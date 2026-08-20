const THEMES = __ONTOBDC_BUILD_THEMES__;
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

const ICONS = {
  light: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.25" fill="currentColor"/>
      <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M12 2.25v2.2"/>
        <path d="M12 19.55v2.2"/>
        <path d="M2.25 12h2.2"/>
        <path d="M19.55 12h2.2"/>
        <path d="M5.1 5.1l1.55 1.55"/>
        <path d="M17.35 17.35l1.55 1.55"/>
        <path d="M18.9 5.1l-1.55 1.55"/>
        <path d="M6.65 17.35L5.1 18.9"/>
      </g>
    </svg>`,
  dark: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.1 15.4A8.2 8.2 0 0 1 8.6 4.9 8.6 8.6 0 1 0 19.1 15.4Z" fill="currentColor"/>
    </svg>`,
  default: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/>
    </svg>`
};

class OntoThemeTile extends HTMLElement {
  #root;
  #themeIndex = 0;
  #icon;
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
          cursor: pointer;
          color: inherit;
        }
        *, *::before, *::after { box-sizing: border-box; }
        button {
          appearance: none;
          -webkit-appearance: none;
          inline-size: 100%;
          block-size: 100%;
          min-block-size: 100%;
          display: grid;
          place-items: center;
          padding: clamp(6px, 12cqw, 10px);
          border: var(--onto-theme-tile-border-width, 0px) solid var(--onto-theme-tile-border-color, currentColor);
          border-radius: var(--onto-theme-tile-border-radius, clamp(12px, 22cqw, 16px));
          background: var(--onto-theme-tile-background, transparent);
          color: inherit;
          cursor: pointer;
          outline: none;
          transition: transform .14s ease, opacity .14s ease, background .14s ease;
        }
        button:hover {
          background: color-mix(in srgb, currentColor 6%, var(--onto-theme-tile-background, transparent));
          transform: translateY(-1px);
        }
        button:active {
          transform: scale(.985);
          opacity: .9;
        }
        .icon {
          inline-size: min(54cqw, 34px);
          block-size: min(54cqw, 34px);
        }
        .icon svg { display: block; width: 100%; height: 100%; }
      </style>
      <button type="button">
        <span class="icon"></span>
      </button>
    `;

    this.#button = this.#root.querySelector("button");
    this.#icon = this.#root.querySelector(".icon");
    this.#button.setAttribute("aria-label", t("toggleTheme"));
    this.#button.setAttribute("title", t("toggleTheme"));
    this.#button.addEventListener("click", () => this.nextTheme());
    document.addEventListener("language-changed", this.#onLanguageChanged);
  }

  disconnectedCallback() {
    document.removeEventListener("language-changed", this.#onLanguageChanged);
  }

  #onLanguageChanged = () => {
    this.#renderIcon(this.theme);
  };

  connectedCallback() {
    // `dataset.theme` (already applied on this same document) wins; else
    // fall back to `?theme=`, which carries the theme across a navigation
    // to/from a standalone entity Page (a separate document — see
    // onto-workstream-tile's "open" link and ontobdc_view.render_entity_view)
    // that would otherwise always reopen on the first/default theme.
    const current = document.documentElement.dataset.theme
      ?? new URLSearchParams(location.search).get("theme");
    const foundIndex = THEMES.findIndex(theme => theme.name === current);
    this.#themeIndex = foundIndex >= 0 ? foundIndex : 0;
    this.#applyTheme(THEMES[this.#themeIndex], false);
  }

  get theme() {
    return THEMES[this.#themeIndex]?.name ?? null;
  }

  get themes() {
    return THEMES.map(theme => ({ ...theme, tokens: { ...theme.tokens }, options: { ...theme.options } }));
  }

  set theme(value) {
    const index = THEMES.findIndex(theme => theme.name === value);
    if (index < 0) return;
    this.#themeIndex = index;
    this.#applyTheme(THEMES[index], true);
  }

  nextTheme() {
    if (!THEMES.length) return;
    this.#themeIndex = (this.#themeIndex + 1) % THEMES.length;
    this.#applyTheme(THEMES[this.#themeIndex], true);
  }

  #applyTheme(theme, emit) {
    if (!theme) return;

    document.documentElement.dataset.theme = theme.name;

    for (const [key, value] of Object.entries(theme.tokens ?? {})) {
      document.documentElement.style.setProperty(`--onto-theme-${key}`, value);
    }

    this.#renderIcon(theme.name);

    if (emit) this.#emit(theme);
  }

  #renderIcon(themeName) {
    this.#icon.innerHTML = ICONS[themeName] ?? ICONS.default;
    this.#button.setAttribute("aria-label", t("currentTheme", { theme: themeName }));
    this.#button.setAttribute("title", t("currentThemeShort", { theme: themeName }));
  }

  #emit(theme) {
    this.dispatchEvent(new CustomEvent("theme-changed", {
      bubbles: true,
      composed: true,
      detail: {
        theme: theme.name,
        label: theme.label,
        options: { ...(theme.options ?? {}) }
      }
    }));
  }
}

if (!customElements.get("onto-theme-tile")) {
  customElements.define("onto-theme-tile", OntoThemeTile);
}

export { OntoThemeTile };
