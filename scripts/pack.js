/**
 * Creates a deployment zip excluding node_modules and local secrets.
 * Run: npm run pack
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const outName = 'tv-display-deploy.zip';
const outPath = path.join(root, outName);

const include = [
  'server.js',
  'package.json',
  'package-lock.json',
  'ecosystem.config.js',
  '.env.example',
  'lib',
  'public',
  'data',
  'uploads/.gitkeep'
];

// Clean old zip
if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

// Use PowerShell Compress-Archive on Windows
const staging = path.join(root, '.deploy-staging');
if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((f) => copyRecursive(path.join(src, f), path.join(dest, f)));
  } else {
    fs.copyFileSync(src, dest);
  }
}

include.forEach((item) => {
  const src = path.join(root, item);
  const dest = path.join(staging, item);
  if (!fs.existsSync(src)) return;
  const destDir = path.dirname(dest);
  fs.mkdirSync(destDir, { recursive: true });
  if (fs.statSync(src).isDirectory()) {
    copyRecursive(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
});

// Ensure empty dirs exist in package
fs.mkdirSync(path.join(staging, 'uploads'), { recursive: true });
if (!fs.existsSync(path.join(staging, 'data', 'settings.json'))) {
  fs.copyFileSync(path.join(root, 'data', 'settings.json'), path.join(staging, 'data', 'settings.json'));
}
if (!fs.existsSync(path.join(staging, 'data', 'playlist.json'))) {
  fs.writeFileSync(path.join(staging, 'data', 'playlist.json'), '[]');
}

execSync(`Compress-Archive -Path "${staging}\\*" -DestinationPath "${outPath}" -Force`, { shell: 'powershell.exe' });
fs.rmSync(staging, { recursive: true, force: true });

console.log(`\nDeployment package created: ${outPath}`);
console.log('Upload this zip to your server, then follow DEPLOY.md\n');
