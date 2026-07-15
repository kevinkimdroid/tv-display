# Deploy TV Display to a Server

## What gets uploaded

When you upload photos/videos through the admin panel, files are saved on the **server** in the `uploads/` folder. The playlist is stored in `data/playlist.json`.

## Quick deploy (Windows Server)

### 1. Create deployment package (on your PC)

```powershell
cd C:\xampp\htdocs\sites\tv-display
npm install
npm run pack
```

This creates `tv-display-deploy.zip` in the project folder.

### 2. Upload to server

Copy `tv-display-deploy.zip` to your server using:
- Remote Desktop + copy/paste
- WinSCP / FileZilla (SFTP)
- Shared network folder

Extract to e.g. `C:\apps\tv-display\`

### 3. Configure on server

```powershell
cd C:\apps\tv-display
copy .env.example .env
notepad .env
```

Edit `.env` with your Oracle credentials:

```
ERP_HOST=10.1.4.101
ERP_PORT=18032
ERP_SERVICE_NAME=PDBTQUEST
ERP_USERNAME=TQ_LMS
ERP_PASSWORD="your_password"
PORT=3000
```

> **Important:** Wrap passwords containing `#` in quotes.

### 4. Install & start

```powershell
# Install Node.js LTS from https://nodejs.org if not installed

cd C:\apps\tv-display
npm install --production

# Option A: Run directly
npm start

# Option B: Run with PM2 (keeps running after logout/reboot)
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 5. Open firewall port

```powershell
New-NetFirewallRule -DisplayName "TV Display" -Direction Inbound -Port 3000 -Protocol TCP -Action Allow
```

### 6. Access from TV / other devices

Replace `SERVER_IP` with your server's IP address:

| Screen | URL |
|--------|-----|
| TV Display | `http://SERVER_IP:3000/` |
| Admin (upload media) | `http://SERVER_IP:3000/admin.html` |

---

## Linux Server

```bash
# Upload & extract zip, then:
cd /opt/tv-display
cp .env.example .env
nano .env          # add Oracle credentials

npm install --production

# Option A: Background with restart scripts (recommended on shared servers)
chmod +x start-daemon.sh stop.sh restart.sh
./start-daemon.sh
# Later: ./restart.sh   (stops only TV Display, not CRM or other apps)

# Option B: PM2 (keeps running after reboot)
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
# Later: pm2 restart tv-display

# Firewall (Ubuntu)
sudo ufw allow 3000/tcp
```

---

## Uploading media to the server

1. Open **Admin panel** on any device: `http://SERVER_IP:3000/admin.html`
2. Drag & drop photos/videos, or click to browse
3. Files upload to the server's `uploads/` folder
4. TV display at `http://SERVER_IP:3000/` shows them automatically

**Limits:** 500 MB per file, up to 20 files per upload.

---

## Folders on the server (persist these)

| Folder | Purpose |
|--------|---------|
| `uploads/` | All uploaded photos & videos |
| `data/playlist.json` | Playlist order & settings |
| `data/settings.json` | Revenue dashboard config |
| `.env` | Database credentials |

Back up `uploads/` and `data/` together.

---

## Optional: Run on port 80 with IIS reverse proxy

If you need port 80 instead of 3000, install IIS + URL Rewrite + ARR and proxy to `http://localhost:3000`.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Upload fails | Check `uploads/` folder exists and is writable |
| No revenue data | Check `.env` Oracle credentials; server must reach `10.1.4.101:18032` |
| TV can't connect | Open firewall port 3000; use server IP not `localhost` |
| App stops after logout | Use PM2 (`pm2 start ecosystem.config.js`) |
