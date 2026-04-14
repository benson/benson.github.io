#!/usr/bin/env node
// Build TCG Player SKU index from MTGJSON data.
// Run when new sets drop or monthly:
//   node scripts/build-sku-index.js
//
// Downloads TcgplayerSkus.json.gz (~35MB) from MTGJSON,
// filters to English SKUs, groups by productId, and writes
// bucket files to cardentry/skus/.

const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const os = require('os');

const sjBase = path.join(__dirname, '..', 'node_modules', 'stream-json', 'src');
const scBase = path.join(__dirname, '..', 'node_modules', 'stream-chain', 'src');
const { parser } = require(path.join(sjBase, 'index.js'));
const { pick } = require(path.join(sjBase, 'filters', 'pick.js'));
const { streamObject } = require(path.join(sjBase, 'streamers', 'stream-object.js'));
const { chain } = require(path.join(scBase, 'index.js'));

const MTGJSON_URL = 'https://mtgjson.com/api/v5/TcgplayerSkus.json.gz';
const OUT_DIR = path.join(__dirname, '..', 'cardentry', 'skus');
const BUCKET_SIZE = 100000;

function downloadToFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`downloading ${url}...`);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadToFile(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));

      const contentLength = parseInt(res.headers['content-length'], 10) || 0;
      let totalBytes = 0;
      const gunzip = zlib.createGunzip();
      const out = fs.createWriteStream(dest);

      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (contentLength) {
          const pct = ((totalBytes / contentLength) * 100).toFixed(0);
          process.stdout.write(`\r  ${(totalBytes / 1024 / 1024).toFixed(0)}MB / ${(contentLength / 1024 / 1024).toFixed(0)}MB (${pct}%)`);
        }
      });

      res.pipe(gunzip).pipe(out);
      out.on('finish', () => { console.log('\n  saved to', dest); resolve(); });
      out.on('error', reject);
      gunzip.on('error', reject);
    }).on('error', reject);
  });
}

function streamParse(filePath) {
  return new Promise((resolve, reject) => {
    console.log('stream-parsing JSON...');

    const byProduct = {};
    let totalSkus = 0;
    let englishSkus = 0;
    let uuidCount = 0;

    const pipeline = chain([
      fs.createReadStream(filePath),
      parser(),
      pick({ filter: 'data' }),
      streamObject(),
    ]);

    pipeline.on('data', ({ key, value }) => {
      // key = UUID, value = array of SKU objects
      uuidCount++;
      if (uuidCount % 50000 === 0) {
        process.stdout.write(`\r  ${uuidCount} cards, ${englishSkus} english SKUs...`);
      }

      if (!Array.isArray(value)) return;
      for (const sku of value) {
        totalSkus++;
        if (sku.language !== 'ENGLISH') continue;
        englishSkus++;

        const pid = sku.productId;
        if (!byProduct[pid]) byProduct[pid] = [];
        byProduct[pid].push({
          s: sku.skuId,
          c: sku.condition,
          p: sku.printing,
        });
      }
    });

    pipeline.on('end', () => {
      console.log(`\n  total SKUs: ${totalSkus}`);
      console.log(`  english SKUs: ${englishSkus}`);
      console.log(`  unique products: ${Object.keys(byProduct).length}`);
      resolve(byProduct);
    });

    pipeline.on('error', reject);
  });
}

async function main() {
  const tmpFile = path.join(os.tmpdir(), 'TcgplayerSkus.json');

  const skipDownload = fs.existsSync(tmpFile) &&
    (Date.now() - fs.statSync(tmpFile).mtimeMs < 3600000);

  if (skipDownload) {
    console.log(`using cached ${tmpFile}`);
  } else {
    await downloadToFile(MTGJSON_URL, tmpFile);
  }

  const byProduct = await streamParse(tmpFile);

  // split into buckets by product ID range
  const buckets = {};
  for (const [pid, skus] of Object.entries(byProduct)) {
    const bucketStart = Math.floor(Number(pid) / BUCKET_SIZE) * BUCKET_SIZE;
    if (!buckets[bucketStart]) buckets[bucketStart] = {};
    buckets[bucketStart][pid] = skus;
  }

  // write bucket files
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // clean old bucket files
  try {
    for (const f of fs.readdirSync(OUT_DIR)) {
      if (f.endsWith('.json')) fs.unlinkSync(path.join(OUT_DIR, f));
    }
  } catch (e) {}

  const index = { buckets: [], updatedAt: new Date().toISOString() };

  for (const [start, products] of Object.entries(buckets)) {
    const filename = start + '.json';
    const content = JSON.stringify(products);
    fs.writeFileSync(path.join(OUT_DIR, filename), content);
    const end = Number(start) + BUCKET_SIZE - 1;
    const productCount = Object.keys(products).length;
    const sizeKB = (content.length / 1024).toFixed(0);
    index.buckets.push({ start: Number(start), end, file: filename });
    console.log(`  bucket ${filename}: ${productCount} products, ${sizeKB}KB`);
  }

  index.buckets.sort((a, b) => a.start - b.start);
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));

  console.log(`\ndone! ${index.buckets.length} buckets written to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
