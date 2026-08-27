const LANGUAGES = __ONTOBDC_BUILD_LANGUAGES__;
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

class OntoLanguageTile extends HTMLElement {
  #root;
  #languageIndex = 0;
  #button;

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
          container-type: inline-size;
          color: inherit;
        }
        *, *::before, *::after { box-sizing: border-box; }
        button {
          inline-size: 100%;
          block-size: 100%;
          min-block-size: 100%;
          display: grid;
          grid-auto-flow: row;
          align-items: center;
          justify-content: center;
          justify-items: center;
          gap: clamp(1px, 2cqw, 3px);
          padding: clamp(4px, 10cqw, 8px);
          border: var(--onto-language-tile-border-width, 0px) solid var(--onto-language-tile-border-color, currentColor);
          border-radius: var(--onto-language-tile-border-radius, clamp(12px, 22cqw, 16px));
          background: var(--onto-language-tile-background, transparent);
          color: inherit;
          cursor: pointer;
          transition: transform .14s ease, opacity .14s ease, background .14s ease;
        }
        button:hover {
          background: color-mix(in srgb, currentColor 6%, var(--onto-language-tile-background, transparent));
          transform: translateY(-1px);
        }
        button:active {
          transform: scale(.985);
          opacity: .9;
        }
        .flag {
          font-size: min(34cqw, 20px);
          line-height: 1;
        }
        .label {
          font: 700 min(16cqw, 10px)/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          letter-spacing: .04em;
          white-space: nowrap;
        }
      </style>
      <button type="button">
        <span class="flag" aria-hidden="true"></span>
        <span class="label"></span>
      </button>
    `;

    this.#button = this.#root.querySelector("button");
    this.#button.addEventListener("click", () => this.nextLanguage());
    document.addEventListener("language-changed", this.#onLanguageChanged);
  }

  connectedCallback() {
    const current = document.documentElement.lang || document.documentElement.dataset.language;
    const foundIndex = LANGUAGES.findIndex(language => language.code === current);
    this.#languageIndex = foundIndex >= 0 ? foundIndex : 0;
    this.#applyLanguage(LANGUAGES[this.#languageIndex], false);
  }

  disconnectedCallback() {
    document.removeEventListener("language-changed", this.#onLanguageChanged);
  }

  get language() {
    return LANGUAGES[this.#languageIndex]?.code ?? null;
  }

  get languages() {
    return LANGUAGES.map(language => ({ ...language }));
  }

  set language(value) {
    const index = LANGUAGES.findIndex(language => language.code === value);
    if (index < 0) return;
    this.#languageIndex = index;
    this.#applyLanguage(LANGUAGES[index], true);
  }

  nextLanguage() {
    if (!LANGUAGES.length) return;
    this.#languageIndex = (this.#languageIndex + 1) % LANGUAGES.length;
    this.#applyLanguage(LANGUAGES[this.#languageIndex], true);
  }

  #onLanguageChanged = (event) => {
    // Another instance (or an external actor) changed the language — stay
    // in sync without re-emitting, so multiple language tiles on one Surface
    // never fight each other.
    const code = event.detail?.language;
    if (!code || code === this.language) return;
    const index = LANGUAGES.findIndex(language => language.code === code);
    if (index < 0) return;
    this.#languageIndex = index;
    this.#applyLanguage(LANGUAGES[index], false);
  };

  #applyLanguage(language, emit) {
    document.documentElement.lang = language.code;
    document.documentElement.dataset.language = language.code;
    this.#root.querySelector(".flag").textContent = language.flag || "";
    this.#root.querySelector(".label").textContent = language.short_label || language.code;
    this.#button.setAttribute("aria-label", t("selectLanguage"));
    this.#button.setAttribute("title", `${t("selectLanguage")} — ${language.label || language.code}`);

    if (emit) this.#emit(language);
  }

  #emit(language) {
    this.dispatchEvent(new CustomEvent("language-changed", {
      bubbles: true,
      composed: true,
      detail: {
        language: language.code,
        label: language.label
      }
    }));
  }
}

if (!customElements.get("onto-language-tile")) {
  customElements.define("onto-language-tile", OntoLanguageTile);
}

export { OntoLanguageTile };
