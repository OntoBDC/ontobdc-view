const I18N = __ONTOBDC_BUILD_I18N__;

function t(key, vars) {
  const locale = document.documentElement.lang || document.documentElement.dataset.language || "en";
  const table = I18N[locale] || I18N.en || {};
  let text = table[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, value);
  }
  return text;
}

class OntoPdfFileTile extends HTMLElement {
  #root;
  #path = "";
  #showDetailsListener;

  static get observedAttributes() {
    return ["columns", "rows", "data-ontobdc-resource"];
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
          grid-template-rows: minmax(0, 1fr) var(--onto-surface-slot-size, 72px);
          row-gap: 6px;
          inline-size: 100%;
          block-size: 100%;
          min-inline-size: 0;
          min-block-size: 0;
          overflow: hidden;
          padding: clamp(8px, 2.4cqw, 14px);
          border-radius: var(--onto-theme-tile-border-radius, 16px);
          border: var(--onto-theme-tile-border-width, 1px) solid
            color-mix(in srgb, var(--onto-theme-accent, #0ea5e9) 45%, transparent);
          background: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 5%, var(--onto-theme-background, #ffffff));
          color: var(--onto-theme-foreground, #0f172a);
          cursor: pointer;
        }
        :host(:fullscreen) .tile {
          border-radius: 0;
        }
        .viewer {
          min-inline-size: 0;
          min-block-size: 0;
          border-radius: 8px;
          overflow: hidden;
          background: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 8%, transparent);
        }
        .viewer embed {
          inline-size: 100%;
          block-size: 100%;
          border: 0;
        }
        .caption {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-inline-size: 0;
        }
        .info {
          min-inline-size: 0;
          display: flex;
          align-items: baseline;
          gap: .5em;
        }
        .label {
          flex: none;
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
        .size {
          flex: none;
          font-size: clamp(9px, 2.2cqw, 11px);
          opacity: .6;
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
        .empty {
          font-size: clamp(11px, 2.6cqw, 13px);
          opacity: .6;
        }
      </style>
      <div class="tile">
        <div class="viewer"><embed type="application/pdf"></div>
        <div class="caption">
          <div class="info">
            <span class="label">PDF</span>
            <span class="name"></span>
          </div>
          <span class="size"></span>
          <div class="actions">
            <a class="icon-btn open-link" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
            <button type="button" class="icon-btn close-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;

    this.#root.querySelector(".tile").addEventListener("dblclick", () => this.#activate());
    this.#root.querySelector(".open-link").addEventListener("click", (event) => event.stopPropagation());
    this.#root.querySelector(".close-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      this.#close();
    });
    this.#applyStaticLabels();
  }

  #applyStaticLabels() {
    const openLink = this.#root.querySelector(".open-link");
    const closeBtn = this.#root.querySelector(".close-btn");
    if (openLink) {
      openLink.title = t("open");
      openLink.setAttribute("aria-label", t("openFile"));
    }
    if (closeBtn) {
      closeBtn.title = t("close");
      closeBtn.setAttribute("aria-label", t("closeTile"));
    }
  }

  #onLanguageChanged = () => {
    this.#applyStaticLabels();
    this.#render();
  };

  connectedCallback() {
    this.#render();
    this.#showDetailsListener = (event) => this.#handleShowDetailsRequested(event);
    this.closest("onto-presentation-surface")?.addEventListener("show-details-requested", this.#showDetailsListener);
    document.addEventListener("language-changed", this.#onLanguageChanged);
  }

  disconnectedCallback() {
    this.closest("onto-presentation-surface")?.removeEventListener("show-details-requested", this.#showDetailsListener);
    document.removeEventListener("language-changed", this.#onLanguageChanged);
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#render();
  }

  #entity() {
    const resourceId = this.getAttribute("data-ontobdc-resource");
    if (!resourceId) return null;

    const script = document.getElementById("ontobdc-surface-jsonld");
    if (!script) return null;

    let graph;
    try {
      graph = JSON.parse(script.textContent);
    } catch {
      return null;
    }

    const nodes = Array.isArray(graph) ? graph : [graph];
    return nodes.find((node) => node && node["@id"] === resourceId) || null;
  }

  #literal(entity, property) {
    const values = entity?.[property];
    if (!Array.isArray(values) || values.length === 0) return "";
    return String(values[0]?.["@value"] ?? values[0]?.["@id"] ?? "").trim();
  }

  #formatBytes(bytesText) {
    const bytes = Number.parseInt(bytesText, 10);
    if (!Number.isFinite(bytes)) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Double-clicking this Tile directly opens fullscreen, without repositioning it.
  #activate() {
    this.#toggleFullscreen(true);
  }

  // Double-clicking the file's name in onto-file-tree-tile opens this Tile at the end of the content region and scrolls it into view, no fullscreen.
  #handleShowDetailsRequested(event) {
    if (!this.#path || event.detail?.path !== this.#path) return;
    delete this.dataset.tileClosed;
    this.#render();
    this.closest("onto-presentation-surface")?.sendToEnd(this);
    requestAnimationFrame(() => this.scrollIntoView({ behavior: "smooth", block: "end" }));
  }

  // Native Fullscreen API — immune to container-type/position:fixed containment quirks, and Escape closes it for free.
  #toggleFullscreen(force) {
    const shouldOpen = typeof force === "boolean" ? force : document.fullscreenElement !== this;
    if (shouldOpen) {
      this.requestFullscreen?.().catch(() => {});
    } else if (document.fullscreenElement === this) {
      document.exitFullscreen?.();
    }
  }

  // Hides this Tile again (not a removal) — double-clicking the file in
  // onto-file-tree-tile reveals it again later.
  #close() {
    this.#toggleFullscreen(false);
    this.closest("onto-presentation-surface")?.close(this);
  }

  #render() {
    const entity = this.#entity();
    this.#path = entity ? this.#literal(entity, "http://ontobdc.org/ontology/domain/ontobdc/ns.ttl#filePath") : "";
    const title = (entity ? this.#literal(entity, "http://purl.org/dc/terms/title") : "") || this.#path;
    const size = entity ? this.#literal(entity, "http://ontobdc.org/ontology/domain/ontobdc/ns.ttl#fileSize") : "";

    if (!this.#path) {
      this.#root.querySelector(".tile").replaceWith(
        Object.assign(document.createElement("div"), { className: "empty", textContent: t("noFile") }),
      );
      return;
    }

    const href = encodeURI(this.#path);
    this.#root.querySelector(".name").textContent = title;
    this.#root.querySelector(".name").title = title;
    // `data-tile-closed` only hides a default-closed Tile visually — it
    // stays connected, so setting `src` unconditionally here would make the
    // browser's native PDF viewer load the entire real file on initial page
    // load regardless of visibility (e.g. forcing OneDrive Files On-Demand
    // to hydrate every PDF up front). Deferred until
    // `#handleShowDetailsRequested` clears the flag and re-renders.
    if (this.dataset.tileClosed !== "true") {
      this.#root.querySelector("embed").setAttribute("src", href);
    }
    this.#root.querySelector(".open-link").href = href;
    this.#root.querySelector(".size").textContent = this.#formatBytes(size);
  }
}

if (!customElements.get("onto-pdf-file-tile")) {
  customElements.define("onto-pdf-file-tile", OntoPdfFileTile);
}

export { OntoPdfFileTile };
