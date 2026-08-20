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

class OntoFileSizeTile extends HTMLElement {
  #root;
  #onLanguageChanged = () => this.#render();

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
          color: var(--onto-theme-foreground, #0f172a);
        }
        *, *::before, *::after { box-sizing: border-box; }
        .tile {
          inline-size: 100%;
          block-size: 100%;
          min-inline-size: 0;
          min-block-size: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: clamp(2px, 4cqh, 6px);
          overflow: hidden;
          padding: clamp(5px, 8cqw, 9px);
          border-radius: var(--onto-theme-tile-border-radius, 16px);
          border: var(--onto-theme-tile-border-width, 1px) solid
            color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 22%, transparent);
          background: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 5%, var(--onto-theme-background, #ffffff));
          color: var(--onto-theme-foreground, #0f172a);
          white-space: nowrap;
        }
        .label {
          font-size: clamp(9px, 2.2cqw, 11px);
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 60%, transparent);
        }
        .value {
          min-inline-size: 0;
          font-size: clamp(15px, 30cqw, 30px);
          line-height: 1;
          font-weight: 800;
          letter-spacing: -0.04em;
          text-align: center;
        }
        .amount {
          /* The only row that stretches full-width — .label/.value stay
             centered above it via the .tile's own align-items: center. */
          align-self: stretch;
          inline-size: 100%;
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          gap: clamp(4px, 1.8cqh, 10px);
        }
        .unit {
          flex: none;
          font-size: clamp(8px, 14cqw, 12px);
          line-height: 1;
          font-weight: 700;
          opacity: .62;
          letter-spacing: .02em;
          text-align: start;
        }
        .close-btn {
          all: unset;
          cursor: pointer;
          flex: none;
          inline-size: clamp(18px, 5cqh, 24px);
          block-size: clamp(18px, 5cqh, 24px);
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 65%, transparent);
          background: transparent;
          transition: background-color .15s ease, color .15s ease;
        }
        .close-btn:hover {
          background: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 10%, transparent);
          color: var(--onto-theme-foreground, #0f172a);
        }
        .close-btn:focus-visible {
          outline: 2px solid var(--onto-theme-accent, #0ea5e9);
          outline-offset: 2px;
        }
        .close-btn svg {
          inline-size: 60%;
          block-size: 60%;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
      </style>
      <div class="tile" role="status" aria-label="Total file size">
        <span class="label"></span>
        <span class="value"></span>
        <div class="amount">
          <span class="unit"></span>
          <button type="button" class="close-btn" title="Close tile" aria-label="Close tile">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  #onCloseClick = () => this.#closeTile();

  connectedCallback() {
    const closeBtn = this.#root.querySelector(".close-btn");
    if (closeBtn) closeBtn.addEventListener("click", this.#onCloseClick);
    this.#render();
    document.addEventListener("language-changed", this.#onLanguageChanged);
  }

  disconnectedCallback() {
    const closeBtn = this.#root.querySelector(".close-btn");
    if (closeBtn) closeBtn.removeEventListener("click", this.#onCloseClick);
    document.removeEventListener("language-changed", this.#onLanguageChanged);
  }

  // Removes ONLY this tile instance. The previous version walked up to
  // closest("[data-ontobdc-card]") — an attribute that doesn't exist
  // anywhere in either repo, so it always fell through to
  // host.parentElement, which is the shared region/grid container every
  // other tile also lives in: closing this one tile removed that whole
  // container, wiping every tile on the page. `this` is unambiguous
  // regardless of what the Surface wraps tiles in.
  #closeTile() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  #surfaceNodes() {
    const script = document.getElementById("ontobdc-surface-jsonld");
    if (!script) return [];
    try {
      const graph = JSON.parse(script.textContent);
      return Array.isArray(graph) ? graph : [graph];
    } catch {
      return [];
    }
  }

  #totalBytes() {
    const property = "http://ontobdc.org/ontology/domain/ns.ttl#fileSize";
    let total = 0;
    let found = false;
    for (const node of this.#surfaceNodes()) {
      const values = node?.[property];
      if (!Array.isArray(values)) continue;
      for (const value of values) {
        const parsed = Number(value?.["@value"] ?? value?.["@id"] ?? value);
        if (!Number.isFinite(parsed) || parsed < 0) continue;
        total += parsed;
        found = true;
      }
    }
    return found ? total : null;
  }

  #formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return null;

    const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    let formatted;
    if (unitIndex === 0) {
      formatted = String(Math.round(value));
    } else if (value < 10) {
      formatted = value.toFixed(2);
    } else if (value < 100) {
      formatted = value.toFixed(1);
    } else {
      formatted = value.toFixed(0);
    }

    return { value: formatted, unit: units[unitIndex], bytes: Math.round(bytes) };
  }

  #render() {
    const formatted = this.#formatBytes(this.#totalBytes());
    const tile = this.#root.querySelector(".tile");
    const labelNode = this.#root.querySelector(".label");
    const valueNode = this.#root.querySelector(".value");
    const unitNode = this.#root.querySelector(".unit");

    const closeBtn = this.#root.querySelector(".close-btn");
    if (closeBtn) {
      closeBtn.title = t("closeTile");
      closeBtn.setAttribute("aria-label", t("closeTile"));
    }

    labelNode.textContent = t("title");

    if (!formatted) {
      valueNode.textContent = "—";
      unitNode.textContent = "";
      tile.title = "Total file size unavailable";
      return;
    }

    valueNode.textContent = formatted.value;
    unitNode.textContent = formatted.unit;
    const exact = `${formatted.bytes.toLocaleString("en-US")} B`;
    tile.title = exact;
    tile.setAttribute("aria-label", `Total file size: ${exact}`);
  }
}

if (!customElements.get("onto-file-size-tile")) {
  customElements.define("onto-file-size-tile", OntoFileSizeTile);
}

export { OntoFileSizeTile };
