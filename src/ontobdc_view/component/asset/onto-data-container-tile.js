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

class OntoDataContainerTile extends HTMLElement {
  #root;

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
        .tile {
          position: relative;
          inline-size: 100%;
          block-size: 100%;
          min-inline-size: 0;
          min-block-size: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: clamp(6px, 3cqw, 14px);
          padding: clamp(12px, 5cqw, 22px);
          border-radius: var(--onto-theme-tile-border-radius, 16px);
          border: var(--onto-theme-tile-border-width, 1px) solid
            color-mix(in srgb, var(--onto-theme-accent, #0ea5e9) 45%, transparent);
          background:
            radial-gradient(130% 160% at 0% 0%, color-mix(in srgb, var(--onto-theme-accent, #0ea5e9) 18%, transparent), transparent 60%),
            color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 5%, var(--onto-theme-background, #ffffff));
          color: var(--onto-theme-foreground, #0f172a);
        }
        .label {
          font-size: clamp(10px, 3cqw, 12px);
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 60%, transparent);
        }
        .body {
          display: grid;
          gap: clamp(2px, 1.4cqw, 6px);
          min-inline-size: 0;
        }
        .name {
          font-size: clamp(16px, 7cqw, 28px);
          font-weight: 800;
          line-height: 1.15;
          overflow-wrap: anywhere;
        }
        .location {
          font-size: clamp(9px, 2.4cqw, 11px);
          font-weight: 600;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 62%, transparent);
          overflow-wrap: anywhere;
        }
        .footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .dims {
          font-size: clamp(10px, 2.8cqw, 12px);
          color: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 55%, transparent);
        }
        .badge {
          font-size: clamp(10px, 2.6cqw, 12px);
          font-weight: 600;
          padding: .3em .75em;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 30%, transparent);
          color: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 75%, transparent);
          white-space: nowrap;
        }
      </style>
      <article class="tile">
        <div class="label"></div>
        <div class="body">
          <div class="name"></div>
          <div class="location"></div>
        </div>
        <div class="footer">
          <span class="dims"></span>
          <span class="badge">container</span>
        </div>
      </article>
    `;
  }

  connectedCallback() {
    this.#render();
    document.addEventListener("language-changed", this.#onLanguageChanged);
  }

  disconnectedCallback() {
    document.removeEventListener("language-changed", this.#onLanguageChanged);
  }

  #onLanguageChanged = () => this.#render();

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

  #literal(entity, property, lang) {
    const values = entity?.[property];
    if (!Array.isArray(values) || values.length === 0) return "";

    const localized = lang ? values.find((value) => value["@language"] === lang) : null;
    const picked = localized || values[0];
    return String(picked["@value"] ?? picked["@id"] ?? "").trim();
  }

  #render() {
    const columns = Math.max(1, Number.parseInt(this.getAttribute("columns") || "1", 10));
    const rows = Math.max(1, Number.parseInt(this.getAttribute("rows") || "1", 10));
    const resourceId = this.getAttribute("data-ontobdc-resource") || "";
    const entity = this.#entity();
    const lang = (document.documentElement.lang || "en").toLowerCase();

    const id = entity
      ? this.#literal(entity, "http://purl.org/dc/terms/identifier") || entity["@id"] || resourceId
      : resourceId;
    const name = entity
      ? this.#literal(entity, "http://purl.org/dc/terms/title", lang) ||
        this.#literal(entity, "http://purl.org/dc/terms/title")
      : "";
    const location = entity
      ? this.#literal(entity, "http://www.w3.org/ns/prov#atLocation")
      : "";

    this.#root.querySelector(".label").textContent = id || t("fallbackLabel");
    this.#root.querySelector(".name").textContent = name || id || t("fallbackLabel");
    this.#root.querySelector(".location").textContent = location;
    this.#root.querySelector(".dims").textContent = `${columns} × ${rows}`;
  }
}

if (!customElements.get("onto-data-container-tile")) {
  customElements.define("onto-data-container-tile", OntoDataContainerTile);
}

export { OntoDataContainerTile };
