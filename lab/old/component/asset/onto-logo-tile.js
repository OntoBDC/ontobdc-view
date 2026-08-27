const BRAND = __ONTOBDC_BUILD_BRAND__;
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

class OntoLogoTile extends HTMLElement {
  #root;
  #columns = 1;
  #rows = 1;

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
          box-sizing: border-box;
          inline-size: 100%;
          block-size: 100%;
          min-inline-size: 0;
          min-block-size: 0;
          container-type: size;
          color: var(--onto-theme-foreground, currentColor);
        }
        *, *::before, *::after { box-sizing: border-box; }
        .frame {
          inline-size: 100%;
          block-size: 100%;
          display: grid;
          place-items: center;
          padding: clamp(8px, 10cqw, 18px);
          overflow: hidden;
        }
        .mark,
        .logotype {
          inline-size: 100%;
          block-size: 100%;
          display: grid;
          place-items: center;
        }
        .mark {
          color: var(--onto-theme-accent, var(--onto-theme-foreground, currentColor));
        }
        .mark svg {
          inline-size: min(72cqw, 72cqh, 58px);
          block-size: min(72cqw, 72cqh, 58px);
          display: block;
        }
        .logotype svg {
          inline-size: min(92cqw, 100%);
          block-size: min(70cqh, 72px);
          display: block;
        }
        .with-slogan {
          inline-size: 100%;
          block-size: 100%;
          display: grid;
          place-items: center;
          align-content: center;
          gap: clamp(6px, 5cqh, 14px);
        }
        .with-slogan .logotype {
          block-size: auto;
          min-block-size: 0;
        }
        .slogan {
          margin: 0;
          color: var(--onto-theme-foreground, currentColor);
          font: 500 clamp(11px, 7cqw, 20px)/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          text-align: center;
          letter-spacing: .01em;
          opacity: .78;
        }
        [hidden] { display: none !important; }
      </style>
      <div class="frame">
        <div class="mark" data-view="mark">${BRAND.mark_svg}</div>
        <div class="logotype" data-view="logotype" hidden>${BRAND.logotype_svg}</div>
        <div class="with-slogan" data-view="slogan" hidden>
          <div class="logotype">${BRAND.logotype_svg}</div>
          ${BRAND.slogan ? `<p class="slogan">${BRAND.slogan}</p>` : ""}
        </div>
      </div>
    `;
  }

  connectedCallback() {
    this.#syncDimensions();
    this.#render();
    document.addEventListener("language-changed", this.#onLanguageChanged);
  }

  disconnectedCallback() {
    document.removeEventListener("language-changed", this.#onLanguageChanged);
  }

  attributeChangedCallback() {
    this.#syncDimensions();
    this.#render();
  }

  #onLanguageChanged = () => this.#render();

  get columns() { return this.#columns; }
  set columns(value) { this.setAttribute("columns", String(value)); }

  get rows() { return this.#rows; }
  set rows(value) { this.setAttribute("rows", String(value)); }

  get brand() { return BRAND.name; }

  get representation() {
    const area = this.#columns * this.#rows;
    if (area <= 1) return "mark";
    if (area < 6 || !BRAND.slogan) return "logotype";
    return "slogan";
  }

  #syncDimensions() {
    this.#columns = Math.max(1, Number.parseInt(this.getAttribute("columns") || "1", 10) || 1);
    this.#rows = Math.max(1, Number.parseInt(this.getAttribute("rows") || "1", 10) || 1);
  }

  #render() {
    if (!this.#root) return;
    const representation = this.representation;
    for (const view of this.#root.querySelectorAll("[data-view]")) {
      view.hidden = view.dataset.view !== representation;
    }
    this.setAttribute("data-representation", representation);
    this.#root.querySelector(".frame").setAttribute("aria-label", t("ariaLabel", { brand: BRAND.name }));
  }
}

if (!customElements.get("onto-logo-tile")) {
  customElements.define("onto-logo-tile", OntoLogoTile);
}

export { OntoLogoTile };
