'use strict';
// ===== Yardımcılar =====
const FEED_URL = 'https://raw.githubusercontent.com/aliyuksekal/borderguide/main/law-updates.json';
const LANGS = [['tr','🇹🇷 Türkçe'],['en','🇬🇧 English'],['uz',"🇺🇿 O'zbekcha"],['ru','🇷🇺 Русский'],['ko','🇰🇷 한국어'],['zh','🇨🇳 中文']];
const K = { trips:'borderguide_trips', lang:'borderguide_lang', theme:'borderguide_theme', limits:'borderguide_limits',
  read:'borderguide_read_updates', remote:'borderguide_remote_updates', lastCheck:'borderguide_last_check',
  intro:'borderguide_intro_done', sel:'borderguide_sel_country', wiki:'borderguide_wiki_country' };

const store = {
  get(k, fb){ try { const v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); } catch(e){ return fb; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

let lang = store.get(K.lang, null);
if(!LANGS.some(l => l[0] === lang)){
  const nav = (navigator.language || 'en').slice(0,2).toLowerCase();
  lang = LANGS.some(l => l[0] === nav) ? nav : 'en';
}
function t(key, vars){
  let s = (I18N[lang] && I18N[lang][key]) ?? I18N.en[key] ?? I18N.tr[key] ?? key;
  if(vars) for(const k in vars) s = s.split('{'+k+'}').join(vars[k]);
  return s;
}
function L(o){ if(!o) return ''; if(typeof o === 'string') return o; return o[lang] || o.en || o.tr || Object.values(o)[0] || ''; }

// Tarihler: gün numarası (UTC gece yarısı / 86400000), saat dilimi ve yaz saati sorunlarından bağımsız.
function dn(s){ const p = String(s).split('-').map(Number); if(p.length !== 3 || p.some(isNaN)) return NaN; return Math.round(Date.UTC(p[0], p[1]-1, p[2]) / 864e5); }
function todayDn(){ const d = new Date(); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
function fmt(n){ const d = new Date(n * 864e5); const p = x => String(x).padStart(2,'0'); return `${p(d.getUTCDate())}.${p(d.getUTCMonth()+1)}.${d.getUTCFullYear()}`; }
function fmtIso(s){ const n = dn(s); return isNaN(n) ? esc(s) : fmt(n); }

// ===== Ülkeler ve kurallar =====
const CMAP = {}; COUNTRIES.forEach(c => CMAP[c.id] = c);
const cname = id => CMAP[id] ? `${CMAP[id].flag} ${L(CMAP[id].name)}` : esc(id);
let limits = store.get(K.limits, {});

function getRule(id){
  const base = (CMAP[id] && CMAP[id].rule) || {};
  if(base.banned) return { banned:true };
  const c = limits[id];
  const period = base.period || 180;
  if(c) return { win: c.win > 0 ? c.win : null, stay: c.stay > 0 ? c.stay : null, period, custom:true };
  return { win: base.win || null, stay: base.stay || null, period, custom:false };
}
function ruleText(r){
  if(r.banned) return t('bannedDesc');
  const parts = [];
  if(r.win) parts.push(t('ruleWin', { n:r.win, p:r.period }));
  if(r.stay) parts.push(t('ruleStay', { n:r.stay }));
  return parts.length ? parts.join(' · ') : t('ruleNone');
}

// ===== Kayıtlar =====
let trips = store.get(K.trips, []);
if(!Array.isArray(trips)) trips = [];
trips = trips.map(tr => {
  let id = tr.country;
  if(!CMAP[id]){ const m = COUNTRIES.find(c => c.old === id); id = m ? m.id : id; }
  const days = dn(tr.exit) - dn(tr.entry) + 1;
  return { id: tr.id || Date.now() + Math.random(), country:id, entry:tr.entry, exit:tr.exit, days: isNaN(days) ? 0 : days };
}).filter(tr => CMAP[tr.country] && tr.days > 0);
const saveTrips = () => store.set(K.trips, trips);

function daySet(country, extra){
  const s = new Set();
  const add = tr => { const a = dn(tr.entry), b = dn(tr.exit); for(let d = a; d <= b; d++) s.add(d); };
  trips.filter(tr => tr.country === country && (!extra || tr.id !== extra.excludeId)).forEach(add);
  if(extra && extra.add) add(extra.add);
  return s;
}
function countWin(set, d, period){ let n = 0; for(const x of set) if(x <= d && x > d - period) n++; return n; }

// Bir kalışı kontrol eder: ilk ihlal günü, en yüksek sayım ve en geç güvenli çıkış.
function checkStay(country, entry, exit, excludeId){
  const r = getRule(country);
  const a = dn(entry), b = dn(exit), days = b - a + 1;
  if(r.banned) return { banned:true, days };
  const set = daySet(country, { excludeId, add:{ entry, exit } });
  let firstWin = null, peak = 0;
  if(r.win){
    for(let d = a; d <= b; d++){
      const c = countWin(set, d, r.period);
      if(c > peak) peak = c;
      if(c > r.win && firstWin === null) firstWin = d;
    }
  }
  const stayOver = r.stay && days > r.stay ? a + r.stay : null;
  const firstBad = [firstWin, stayOver].filter(x => x !== null).sort((x,y) => x-y)[0] ?? null;
  return { rule:r, days, peak, firstWin, stayOver, firstBad, lastOk: firstBad === null ? b : firstBad - 1, set };
}

// ===== Tema =====
let theme = store.get(K.theme, 'auto');
const mq = window.matchMedia('(prefers-color-scheme: dark)');
function systemDark(){ try { if(window.AndroidBridge && AndroidBridge.isSystemDark) return !!AndroidBridge.isSystemDark(); } catch(e){} return mq.matches; }
function effTheme(){ return theme === 'auto' ? (systemDark() ? 'dark' : 'light') : theme; }
window.bgSystemThemeChanged = () => { if(theme === 'auto') setTheme('auto', false); };
function setTheme(th, save = true){
  theme = th; if(save) store.set(K.theme, th);
  const eff = effTheme();
  document.documentElement.className = 't-' + eff;
  ['light','dark','amoled','auto'].forEach(x => $('theme-btn-'+x).classList.toggle('active', x === th));
  try { window.AndroidBridge && AndroidBridge.setTheme(eff); } catch(e){}
}
mq.addEventListener && mq.addEventListener('change', () => { if(theme === 'auto') setTheme('auto', false); });

// ===== Dil =====
function fillSelects(){
  document.querySelectorAll('.lang-select').forEach(s => { s.innerHTML = LANGS.map(([v,n]) => `<option value="${v}">${n}</option>`).join(''); s.value = lang; });
  document.querySelectorAll('.country-select').forEach(s => {
    const cur = s.value;
    s.innerHTML = Object.keys(GROUPS).map(g => `<optgroup label="${esc(L(GROUPS[g]))}">` +
      COUNTRIES.filter(c => c.group === g).map(c => `<option value="${c.id}">${c.flag} ${esc(L(c.name))}</option>`).join('') + '</optgroup>').join('');
    if(cur) s.value = cur;
  });
}
function applyLang(){
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  fillSelects();
  resetDeleteBtn();
  $('intro-next').textContent = introStep < 2 ? t('next') : t('start');
  renderAll();
}
function changeLanguage(v){ lang = v; store.set(K.lang, v); applyLang(); }

// ===== Bildirim (toast) =====
let toastTimer;
function toast(msg){ const el = $('toast'); el.textContent = msg; el.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), 2600); }

// ===== Modallar =====
function openModal(id){
  const m = $(id); m.classList.remove('hidden'); m.classList.add('flex');
  if(id === 'notif-modal'){ closeNotifDetail(); renderNotifs(); }
  if(id === 'settings-modal'){ $('check-result').classList.add('hidden'); renderLastCheck(); }
}
function closeModal(id){ const m = $(id); m.classList.add('hidden'); m.classList.remove('flex'); if(id === 'edit-modal'){ editingId = null; resetDeleteBtn(); } }
function openModals(){ return [...document.querySelectorAll('.modal')].filter(m => !m.classList.contains('hidden')); }
document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if(e.target === m) closeModal(m.id); }));

// Android geri tuşu: true dönerse uygulama kapanmaz.
window.bgBack = function(){
  if(!$('intro').classList.contains('hidden')){ if(introStep > 0){ showIntro(introStep - 1); return true; } return false; }
  const open = openModals();
  if(open.length){
    const top = open[open.length - 1];
    if(top.id === 'notif-modal' && !$('notif-detail').classList.contains('hidden')){ closeNotifDetail(); return true; }
    closeModal(top.id); return true;
  }
  if(!$('tab-wiki').classList.contains('hidden')){ switchTab('dashboard'); return true; }
  return false;
};

// ===== Sekmeler =====
function switchTab(name){
  ['dashboard','wiki'].forEach(n => {
    $('tab-'+n).classList.toggle('hidden', n !== name);
    $('nav-'+n).classList.toggle('text-blue-400', n === name);
    $('nav-'+n).classList.toggle('text-slate-400', n !== name);
  });
  $('main').scrollTop = 0;
  if(name === 'wiki') renderWiki();
}

// ===== Ana kart =====
const selCountry = () => $('trip-country').value;
function renderDashboard(){
  const id = selCountry(), r = getRule(id), today = todayDn();
  $('rule-title').textContent = cname(id);
  $('rule-desc').textContent = ruleText(r);
  $('rule-src').textContent = r.banned ? '' : (r.custom ? t('ruleCustom') : t('ruleDefault'));
  $('sim-country').textContent = cname(id);
  const used = $('days-used'), lbl = $('days-used-label'), bar = $('progress-bar'), rem = $('days-remaining');
  $('progress-wrap').classList.toggle('hidden', !!r.banned || (!r.win && !r.stay));
  if(r.banned){
    used.textContent = '✕'; used.className = 'text-3xl font-black text-red-400';
    lbl.textContent = t('bannedTitle'); rem.textContent = t('bannedTitle'); rem.className = 'font-bold text-red-400 text-sm';
    return;
  }
  let n = 0, lim = 0;
  if(r.win){ n = countWin(daySet(id), today, r.period); lim = r.win; lbl.textContent = t('usedWin', { n:lim, p:r.period }); }
  else if(r.stay){
    const cur = trips.find(tr => tr.country === id && dn(tr.entry) <= today && dn(tr.exit) >= today);
    n = cur ? today - dn(cur.entry) + 1 : 0; lim = r.stay; lbl.textContent = t('usedStay', { n:lim });
  } else { used.textContent = '–'; used.className = 'text-3xl font-black text-slate-400'; lbl.textContent = t('ruleNone'); rem.textContent = '–'; rem.className = 'font-bold text-slate-400 text-sm'; return; }
  used.textContent = n;
  const over = n > lim, left = lim - n;
  used.className = 'text-3xl font-black ' + (over ? 'text-red-400' : 'text-blue-400');
  bar.style.width = Math.min(100, lim ? n / lim * 100 : 0) + '%';
  bar.className = 'h-2 rounded-full transition-all duration-500 bg-gradient-to-r ' + (over ? 'from-red-500 to-red-400' : left < 15 ? 'from-amber-500 to-red-400' : 'from-blue-500 to-emerald-400');
  rem.textContent = over ? t('overBy', { n: n - lim }) : t('daysN', { n:left });
  rem.className = 'font-bold text-sm ' + (over ? 'text-red-400' : left < 15 ? 'text-amber-400' : 'text-emerald-400');
}

// ===== Kayıt ekleme / liste =====
function validDates(e, x, errEl){
  const show = m => { errEl.textContent = m; errEl.classList.remove('hidden'); return false; };
  errEl.classList.add('hidden');
  if(!e || !x || isNaN(dn(e)) || isNaN(dn(x))) return show(t('errFill'));
  if(dn(x) < dn(e)) return show(t('errOrder'));
  return true;
}
function addTrip(){
  const country = selCountry(), entry = $('trip-entry').value, exit = $('trip-exit').value;
  if(!validDates(entry, exit, $('add-error'))) return;
  trips.push({ id: Date.now(), country, entry, exit, days: dn(exit) - dn(entry) + 1 });
  saveTrips();
  $('trip-entry').value = ''; $('trip-exit').value = '';
  renderAll(); toast(t('saved'));
}
function tripIssue(tr){
  const c = checkStay(tr.country, tr.entry, tr.exit, tr.id);
  if(c.banned) return { banned:true };
  if(c.firstBad === null) return null;
  if(c.stayOver !== null && (c.firstWin === null || c.stayOver <= c.firstWin)) return { d:c.days, l:c.rule.stay };
  return { d:c.peak, l:c.rule.win };
}
function renderTrips(){
  const el = $('trip-list');
  if(!trips.length){ el.innerHTML = `<p class="text-xs text-slate-500 text-center py-4">${esc(t('noLogs'))}</p>`; return; }
  el.innerHTML = [...trips].sort((a,b) => dn(b.entry) - dn(a.entry)).map(tr => {
    const bad = !!tripIssue(tr);
    return `<button onclick="openEditTrip(${tr.id})" class="w-full text-left bg-slate-900/50 border ${bad ? 'border-red-500/60' : 'border-slate-800'} p-3 rounded-xl flex justify-between items-center text-xs active:scale-[0.99] transition-transform">
      <div class="min-w-0"><p class="font-bold truncate">${esc(cname(tr.country))}${bad ? ' <i class="fa-solid fa-triangle-exclamation text-red-400 ml-1"></i>' : ''}</p>
      <p class="text-[11px] text-slate-400">${fmtIso(tr.entry)} – ${fmtIso(tr.exit)}</p></div>
      <div class="flex items-center gap-2 shrink-0"><span class="${bad ? 'text-red-400 bg-red-500/10' : 'text-blue-400 bg-blue-500/10'} font-bold px-2 py-1 rounded">${tr.days} ${esc(t('dayUnit'))}</span><i class="fa-solid fa-pen text-slate-500"></i></div>
    </button>`;
  }).join('');
}

// ===== Uyarı çubuğu =====
function renderWarnBar(){
  const list = [];
  const e = $('trip-entry').value, x = $('trip-exit').value, c = selCountry();
  if(e && x && !isNaN(dn(e)) && !isNaN(dn(x)) && dn(x) >= dn(e)){
    const i = tripIssue({ id:'__planned', country:c, entry:e, exit:x });
    if(i) list.push({ ...i, country:c, planned:true });
  }
  trips.forEach(tr => { const i = tripIssue(tr); if(i) list.push({ ...i, country:tr.country, planned:false }); });
  const bar = $('warn-bar');
  if(!list.length){ bar.classList.add('hidden'); bar.innerHTML = ''; return; }
  const rows = list.slice(0,2).map(w => `<p class="text-[12px] font-bold leading-snug">${esc(w.banned ? t('warnBanned', { c:cname(w.country) }) : t('warnOver', { c:cname(w.country), d:w.d, l:w.l, p: w.planned ? t('planned') : '' }))}</p>`).join('');
  bar.innerHTML = rows + (list.length > 2 ? `<p class="text-[11px] opacity-90">${esc(t('warnMore', { n:list.length - 2 }))}</p>` : '') + `<p class="text-[10px] opacity-80">${esc(t('warnHint'))}</p>`;
  bar.classList.remove('hidden');
}

// ===== Simülatör =====
function simulateTrip(){
  const res = $('sim-result'), entry = $('sim-entry').value, exit = $('sim-exit').value, id = selCountry();
  const show = (kind, msg) => {
    const cls = { ok:'bg-emerald-500/10 border-emerald-500/30 text-emerald-300', bad:'bg-red-500/10 border-red-500/40 text-red-300', info:'bg-amber-500/10 border-amber-500/30 text-amber-300' }[kind];
    res.className = 'text-xs p-3 rounded-xl border leading-relaxed ' + cls; res.textContent = msg; res.classList.remove('hidden');
  };
  if(!entry || !exit || isNaN(dn(entry)) || isNaN(dn(exit))) return show('info', t('errFill'));
  if(dn(exit) < dn(entry)) return show('info', t('errOrder'));
  const r = getRule(id);
  if(r.banned) return show('bad', t('warnBanned', { c:cname(id) }));
  if(!r.win && !r.stay) return show('info', t('simNoRule'));
  const c = checkStay(id, entry, exit);
  const a = dn(entry), b = dn(exit);
  if(c.firstBad === null){
    if(r.win) return show('ok', t('simOkWin', { u:countWin(c.set, b, r.period), l:r.win, p:r.period }));
    return show('ok', t('simOkStay', { d:c.days, l:r.stay }));
  }
  if(c.firstBad === a){
    // Giriş günü bile hak yok: en erken uygun giriş tarihini ara.
    const base = daySet(id);
    for(let d = a + 1; d <= a + 400; d++){
      const s = new Set(base); s.add(d);
      if(countWin(s, d, r.period) <= r.win) return show('bad', t('simNoEntry', { date:fmt(d) }));
    }
    return show('bad', t('simNoEntryFar'));
  }
  if(c.firstWin !== null && (c.stayOver === null || c.firstWin <= c.stayOver))
    return show('bad', t('simOverWin', { date:fmt(c.firstWin), l:r.win, p:r.period, last:fmt(c.lastOk) }));
  return show('bad', t('simOverStay', { d:c.days, l:r.stay, last:fmt(c.lastOk) }));
}

// ===== Düzenleme =====
let editingId = null, deleteArmed = null;
function openEditTrip(id){
  const tr = trips.find(x => x.id === id); if(!tr) return;
  editingId = id;
  $('edit-country').value = tr.country; $('edit-entry').value = tr.entry; $('edit-exit').value = tr.exit;
  $('edit-error').classList.add('hidden'); resetDeleteBtn(); openModal('edit-modal');
}
function resetDeleteBtn(){ clearTimeout(deleteArmed); deleteArmed = null; $('edit-delete').innerHTML = `<i class="fa-solid fa-trash mr-1"></i>${esc(t('del'))}`; }
function saveEditTrip(){
  const tr = trips.find(x => x.id === editingId); if(!tr) return;
  const entry = $('edit-entry').value, exit = $('edit-exit').value;
  if(!validDates(entry, exit, $('edit-error'))) return;
  Object.assign(tr, { country:$('edit-country').value, entry, exit, days: dn(exit) - dn(entry) + 1 });
  saveTrips(); closeModal('edit-modal'); renderAll(); toast(t('updated'));
}
function deleteEditTrip(){
  if(editingId === null) return;
  if(deleteArmed === null){
    $('edit-delete').innerHTML = `<i class="fa-solid fa-trash mr-1"></i>${esc(t('delConfirm'))}`;
    deleteArmed = setTimeout(resetDeleteBtn, 3000); return;
  }
  trips = trips.filter(x => x.id !== editingId);
  saveTrips(); closeModal('edit-modal'); renderAll(); toast(t('deleted'));
}

// ===== Limit ayarı =====
function openLimitModal(){
  const id = selCountry(), r = getRule(id);
  if(r.banned){ toast(t('bannedDesc')); return; }
  $('limit-country').textContent = cname(id);
  $('limit-win-lbl').textContent = t('limitWin', { p:r.period });
  $('limit-win').value = r.win || ''; $('limit-stay').value = r.stay || '';
  openModal('limit-modal');
}
function saveLimit(){
  const id = selCountry();
  const num = v => { const n = parseInt(v, 10); return n > 0 && n <= 3650 ? n : null; };
  limits[id] = { win: num($('limit-win').value), stay: num($('limit-stay').value) };
  store.set(K.limits, limits); closeModal('limit-modal'); renderAll(); toast(t('limitSaved'));
}
function resetLimit(){ delete limits[selCountry()]; store.set(K.limits, limits); closeModal('limit-modal'); renderAll(); toast(t('limitSaved')); }

// ===== Varışta kayıt =====
function regDeadline(entry, n, working){
  let d = dn(entry);
  if(!working) return d + n;
  let c = 0;
  while(c < n){ d++; const w = new Date(d * 864e5).getUTCDay(); if(w !== 0 && w !== 6) c++; }
  return d;
}
function renderReg(){
  const id = selCountry(), type = $('stay-type').value, entry = $('trip-entry').value;
  const d = REG[id] || REG_DEFAULT;
  let h = `<div class="flex items-start justify-between gap-2"><span class="text-[10px] font-bold text-amber-400 uppercase tracking-wider"><i class="fa-solid fa-file-signature mr-1"></i>${esc(t('regTitle'))}</span><span class="text-[10px] text-right ${d.ok ? 'text-emerald-400' : 'text-slate-400'}">${esc(d.ok ? t('regDated') : t('regGeneral'))}</span></div>`;
  if(type === 'hotel') h += `<p>${esc(L(d.hotel))}</p>`;
  else {
    h += `<p>${esc(L(d.home))}</p>`;
    if(d.days) h += `<p><b class="text-slate-100">${esc(t('regDeadline'))}:</b> ${d.days} ${esc(d.dayType === 'working' ? t('wd') : t('cd'))}</p>`;
    if(d.where) h += `<p><b class="text-slate-100">${esc(t('regWhere'))}:</b> ${esc(L(d.where))}</p>`;
    if(d.calc && d.days && entry && !isNaN(dn(entry))) h += `<p class="text-amber-300 font-semibold">${esc(t('regLast'))}: ${fmt(regDeadline(entry, d.days, d.dayType === 'working'))}</p>`;
  }
  if(d.note) h += `<p class="text-[10px] text-slate-400">${esc(L(d.note))}</p>`;
  $('reg-info').innerHTML = h;
}

// ===== Rehber =====
function renderWiki(){
  const id = $('wiki-country').value, c = CMAP[id]; if(!c) return;
  store.set(K.wiki, id);
  const r = getRule(id), danger = !!r.banned;
  const block = (icon, color, title, text) => `<div class="space-y-1"><span class="text-[10px] font-bold ${color} uppercase tracking-wider"><i class="fa-solid ${icon} mr-1"></i>${esc(title)}</span><p class="text-sm text-slate-300 leading-relaxed bg-black/30 p-3 rounded-xl border border-slate-800/80">${esc(text)}</p></div>`;
  $('wiki-card').innerHTML = `<div class="bg-slate-900/50 border ${danger ? 'border-red-500/70' : 'border-slate-800'} rounded-2xl p-4 space-y-4">
    <div class="border-b border-slate-800 pb-2"><h3 class="font-bold text-base">${esc(cname(id))}</h3><p class="text-xs ${danger ? 'text-red-400' : 'text-slate-400'} mt-0.5">${esc(ruleText(r))}</p></div>
    ${block('fa-triangle-exclamation', 'text-red-400', t('penalty'), L(c.pen))}
    ${block('fa-building-columns', 'text-blue-400', t('visaCenter'), L(c.visa))}
    ${block('fa-signal', 'text-emerald-400', t('telecom'), L(c.tel))}
    <p class="text-[11px] text-amber-400/90 leading-relaxed"><i class="fa-solid fa-circle-info mr-1"></i>${esc(t('wikiNote', { date:fmt(dn(DATA_DATE)) }))}</p>
  </div>`;
}

// ===== Yasa değişikliği bildirimleri =====
function allUpdates(){
  const remote = store.get(K.remote, []);
  const list = [...LAW_UPDATES];
  (Array.isArray(remote) ? remote : []).forEach(u => { if(!list.some(x => x.id === u.id)) list.push(u); });
  return list.sort((a,b) => String(b.date).localeCompare(String(a.date)));
}
const getRead = () => { const r = store.get(K.read, []); return Array.isArray(r) ? r : []; };
function renderNotifs(){
  const read = getRead(), list = allUpdates();
  const unread = list.filter(u => !read.includes(u.id)).length;
  const badge = $('notif-badge');
  badge.textContent = unread; badge.classList.toggle('hidden', !unread); badge.classList.toggle('flex', !!unread);
  const el = $('notif-list');
  if(!list.length){ el.innerHTML = `<p class="text-xs text-slate-500 text-center py-4">${esc(t('notifEmpty'))}</p>`; return; }
  el.innerHTML = list.map((u, i) => {
    const isNew = !read.includes(u.id);
    return `<button onclick="openNotif(${i})" class="w-full text-left bg-slate-950 border ${isNew ? 'border-amber-500/50' : 'border-slate-800'} rounded-xl p-3 flex items-start gap-3 active:scale-[0.99] transition-transform">
      <span class="text-xl leading-none">${esc(u.flag || '🌐')}</span>
      <span class="flex-1 min-w-0"><span class="block text-xs font-bold ${isNew ? 'text-slate-100' : 'text-slate-300'}">${esc(L(u.title))}</span><span class="block text-[10px] text-slate-500 mt-0.5">${fmtIso(u.date)}</span></span>
      ${isNew ? '<span class="w-2 h-2 rounded-full bg-red-500 mt-1 shrink-0"></span>' : ''}</button>`;
  }).join('');
}
function openNotif(i){
  const u = allUpdates()[i]; if(!u) return;
  const read = getRead(); if(!read.includes(u.id)){ read.push(u.id); store.set(K.read, read); }
  $('notif-list').classList.add('hidden');
  const d = $('notif-detail'); d.classList.remove('hidden');
  d.innerHTML = `<button onclick="closeNotifDetail()" class="text-sm text-blue-400 flex items-center"><i class="fa-solid fa-chevron-left mr-1"></i>${esc(t('back'))}</button>
    <div class="flex items-center gap-2"><span class="text-2xl">${esc(u.flag || '🌐')}</span><h4 class="font-bold text-sm">${esc(L(u.title))}</h4></div>
    <p class="text-[11px] text-slate-500">${fmtIso(u.date)}</p>
    <p class="text-sm text-slate-300 leading-relaxed bg-black/30 p-3 rounded-xl border border-slate-800">${esc(L(u.body))}</p>
    ${u.source ? `<p class="text-[11px] text-slate-400"><i class="fa-solid fa-link mr-1"></i>${esc(t('source'))}: ${esc(u.source)}</p>` : ''}
    <p class="text-[11px] text-amber-400/90">${esc(t('notifWarn'))}</p>`;
  renderNotifs();
}
function closeNotifDetail(){ $('notif-detail').classList.add('hidden'); $('notif-list').classList.remove('hidden'); }

function validUpdate(x){ return x && typeof x.id === 'string' && x.title && x.body && typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date); }
function renderLastCheck(){ const ts = store.get(K.lastCheck, 0); $('last-check').textContent = ts ? new Date(ts).toLocaleString(lang) : t('never'); }
async function checkLawUpdates(manual){
  const btn = $('btn-check'), out = $('check-result');
  if(manual){ btn.disabled = true; btn.textContent = t('checking'); out.classList.add('hidden'); }
  let msg;
  try {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(FEED_URL + '?t=' + Date.now(), { cache:'no-store', signal:ctrl.signal });
    clearTimeout(timer);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if(!Array.isArray(data)) throw new Error('format');
    const known = new Set(allUpdates().map(u => u.id));
    const fresh = data.filter(validUpdate);
    const added = fresh.filter(u => !known.has(u.id)).length;
    store.set(K.remote, fresh.filter(u => !LAW_UPDATES.some(b => b.id === u.id)));
    store.set(K.lastCheck, Date.now());
    msg = added ? t('checkNew', { n:added }) : t('checkNone');
    renderNotifs();
  } catch(e){ msg = t('checkFail'); }
  renderLastCheck();
  if(manual){ btn.disabled = false; btn.textContent = t('btnCheck'); out.textContent = msg; out.classList.remove('hidden'); }
}

// ===== Tanıtım ekranı =====
let introStep = 0;
function showIntro(step){
  introStep = step;
  document.querySelectorAll('.intro-slide').forEach(s => s.classList.toggle('hidden', +s.dataset.slide !== step));
  document.querySelectorAll('.intro-dot').forEach((d, i) => { d.classList.toggle('bg-blue-500', i === step); d.classList.toggle('bg-slate-700', i !== step); });
  $('intro-next').textContent = step < 2 ? t('next') : t('start');
  const el = $('intro'); el.classList.remove('hidden'); el.classList.add('flex');
}
function introNext(){
  if(introStep < 2) return showIntro(introStep + 1);
  store.set(K.intro, true);
  $('intro').classList.add('hidden'); $('intro').classList.remove('flex');
}

// ===== Başlat =====
function renderAll(){
  store.set(K.sel, selCountry());
  renderDashboard(); renderReg(); renderTrips(); renderWarnBar(); renderNotifs();
  if(!$('tab-wiki').classList.contains('hidden')) renderWiki();
  if(!$('sim-result').classList.contains('hidden')) simulateTrip();
}
function init(){
  $('hdr-data-date').textContent = fmt(dn(DATA_DATE));
  try { const v = window.AndroidBridge && AndroidBridge.getVersion(); if(v) $('app-version').textContent = v; } catch(e){}
  fillSelects();
  const sel = store.get(K.sel, 'schengen'); $('trip-country').value = CMAP[sel] ? sel : 'schengen';
  const wk = store.get(K.wiki, 'schengen'); $('wiki-country').value = CMAP[wk] ? wk : 'schengen';
  setTheme(theme, false);
  document.querySelectorAll('.lang-select').forEach(s => s.addEventListener('change', e => changeLanguage(e.target.value)));
  $('trip-country').addEventListener('change', () => { $('sim-result').classList.add('hidden'); renderAll(); });
  $('wiki-country').addEventListener('change', renderWiki);
  $('stay-type').addEventListener('change', renderReg);
  ['trip-entry','trip-exit'].forEach(i => ['change','input'].forEach(ev => $(i).addEventListener(ev, () => { renderReg(); renderWarnBar(); })));
  applyLang();
  if(!store.get(K.intro, false)) showIntro(0);
  const last = store.get(K.lastCheck, 0);
  if(Date.now() - last > 864e5) checkLawUpdates(false);
  document.addEventListener('visibilitychange', () => { if(!document.hidden) renderDashboard(); });
}
init();
