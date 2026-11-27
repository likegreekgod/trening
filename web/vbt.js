/* Siła z Ruchu: śledzenie talerza na klatkach filmu (tor sztangi i prędkość), wspólne dla aplikacji klienta (app.js) i panelu trenera (trener.js).
 * Zwykły skrypt bez modułów: funkcje są globalne, ładowany po lib.js (TL.PLATE_M), przed app.js / trener.js. Analiza wyniku: TL.analyse, TL.vbtOut, TL.pathSVG. */
'use strict';
/* ---------- śledzenie talerza na klatkach filmu: dopasowanie wzorca (SAD) na zmniejszonym szarym obrazie, co 1/30 s ---------- */
/**
 * src: { w, h, t0, t1, draw(ctx, t, W, H) → Promise } – klatka z chwili t narysowana na ctx (film albo obraz testowy)
 * c0: środek talerza, r0: promień [px filmu]; talerz 450 mm kalibruje skalę.
 * Wynik: [{t, x, y}] w metrach, y w górę, względem pierwszej klatki.
 */
async function track(src, c0, r0, onProg, abort){
  const k = Math.min(1, 28 / r0), rw = r0 * k, W = Math.round(src.w * k), H = Math.round(src.h * k);
  const wc = document.createElement('canvas'); wc.width = W; wc.height = H;
  const wx = wc.getContext('2d', { willReadFrequently: true });
  const th = Math.max(8, Math.round(rw * 0.75)), sr = Math.max(8, Math.round(rw * 0.7)), side = 2 * th + 1;
  const grey = img => { const d = img.data, g = new Float32Array(img.width * img.height); for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; return g; };
  let cx = c0.x * k, cy = c0.y * k, tpl = null;
  const pts = [], dt = 1 / 30;
  for (let t = src.t0; t <= src.t1 + 1e-6; t += dt) {
    if (abort && abort.stop) break;
    await src.draw(wx, t, W, H);
    const x0 = Math.max(0, Math.floor(cx - th - sr)), y0 = Math.max(0, Math.floor(cy - th - sr));
    const x1 = Math.min(W, Math.ceil(cx + th + sr + 1)), y1 = Math.min(H, Math.ceil(cy + th + sr + 1));
    const rg = x1 - x0, hg = y1 - y0;
    if (rg < side || hg < side) break;                                          // talerz wyszedł z kadru
    const g = grey(wx.getImageData(x0, y0, rg, hg));
    if (!tpl) {
      tpl = new Float32Array(side * side);
      const ox = Math.round(cx - th) - x0, oy = Math.round(cy - th) - y0;
      for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) tpl[j * side + i] = g[(oy + j) * rg + ox + i];
      pts.push({ t, x: cx / k, y: cy / k });
      continue;
    }
    let best = Infinity, bx = 0, by = 0; const sc = {};
    for (let dy = -sr; dy <= sr; dy++) for (let dx = -sr; dx <= sr; dx++) {
      const ox = Math.round(cx - th + dx) - x0, oy = Math.round(cy - th + dy) - y0;
      if (ox < 0 || oy < 0 || ox + side > rg || oy + side > hg) continue;
      let s = 0;
      for (let j = 0; j < side && s < best; j += 2) { const ro = (oy + j) * rg + ox, to = j * side; for (let i = 0; i < side; i += 2) { const d = g[ro + i] - tpl[to + i]; s += d < 0 ? -d : d; } }
      sc[dx + ',' + dy] = s;
      if (s < best) { best = s; bx = dx; by = dy; }
    }
    // dokładność poniżej piksela: parabola przez sąsiednie wyniki
    const sub = (a, b, c) => { const den = a - 2 * b + c; return den > 0 ? 0.5 * (a - c) / den : 0; };
    const fx = sc[(bx - 1) + ',' + by] != null && sc[(bx + 1) + ',' + by] != null ? sub(sc[(bx - 1) + ',' + by], best, sc[(bx + 1) + ',' + by]) : 0;
    const fy = sc[bx + ',' + (by - 1)] != null && sc[bx + ',' + (by + 1)] != null ? sub(sc[bx + ',' + (by - 1)], best, sc[bx + ',' + (by + 1)]) : 0;
    cx = Math.round(cx) + bx + Math.max(-.5, Math.min(.5, fx)); cy = Math.round(cy) + by + Math.max(-.5, Math.min(.5, fy));
    const ox = Math.round(cx - th) - x0, oy = Math.round(cy - th) - y0;
    if (ox >= 0 && oy >= 0 && ox + side <= rg && oy + side <= hg)                 // wzorzec powoli nadąża za zmianą wyglądu talerza
      for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) { const q = j * side + i; tpl[q] = 0.85 * tpl[q] + 0.15 * g[(oy + j) * rg + ox + i]; }
    pts.push({ t, x: cx / k, y: cy / k });
    if (onProg) onProg((t - src.t0) / (src.t1 - src.t0), cx / k, cy / k);
  }
  if (!pts.length) return [];
  const m = TL.PLATE_M / (2 * r0);
  return pts.map(p => ({ t: p.t - pts[0].t, x: (p.x - pts[0].x) * m, y: -(p.y - pts[0].y) * m }));
}
/** film jako źródło klatek: przewinięcie do t i rysunek; analiza najwyżej 20 s od wybranego startu */
const videoSource = v => ({ w: v.videoWidth, h: v.videoHeight, t0: v.currentTime, t1: Math.min(v.duration, v.currentTime + 20),
  draw: (ctx, t, W, H) => new Promise(res => {
    let ok = false;
    const done = () => { if (ok) return; ok = true; v.removeEventListener('seeked', done); ctx.drawImage(v, 0, 0, W, H); res(); };
    v.addEventListener('seeked', done); v.currentTime = t; setTimeout(done, 1500);
  }) });
/** filmy nagrane w przeglądarce nie mają długości w nagłówku: przewinięcie na koniec ją ustala */
const fixDuration = v => new Promise(res => {
  if (isFinite(v.duration)) return res();
  const on = () => { if (isFinite(v.duration)) { v.removeEventListener('durationchange', on); res(); } };
  v.addEventListener('durationchange', on); v.currentTime = 1e101; setTimeout(res, 4000);
});
