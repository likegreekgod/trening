/* Animacja otwarcia: decyzja przed pierwszym rysowaniem strony (skrypt stoi zaraz pod #intro w index.html). */
/* Animacja otwarcia przy wejściu po przerwie: pokazuje się, gdy aplikacji nie było na ekranie co najmniej 30 minut (INTRO_GAP), nigdy przy ograniczeniu ruchu.
   Pamięć telefonu „intro” = chwila (ms), w której aplikacja była ostatnio na ekranie. Odświeża ją introMark na końcu skryptu (co minutę i w chwili schowania aplikacji),
   więc przeładowanie strony w trakcie treningu nie pokazuje animacji. Zapis z v53 (data zamiast chwili) liczy się jak „dawno temu”.
   Przy uruchomieniu decyzja zapada tutaj, przed pierwszym rysowaniem strony: aplikacja nie mignie przed zasłoną, a zasłona nie mignie przy wejściu bez animacji.
   Przy powrocie do otwartej aplikacji (bez przeładowania strony) introVis woła introShow() bez argumentu: zasłona jest wtedy świeżą kopią tej z HTML.
   Każdy błąd (np. zablokowana albo pełna pamięć) = bez animacji. */
var INTRO_GAP = 30 * 60000, introTpl = document.getElementById('intro').cloneNode(true);
function introShow(el){                                  // true = zasłona stoi na ekranie i czeka na introRun
  try {
    if (!introTpl.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    localStorage.setItem('intro', Date.now());          // od razu, także gdy ktoś zamknie aplikację w trakcie; gdy zapis się nie uda, animacji nie ma (wracałaby przy każdym otwarciu)
    if (!el) { el = introTpl.cloneNode(true); document.body.insertBefore(el, document.body.firstChild); }
    el.hidden = false;
    // niski albo wąski ekran: całość proporcjonalnie mniejsza; podpis znika, gdy wyszedłby poniżej 12 px
    var box = el.firstElementChild, k = Math.min(1, (el.clientHeight - 40) / box.offsetHeight, (el.clientWidth - 32) / box.offsetWidth);
    if (k > 0 && k < 1) { box.style.transform = 'scale(' + k + ')'; if (k * 13 < 12) el.classList.add('sm'); }
    // pasek systemowy w kolorze zasłony na czas animacji (zdejmuje go introRun)
    var m = document.createElement('meta'); m.name = 'theme-color'; m.id = 'intro-tc';
    m.content = getComputedStyle(document.documentElement).getPropertyValue('--intro-bg').trim();
    var first = document.querySelector('meta[name="theme-color"]');   // przeglądarka bierze pierwszy pasujący znacznik
    (first ? first.parentNode : document.head).insertBefore(m, first);
    return true;
  } catch (e) { if (el) el.remove(); return false; }
}
(function(){
  var el = document.getElementById('intro'), last;
  try { last = Number(localStorage.getItem('intro')) || 0; } catch (e) { el.remove(); return; }
  if (Date.now() - last < INTRO_GAP || !introShow(el)) el.remove();
})();
