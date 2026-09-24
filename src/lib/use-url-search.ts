"use client";

import { useCallback, useSyncExternalStore } from "react";

const URL_CHANGE = "twenty:urlchange";

let historyPatched = false;

/**
 * Next cambia la URL con history.pushState/replaceState, que no emiten ningún evento.
 * Sin esto, al ir por ejemplo de /catalogo?categoria=a a /catalogo?categoria=b desde el menú,
 * la página no se entera del cambio (misma ruta, mismo HTML) y el filtro no se actualiza.
 */
function patchHistory() {
  if (historyPatched) return;
  historyPatched = true;
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method];
    window.history[method] = function (this: History, ...args: Parameters<History["pushState"]>) {
      const result = original.apply(this, args);
      // En una microtarea: Next llama a pushState mientras React confirma la navegación.
      queueMicrotask(() => window.dispatchEvent(new Event(URL_CHANGE)));
      return result;
    };
  }
}

function subscribe(onChange: () => void) {
  patchHistory();
  window.addEventListener("popstate", onChange);
  window.addEventListener(URL_CHANGE, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(URL_CHANGE, onChange);
  };
}

const getSnapshot = () => window.location.search;
// En el HTML estático (y al hidratar) no hay query: la página se renderiza con su estado por defecto
// y el estado de la URL se aplica en el navegador. Así la página sigue siendo 100% cacheable.
const getServerSnapshot = () => "";

/**
 * Estado en la query string sin pasar por el servidor: history.replaceState se integra con el
 * router de Next y no dispara una navegación. También sigue los cambios de URL que hace Next
 * (enlaces a la misma página con otra query).
 */
export function useUrlSearch(): [string, (next: string) => void] {
  const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setSearch = useCallback((next: string) => {
    const query = next.replace(/^\?/, "");
    const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new Event(URL_CHANGE));
  }, []);
  return [search, setSearch];
}
