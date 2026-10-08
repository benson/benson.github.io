const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function updateFooter(html, timestamp) {
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/New_York',
  }).format(new Date(timestamp)).toLowerCase();
  const footer = /<footer>last updated [^<]+<\/footer>/;
  if (!footer.test(html)) throw new Error('Homepage last-updated footer not found');
  return html.replace(footer, `<footer>last updated ${date}</footer>`);
}

function main() {
  const root = path.resolve(__dirname, '..');
  const timestamp = execFileSync('git', [
    'log', '-1', '--format=%cI', '--',
    'index.html', 'style.css', 'window.js', 'vellum-ui/vellum-ui.css',
  ], { cwd: root, encoding: 'utf8' }).trim();
  if (!timestamp) throw new Error('No homepage commit found');
  const file = path.join(root, 'index.html');
  fs.writeFileSync(file, updateFooter(fs.readFileSync(file, 'utf8'), timestamp));
}

if (require.main === module) main();
module.exports = { updateFooter };
