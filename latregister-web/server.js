const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { Readable } = require('stream')

const PORT = process.env.PORT || 3000
const DATA_DIR = path.join(__dirname, 'data')
const UPLOADS_DIR = path.join(__dirname, 'uploads')
const PUBLIC_DIR = path.join(__dirname, 'public')
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const SESSION_FILE = path.join(DATA_DIR, 'sessions.json')

// Ensure directories exist
;[DATA_DIR, UPLOADS_DIR, PUBLIC_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
})

// ── Users & sessions ─────────────────────────────────────────────────────────

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    // Default admin user: admin / latregister
    const salt = crypto.randomBytes(16).toString('hex')
    const hash = hashPassword('latregister', salt)
    fs.writeFileSync(USERS_FILE, JSON.stringify([
      { username: 'admin', salt, hash, name: 'Administrator' }
    ], null, 2))
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))
}

function hashPassword(password, salt) {
  return crypto.createHmac('sha256', salt).update(password).digest('hex')
}

function loadSessions() {
  if (!fs.existsSync(SESSION_FILE)) return {}
  try { return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')) } catch { return {} }
}

function saveSessions(s) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(s, null, 2))
}

function createSession(username) {
  const sessions = loadSessions()
  const token = crypto.randomBytes(32).toString('hex')
  sessions[token] = { username, created: Date.now() }
  saveSessions(sessions)
  return token
}

function getSession(req) {
  const cookie = req.headers.cookie || ''
  const match = cookie.match(/session=([a-f0-9]+)/)
  if (!match) return null
  const sessions = loadSessions()
  const s = sessions[match[1]]
  if (!s) return null
  // Expire after 30 days
  if (Date.now() - s.created > 30 * 24 * 3600 * 1000) {
    delete sessions[match[1]]; saveSessions(sessions); return null
  }
  return s
}

// ── Data files ────────────────────────────────────────────────────────────────

const DATA_FILES = {
  data: path.join(DATA_DIR, 'latregister-data.json'),
  noter: path.join(DATA_DIR, 'latregister-noter.json'),
  noter2: path.join(DATA_DIR, 'latregister-noter2.json'),
}

function readJSON(file) {
  if (!fs.existsSync(file)) return null
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk; if (body.length > 50 * 1024 * 1024) reject(new Error('Too large')) })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function parseCT(req) {
  return (req.headers['content-type'] || '').split(';')[0].trim()
}

function send(res, status, data, ct = 'application/json') {
  const body = ct === 'application/json' ? JSON.stringify(data) : data
  res.writeHead(status, { 'Content-Type': ct, 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

function sendFile(res, filePath) {
  if (!fs.existsSync(filePath)) { send(res, 404, { error: 'Not found' }); return }
  const ext = path.extname(filePath).toLowerCase()
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.pdf': 'application/pdf', '.png': 'image/png',
    '.ico': 'image/x-icon', '.svg': 'image/svg+xml' }
  const ct = types[ext] || 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': ct })
  fs.createReadStream(filePath).pipe(res)
}

function redirect(res, url) {
  res.writeHead(302, { Location: url }); res.end()
}

// ── Multipart form parser (for file uploads) ─────────────────────────────────

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const ct = req.headers['content-type'] || ''
    const boundaryMatch = ct.match(/boundary=(.+)/)
    if (!boundaryMatch) return reject(new Error('No boundary'))
    const boundary = '--' + boundaryMatch[1]
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const buf = Buffer.concat(chunks)
      const parts = []
      let start = 0
      const boundaryBuf = Buffer.from(boundary)
      while (true) {
        const idx = buf.indexOf(boundaryBuf, start)
        if (idx === -1) break
        if (start > 0) {
          const part = buf.slice(start, idx - 2)
          const headerEnd = part.indexOf('\r\n\r\n')
          if (headerEnd !== -1) {
            const headers = part.slice(0, headerEnd).toString()
            const data = part.slice(headerEnd + 4)
            const nameMatch = headers.match(/name="([^"]+)"/)
            const filenameMatch = headers.match(/filename="([^"]+)"/)
            parts.push({
              name: nameMatch ? nameMatch[1] : '',
              filename: filenameMatch ? filenameMatch[1] : null,
              data
            })
          }
        }
        start = idx + boundaryBuf.length + 2
      }
      resolve(parts)
    })
    req.on('error', reject)
  })
}

// ── Routes ────────────────────────────────────────────────────────────────────

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost`)
  const pathname = url.pathname
  const method = req.method

  // Public: login page
  if (pathname === '/login' && method === 'GET') {
    return sendFile(res, path.join(PUBLIC_DIR, 'login.html'))
  }

  // Public: login POST
  if (pathname === '/login' && method === 'POST') {
    const body = await parseBody(req)
    const params = new URLSearchParams(body)
    const username = params.get('username') || ''
    const password = params.get('password') || ''
    const users = loadUsers()
    const user = users.find(u => u.username === username)
    if (user && hashPassword(password, user.salt) === user.hash) {
      const token = createSession(username)
      res.writeHead(302, { 'Set-Cookie': `session=${token}; Path=/; HttpOnly; SameSite=Lax`, Location: '/' })
      res.end()
    } else {
      return sendFile(res, path.join(PUBLIC_DIR, 'login.html?error=1'))
    }
    return
  }

  // Public: logout
  if (pathname === '/logout') {
    res.writeHead(302, { 'Set-Cookie': 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT', Location: '/login' })
    res.end(); return
  }

  // Auth check for all other routes
  const session = getSession(req)
  if (!session) { redirect(res, '/login'); return }

  // Main app
  if (pathname === '/' || pathname === '/index.html') {
    return sendFile(res, path.join(PUBLIC_DIR, 'index.html'))
  }

  // Static files
  if (pathname.startsWith('/public/')) {
    return sendFile(res, path.join(PUBLIC_DIR, pathname.slice(8)))
  }

  // ── API ──────────────────────────────────────────────────────────────────

  // GET data
  if (pathname === '/api/data' && method === 'GET') {
    const data = readJSON(DATA_FILES.data)
    const noter = readJSON(DATA_FILES.noter) || {}
    const noter2 = readJSON(DATA_FILES.noter2) || {}
    return send(res, 200, { data, noter, noter2 })
  }

  // POST data (save all)
  if (pathname === '/api/data' && method === 'POST') {
    const body = await parseBody(req)
    const { data, noter, noter2 } = JSON.parse(body)
    if (data) writeJSON(DATA_FILES.data, data)
    if (noter) writeJSON(DATA_FILES.noter, noter)
    if (noter2) writeJSON(DATA_FILES.noter2, noter2)
    return send(res, 200, { ok: true })
  }

  // Upload PDF
  if (pathname === '/api/upload' && method === 'POST') {
    const parts = await parseMultipart(req)
    const filePart = parts.find(p => p.filename)
    if (!filePart) return send(res, 400, { error: 'No file' })
    const safeName = path.basename(filePart.filename).replace(/[^a-zA-Z0-9._\- æøåÆØÅ]/g, '_')
    const dest = path.join(UPLOADS_DIR, safeName)
    fs.writeFileSync(dest, filePart.data)
    return send(res, 200, { url: '/uploads/' + encodeURIComponent(safeName) })
  }

  // Serve uploaded PDFs
  if (pathname.startsWith('/uploads/')) {
    const fname = decodeURIComponent(pathname.slice(9))
    return sendFile(res, path.join(UPLOADS_DIR, fname))
  }

  // Backup download
  if (pathname === '/api/backup' && method === 'GET') {
    const backup = {
      data: readJSON(DATA_FILES.data),
      noter: readJSON(DATA_FILES.noter),
      noter2: readJSON(DATA_FILES.noter2),
      exported: new Date().toISOString()
    }
    const body = JSON.stringify(backup, null, 2)
    const filename = `latregister-backup-${new Date().toISOString().slice(0,10)}.json`
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': Buffer.byteLength(body)
    })
    res.end(body); return
  }

  // User management
  if (pathname === '/api/users' && method === 'GET') {
    const users = loadUsers().map(u => ({ username: u.username, name: u.name }))
    return send(res, 200, users)
  }

  if (pathname === '/api/users' && method === 'POST') {
    const body = await parseBody(req)
    const { username, password, name } = JSON.parse(body)
    if (!username || !password) return send(res, 400, { error: 'Mangler felt' })
    const users = loadUsers()
    if (users.find(u => u.username === username)) return send(res, 409, { error: 'Bruker finnes' })
    const salt = crypto.randomBytes(16).toString('hex')
    const hash = hashPassword(password, salt)
    users.push({ username, salt, hash, name: name || username })
    saveUsers(users)
    return send(res, 200, { ok: true })
  }

  if (pathname.startsWith('/api/users/') && method === 'DELETE') {
    const uname = decodeURIComponent(pathname.slice(11))
    if (uname === session.username) return send(res, 400, { error: 'Kan ikke slette deg selv' })
    const users = loadUsers().filter(u => u.username !== uname)
    saveUsers(users)
    return send(res, 200, { ok: true })
  }

  if (pathname === '/api/change-password' && method === 'POST') {
    const body = await parseBody(req)
    const { oldPassword, newPassword } = JSON.parse(body)
    const users = loadUsers()
    const user = users.find(u => u.username === session.username)
    if (!user || hashPassword(oldPassword, user.salt) !== user.hash)
      return send(res, 403, { error: 'Feil passord' })
    user.salt = crypto.randomBytes(16).toString('hex')
    user.hash = hashPassword(newPassword, user.salt)
    saveUsers(users)
    return send(res, 200, { ok: true })
  }

  if (pathname === '/api/whoami') {
    const users = loadUsers()
    const user = users.find(u => u.username === session.username)
    return send(res, 200, { username: session.username, name: user?.name || session.username })
  }

  send(res, 404, { error: 'Not found' })
}

const server = http.createServer(async (req, res) => {
  try { await handleRequest(req, res) }
  catch (e) { console.error(e); send(res, 500, { error: e.message }) }
})

server.listen(PORT, () => {
  console.log(`Låtregister kjører på http://localhost:${PORT}`)
})
