// Tailwind v4 ile web/ içindeki sınıfları tarayıp web/app.css üretir (internetsiz).
import { createRequire } from 'module';
import fs from 'fs'; import path from 'path';
const twDir = process.env.TW_DIR || '/opt/npm-tools/node_modules/tailwindcss';
const require = createRequire(path.join(twDir, 'package.json'));
const { compile } = require(path.join(twDir, 'dist/lib.js'));
const web = path.resolve(process.argv[2] || 'web');
const src = ['index.html','app.js'].map(f => fs.readFileSync(path.join(web, f), 'utf8')).join('\n');
const candidates = new Set(src.split(/[\s"'`<>=(){};,]+/).filter(Boolean));
const css = await compile('@import "tailwindcss";', {
  base: twDir,
  async loadStylesheet(id, base) {
    let p = id === 'tailwindcss' ? path.join(twDir, 'index.css') : id.startsWith('tailwindcss/') ? path.join(twDir, id.slice(12)) : path.resolve(base, id);
    if (!p.endsWith('.css') && fs.existsSync(p + '.css')) p += '.css';
    return { path: p, base: path.dirname(p), content: fs.readFileSync(p, 'utf8') };
  }
});
const out = css.build([...candidates]);
fs.writeFileSync(path.join(web, 'app.css'), out);
console.log('app.css', out.length, 'bytes,', candidates.size, 'candidates');

// Eski Android WebView'lar için: oklch renklerini hex'e çevir ve @layer sarmalayıcılarını kaldır.
function oklchToHex(L, C, H, A) {
  L = L.endsWith('%') ? parseFloat(L) / 100 : parseFloat(L); C = parseFloat(C); H = parseFloat(H) || 0;
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  const g = x => { x = Math.min(1, Math.max(0, x)); const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; return Math.round(v * 255).toString(16).padStart(2, '0'); };
  let hex = '#' + lin.map(g).join('');
  if (A !== undefined) { const al = A.endsWith('%') ? parseFloat(A) / 100 : parseFloat(A); hex += Math.round(al * 255).toString(16).padStart(2, '0'); }
  return hex;
}
function stripLayers(css) {
  let out = '', i = 0;
  const re = /@layer\s+[\w.,\s-]+\{/g;
  while (true) {
    re.lastIndex = i; const m = re.exec(css);
    if (!m) { out += css.slice(i); break; }
    out += css.slice(i, m.index);
    let depth = 1, j = m.index + m[0].length, start = j;
    while (depth && j < css.length) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    out += stripLayers(css.slice(start, j - 1)); i = j;
  }
  return out.replace(/@layer\s+[\w.,\s-]+;/g, '');
}
let post = fs.readFileSync(path.join(web, 'app.css'), 'utf8');
post = post.replace(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?))?\s*\)/g, (_, L, C, H, A) => oklchToHex(L, C, H, A));
post = stripLayers(post);
// color-mix(in srgb, #hex N%, transparent) -> #hexAA ; iç içe @supports color-mix bloklarını kaldır (eski WebView uyumu)
post = post.replace(/color-mix\(in srgb, (#[0-9a-f]{6}|#[0-9a-f]{3}) ([\d.]+)%, transparent\)/g, (_, h, p) => (h.length === 4 ? '#' + [...h.slice(1)].map(c => c + c).join('') : h) + Math.round(parseFloat(p) * 2.55).toString(16).padStart(2, '0'));
{
  let o = '', i = 0; const key = '@supports (color: color-mix(in lab, red, red))';
  while (true) { const k = post.indexOf(key, i); if (k < 0) { o += post.slice(i); break; }
    o += post.slice(i, k); let j = post.indexOf('{', k) + 1, d = 1; while (d) { if (post[j] === '{') d++; else if (post[j] === '}') d--; j++; } i = j; }
  post = o;
}
fs.writeFileSync(path.join(web, 'app.css'), post);
console.log('post-processed:', post.length, 'bytes; oklch left:', (post.match(/oklch\(/g) || []).length, '; @layer left:', (post.match(/@layer/g) || []).length);
