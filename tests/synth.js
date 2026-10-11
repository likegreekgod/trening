// Ruch syntetyczny do testów analizy ścieżki i VBT (metry, y w górę od startu, 30 kl/s). Szum deterministyczny ±1 mm.
const ss = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
const noise = k => (((k * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.002;

/** rwanie z przysiadem: ciąg do 96 cm, wejście pod sztangę (−17 cm), pauza, wstanie */
function snatchAt(T) {
  if (T < 0.95) { const u = T / 0.95; return { y: 0.96 * (1 - Math.cos(Math.PI * Math.pow(u, 1.6))) / 2, x: -0.035 * Math.sin(Math.PI * Math.min(1, u * 1.6)) + 0.05 * ss((u - 0.62) / 0.38) }; }
  if (T < 1.18) { const u = (T - 0.95) / 0.23; return { y: 0.96 - 0.17 * ss(u), x: 0.05 - 0.09 * ss(u) }; }
  if (T < 1.6) return { y: 0.79, x: -0.04 };
  const u = Math.min(1, (T - 1.6) / 1.3); return { y: 0.79 + 0.86 * ss(u), x: -0.04 + 0.015 * ss(u) };
}
/** przysiad / wyciskanie: 3 powtórzenia po 50 cm, coraz wolniej (0,6 / 0,7 / 0,8 s w górę) */
const UP = [0.6, 0.7, 0.8], ROM = 0.5, HOLD = 0.3, DOWN = 0.8;
function strengthAt(T) {
  let t = T - 0.3;                                   // 0,3 s bezruchu na początku
  if (t < 0) return { x: 0, y: 0 };
  for (const up of UP) {
    if (t < up) return { x: 0.01 * Math.sin(Math.PI * t / up), y: ROM * ss(t / up) };
    t -= up; if (t < HOLD) return { x: 0, y: ROM };
    t -= HOLD; if (t < DOWN) return { x: 0, y: ROM * (1 - ss(t / DOWN)) };
    t -= DOWN; if (t < HOLD) return { x: 0, y: 0 };
    t -= HOLD;
  }
  return { x: 0, y: 0 };
}
const sample = (at, dur, fps = 30) => Array.from({ length: Math.round(dur * fps) + 1 }, (_, k) => {
  const T = k / fps, p = at(T); return { t: T, x: p.x + noise(k), y: p.y + noise(k + 7) };
});
/** prawdziwa szczytowa prędkość pionowa (gęste próbkowanie) */
const trueVmax = (at, dur) => { let m = 0; for (let T = 0; T < dur; T += 0.001) m = Math.max(m, (at(T + 0.001).y - at(T).y) / 0.001); return m; };

module.exports = {
  snatchAt, strengthAt, sample, trueVmax, UP, ROM,
  snatch: () => sample(snatchAt, 3.1), strength: () => sample(strengthAt, 0.3 + UP.reduce((s, u) => s + u + HOLD + DOWN + HOLD, 0))
};
