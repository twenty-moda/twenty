import { Logo } from "./logo";

/**
 * Pantalla de carga con el logo: tapa la página hasta que cargan las fotos que se ven en pantalla (y la tipografía),
 * con un máximo de 3 s. Solo en la primera carga: en las navegaciones dentro de la tienda el layout no se vuelve
 * a montar y quedan las transiciones de página.
 *
 * Todo lo maneja este script en línea, que corre antes de hidratar (no depende de React ni retrasa la hidratación):
 * marca `<html data-splash="in" → "out" → "done">` y el CSS de globals.css hace el resto. Sin JavaScript la pantalla
 * nunca aparece. La página se pinta debajo de la cortina, así que no retrasa el LCP.
 */
const SCRIPT = `(function () {
  var html = document.documentElement;
  var MIN = 450, MAX = 3000, finished = false;
  html.dataset.splash = "in";
  function out() {
    if (finished) return;
    finished = true;
    setTimeout(function () {
      html.dataset.splash = "out";
      setTimeout(function () { html.dataset.splash = "done"; }, 1100);
    }, Math.max(0, MIN - performance.now()));
  }
  setTimeout(out, Math.max(0, MAX - performance.now()));
  function progress(value) { html.style.setProperty("--splash-progress", String(value)); }
  function ready() {
    progress(1);
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(out, out);
  }
  function track() {
    var imgs = Array.prototype.filter.call(document.querySelectorAll("main img"), function (img) {
      var r = img.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
    });
    var done = 0;
    if (!imgs.length) return ready();
    function one() {
      done += 1;
      progress(0.1 + (0.9 * done) / imgs.length);
      if (done === imgs.length) ready();
    }
    imgs.forEach(function (img) {
      if (img.complete) return one();
      img.addEventListener("load", one, { once: true });
      img.addEventListener("error", one, { once: true });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", track, { once: true });
  else track();
})();`;

export function SplashScreen() {
  return (
    <>
      {/* Antes del marcado: así la pantalla ya está puesta en el primer pintado. */}
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
      <div className="splash" aria-hidden="true">
        <div className="splash-inner">
          <div className="splash-logo">
            <Logo priority className="w-full" />
          </div>
          <span className="splash-bar">
            <span />
          </span>
        </div>
      </div>
    </>
  );
}
