/**
 * Builds a deployable server package in dist/tv-display/
 * and creates dist/tv-display-deploy.zip
 *
 * Run: npm run build
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist', 'tv-display');
const zipPath = path.join(root, 'dist', 'tv-display-deploy.zip');

const FILES = [
  'server.js',
  'package.json',
  'package-lock.json',
  'ecosystem.config.js',
  '.env.example',
  'DEPLOY.md'
];

const DIRS = ['lib', 'public'];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((f) => copyRecursive(path.join(src, f), path.join(dest, f)));
  } else {
    fs.copyFileSync(src, dest);
  }
}

function write(file, content) {
  fs.writeFileSync(path.join(distDir, file), content);
}

// Clean
if (fs.existsSync(path.join(root, 'dist'))) {
  fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Copy files
FILES.forEach((f) => {
  const src = path.join(root, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(distDir, f));
});

DIRS.forEach((d) => {
  const src = path.join(root, d);
  if (fs.existsSync(src)) copyRecursive(src, path.join(distDir, d));
});

// Data & uploads
fs.mkdirSync(path.join(distDir, 'data'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'uploads'), { recursive: true });

const settingsSrc = path.join(root, 'data', 'settings.json');
const playlistSrc = path.join(root, 'data', 'playlist.json');
fs.writeFileSync(
  path.join(distDir, 'data', 'settings.json'),
  fs.existsSync(settingsSrc)
    ? fs.readFileSync(settingsSrc)
    : '{"revenue":{"enabled":true,"year":"2026","slideDuration":18,"slideDurations":{"portfolio":180},"slides":["portfolio","ytd","budget","monthly","accounts"]}}'
);
fs.writeFileSync(
  path.join(distDir, 'data', 'playlist.json'),
  fs.existsSync(playlistSrc) ? fs.readFileSync(playlistSrc) : '[]'
);

// Budget files required for portfolio / actual-vs-budget slides
fs.readdirSync(path.join(root, 'data'))
  .filter((f) => /^budgets-\d{4}\.json$/i.test(f))
  .forEach((f) => {
    fs.copyFileSync(path.join(root, 'data', f), path.join(distDir, 'data', f));
  });

// ── Server helper scripts (Windows) ─────────────────────────────────────

write('install.bat', `@echo off
echo ============================================
echo  Geminia TV Display - Server Install
echo ============================================
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  echo Download from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist .env (
  echo Creating .env from .env.example ...
  copy .env.example .env
  echo.
  echo IMPORTANT: Edit .env with your Oracle credentials before starting!
  echo   notepad .env
  echo.
)

echo Installing dependencies...
call npm install --production
if errorlevel 1 (
  echo ERROR: npm install failed.
  pause
  exit /b 1
)

echo.
echo ============================================
echo  Install complete!
echo  1. Edit .env with database credentials
echo  2. Run start.bat
echo ============================================
pause
`);

write('start.bat', `@echo off
cd /d "%~dp0"

if not exist node_modules (
  echo node_modules not found. Run install.bat first.
  pause
  exit /b 1
)

if not exist .env (
  echo .env not found. Run install.bat first.
  pause
  exit /b 1
)

echo Starting Geminia TV Display on port 3000...
echo   Display: http://localhost:3000/
echo   Admin:   http://localhost:3000/admin.html
echo.
node server.js
`);

write('start-pm2.bat', `@echo off
cd /d "%~dp0"

where pm2 >nul 2>&1
if errorlevel 1 (
  echo Installing PM2...
  call npm install -g pm2
)

pm2 start ecosystem.config.js
pm2 save
echo.
echo App running in background via PM2.
echo   pm2 status
echo   pm2 logs tv-display
pause
`);

// ── Server helper scripts (Linux) ───────────────────────────────────────

write('install.sh', `#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "============================================"
echo " Geminia TV Display - Server Install"
echo "============================================"

if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is not installed."
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env — edit with your Oracle credentials!"
fi

npm install --production
echo ""
echo "Install complete! Edit .env then run: ./start.sh"
`);

write('start.sh', `#!/bin/bash
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then echo "Run ./install.sh first"; exit 1; fi
if [ ! -f .env ]; then echo "Run ./install.sh first"; exit 1; fi
echo "Starting on http://0.0.0.0:3000"
node server.js
`);

const linuxScripts = ['stop.sh', 'start-daemon.sh', 'restart.sh'];
linuxScripts.forEach((name) => {
  const src = path.join(root, name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(distDir, name));
});

// ── Quick readme for server admin ───────────────────────────────────────

write('SERVER-README.txt', `GEMINIA LIFE INSURANCE — TV DISPLAY
==================================

QUICK START (Windows Server)
----------------------------
1. Extract this folder to e.g. C:\\apps\\tv-display\\
2. Double-click install.bat
3. Edit .env with Oracle credentials (notepad .env)
4. Double-click start.bat

For always-on (survives reboot):
   Double-click start-pm2.bat

QUICK START (Linux)
-------------------
   chmod +x install.sh start-daemon.sh stop.sh restart.sh
   ./install.sh
   nano .env
   ./start-daemon.sh          # background (survives logout)

RESTART / STOP (Linux — only affects TV Display, not CRM)
---------------------------------------------------------
   ./restart.sh                 # stop + start in background
   ./stop.sh                    # stop only
   tail -f tv-display.log       # view logs

OPEN FIREWALL (Windows PowerShell as Admin)
-------------------------------------------
   New-NetFirewallRule -DisplayName "TV Display" -Direction Inbound -Port 3000 -Protocol TCP -Action Allow

ACCESS FROM TV / STAFF DEVICES
--------------------------------
   Display:  http://YOUR_SERVER_IP:3000/
   Admin:    http://YOUR_SERVER_IP:3000/admin.html

UPLOAD PHOTOS/VIDEOS
--------------------
   Open Admin URL in browser → drag & drop files
   Files save to uploads/ folder on this server

REQUIREMENTS
------------
   - Node.js 18+ (https://nodejs.org)
   - Network access to Oracle ERP (10.1.4.101:18032)
   - Port 3000 open in firewall

DO NOT UPLOAD
-------------
   - .env (create on server with your passwords)
   - node_modules (run install.bat on server)
`);

// ── Create zip ──────────────────────────────────────────────────────────

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

try {
  execSync(
    `Compress-Archive -Path "${distDir}\\*" -DestinationPath "${zipPath}" -Force`,
    { shell: 'powershell.exe', stdio: 'inherit' }
  );
} catch (err) {
  console.warn('Zip creation skipped:', err.message);
}

console.log('');
console.log('Build complete!');
console.log('');
console.log('  Folder (upload as-is):  dist/tv-display/');
console.log('  Zip (upload & extract): dist/tv-display-deploy.zip');
console.log('');
console.log('On the server after upload:');
console.log('  Windows → run install.bat, edit .env, run start.bat');
console.log('  Linux   → run ./install.sh, edit .env, run ./start.sh');
console.log('');
