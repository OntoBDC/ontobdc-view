class OntoDateTimeTile extends HTMLElement {
  #root;
  #timer = null;
  #observer = null;

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
          align-items: center;
          justify-content: center;
          gap: clamp(4px, 4cqw, 10px);
          overflow: hidden;
          padding: clamp(5px, 7cqw, 10px);
          border-radius: var(--onto-theme-tile-border-radius, 16px);
          border: var(--onto-theme-tile-border-width, 1px) solid
            color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 22%, transparent);
          background: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 5%, var(--onto-theme-background, #ffffff));
          white-space: nowrap;
        }
        .time {
          font-size: clamp(16px, 30cqw, 30px);
          line-height: 1;
          font-weight: 800;
          letter-spacing: -0.04em;
        }
        .date {
          display: none;
          font-size: clamp(10px, 10cqw, 14px);
          line-height: 1.1;
          font-weight: 600;
          opacity: .68;
        }
        :host([data-layout="date-time"]) .tile {
          justify-content: space-between;
        }
        :host([data-layout="date-time"]) .date {
          display: inline;
        }
      </style>
      <div class="tile" role="timer" aria-live="off">
        <span class="time"></span>
        <span class="date"></span>
      </div>
    `;
  }

  connectedCallback() {
    this.#observer = new ResizeObserver(() => this.#updateLayout());
    this.#observer.observe(this);
    this.#render();
    this.#timer = window.setInterval(() => this.#render(), 1000);
  }

  disconnectedCallback() {
    if (this.#observer) this.#observer.disconnect();
    this.#observer = null;
    if (this.#timer !== null) window.clearInterval(this.#timer);
    this.#timer = null;
  }

  #locale() {
    const lang = (document.documentElement.lang || "en").trim();
    const aliases = {
      "pt-br": "pt-BR",
      "pt-pt": "pt-PT",
      "es": "es",
      "en": "en"
    };
    return aliases[lang.toLowerCase()] || lang;
  }

  #updateLayout() {
    const rect = this.getBoundingClientRect();
    const ratio = rect.height > 0 ? rect.width / rect.height : 1;
    this.setAttribute("data-layout", ratio >= 1.55 ? "date-time" : "time");
  }

  #render() {
    this.#updateLayout();
    const now = new Date();
    const locale = this.#locale();
    const time = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(now);
    const date = new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(now);

    const timeNode = this.#root.querySelector(".time");
    const dateNode = this.#root.querySelector(".date");
    const tile = this.#root.querySelector(".tile");
    timeNode.textContent = time;
    dateNode.textContent = date;
    tile.setAttribute("aria-label", `${date} ${time}`);
    tile.title = `${date} ${time}`;
  }
}

if (!customElements.get("onto-date-time-tile")) {
  customElements.define("onto-date-time-tile", OntoDateTimeTile);
}

export { OntoDateTimeTile };
