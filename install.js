const fs = require('fs');
const path = require('path');

try {
  require('child_process').execSync('taskkill /f /im alisha-player.exe', { stdio: 'ignore' });
} catch {}

const srcDir = 'F:\\TEACH\\system design\\alisha';
const pkg = JSON.parse(fs.readFileSync(path.join(srcDir, 'package.json'), 'utf8'));
const extFolder = `${pkg.publisher}.${pkg.name}-${pkg.version}`;

const targets = [
  path.join('C:\\Users\\solan\\.antigravity-ide', 'extensions', extFolder),
  path.join('C:\\Users\\solan\\.vscode', 'extensions', extFolder),
  // Also keep updating previous folder for backward-compatibility
  path.join('C:\\Users\\solan\\.antigravity-ide', 'extensions', 'alisha.alisha-docs-reader-1.0.0'),
  path.join('C:\\Users\\solan\\.vscode', 'extensions', 'alisha.alisha-docs-reader-1.0.0')
];

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  fs.readdirSync(from).forEach(element => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    const stat = fs.lstatSync(fromPath);
    if (stat.isFile()) {
      try {
        fs.copyFileSync(fromPath, toPath);
      } catch (err) {
        // If a binary is locked by active extension process, keep existing binary
      }
    } else if (stat.isDirectory()) {
      copyFolderSync(fromPath, toPath);
    }
  });
}

for (const target of targets) {
  console.log(`Installing ALISHA to: ${target}`);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  // Copy manifest and readme
  fs.copyFileSync(path.join(srcDir, 'package.json'), path.join(target, 'package.json'));
  fs.copyFileSync(path.join(srcDir, 'README.md'), path.join(target, 'README.md'));

  // Copy compiled output
  copyFolderSync(path.join(srcDir, 'out'), path.join(target, 'out'));

  // Copy node_modules
  copyFolderSync(path.join(srcDir, 'node_modules'), path.join(target, 'node_modules'));

  // Copy voices folder structure if exists
  if (fs.existsSync(path.join(srcDir, 'voices'))) {
    copyFolderSync(path.join(srcDir, 'voices'), path.join(target, 'voices'));
  }
  // Copy bin folder structure if exists
  if (fs.existsSync(path.join(srcDir, 'bin'))) {
    copyFolderSync(path.join(srcDir, 'bin'), path.join(target, 'bin'));
  }
  // Copy media folder if exists
  if (fs.existsSync(path.join(srcDir, 'media'))) {
    copyFolderSync(path.join(srcDir, 'media'), path.join(target, 'media'));
  }

  console.log(`✓ Successfully installed to ${target}`);
}

console.log('\nInstallation Complete! Restart Antigravity IDE or reload window to use ALISHA.');
