# Kontury liter czcionki marki dla tools/make-icons.js:   python3 tools/icon-glyphs.py [litery]   (domyślnie litery nazwy „SIŁA Z RUCHU”)
# Czyta Big Shoulders Display z web/fonts/ (grubość 800) i zapisuje tools/icon-glyphs.json: { font, wght, upm, cap, glyphs: { litera: { adv, d } } }.
# d = ścieżka SVG w jednostkach czcionki, oś y w dół, linia bazowa y = 0, tylko polecenia bezwzględne M, L, Q, C, Z i liczby całkowite,
# żeby narzędzie ikon mogło samo przeliczyć punkty przy ustawianiu liter po okręgu.
# Potrzebne tylko przy zmianie napisu na ikonie. Wymaga: pip install fonttools brotli (do tego skryptu, nie do aplikacji).
import sys, json, os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.basePen import BasePen

WGHT = 800
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = [os.path.join(HERE, '..', 'web', 'fonts', 'big-shoulders-display-' + part + '-wght-normal.woff2') for part in ('latin', 'latin-ext')]
letters = sys.argv[1] if len(sys.argv) > 1 else 'SIŁAZRUCH'

class Pen(BasePen):
    def __init__(self, gs): super().__init__(gs); self.c = []
    def _moveTo(self, p): self.c.append('M%d %d' % (round(p[0]), -round(p[1])))
    def _lineTo(self, p): self.c.append('L%d %d' % (round(p[0]), -round(p[1])))
    def _curveToOne(self, a, b, c): self.c.append('C%d %d %d %d %d %d' % (round(a[0]), -round(a[1]), round(b[0]), -round(b[1]), round(c[0]), -round(c[1])))
    def _qCurveToOne(self, a, b): self.c.append('Q%d %d %d %d' % (round(a[0]), -round(a[1]), round(b[0]), -round(b[1])))
    def _closePath(self): self.c.append('Z')

res, meta = {}, {}
for f in FONTS:
    font = instancer.instantiateVariableFont(TTFont(f), {'wght': WGHT})
    gs, cmap = font.getGlyphSet(), font.getBestCmap()
    meta = {'upm': font['head'].unitsPerEm, 'cap': font['OS/2'].sCapHeight}
    for ch in letters:
        g = cmap.get(ord(ch))
        if g is None or ch in res: continue
        pen = Pen(gs); gs[g].draw(pen)
        res[ch] = {'adv': gs[g].width, 'd': ''.join(pen.c)}
missing = [ch for ch in letters if ch not in res]
if missing: sys.exit('Brak liter w czcionce: ' + ''.join(missing))
out = os.path.join(HERE, 'icon-glyphs.json')
json.dump({'font': 'Big Shoulders Display (OFL), web/fonts/', 'wght': WGHT, 'upm': meta['upm'], 'cap': meta['cap'], 'glyphs': res}, open(out, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print(out, {k: v['adv'] for k, v in res.items()}, meta)
