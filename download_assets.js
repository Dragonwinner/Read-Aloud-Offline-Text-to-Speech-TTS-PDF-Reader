const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { finished } = require('stream/promises');
const { execSync } = require('child_process');

const binDir = path.join(__dirname, 'bin', 'win32');
const voicesDir = path.join(__dirname, 'voices');

if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
if (!fs.existsSync(voicesDir)) fs.mkdirSync(voicesDir, { recursive: true });

async function download(url, dest) {
  console.log(`Downloading: ${url} -> ${dest}`);
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const fileStream = fs.createWriteStream(dest, { flags: 'w' });
  await finished(Readable.fromWeb(res.body).pipe(fileStream));
  console.log(`✓ Completed: ${path.basename(dest)}`);
}

async function main() {
  // 1. Piper Binary
  const piperExe = path.join(binDir, 'piper', 'piper.exe');
  if (!fs.existsSync(piperExe) && !fs.existsSync(path.join(binDir, 'piper.exe'))) {
    const tempZip = path.join(__dirname, 'piper_win.zip');
    await download('https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip', tempZip);
    console.log('Extracting Piper binary...');
    execSync(`powershell -Command "Expand-Archive -LiteralPath '${tempZip}' -DestinationPath '${binDir}' -Force"`);
    if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
    console.log('✓ Piper binary extracted successfully.');
  } else {
    console.log('✓ Piper binary already present.');
  }

  // 2. Amy (Female)
  const amyModel = path.join(voicesDir, 'en_US-amy-medium.onnx');
  const amyJson = path.join(voicesDir, 'en_US-amy-medium.onnx.json');
  if (!fs.existsSync(amyModel)) {
    await download('https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx', amyModel);
  }
  if (!fs.existsSync(amyJson)) {
    await download('https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx.json', amyJson);
  }

  // 3. Ryan (Male)
  const ryanModel = path.join(voicesDir, 'en_US-ryan-medium.onnx');
  const ryanJson = path.join(voicesDir, 'en_US-ryan-medium.onnx.json');
  if (!fs.existsSync(ryanModel)) {
    await download('https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/medium/en_US-ryan-medium.onnx', ryanModel);
  }
  if (!fs.existsSync(ryanJson)) {
    await download('https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json', ryanJson);
  }

  console.log('\n🎉 ALL OFFLINE ASSETS DOWNLOADED AND READY!');
}

main().catch(err => {
  console.error('Error during download:', err);
  process.exit(1);
});
