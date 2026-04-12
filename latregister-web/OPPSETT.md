# Låtregister — oppsett på Hetzner

## 1. Opprett server på Hetzner

1. Gå til hetzner.com og logg inn
2. «Create server» → velg:
   - Location: Falkenstein eller Helsinki
   - Image: Ubuntu 24.04
   - Type: CX23 (billigste, holder fint)
   - SSH key: legg til din offentlige SSH-nøkkel
3. Klikk «Create & Buy now»
4. Noter IP-adressen du får

## 2. Logg inn på serveren

```bash
ssh root@DIN_IP
```

## 3. Installer Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node --version  # skal vise v22.x
```

## 4. Last opp appen

På din lokale Mac, kjør:
```bash
scp -r ~/Downloads/latregister-web root@DIN_IP:/opt/latregister
```

## 5. Kopier eksisterende data

```bash
scp ~/Documents/Låtregister/latregister-data.json root@DIN_IP:/opt/latregister/data/
scp ~/Documents/Låtregister/latregister-noter.json root@DIN_IP:/opt/latregister/data/
scp ~/Documents/Låtregister/latregister-noter2.json root@DIN_IP:/opt/latregister/data/
```

## 6. Start appen

```bash
ssh root@DIN_IP
cd /opt/latregister
node server.js
```

Appen kjører nå på http://DIN_IP:3000

Standard innlogging: **admin / latregister** — bytt passord umiddelbart i Innstillinger!

## 7. Kjør appen automatisk (ved omstart)

```bash
# Installer pm2
npm install -g pm2

# Start appen med pm2
cd /opt/latregister
pm2 start server.js --name latregister
pm2 startup
pm2 save
```

## 8. (Valgfritt) Domene og HTTPS

Hvis du vil ha et domenavn (f.eks. latar.5b.no) og HTTPS:

```bash
apt install -y nginx certbot python3-certbot-nginx

# Lag nginx-konfig
cat > /etc/nginx/sites-available/latregister << 'EOF'
server {
    server_name latar.5b.no;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        client_max_body_size 50M;
    }
}
EOF

ln -s /etc/nginx/sites-available/latregister /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# HTTPS
certbot --nginx -d latar.5b.no
```

## Oppdatere appen

Når du har ny versjon av index.html:
```bash
scp ~/Downloads/latregister-web/public/index.html root@DIN_IP:/opt/latregister/public/
pm2 restart latregister
```

Ingen nedetid for brukerne — siden er statisk HTML.
