const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { spawn } = require('child_process');

const MODELS_DIR = path.join(__dirname, 'paddle-ocr-models');

const MODELS = [
  {
    name: 'ch_PP-OCRv4_det_infer',
    url: 'https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/ch_PP-OCRv4_det_infer.tar'
  },
  {
    name: 'ch_PP-OCRv4_rec_infer',
    url: 'https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/ch_PP-OCRv4_rec_infer.tar'
  }
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getFileSize(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'HEAD' }, (res) => {
      resolve(parseInt(res.headers['content-length'] || '0', 10));
    });
    req.on('error', reject);
    req.end();
  });
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        downloadFile(redirectUrl, destPath, onProgress).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const totalSize = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      const writeStream = fs.createWriteStream(destPath);

      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress && totalSize > 0) {
          onProgress(downloaded, totalSize);
        }
      });

      res.pipe(writeStream);

      writeStream.on('finish', () => {
        writeStream.close();
        resolve();
      });

      writeStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });

    req.on('error', reject);
    req.setTimeout(300000, () => {
      req.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

function extractTar(tarPath, destDir) {
  return new Promise((resolve, reject) => {
    const args = ['-xzf', tarPath, '-C', destDir];
    const tarProcess = spawn('tar', args, { shell: true });

    tarProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar exited with code ${code}`));
      }
    });

    tarProcess.on('error', (err) => {
      reject(err);
    });
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec) {
  return formatBytes(bytesPerSec) + '/s';
}

async function downloadModel(model) {
  const tarPath = path.join(MODELS_DIR, `${model.name}.tar`);
  const modelDir = path.join(MODELS_DIR, model.name);

  console.log(`\n📦 Downloading ${model.name}...`);

  ensureDir(MODELS_DIR);

  let lastProgressTime = Date.now();
  let lastDownloaded = 0;

  const startTime = Date.now();

  await downloadFile(model.url, tarPath, (downloaded, total) => {
    const now = Date.now();
    const elapsed = (now - startTime) / 1000;
    const speed = downloaded / elapsed;
    const percent = ((downloaded / total) * 100).toFixed(1);

    process.stdout.write(`\r  📊 ${percent}% (${formatBytes(downloaded)} / ${formatBytes(total)}) - ${formatSpeed(speed)}   `);

    lastProgressTime = now;
    lastDownloaded = downloaded;
  });

  console.log(`\n  ✅ Download complete: ${tarPath}`);

  console.log(`  📂 Extracting...`);
  await extractTar(tarPath, MODELS_DIR);
  console.log(`  ✅ Extraction complete`);

  console.log(`  🧹 Cleaning up tar file...`);
  fs.unlinkSync(tarPath);
  console.log(`  ✅ Cleanup complete`);

  const extractedPath = path.join(MODELS_DIR, model.name);
  if (fs.existsSync(extractedPath)) {
    console.log(`  📁 Model extracted to: ${extractedPath}`);
    const files = fs.readdirSync(extractedPath);
    console.log(`     Files: ${files.length}`);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('  PaddleOCR Model Downloader');
  console.log('  下载 PaddleOCR 中文字符识别模型');
  console.log('='.repeat(60));
  console.log(`\n📂 Output directory: ${MODELS_DIR}`);

  ensureDir(MODELS_DIR);

  const results = [];

  for (const model of MODELS) {
    try {
      await downloadModel(model);
      results.push({ name: model.name, status: 'success' });
    } catch (err) {
      console.error(`\n❌ Failed to download ${model.name}: ${err.message}`);
      results.push({ name: model.name, status: 'failed', error: err.message });
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('  Summary / 下载总结');
  console.log('='.repeat(60));

  for (const result of results) {
    if (result.status === 'success') {
      console.log(`  ✅ ${result.name}`);
    } else {
      console.log(`  ❌ ${result.name} - ${result.error}`);
    }
  }

  const successCount = results.filter(r => r.status === 'success').length;
  console.log(`\n  Total: ${successCount} / ${MODELS.length} models downloaded successfully.`);

  if (successCount === MODELS.length) {
    console.log('\n🎉 All models downloaded successfully!');
    console.log(`   Models are stored in: ${MODELS_DIR}`);
  } else {
    console.log('\n⚠️  Some models failed to download. Please check errors above.');
    process.exit(1);
  }
}

main().catch(console.error);