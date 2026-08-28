const I18N = __ONTOBDC_BUILD_I18N__;
const FILE_VIEWER_PAGE_PATH = ".__ontobdc__/onto-file-viewer.html";
// Canonical URL-controlled presentation parameters. The page's URL-state
// runtime owns this list when it is present, and this Tile defers to it —
// but a Tile is self-sufficient by contract, so it also has to know the
// list itself. A control that quietly stops carrying state because a
// runtime from another package is missing is a broken control, not a
// degraded one.
const PRESENTATION_PARAMS = ["lang", "theme"];

// What the document is actually rendering, for a page whose URL was never
// normalized: the link must carry the state the user is looking at, not
// nothing.
const APPLIED_PRESENTATION_STATE = {
  lang: () =>
    document.documentElement.lang
    || document.documentElement.dataset.language
    || "",
  theme: () => document.documentElement.dataset.theme || "",
};

/**
 * Return `href` carrying the active presentation state, so a separate
 * generated document opens in the language and theme in use here.
 *
 * Prefers the page's URL-state runtime; falls back to the same rule when it
 * is absent. A parameter the link already declares always wins, so
 * inheriting never overwrites an explicit choice.
 */
function decorateInternalUrl(href) {
  const state = window.ontobdcUrlState;
  if (state && typeof state.decorate === "function") return state.decorate(href);

  try {
    const target = new URL(href, location.href);
    const current = new URLSearchParams(location.search);
    for (const name of PRESENTATION_PARAMS) {
      if (target.searchParams.has(name)) continue;
      const carried = current.get(name) || APPLIED_PRESENTATION_STATE[name]();
      if (carried) target.searchParams.set(name, carried);
    }
    return target.href;
  } catch {
    return href;
  }
}

const NATIVE_RENDERABLE_EXTENSIONS = Object.freeze(
  new Set([
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "tif", "tiff",
    "pdf",
    "csv",
    "eml",
  ]),
);
const FILE_VIEWER_DEFAULTS = Object.freeze({
  columns: 6,
  rows: 6,
  minColumns: 6,
  minRows: 5,
});

function t(key, vars) {
  const locale = document.documentElement.lang || document.documentElement.dataset.language || "en";
  const table = I18N[locale] || I18N.en || {};
  let text = table[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, value);
  }
  return text;
}

function _ensureViewerSizeAttributes(element) {
  const { columns, rows, minColumns, minRows } = FILE_VIEWER_DEFAULTS;
  if (!element.hasAttribute("columns")) element.setAttribute("columns", String(columns));
  if (!element.hasAttribute("rows")) element.setAttribute("rows", String(rows));
  if (!element.hasAttribute("min-columns")) element.setAttribute("min-columns", String(minColumns));
  if (!element.hasAttribute("min-rows")) element.setAttribute("min-rows", String(minRows));
  return {
    columns: Number.parseInt(element.getAttribute("columns") ?? String(columns), 10),
    rows: Number.parseInt(element.getAttribute("rows") ?? String(rows), 10),
  };
}

// The single Surface-wide file viewer. Unlike the retired per-file preview
// Tiles (one custom element per file entity — thousands, in a real
// container), there is exactly one of these in the DOM, always. It carries
// no `data-ontobdc-resource` and touches no real file itself: it listens
// for the same `show-details-requested` event onto-file-tree-tile already
// dispatches on double-click, and points its <iframe> at the standalone
// onto-file-viewer.html page with that one file's path passed by reference
// in the query string. That page is the only place, and this dblclick the
// only moment, any real container file is ever read — this Tile's own
// `src` stays unset until then, closed or not.
class OntoFileViewerTile extends HTMLElement {
  #root;
  #path = "";

  static get observedAttributes() {
    return ["columns", "rows"];
  }

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "closed" });
    this.#root.innerHTML = `
      <style>
        :host {
          all: initial;
          display: block;
          inline-size: 100%;
          block-size: 100%;
          min-inline-size: 0;
          min-block-size: 0;
          box-sizing: border-box;
          container-type: size;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        *, *::before, *::after { box-sizing: border-box; }
        :host(:fullscreen) {
          inline-size: 100vw;
          block-size: 100vh;
          background: var(--onto-theme-background, #ffffff);
        }
        .tile {
          display: grid;
          grid-template-rows: var(--onto-surface-slot-size, 72px) minmax(0, 1fr);
          row-gap: 6px;
          inline-size: 100%;
          block-size: 100%;
          min-inline-size: 0;
          min-block-size: 0;
          overflow: hidden;
          padding: 6px;
          border-radius: var(--onto-theme-tile-border-radius, 16px);
          border: var(--onto-theme-tile-border-width, 1px) solid
            color-mix(in srgb, var(--onto-theme-accent, #0ea5e9) 45%, transparent);
          background: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 5%, var(--onto-theme-background, #ffffff));
          color: var(--onto-theme-foreground, #0f172a);
        }
        :host(:fullscreen) .tile {
          border-radius: 0;
        }
        .caption {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-inline-size: 0;
          padding: 0 4px;
        }
        .info {
          min-inline-size: 0;
        }
        .label {
          font-size: clamp(9px, 2.2cqw, 11px);
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 60%, transparent);
        }
        .name {
          font-size: clamp(11px, 2.6cqw, 13px);
          font-weight: 700;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .actions {
          display: flex;
          align-items: center;
          gap: 4px;
          flex: none;
        }
        .icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          inline-size: 24px;
          block-size: 24px;
          padding: 0;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: var(--onto-theme-accent, #0ea5e9);
          cursor: pointer;
        }
        .icon-btn:hover {
          background: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 10%, transparent);
        }
        .icon-btn.close-btn {
          color: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 55%, transparent);
        }
        .icon-btn svg {
          inline-size: 14px;
          block-size: 14px;
        }
        .frame-wrap {
          min-inline-size: 0;
          min-block-size: 0;
          overflow: hidden;
          border-radius: 10px;
          background: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 8%, transparent);
        }
        iframe {
          display: block;
          inline-size: 100%;
          block-size: 100%;
          border: 0;
        }
        .empty {
          display: grid;
          place-items: center;
          inline-size: 100%;
          block-size: 100%;
          font-size: clamp(11px, 2.6cqw, 13px);
          opacity: .6;
        }
      </style>
      <div class="tile">
        <div class="caption">
          <div class="info">
            <div class="label"></div>
            <div class="name"></div>
          </div>
          <div class="actions">
            <a class="icon-btn open-link" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
            <button type="button" class="icon-btn fullscreen-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            </button>
            <button type="button" class="icon-btn close-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div class="frame-wrap"><div class="empty"></div></div>
      </div>
    `;

    this.#root.querySelector(".open-link").addEventListener("click", (event) => event.stopPropagation());
    this.#root.querySelector(".fullscreen-btn").addEventListener("click", () => this.#toggleFullscreen());
    this.#root.querySelector(".close-btn").addEventListener("click", () => this.#close());
    this.#applyStaticLabels();
  }

  #applyStaticLabels() {
    const label = this.#root.querySelector(".label");
    const openLink = this.#root.querySelector(".open-link");
    const fullscreenBtn = this.#root.querySelector(".fullscreen-btn");
    const closeBtn = this.#root.querySelector(".close-btn");
    label.textContent = t("fileBadge");
    openLink.title = t("open");
    openLink.setAttribute("aria-label", t("openFile"));
    fullscreenBtn.title = t("openFullscreen");
    fullscreenBtn.setAttribute("aria-label", t("openFullscreen"));
    closeBtn.title = t("close");
    closeBtn.setAttribute("aria-label", t("closeTile"));
    const empty = this.#root.querySelector(".empty");
    if (empty) empty.textContent = t("noFile");
  }

  #onLanguageChanged = () => this.#applyStaticLabels();

  #eventTargetSurface() {
    return (
      this.closest("onto-presentation-surface")
      ?? (this.getRootNode?.().host instanceof Element
          ? this.getRootNode().host.closest("onto-presentation-surface")
          : null)
    );
  }

  connectedCallback() {
    document.addEventListener("language-changed", this.#onLanguageChanged);
  }

  disconnectedCallback() {
    document.removeEventListener("language-changed", this.#onLanguageChanged);
  }

  openFile(path) {
    const safePath = String(path || "").trim();
    if (!safePath) return;
    const size = _ensureViewerSizeAttributes(this);
    const surface = this.#eventTargetSurface();
    if (surface) {
      surface.present(this, {
        region: this.getAttribute("surface-region") || "content",
        columns: size.columns,
        rows: size.rows,
      });
    }
    this.#path = safePath;
    delete this.dataset.tileClosed;
    this.#render();
    this.#eventTargetSurface()?.sendToEnd(this);
  }

  #toggleFullscreen(force) {
    const shouldOpen = typeof force === "boolean" ? force : document.fullscreenElement !== this;
    if (shouldOpen) {
      this.requestFullscreen?.().catch(() => {});
    } else if (document.fullscreenElement === this) {
      document.exitFullscreen?.();
    }
  }

  // Hides this Tile again (not a removal) — double-clicking another file
  // reopens it pointed at the new one.
  #close() {
    this.#toggleFullscreen(false);
    this.#eventTargetSurface()?.close(this);
  }

  #render() {
    const frameWrap = this.#root.querySelector(".frame-wrap");
    const nameNode = this.#root.querySelector(".name");
    const openLink = this.#root.querySelector(".open-link");

    if (!this.#path) {
      nameNode.textContent = "";
      openLink.removeAttribute("href");
      frameWrap.replaceChildren(
        Object.assign(document.createElement("div"), { className: "empty", textContent: t("noFile") }),
      );
      return;
    }

    const title = this.#path.split("/").pop() || this.#path;
    nameNode.textContent = title;
    nameNode.title = this.#path;

    const encodedSegments = this.#path
      .split("/")
      .map((segment) => encodeURIComponent(segment));
    const rawFileHref = encodedSegments.join("/");
    const fileExtension = (title.split(".").pop() || "").toLowerCase();
    const viewerPageHref = `${FILE_VIEWER_PAGE_PATH}?path=${encodeURIComponent(this.#path)}`;

    const isRenderable = NATIVE_RENDERABLE_EXTENSIONS.has(fileExtension);
    const openHref = isRenderable ? viewerPageHref : rawFileHref;
    // Only the generated viewer page inherits presentation state; a raw
    // container file is not one of our pages and must be linked untouched.
    openLink.href = isRenderable ? decorateInternalUrl(openHref) : openHref;

    let iframe = frameWrap.querySelector("iframe");
    if (!iframe) {
      iframe = document.createElement("iframe");
      frameWrap.replaceChildren(iframe);
    }
    // The viewer page is a separate generated document, so it inherits the
    // active presentation state the same way every other internal link does.
    const resolvedIframeSrc = decorateInternalUrl(viewerPageHref);
    if (this.dataset.tileClosed !== "true" && iframe.src !== resolvedIframeSrc) {
      iframe.src = resolvedIframeSrc;
    }
  }
}

if (!customElements.get("onto-file-viewer-tile")) {
  customElements.define("onto-file-viewer-tile", OntoFileViewerTile);
}

// Global file-open dispatcher — deliberately registered once at module load,
// NOT inside each instance's ``connectedCallback``.  Rationale: the
// FileViewerTile is registered with ``default_closed = True``, which means
// the Surface renderer is *allowed* to omit the element from the DOM until
// it is explicitly opened (or at least to render it with ``tileClosed``
// applied and deferred).  If the element is not yet in the DOM when a
// double-click fires on the file tree, then ``connectedCallback`` has
// never run and no per-instance listener exists yet — classic catch-22.
// Listening globally from module-init (guaranteed to run once when the
// component script is embedded) breaks that deadlock: we locate the
// surface that owns the originating file-tree event, find (or create on
// demand) the viewer tile inside that surface, set the path, and reveal
// it — independently of whether any particular instance was connected
// before the user clicked.
(function () {
  function _owningSurface(target) {
    if (!(target instanceof Element)) return null;
    const direct = target.closest("onto-presentation-surface");
    if (direct) return direct;
    const root = target.getRootNode?.();
    if (root && root.host instanceof Element) {
      return root.host.closest("onto-presentation-surface") ?? null;
    }
    return null;
  }

  function _findOrCreateViewer(surface) {
    if (!surface) return null;
    let viewer = surface.querySelector("onto-file-viewer-tile");
    if (viewer instanceof OntoFileViewerTile) return viewer;
    const registry = window.__ONTOBDC_COMPONENT_REGISTRY__;
    let created = null;
    if (registry && typeof registry.materializeTile === "function") {
      try {
        created = registry.materializeTile(
          "http://datacenter.app.br/ontology/ontobdc/domain/view.ttl#FileViewerTile",
        );
      } catch (_) { created = null; }
    }
    if (!(created instanceof OntoFileViewerTile)) {
      created = document.createElement("onto-file-viewer-tile");
      delete created.dataset.tileClosed;
    }
    const size = _ensureViewerSizeAttributes(created);
    const regionAttr = created.getAttribute("surface-region") || "content";
    surface.present(created, {
      region: regionAttr,
      columns: size.columns,
      rows: size.rows,
    });
    return created;
  }

  const ONCE_KEY = Symbol.for("onto-file-viewer-tile.listener-attached");
  if (document[ONCE_KEY]) return;
  document[ONCE_KEY] = true;

  document.addEventListener("show-details-requested", (event) => {
    const path = String(event.detail?.path || "").trim();
    if (!path || event.detail?.kind !== "file") return;
    const surface = _owningSurface(event.target);
    const viewer = _findOrCreateViewer(surface);
    if (!viewer) return;
    Promise.resolve().then(() => {
      viewer.openFile?.(path);
    });
  });

  window.addEventListener("message", (event) => {
    const payload = event.data;
    if (!payload || typeof payload !== "object") return;
    if (payload.type !== "ontobdc:viewer:close-requested") return;
    const viewer = document.querySelector("onto-file-viewer-tile");
    if (!(viewer instanceof OntoFileViewerTile)) return;
    viewer.dataset.tileClosed = "";
  });
})();

export { OntoFileViewerTile };
