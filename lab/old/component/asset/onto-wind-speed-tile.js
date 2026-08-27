class OntoWindSpeedTile extends HTMLElement {
  #root;

  static get observedAttributes() {
    return [
      "data-wind-speed",
      "data-wind-unit",
      "data-wind-direction",
      "data-wind-direction-deg",
      "data-wind-gust",
      "lang",
    ];
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
          color: var(--onto-theme-foreground, #0f172a);
        }
        *, *::before, *::after { box-sizing: border-box; }
        .tile {
          inline-size: 100%;
          block-size: 100%;
          display: grid;
          grid-template-columns: auto 1fr;
          grid-template-rows: 1fr;
          align-items: center;
          gap: clamp(5px, 5cqw, 12px);
          overflow: hidden;
          padding: clamp(6px, 7cqw, 12px);
          border-radius: var(--onto-theme-tile-border-radius, 16px);
          border: var(--onto-theme-tile-border-width, 1px) solid
            color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 22%, transparent);
          background: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 5%, var(--onto-theme-background, #ffffff));
          color: var(--onto-theme-foreground, #0f172a);
        }
        .arrow {
          display: grid;
          place-items: center;
          inline-size: clamp(22px, 24cqw, 46px);
          block-size: clamp(22px, 24cqw, 46px);
          font-size: clamp(18px, 22cqw, 38px);
          line-height: 1;
          transform: rotate(var(--wind-direction, 0deg));
          transform-origin: center;
        }
        .primary {
          min-inline-size: 0;
          display: flex;
          align-items: baseline;
          gap: .25em;
          white-space: nowrap;
        }
        .speed {
          font-size: clamp(17px, 28cqw, 32px);
          line-height: 1;
          font-weight: 800;
          letter-spacing: -0.04em;
        }
        .unit {
          font-size: clamp(8px, 12cqw, 12px);
          line-height: 1;
          font-weight: 700;
          opacity: .62;
        }
        .details {
          display: none;
          grid-column: 1 / -1;
          min-inline-size: 0;
          gap: 3px;
          font-size: clamp(9px, 9cqw, 12px);
          line-height: 1.15;
          opacity: .72;
        }
        .direction,
        .gust { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        @container (min-width: 150px) {
          .direction { display: block; }
          .details { display: grid; }
        }

        @container (min-width: 150px) and (min-height: 105px) {
          .tile { grid-template-rows: auto auto; align-content: center; }
          .gust { display: block; }
        }

        @container (max-height: 104px) {
          .gust { display: none; }
        }
      </style>
      <div class="tile" role="group">
        <div class="arrow" aria-hidden="true">↑</div>
        <div class="primary">
          <span class="speed">—</span>
          <span class="unit"></span>
        </div>
        <div class="details">
          <span class="direction"></span>
          <span class="gust"></span>
        </div>
      </div>
    `;
  }

  connectedCallback() {
    this.#render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#render();
  }

  #language() {
    return String(this.getAttribute("lang") || document.documentElement.lang || "en").toLowerCase();
  }

  #labels() {
    const lang = this.#language();
    if (lang.startsWith("pt")) return { wind: "Vento", direction: "Direção", gust: "Rajada" };
    if (lang.startsWith("es")) return { wind: "Viento", direction: "Dirección", gust: "Ráfaga" };
    return { wind: "Wind", direction: "Direction", gust: "Gust" };
  }

  #number(attribute) {
    const raw = this.getAttribute(attribute);
    if (raw === null || raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  #format(value) {
    if (value === null) return "—";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1).replace(/\.0$/, "");
    return value.toFixed(1).replace(/\.0$/, "");
  }

  #render() {
    const labels = this.#labels();
    const speed = this.#number("data-wind-speed");
    const gust = this.#number("data-wind-gust");
    const unit = (this.getAttribute("data-wind-unit") || "km/h").trim();
    const direction = (this.getAttribute("data-wind-direction") || "").trim();
    const directionDeg = this.#number("data-wind-direction-deg");

    const speedNode = this.#root.querySelector(".speed");
    const unitNode = this.#root.querySelector(".unit");
    const directionNode = this.#root.querySelector(".direction");
    const gustNode = this.#root.querySelector(".gust");
    const tile = this.#root.querySelector(".tile");
    const arrow = this.#root.querySelector(".arrow");

    speedNode.textContent = this.#format(speed);
    unitNode.textContent = speed === null ? "" : unit;
    directionNode.textContent = direction ? `${labels.direction}: ${direction}` : "";
    gustNode.textContent = gust === null ? "" : `${labels.gust}: ${this.#format(gust)} ${unit}`;

    arrow.style.setProperty("--wind-direction", `${directionDeg ?? 0}deg`);

    const parts = [];
    if (speed !== null) parts.push(`${labels.wind}: ${this.#format(speed)} ${unit}`);
    if (direction) parts.push(`${labels.direction}: ${direction}`);
    if (gust !== null) parts.push(`${labels.gust}: ${this.#format(gust)} ${unit}`);
    const accessible = parts.join(", ") || `${labels.wind}: —`;
    tile.setAttribute("aria-label", accessible);
    tile.title = accessible;
  }
}

if (!customElements.get("onto-wind-speed-tile")) {
  customElements.define("onto-wind-speed-tile", OntoWindSpeedTile);
}

export { OntoWindSpeedTile };
