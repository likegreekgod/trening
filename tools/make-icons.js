// Ikony „Siła z Ruchu” (web/icons/), szkic „Duet z bliska”: góra rysunku z animacji otwarcia w zbliżeniu, grubą kreską.
// Tor sztangi i linia tańca są wzięte wprost z animacji (web/index.html, #in-bar i #in-dance), a kolory z tokenów --intro-* tej samej strony.
// Tutaj zmienia się tylko kadr, skala, grubość linii i to, który kolor marki rysuje którą część: kształtu toru nie poprawiaj w tym pliku.
//   node tools/make-icons.js [katalog]    zapisuje wszystkie pliki (domyślnie do web/icons/); PNG rysuje przeglądarka z Playwright
// Po zmianie ikon podbij VERSION w web/sw.js. Test „Ikona …” w tests/ui.test.js pilnuje, żeby pliki w web/icons/ były tym, co rysuje to narzędzie.
const fs = require('fs'), path = require('path');
const WEB = path.join(__dirname, '..', 'web');

// Rysunek w układzie animacji (200 × 330) przeniesiony na kafel 512 × 512: punkt (cx, cy) trafia w środek kafla, skala s.
// bw = grubość toru, dw = grubość linii tańca, rr = promień talerza (pełne koło na końcu toru), hub = promień środka talerza.
const ART = { cx: 100, cy: 60, s: 3.5, bw: 15, dw: 9, rr: 18, hub: 7.5 };      // ikona na ekranie głównym: góra toru i kawałek linii tańca pod nią
const TINY = { cx: 97, cy: 43, s: 5.4, bw: 17, dw: 11, rr: 16.5, hub: 7.5 };   // znak 16–32 px (karta przeglądarki, nagłówek aplikacji): sama góra toru z pętlą linii tańca i talerzem
// Który kolor marki (bg = ciemne tło animacji, ink = jasny, acc = pomarańczowy) rysuje którą część. Środek talerza zostaje pomarańczowy:
// ciemny albo jasny środek na kontrastowym kole wygląda jak oko.
const LOOK = { tile: 'bg', bar: 'acc', dance: 'ink', plate: 'ink', hub: 'acc' };
const SAFE = .8;    // ikona „maskable”: Android przycina ją do koła albo zaokrąglonego kwadratu, więc rysunek mieści się w środkowych 80%
const RX = 111;     // zaokrąglenie rogów znaku (jak w poprzedniej ikonie: 26 / 120 boku)

function files(){
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  const pick = (re, what) => { const m = html.match(re); if (!m) throw new Error('Nie znajduję w web/index.html: ' + what); return m[1]; };
  const BAR = pick(/<path id="in-bar"[^>]*\sd="([^"]+)"/, 'tor sztangi #in-bar'), DANCE = pick(/<path id="in-dance"[^>]*\sd="([^"]+)"/, 'linia tańca #in-dance');
  const C = { bg: pick(/--intro-bg:(#[0-9a-f]{6})/i, '--intro-bg'), ink: pick(/--intro-ink:(#[0-9a-f]{6})/i, '--intro-ink'), acc: pick(/--intro-acc:(#[0-9a-f]{6})/i, '--intro-acc') };
  const END = BAR.trim().split(/[ ,]+/).slice(-2).map(Number);   // koniec toru = środek talerza w chwili chwytu
  const look = {}; for (const part of Object.keys(LOOK)) look[part] = C[LOOK[part]];
  // Kolejność: linia tańca, tor, talerz (zakrywa koniec toru), środek talerza.
  // mono = sam kształt (czarny, bez przezroczystości): z ikony jednobarwnej Android bierze tylko obrys i sam go koloruje.
  // W niej środek talerza jest otworem (wycięcie regułą evenodd), bo czarne kółko na czarnym talerzu by znikło.
  const draw = ({ cx, cy, s, bw, dw, rr, hub }, mono) => {
    const k = mono ? { bar: '#000', dance: '#000', plate: '#000' } : look;
    const ring = r => `M${END[0] - r} ${END[1]}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
    const body = `<path d="${DANCE}" stroke="${k.dance}" stroke-width="${dw}"/>` + `<path d="${BAR}" stroke="${k.bar}" stroke-width="${bw}"/>` +
      `<circle cx="${END[0]}" cy="${END[1]}" r="${rr}" fill="${k.plate}" stroke="none"/>`;
    return `<g transform="translate(256 256) scale(${s}) translate(${-cx} ${-cy})" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
      (mono ? `<clipPath id="o"><path clip-rule="evenodd" d="M-400 -400h1000v1200h-1000z${ring(hub)}"/></clipPath><g clip-path="url(#o)">${body}</g>`
            : body + `<circle cx="${END[0]}" cy="${END[1]}" r="${hub}" fill="${k.hub}" stroke="none"/>`) + '</g>';
  };
  const shrink = a => `<g transform="translate(256 256) scale(${SAFE}) translate(-256 -256)">${a}</g>`;
  const full = a => `<rect width="512" height="512" fill="${look.tile}"/>${a}`;                         // kwadrat po brzegi: telefon sam zaokrągla rogi
  const round = a => `<clipPath id="t"><rect width="512" height="512" rx="${RX}"/></clipPath><g clip-path="url(#t)">${full(a)}</g>`;
  const at = (g, x, y, k) => [256 + (x - g.cx) * g.s * k, 256 + (y - g.cy) * g.s * k];   // punkt rysunku na kaflu 512 (k = zmniejszenie)
  const svg = (body, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"${attrs}>${body}</svg>`;
  return {
    colors: C, look,   // look = kolor każdej części po podstawieniu (tile, bar, dance, plate, hub)
    // punkty kontrolne ikony jednobarwnej w pikselach kafla 512: środek talerza (otwór) i punkt na talerzu obok otworu
    monoPlate: { hole: at(ART, END[0], END[1], SAFE), ring: at(ART, END[0] + (ART.hub + ART.rr) / 2, END[1], SAFE) },
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
