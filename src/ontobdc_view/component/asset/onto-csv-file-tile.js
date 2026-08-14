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

class OntoCsvFileTile extends HTMLElement {
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
        .scroll {
          min-inline-size: 0;
          min-block-size: 0;
          overflow: auto;
          border-radius: 8px;
        }
        table {
          border-collapse: collapse;
          font-size: clamp(10px, 2.4cqw, 12px);
          inline-size: 100%;
        }
        th, td {
          padding: 3px 8px;
          text-align: start;
          white-space: nowrap;
          border-bottom: 1px solid color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 12%, transparent);
        }
        th {
          position: sticky;
          inset-block-start: 0;
          font-weight: 700;
          background: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 10%, var(--onto-theme-background, #ffffff));
        }
        .fallback {
          display: grid;
          place-items: center;
          gap: 6px;
          inline-size: 100%;
          block-size: 100%;
          font-size: clamp(10px, 2.6cqw, 12px);
          opacity: .7;
          text-align: center;
        }
        .fallback a {
          color: var(--onto-theme-accent, #0ea5e9);
          font-weight: 600;
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
        .count {
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
        <div class="scroll"></div>
        <div class="caption">
          <div class="info">
            <span class="label">CSV</span>
            <span class="name"></span>
          </div>
          <span class="count"></span>
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
    document.removeEventListener("language-changed", this.#onLanguageChanged);
    this.closest("onto-presentation-surface")?.removeEventListener("show-details-requested", this.#showDetailsListener);
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

  // Minimal RFC4180-ish parser: handles quoted fields, escaped "" and commas inside quotes.
  #parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (inQuotes) {
        if (char === '"' && text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      } else {
        field += char;
      }
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
  }

  #renderTable(rows) {
    const [header, ...body] = rows;
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const cell of header) {
      const th = document.createElement("th");
      th.textContent = cell;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const cells of body) {
      const tr = document.createElement("tr");
      for (const cell of cells) {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
  }

  #renderFallback(scroll, href) {
    const fallback = document.createElement("div");
    fallback.className = "fallback";
    fallback.innerHTML = `<span></span>`;
    fallback.querySelector("span").textContent = t("previewUnavailable");
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = t("openFile");
    link.addEventListener("click", (event) => event.stopPropagation());
    fallback.appendChild(link);
    scroll.replaceChildren(fallback);
  }

  // Double-clicking this Tile directly opens fullscreen, without repositioning it.
  #activate() {
    this.#toggleFullscreen(true);
  }

  // Double-clicking the file's name in onto-file-tree-tile opens this Tile at the end of the content region and scrolls it into view, no fullscreen.
  #handleShowDetailsRequested(event) {
    if (!this.#path || event.detail?.path !== this.#path) return;
    delete this.dataset.tileClosed;
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

  async #render() {
    const entity = this.#entity();
    this.#path = entity ? this.#literal(entity, "http://ontobdc.org/ontology/domain/ns.ttl#filePath") : "";
    const title = (entity ? this.#literal(entity, "http://purl.org/dc/terms/title") : "") || this.#path;

    if (!this.#path) {
      this.#root.querySelector(".tile").replaceWith(
        Object.assign(document.createElement("div"), { className: "empty", textContent: t("noFile") }),
      );
      return;
    }

    const href = encodeURI(this.#path);
    this.#root.querySelector(".name").textContent = title;
    this.#root.querySelector(".name").title = title;
    this.#root.querySelector(".open-link").href = href;
    const scroll = this.#root.querySelector(".scroll");
    const count = this.#root.querySelector(".count");

    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const rows = this.#parseCsv(text);
      if (!rows.length) throw new Error("empty CSV");
      scroll.replaceChildren(this.#renderTable(rows));
      count.textContent = t("rows", { count: Math.max(0, rows.length - 1) });
    } catch {
      this.#renderFallback(scroll, href);
    }
  }
}

if (!customElements.get("onto-csv-file-tile")) {
  customElements.define("onto-csv-file-tile", OntoCsvFileTile);
}

export { OntoCsvFileTile };
