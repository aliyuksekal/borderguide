// docs/privacy.html ve docs/terms.html sayfalarını uygulamadaki metinlerden (web/i18n.js) üretir: node tools/build-legal.mjs
import fs from 'fs'; import vm from 'vm';
const ctx = { window:{} }; vm.createContext(ctx); vm.runInContext(fs.readFileSync('web/i18n.js','utf8'), ctx);
const I = ctx.window.I18N;
const LANGS = [['tr','Türkçe'],['en','English'],['ru','Русский'],['uz',"O'zbekcha"],['ko','한국어'],['zh','中文']];
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const doc = t => { let out = '', ul = false; for (const l of t.split('\n').filter(x => x.trim())) {
  if (l.startsWith('• ')) { if (!ul) { out += '<ul>'; ul = true; } out += `<li>${esc(l.slice(2))}</li>`; continue; }
  if (ul) { out += '</ul>'; ul = false; }
  out += l.startsWith('## ') ? `<h3>${esc(l.slice(3))}</h3>` : `<p>${esc(l)}</p>`; }
  return out + (ul ? '</ul>' : ''); };
const CSS = `:root{--bg:#f1f5f9;--card:#fff;--text:#0f172a;--muted:#475569;--line:#e2e8f0;--accent:#2563eb}
@media (prefers-color-scheme:dark){:root{--bg:#020617;--card:#0f172a;--text:#f1f5f9;--muted:#94a3b8;--line:#1e293b;--accent:#60a5fa}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 16px 48px}header{display:flex;align-items:center;gap:16px;margin-bottom:16px}header img{width:80px;height:80px}
h1{margin:0;font-size:30px;line-height:1.2}h2{font-size:22px;margin:0 0 8px}h3{font-size:17px;margin:18px 0 4px}.sub{color:var(--muted);margin:4px 0 0}
nav{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 16px}nav a{padding:4px 10px;border:1px solid var(--line);border-radius:999px;text-decoration:none;font-size:14px}
section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 20px;margin:16px 0}ul{padding-left:20px;margin:8px 0}li{margin:4px 0}p{margin:6px 0}a{color:var(--accent)}
footer{margin-top:32px;color:var(--muted);font-size:14px;border-top:1px solid var(--line);padding-top:16px}`;
function page(file, title, sub, parts) {
  const body = LANGS.map(([l, n]) => `<section id="${l}" lang="${l}"><h2>${esc(n)} · ${esc(I[l][parts[0][0]])}</h2>${parts.map(([tk, dk], i) => (i ? `<h2 style="margin-top:24px">${esc(I[l][tk])}</h2>` : '') + doc(I[l][dk])).join('')}<p class="sub">${esc(I[l].lgUpdated)}</p></section>`).join('\n');
  fs.writeFileSync('docs/' + file, `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>BorderGuide – ${esc(title)}</title><link rel="icon" href="logo.webp"><style>${CSS}</style></head>
<body><main><header><img src="logo.webp" alt="BorderGuide"><div><h1>${esc(title)}</h1><p class="sub">${esc(sub)} · BorderGuide · matali</p></div></header>
<nav>${LANGS.map(([l, n]) => `<a href="#${l}">${esc(n)}</a>`).join('')}</nav>
${body}
<footer>matali · <a href="mailto:matali.truz@gmail.com">matali.truz@gmail.com</a> · <a href="index.html">BorderGuide</a> · <a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a></footer>
</main></body></html>
`);
  console.log(file, 'ok');
}
page('privacy.html', 'Gizlilik Politikası', 'Privacy Policy', [['lgPrivacy','docPrivacy'], ['lgThird','docThird']]);
page('terms.html', 'Kullanım Koşulları', 'Terms of Use · Disclaimer', [['lgTerms','docTerms'], ['lgDisclaimer','docDisclaimer'], ['lgLicenses','docLicenses']]);
