// BorderGuide açılış animasyonu (canvas + WebGL küre) — uygulamanın üstünde oynar, sonunda gerçek uygulama açılır.
// Akış: simge belirir, içindeki dünya döner → Türkiye'den kalkan uçak iziyle sağ üst köşeye uçar →
// uçarken alttaki yazı belirir → simge başlıktaki logo yerine küçülür, uygulama açılır.
(function(){
  const T = 3.7;
  let W = 390, H = 844, IC = { cx: 195, cy: 363, size: 280 }, HDR = { cx: 32, cy: 28, size: 40 };
  const PL = { w: 253, h: 121, ang: -0.26 };                       // uçak görseli (simge px), burun sağ-üst
  const G = { cx: 0.4915, cy: 0.4294, rs: 0.3862, tLon: 0.1640, tLat: 0.5003 };
  const ROT0 = 0.80;                                                // başlangıç dönüş farkı (radyan)
  const APPEAR = [0, .5], SPINEND = 2.7, FLY = [1.0, 2.5], TEXT = [1.4, 2.4], OPEN = [2.75, 3.55];
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const easeOutCubic = x => 1 - Math.pow(1 - x, 3);
  const easeInCubic = x => x * x * x;
  const easeInOut = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const lonOffset = t => ROT0 * (1 - easeOutCubic(prog(t, 0, SPINEND)));   // azaldıkça yüzey sağa akar (doğuya dönüş)

  // Türkiye'nin simge üzerindeki konumu (0-1), dönüşe göre
  function turkeyAt(t){
    const lon = G.tLon - lonOffset(t);
    return { x: G.cx + G.rs * Math.cos(G.tLat) * Math.sin(lon), y: G.cy - G.rs * Math.sin(G.tLat), front: Math.cos(lon) > 0 };
  }

  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const STARS = Array.from({ length: 70 }, () => ({ x: rnd() * W, y: rnd() * H, r: .4 + rnd() * 1.2, ph: rnd() * 6.28 }));
  const SPARK = Array.from({ length: 26 }, () => ({ o: rnd(), d: (rnd() - .5) * 10, r: .6 + rnd() * 1.6, ph: rnd() * 6.28 }));

  function makeGlobe(N, texImg){
    const c = document.createElement('canvas'); c.width = c.height = N;
    const gl = c.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, alpha: true });
    if (!gl) return null;
    const vs = 'attribute vec2 p; varying vec2 uv; void main(){ uv = p * .5 + .5; uv.y = 1. - uv.y; gl_Position = vec4(p, 0., 1.); }';
    const fs = 'precision highp float; varying vec2 uv; uniform sampler2D tex; uniform vec3 g; uniform float off;' +
      'const float PI = 3.14159265;' +
      'void main(){ vec2 d = (uv - g.xy) / g.z; d.y = -d.y; float r2 = dot(d, d); if (r2 > 1.) { gl_FragColor = vec4(0.); return; }' +
      ' float nz = sqrt(1. - r2); float lat = asin(clamp(d.y, -1., 1.)); float lon = atan(d.x, nz) + off;' +
      ' vec2 tc = vec2(fract((lon + PI) / (2. * PI)), (PI * .5 - lat) / PI);' +
      ' vec3 col = texture2D(tex, tc).rgb; float edge = smoothstep(1., .985, sqrt(r2));' +
      ' gl_FragColor = vec4(col * edge, edge); }';
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, texImg);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const uG = gl.getUniformLocation(pr, 'g'), uOff = gl.getUniformLocation(pr, 'off');
    gl.uniform3f(uG, G.cx, G.cy, G.rs); gl.viewport(0, 0, N, N);
    return { canvas: c, draw(off){ gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.uniform1f(uOff, off); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); } };
  }

  function create(canvas, A, target){
    W = Math.max(280, canvas.clientWidth || window.innerWidth); H = Math.max(400, canvas.clientHeight || window.innerHeight);
    IC = { cx: W / 2, cy: H * 0.43, size: Math.min(300, W * 0.72, H * 0.4) };
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    function hdr(){ try { const r = target && target(); if (r && r.width > 0) return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, size: r.width }; } catch(e){} return { cx: 32, cy: 28, size: 40 }; }
    let hdrAt = null;
    const g = canvas.getContext('2d'); g.imageSmoothingQuality = 'high';
    const N = 768;
    const globe = makeGlobe(N, A.tex);
    const icon = document.createElement('canvas'); icon.width = icon.height = N;
    const ic = icon.getContext('2d'); ic.imageSmoothingQuality = 'high';
    let lastOff = null;
    function iconFrame(t){
      const off = lonOffset(t);
      if (off === lastOff) return icon;
      lastOff = off;
      ic.clearRect(0, 0, N, N);
      if (globe){ globe.draw(off); ic.drawImage(globe.canvas, 0, 0); }
      ic.drawImage(A.overlay, 0, 0, N, N);
      if (!globe) ic.drawImage(A.base, 0, 0, N, N);
      return icon;
    }
    const toScreen = (p, cx, cy, sc) => ({ x: cx + (p.x - .5) * IC.size * sc, y: cy + (p.y - .5) * IC.size * sc });
    let flight = null;
    function flightPath(){
      if (flight) return flight;
      const P0 = toScreen(turkeyAt(FLY[0]), IC.cx, IC.cy, 1);
      const P1 = { x: P0.x + 70, y: P0.y - 50 }, P2 = { x: W - 10, y: Math.max(60, IC.cy - IC.size * .95) }, P3 = { x: W + 120, y: -110 };
      const bez = s => { const u = 1 - s; return { x: u*u*u*P0.x + 3*u*u*s*P1.x + 3*u*s*s*P2.x + s*s*s*P3.x, y: u*u*u*P0.y + 3*u*u*s*P1.y + 3*u*s*s*P2.y + s*s*s*P3.y }; };
      const tan = s => { const u = 1 - s; return { x: 3*u*u*(P1.x-P0.x) + 6*u*s*(P2.x-P1.x) + 3*s*s*(P3.x-P2.x), y: 3*u*u*(P1.y-P0.y) + 6*u*s*(P2.y-P1.y) + 3*s*s*(P3.y-P2.y) }; };
      return (flight = { bez, tan, P0 });
    }

    function renderAt(t){
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.globalAlpha = 1;
      g.clearRect(0, 0, W, H);
      const opBg = easeInOut(prog(t, OPEN[0], OPEN[1]));
      if (t >= OPEN[0] - .05 && !hdrAt) hdrAt = hdr();
      if (hdrAt) HDR = hdrAt;
      g.globalAlpha = 1 - opBg;
      const bg = g.createRadialGradient(W/2, H*.4, 10, W/2, H*.45, H*.8);
      bg.addColorStop(0, '#1d3f8f'); bg.addColorStop(.45, '#0b1736'); bg.addColorStop(1, '#030816');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      for (const s of STARS){ g.globalAlpha = (.3 + .35 * Math.sin(s.ph + t * 3)) * (1 - opBg); g.fillStyle = '#cfe0ff'; g.beginPath(); g.arc(s.x * W / 390, s.y * H / 844, s.r, 0, 6.283); g.fill(); }
      g.globalAlpha = 1;

      // simge (dönmez): belirir, açılışta başlık logosuna küçülür
      const ap = easeOutCubic(prog(t, APPEAR[0], APPEAR[1]));
      const op = easeInOut(prog(t, OPEN[0], OPEN[1])), mv = easeInOut(prog(t, OPEN[0] - .05, OPEN[1] - .25));
      let sc = (.94 + .06 * ap) * (1 - mv) + (HDR.size / IC.size) * mv;
      const cx = IC.cx + (HDR.cx - IC.cx) * mv, cy = IC.cy + (HDR.cy - IC.cy) * mv;
      const iconAlpha = ap * (1 - prog(t, OPEN[1] - .3, OPEN[1] - .05));
      const frame = iconFrame(t);
      g.save(); g.translate(cx, cy); g.scale(sc, sc); g.globalAlpha = iconAlpha;
      g.shadowColor = 'rgba(70,140,255,.5)'; g.shadowBlur = 50 * (1 - mv);
      g.drawImage(frame, -IC.size/2, -IC.size/2, IC.size, IC.size);
      g.shadowBlur = 0;
      const tp = easeOutCubic(prog(t, TEXT[0], TEXT[1]));
      if (tp > 0){ g.globalAlpha = iconAlpha * tp; g.drawImage(A.text, -IC.size/2, -IC.size/2 + 10 * (1 - tp), IC.size, IC.size); }
      g.restore();

      // kalkıştan önce Türkiye'de nabız
      const pulse = prog(t, .45, 1.05);
      if (pulse > 0 && pulse < 1){
        const p = toScreen(turkeyAt(t), IC.cx, IC.cy, sc);
        g.strokeStyle = `rgba(255,214,102,${1 - pulse})`; g.lineWidth = 2;
        g.beginPath(); g.arc(p.x, p.y, 3 + pulse * 20, 0, 6.283); g.stroke();
      }

      // uçuş: iz ve parıltılar
      const fp = prog(t, FLY[0], FLY[1]);
      if (t >= FLY[0] && fp < 1){
        const F = flightPath();
        const s = easeInCubic(fp) * .6 + easeInOut(fp) * .4;
        const tail = Math.max(0, s - .55), fade = 1 - prog(t, FLY[1] - .25, FLY[1]);
        g.lineCap = 'round';
        for (let i = 0; i < 30; i++){
          const a0 = tail + (s - tail) * i / 30, a1 = tail + (s - tail) * (i + 1) / 30, q0 = F.bez(a0), q1 = F.bez(a1), f = (i + 1) / 30;
          g.strokeStyle = `rgba(255,255,255,${.85 * f * fade})`; g.lineWidth = 1 + 4.5 * f * (.4 + s);
          g.beginPath(); g.moveTo(q0.x, q0.y); g.lineTo(q1.x, q1.y); g.stroke();
        }
        for (const sp of SPARK){
          const a = tail + (s - tail) * sp.o, q = F.bez(a), d = F.tan(Math.max(.001, a)), L = Math.hypot(d.x, d.y) || 1;
          g.globalAlpha = fade * sp.o * (.5 + .5 * Math.sin(sp.ph + t * 14));
          g.fillStyle = '#fff6d6'; g.beginPath(); g.arc(q.x - d.y / L * sp.d, q.y + d.x / L * sp.d, sp.r, 0, 6.283); g.fill();
        }
        g.globalAlpha = 1;
        const p = F.bez(s), d = F.tan(Math.max(.001, s));
        const heading = Math.atan2(d.y, d.x), ang = PL.ang + (heading - PL.ang) * .55 * easeOutCubic(clamp(s * 2.2));
        const k = IC.size / 1024, scl = (.35 + 2.3 * Math.pow(s, 1.3)) * easeOutCubic(prog(t, FLY[0], FLY[0] + .2));
        g.save(); g.translate(p.x, p.y); g.rotate(ang); g.scale(scl, scl);
        g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 18; g.shadowOffsetY = 10;
        g.drawImage(A.plane, -PL.w * k / 2, -PL.h * k / 2, PL.w * k, PL.h * k);
        g.restore();
      }

      // açılış: arka plan saydamlaşır, altta gerçek uygulama görünür; logo hedef yerine oturur
      if (op > 0 && op < 1){ g.save(); g.globalAlpha = iconAlpha; g.translate(cx, cy); g.scale(sc, sc); g.drawImage(frame, -IC.size/2, -IC.size/2, IC.size, IC.size); g.drawImage(A.text, -IC.size/2, -IC.size/2, IC.size, IC.size); g.restore(); }
    }
    return { renderAt, duration: T, webgl: !!globe, open: OPEN[0], gl: globe };
  }

  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

  // Uygulama başlangıcı: #splash katmanında oynatır, dokununca hızlanır, bitince katmanı kaldırır.
  async function start(){
    const box = document.getElementById('splash'), canvas = document.getElementById('splash-canvas');
    if (!box || !canvas) return;
    const done = () => {
      box.classList.add('splash-gone'); setTimeout(() => box.remove(), 50);
      try { if (typeof setTheme === 'function' && typeof theme !== 'undefined') setTheme(theme, false); } catch(e){}
    };
    try { window.AndroidBridge && AndroidBridge.setTheme('dark'); } catch(e){}
    try {
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
      const A = { overlay: await load('splash/overlay.webp'), text: await load('splash/text.webp'), plane: await load('splash/plane.webp'), tex: await load('splash/globe_tex.jpg'), base: await load('splash/base.webp') };
      const target = () => {
        const intro = document.getElementById('intro');
        const el = intro && !intro.classList.contains('hidden') ? intro.querySelector('img') : document.querySelector('#app-header img');
        return el ? el.getBoundingClientRect() : null;
      };
      const anim = create(canvas, A, target);
      let t0 = performance.now(), skip = 0, raf = 0;
      box.addEventListener('pointerdown', () => { const t = (performance.now() - t0) / 1000 + skip; if (t < anim.open) skip += anim.open - t; }, { passive: true });
      const step = now => {
        const t = (now - t0) / 1000 + skip;
        anim.renderAt(Math.min(t, T));
        if (!box.dataset.live){ box.dataset.live = '1'; box.style.background = 'transparent'; }
        if (t < T) raf = requestAnimationFrame(step);
        else { try { const gl = anim.gl && anim.gl.canvas.getContext('webgl'); const ext = gl && gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch(e){} done(); }
      };
      raf = requestAnimationFrame(step);
    } catch(e){ done(); }
  }
  window.BorderGuideSplash = { start, create, load };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
