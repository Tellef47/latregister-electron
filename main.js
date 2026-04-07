const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

// Data file sits next to the .app bundle (or next to main.js in dev)
function getDataDir() {
  // Always use ~/Documents/Låtregister — works both in dev and packaged
  const dir = path.join(app.getPath('home'), 'Documents', 'Låtregister')
  if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true })
  return dir
}

function getDataPath() {
  return path.join(getDataDir(), 'latregister-data.json')
}

function getNoterPath() {
  return path.join(getDataDir(), 'latregister-noter.json')
}

function getNoter2Path() {
  return path.join(getDataDir(), 'latregister-noter2.json')
}

let mainWindow
let pdfWindows = []

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title: 'Låtregister',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
    backgroundColor: '#faf7f2',
  })
  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer.html'))
  mainWindow.webContents.on('did-fail-load', (e, code, desc) => console.error('Load failed:', code, desc))
  mainWindow.webContents.on('crashed', () => console.error('Renderer crashed'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

// ── IPC handlers ──────────────────────────────────────────────

ipcMain.handle('load-data', () => {
  const p = getDataPath()
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  return null
})

ipcMain.handle('save-data', (_, data) => {
  fs.writeFileSync(getDataPath(), JSON.stringify(data, null, 2), 'utf8')
  return true
})

ipcMain.handle('load-noter', () => {
  const p = getNoterPath()
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  return {}
})

ipcMain.handle('save-noter', (_, noter) => {
  fs.writeFileSync(getNoterPath(), JSON.stringify(noter, null, 2), 'utf8')
  return true
})

ipcMain.handle('load-noter2', () => {
  const p = getNoter2Path()
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  return {}
})

ipcMain.handle('save-noter2', (_, noter2) => {
  fs.writeFileSync(getNoter2Path(), JSON.stringify(noter2, null, 2), 'utf8')
  return true
})

ipcMain.handle('open-pdf', (_, filePath) => {
  // Open PDF in a new BrowserWindow with native PDF viewer
  const win = new BrowserWindow({
    width: 900,
    height: 1100,
    minWidth: 500,
    minHeight: 400,
    title: path.basename(filePath),
    webPreferences: { plugins: true },
  })
  const url = 'file://' + filePath
  win.loadURL(url)
  pdfWindows.push(win)
  win.on('closed', () => { pdfWindows = pdfWindows.filter(w => w !== win) })
  return true
})

ipcMain.handle('open-graph', (_, data) => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    title: 'Nettverksoversikt — Låtregister',
    webPreferences: { nodeIntegration: false, contextIsolation: false },
    backgroundColor: '#faf7f2',
  })
  win.loadFile(path.join(__dirname, 'src', 'graph.html'))
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(`window.graphData = ${JSON.stringify(data)}; if(window.graphData) init(window.graphData);`)
  })
  return true
})

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Velg noterotmappe',
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

ipcMain.handle('pick-pdf', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Velg PDF-fil',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})
