// Ikony „Siła z Ruchu” (web/icons/): talerz z nazwą marki na obwodzie, jak na prawdziwych talerzach do podnoszenia.
// Wcześniejsze ikony były wycinkiem toru z animacji otwarcia; w małym rozmiarze nie było widać, co to jest (docs/decyzje.md, 2026-11-18).
// Kolory marki są brane z tokenów --intro-* w web/index.html. Litery to kontury czcionki marki (Big Shoulders Display 800, licencja OFL)
// zapisane w tools/icon-glyphs.json (tworzy je tools/icon-glyphs.py), bo plik ikony nie może wczytać czcionki z web/fonts/.
//   node tools/make-icons.js [katalog]    zapisuje wszystkie pliki (domyślnie do web/icons/); PNG rysuje przeglądarka z Playwright
// Po zmianie ikon podbij VERSION w web/sw.js. Test „Ikona …” w tests/ui.test.js pilnuje, żeby pliki w web/icons/ były tym, co rysuje to narzędzie.
const fs = require('fs'), path = require('path');
const WEB = path.join(__dirname, '..', 'web');
const FONT = JSON.parse(fs.readFileSync(path.join(__dirname, 'icon-glyphs.json'), 'utf8'));

const NAME = 'SIŁA Z RUCHU';   // napis na obwodzie, u góry i u dołu
for (const ch of NAME) if (ch !== ' ' && !FONT.glyphs[ch]) throw new Error('Brak litery „' + ch + '” w tools/icon-glyphs.json: dopisz ją skryptem tools/icon-glyphs.py');
// Talerz na kaflu 512 × 512, środek talerza w środku kafla. R = promień talerza, rim = odległość cienkiej linii od krawędzi (0 = bez niej),
// groove / gw = promień i grubość rowka, hub / hole = promień jasnej piasty i otworu na gryf, cap = wysokość liter (0 = bez napisu),
// pad = odstęp liter od krawędzi, track = odstęp między literami (w połowie ich wysokości), space = szerokość spacji w jednostkach czcionki.
const ART = { R: 206, rim: 9, groove: 132, gw: 5, hub: 60, hole: 24, cap: 46, pad: 17, track: 8, space: 500 };   // ikona na ekranie głównym
const TINY = { R: 226, rim: 0, groove: 150, gw: 7, hub: 70, hole: 30, cap: 0 };                                  // znak 16–32 px: sam talerz, napis zlałby się w plamę
const SAFE = .92;   // ikona „maskable”: Android przycina ją do koła albo zaokrąglonego kwadratu; talerz jest kołem, więc wystarczy mały margines
const RX = 111;     // zaokrąglenie rogów znaku (26 / 120 boku)
const M = 256;      // środek kafla
const r1 = n => Math.round(n * 10) / 10;

// litera na kaflu: kontur w skali k, przesunięty o (dx, dy) i obrócony o kąt deg wokół środka kafla
function glyph(ch, k, dx, dy, deg){
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return FONT.glyphs[ch].d.replace(/([MLQC])([^MLQCZ]+)/g, (_, cmd, nums) => {
    const v = nums.trim().split(' ').map(Number), o = [];
    for (let i = 0; i < v.length; i += 2) { const x = v[i] * k + dx, y = v[i + 1] * k + dy; o.push(r1(M + x * c - y * s), r1(M + x * s + y * c)); }
    return cmd + o.join(' ');
  });
}
// napis po okręgu, wyśrodkowany u góry albo u dołu talerza; r = promień linii bazowej liter. U dołu litery stoją głową do środka, więc napis czyta się od lewej do prawej.
// Litery są rozstawiane po okręgu, który przechodzi przez połowę ich wysokości (rm): górny i dolny napis zajmują wtedy ten sam łuk i mają ten sam odstęp między literami
// (rozstawiane po linii bazowej dawały szeroki napis u góry i ściśnięty u dołu).
// Zwraca ścieżkę wszystkich liter i punkty kontrolne dla testu: środek litery „I” (pełna kreska) i środek pierwszej spacji (pusty talerz).
function ring(g, r, bottom){
  const k = g.cap / FONT.cap, w = [...NAME].map(ch => (ch === ' ' ? g.space : FONT.glyphs[ch].adv) * k), rm = bottom ? r - g.cap / 2 : r + g.cap / 2;
  let pos = -(w.reduce((a, b) => a + b, 0) + g.track * (w.length - 1)) / 2, d = ''; const probe = {};
  [...NAME].forEach((ch, i) => {
    const a = (pos + w[i] / 2) / rm * (bottom ? -1 : 1), deg = a * 180 / Math.PI, m = bottom ? rm : -rm;
    const at = [r1(M - m * Math.sin(a)), r1(M + m * Math.cos(a))];   // środek pola litery
    if (ch !== ' ') d += glyph(ch, k, -w[i] / 2, bottom ? r : -r, deg);
    if (ch === 'I' && !probe.stem) probe.stem = at;
    if (ch === ' ' && !probe.gap) probe.gap = at;
    pos += w[i] + g.track;
  });
  return { d, probe };
}
const disc = r => `M${M - r} ${M}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;   // koło jako ścieżka (do wycinania otworów w ikonie jednobarwnej)

function files(){
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  const pick = (re, what) => { const m = html.match(re); if (!m) throw new Error('Nie znajduję w web/index.html: ' + what); return m[1]; };
  const C = { bg: pick(/--intro-bg:(#[0-9a-f]{6})/i, '--intro-bg'), ink: pick(/--intro-ink:(#[0-9a-f]{6})/i, '--intro-ink'), acc: pick(/--intro-acc:(#[0-9a-f]{6})/i, '--intro-acc') };
  const circle = (r, attrs) => `<circle cx="${M}" cy="${M}" r="${r}" ${attrs}/>`;
  const text = g => g.cap ? [ring(g, g.R - g.pad - g.cap, false), ring(g, g.R - g.pad, true)] : [];
  const dotR = 6.5, dotAt = g => g.R - g.pad - g.cap / 2;   // kropki po bokach, między napisami
  // kolorowy talerz: pomarańczowy krążek, napis i rowki w kolorze tła, jasna piasta, ciemny otwór
  const draw = g => { const t = text(g);
    return circle(g.R, `fill="${C.acc}"`) +
      (g.rim ? circle(g.R - g.rim, `fill="none" stroke="${C.bg}" stroke-width="3" opacity=".4"`) : '') +
      circle(g.groove, `fill="none" stroke="${C.bg}" stroke-width="${g.gw}" opacity=".5"`) +
      (t.length ? `<path fill="${C.bg}" d="${t[0].d}${t[1].d}"/>` + [-1, 1].map(m => `<circle cx="${M + m * dotAt(g)}" cy="${M}" r="${dotR}" fill="${C.bg}"/>`).join('') : '') +
      circle(g.hub, `fill="${C.ink}"`) + circle(g.hole, `fill="${C.bg}"`); };
  // jednobarwny talerz (Android koloruje go sam i bierze tylko kształt): czarny krążek, w którym napis, rowek, obrys piasty i otwór są wycięte na wylot
  const mono = g => { const t = text(g), ringCut = (r, w) => disc(r + w / 2) + disc(r - w / 2);
    return `<path fill="#000" fill-rule="evenodd" d="${disc(g.R)}${ringCut(g.groove, g.gw)}${ringCut(g.hub, g.gw)}${t.map(x => x.d).join('')}` +
      (t.length ? [-1, 1].map(m => `M${M + m * dotAt(g) - dotR} ${M}a${dotR} ${dotR} 0 1 0 ${2 * dotR} 0a${dotR} ${dotR} 0 1 0 ${-2 * dotR} 0z`).join('') : '') + `${disc(g.hole)}"/>`; };
  const shrink = a => `<g transform="translate(${M} ${M}) scale(${SAFE}) translate(${-M} ${-M})">${a}</g>`;
  const full = a => `<rect width="512" height="512" fill="${C.bg}"/>${a}`;                         // kwadrat po brzegi: telefon sam zaokrągla rogi
  const round = a => `<clipPath id="t"><rect width="512" height="512" rx="${RX}"/></clipPath><g clip-path="url(#t)">${full(a)}</g>`;
  const svg = (body, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"${attrs}>${body}</svg>`;
  const safe = p => p.map(v => r1(M + (v - M) * SAFE)), top = text(ART)[0].probe;
  return {
    colors: C,
    // punkty kontrolne dla testu (w układzie 512 × 512): w dużej ikonie kreska litery „I” i pusta przerwa między wyrazami; w ikonie jednobarwnej to samo po zmniejszeniu,
    // do tego otwór na gryf i pełny pierścień między piastą a rowkiem
    probe: { stem: top.stem, gap: top.gap,
      mono: { stem: safe(top.stem), gap: safe(top.gap), hole: [M, M], solid: safe([M + (ART.hub + ART.groove) / 2, M]) } },
    svg: { 'favicon.svg': svg(round(draw(TINY))) + '\n', 'icon-mono.svg': svg(shrink(mono(ART))) + '\n' },
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
