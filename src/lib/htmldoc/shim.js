// Script di Orbit dentro la pagina dell'editor visuale (iframe sandbox, origine opaca, CSP senza rete).
// Rende modificabili i testi marcati con data-orbit-ref e manda a Orbit, con postMessage, il nuovo
// contenuto di ognuno; segnala blocco e voce selezionati; inoltra Ctrl+S / Ctrl+Z / Ctrl+Y. Orbit
// riporta le modifiche nel SORGENTE: il DOM di questa pagina non viene mai salvato.
(() => {
  "use strict";
  const cfg = window.__orbit || {};
  const REF = "data-orbit-ref";
  const ITEM = "data-orbit-item";
  const post = (m) => {
    m.orbit = 1;
    parent.postMessage(m, "*");
  };
  const elOf = (n) => (n && n.nodeType === 1 ? n : n ? n.parentElement : null);
  const hostOf = (n) => {
    const e = elOf(n);
    return e && e.closest ? e.closest("[" + REF + "]") : null;
  };
  const blockOf = (n) => {
    const e = elOf(n);
    return e && e.closest ? e.closest("main > section[data-block]") : null;
  };

  // aiuti visivi: solo in questa copia, mai stampati
  const style = document.createElement("style");
  style.textContent =
    "[" + REF + "]{outline:1px solid transparent;outline-offset:2px;border-radius:2px;cursor:text}" +
    "[" + REF + "]:hover{outline-color:rgba(76,141,255,.45)}" +
    "[" + REF + "]:focus{outline:2px solid rgba(76,141,255,.9)}" +
    ".orbit-sel{outline:1px dashed rgba(76,141,255,.6)!important;outline-offset:6px!important}" +
    ".orbit-item{outline:1px dashed rgba(124,92,255,.8)!important;outline-offset:3px!important}" +
    "@media print{[" + REF + "],.orbit-sel,.orbit-item{outline:none!important}}" +
    // l'interruttore chiaro/scuro del documento: nell'editor c'è quello del pannello
    ".dr-theme{display:none!important}";
  (document.head || document.documentElement).appendChild(style);

  // ---- modifiche del testo ----
  const pending = new Map();
  function clean(el) {
    const c = el.cloneNode(true);
    for (const n of c.querySelectorAll("[contenteditable],[spellcheck],[" + REF + "],[" + ITEM + "],.orbit-sel,.orbit-item")) {
      n.removeAttribute("contenteditable");
      n.removeAttribute("spellcheck");
      n.removeAttribute(REF);
      n.removeAttribute(ITEM);
      n.classList.remove("orbit-sel", "orbit-item");
      if (n.getAttribute("class") === "") n.removeAttribute("class");
    }
    // il browser a volte avvolge righe in <div>/<p>: si tengono solo testo e tag in linea
    for (const n of c.querySelectorAll("div,p")) n.replaceWith(...n.childNodes);
    let h = c.innerHTML.replace(/(\S)&nbsp;(?=\S)/g, "$1 ");
    if (h === "<br>") h = "";
    return h;
  }
  function send(ref) {
    clearTimeout(pending.get(ref));
    pending.delete(ref);
    const el = document.querySelector("[" + REF + '="' + ref + '"]');
    if (el) post({ type: "edit", ref: Number(ref), html: clean(el) });
  }
  function flush() {
    for (const ref of Array.from(pending.keys())) send(ref);
  }
  document.addEventListener(
    "input",
    (e) => {
      const h = hostOf(e.target);
      if (!h) return;
      const ref = h.getAttribute(REF);
      clearTimeout(pending.get(ref));
      pending.set(ref, setTimeout(() => send(ref), 300));
    },
    true,
  );
  document.addEventListener(
    "focusout",
    (e) => {
      const h = hostOf(e.target);
      if (h && pending.has(h.getAttribute(REF))) send(h.getAttribute(REF));
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = (e.key || "").toLowerCase();
      if (mod && k === "s") {
        e.preventDefault();
        flush();
        post({ type: "save" });
        return;
      }
      if (mod && (k === "z" || k === "y")) {
        e.preventDefault();
        flush();
        post({ type: k === "y" || e.shiftKey ? "redo" : "undo" });
        return;
      }
      const h = hostOf(e.target);
      if (!h) return;
      if (e.key === "Enter" && !e.shiftKey) {
        // un testo resta un elemento solo: Invio conferma, Maiusc+Invio va a capo dentro il testo
        e.preventDefault();
        flush();
      } else if (e.key === "Escape") {
        flush();
        h.blur();
      }
    },
    true,
  );

  // incolla solo testo, su una riga: niente HTML né stili che arrivano da fuori
  document.addEventListener(
    "paste",
    (e) => {
      if (!hostOf(e.target)) return;
      e.preventDefault();
      const t = (e.clipboardData && e.clipboardData.getData("text/plain")) || "";
      document.execCommand("insertText", false, t.replace(/\s*\r?\n\s*/g, " "));
    },
    true,
  );
  document.addEventListener("drop", (e) => e.preventDefault(), true);

  // ---- selezione: blocco e voce ----
  let selBlock = null;
  let selItem = null;
  let lastSel = "";
  function mark(block, item) {
    if (selBlock !== block) {
      if (selBlock) selBlock.classList.remove("orbit-sel");
      selBlock = block;
      if (block) block.classList.add("orbit-sel");
    }
    if (selItem !== item) {
      if (selItem) selItem.classList.remove("orbit-item");
      selItem = item;
      if (item) item.classList.add("orbit-item");
    }
  }
  function select(target) {
    const e = elOf(target);
    const h = hostOf(e);
    const b = blockOf(e);
    const it = e && e.closest ? e.closest("[" + ITEM + "]") : null;
    mark(b, it);
    const msg = {
      type: "select",
      ref: h ? Number(h.getAttribute(REF)) : null,
      block: b ? b.id : null,
      item: it ? Number(it.getAttribute(ITEM)) : null,
    };
    const key = msg.ref + "|" + msg.block + "|" + msg.item;
    if (key === lastSel) return;
    lastSel = key;
    post(msg);
  }
  document.addEventListener("focusin", (e) => select(e.target), true);

  document.addEventListener(
    "click",
    (e) => {
      const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (a) {
        e.preventDefault(); // la pagina non naviga mai
        const href = a.getAttribute("href") || "";
        if (href.startsWith("#")) {
          if (!hostOf(a) || mod(e)) {
            const t = document.getElementById(decodeURIComponent(href.slice(1)));
            if (t) t.scrollIntoView({ block: "start", behavior: "smooth" });
          }
        } else if (mod(e)) post({ type: "link", href: a.href });
      }
      select(e.target);
    },
    true,
  );
  const mod = (e) => e.ctrlKey || e.metaKey;

  let scrollTimer = 0;
  addEventListener(
    "scroll",
    () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => post({ type: "scroll", y: Math.round(scrollY) }), 150);
    },
    { passive: true },
  );

  // ---- messaggi da Orbit ----
  addEventListener("message", (e) => {
    if (e.source !== parent) return;
    const m = e.data || {};
    if (m.type === "reveal") {
      const b = document.getElementById(m.block);
      if (b) {
        b.scrollIntoView({ block: "start", behavior: m.smooth ? "smooth" : "auto" });
        mark(b, null);
      }
    } else if (m.type === "css") {
      document.documentElement.style.setProperty(m.name, m.value);
    } else if (m.type === "layout") {
      const b = document.getElementById(m.block);
      if (b) {
        if (m.layout) b.setAttribute("data-layout", m.layout);
        else b.removeAttribute("data-layout");
      }
    } else if (m.type === "dataset") {
      for (const s of document.querySelectorAll('script[type="application/json"][data-dataset]')) {
        if (s.getAttribute("data-dataset") === m.name) s.textContent = m.json;
      }
      if (window.docRuntime && window.docRuntime.render) window.docRuntime.render();
    } else if (m.type === "flush") {
      flush();
    } else if (m.type === "print") {
      flush();
      mark(null, null);
      window.print();
    }
  });

  function start() {
    if (!cfg.readonly) {
      for (const el of document.querySelectorAll("[" + REF + "]")) {
        el.setAttribute("contenteditable", "true");
        el.setAttribute("spellcheck", "false");
      }
    }
    const ready = () => {
      if (cfg.scroll) scrollTo(0, cfg.scroll);
      if (cfg.block) {
        const b = document.getElementById(cfg.block);
        if (b) mark(b, null);
      }
      post({ type: "ready", token: cfg.token, refs: document.querySelectorAll("[" + REF + "]").length });
    };
    // setTimeout e non requestAnimationFrame: la copia nuova si carica in un iframe nascosto, dove il
    // browser sospende i frame d'animazione e «pronto» non arriverebbe mai
    if (document.readyState === "complete") setTimeout(ready, 0);
    else addEventListener("load", () => setTimeout(ready, 0), { once: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
