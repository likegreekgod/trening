// Ikony „Siła z Ruchu” (web/icons/), szkic „Duet”: ostatnia klatka animacji otwarcia w zbliżeniu.
// Tor sztangi i linia tańca są wzięte wprost z animacji (web/index.html, #in-bar i #in-dance), a kolory z tokenów --intro-* tej samej strony.
// Tutaj zmienia się tylko kadr, skala i grubość linii: kształtu toru nie poprawiaj w tym pliku.
//   node tools/make-icons.js [katalog]    zapisuje wszystkie pliki (domyślnie do web/icons/); PNG rysuje przeglądarka z Playwright
// Po zmianie ikon podbij VERSION w web/sw.js. Test „Ikona …” w tests/ui.test.js pilnuje, żeby pliki w web/icons/ były tym, co rysuje to narzędzie.
const fs = require('fs'), path = require('path');
const WEB = path.join(__dirname, '..', 'web');

// Rysunek w układzie animacji (200 × 330) przeniesiony na kafel 512 × 512: punkt (cx, cy) trafia w środek kafla, skala s.
// bw = grubość toru, dw = grubość linii tańca (0 = bez niej), rr / rw = promień i grubość pierścienia talerza, hub = promień piasty (0 = bez niej).
const ART = { cx: 101, cy: 112, s: 2.05, bw: 12, dw: 5.5, rr: 18, rw: 9, hub: 6.5 };   // ikona na ekranie głównym
const TINY = { cx: 104, cy: 92, s: 3.1, bw: 15, dw: 0, rr: 26, rw: 13, hub: 0 };       // znak 16–32 px (karta przeglądarki, nagłówek aplikacji): sam haczyk toru i talerz
const DANCE_OPACITY = .9;
const SAFE = .8;    // ikona „maskable”: Android przycina ją do koła albo zaokrąglonego kwadratu, więc rysunek mieści się w środkowych 80%
const RX = 111;     // zaokrąglenie rogów znaku (jak w poprzedniej ikonie: 26 / 120 boku)

function files(){
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  const pick = (re, what) => { const m = html.match(re); if (!m) throw new Error('Nie znajduję w web/index.html: ' + what); return m[1]; };
  const BAR = pick(/<path id="in-bar"[^>]*\sd="([^"]+)"/, 'tor sztangi #in-bar'), DANCE = pick(/<path id="in-dance"[^>]*\sd="([^"]+)"/, 'linia tańca #in-dance');
  const C = { bg: pick(/--intro-bg:(#[0-9a-f]{6})/i, '--intro-bg'), ink: pick(/--intro-ink:(#[0-9a-f]{6})/i, '--intro-ink'), acc: pick(/--intro-acc:(#[0-9a-f]{6})/i, '--intro-acc') };
  const END = BAR.trim().split(/[ ,]+/).slice(-2).map(Number);   // koniec toru = środek talerza w chwili chwytu
  // mono = sam kształt (czarny, bez przezroczystości): z ikony jednobarwnej Android bierze tylko obrys i sam go koloruje
  const draw = ({ cx, cy, s, bw, dw, rr, rw, hub }, mono) => {
    const ink = mono ? '#000' : C.ink, acc = mono ? '#000' : C.acc;
    return `<g transform="translate(256 256) scale(${s}) translate(${-cx} ${-cy})" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
      (dw ? `<path d="${DANCE}" stroke="${ink}" stroke-width="${dw}"${mono ? '' : ` opacity="${DANCE_OPACITY}"`}/>` : '') +
      `<circle cx="${END[0]}" cy="${END[1]}" r="${rr}" stroke="${ink}" stroke-width="${rw}"/>` +
      `<path d="${BAR}" stroke="${acc}" stroke-width="${bw}"/>` +
      (hub ? `<circle cx="${END[0]}" cy="${END[1]}" r="${hub}" fill="${ink}" stroke="none"/>` : '') + '</g>';
  };
  const shrink = a => `<g transform="translate(256 256) scale(${SAFE}) translate(-256 -256)">${a}</g>`;
  const full = a => `<rect width="512" height="512" fill="${C.bg}"/>${a}`;                         // kwadrat po brzegi: telefon sam zaokrągla rogi
  const round = a => `<clipPath id="t"><rect width="512" height="512" rx="${RX}"/></clipPath><g clip-path="url(#t)">${full(a)}</g>`;
  const svg = (body, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"${attrs}>${body}</svg>`;
  return {
    colors: C,
    svg: { 'favicon.svg': svg(round(draw(TINY))) + '\n', 'icon-mono.svg': svg(shrink(draw(ART, true))) + '\n' },
    png: [
      ['icon-512.png', 512, full(draw(ART))], ['icon-192.png', 192, full(draw(ART))],
      ['icon-maskable-512.png', 512, full(shrink(draw(ART)))], ['icon-maskable-192.png', 192, full(shrink(draw(ART)))],
      ['apple-touch-icon.png', 180, full(draw(ART))],
      ['favicon-32.png', 32, round(draw(TINY))], ['favicon-16.png', 16, round(draw(TINY))],
    ].map(([name, size, body]) => [name, size, svg(body, ` width="${size}" height="${size}" style="display:block"`)]),
  };
}
module.exports = { files };

if (require.main === module) (async () => {
  const f = files(), out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(WEB, 'icons');
  fs.mkdirSync(out, { recursive: true });
  for (const [name, text] of Object.entries(f.svg)) fs.writeFileSync(path.join(out, name), text);
  const browser = await require('playwright').chromium.launch(), page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [name, size, markup] of f.png) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<body style="margin:0;background:transparent">${markup}</body>`);
    await page.screenshot({ path: path.join(out, name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  }
  await browser.close();
  console.log(Object.keys(f.svg).concat(f.png.map(x => x[0])).join(', ') + ' → ' + out);
})();
