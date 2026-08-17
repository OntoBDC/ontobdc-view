class OntoFileSizeTile extends HTMLElement {
  #root;

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
          gap: clamp(2px, 3cqw, 5px);
          overflow: hidden;
          padding: clamp(5px, 8cqw, 9px);
          border-radius: var(--onto-theme-tile-border-radius, 16px);
          border: var(--onto-theme-tile-border-width, 1px) solid
            color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 22%, transparent);
          background: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 5%, var(--onto-theme-background, #ffffff));
          color: var(--onto-theme-foreground, #0f172a);
          white-space: nowrap;
        }
        .value {
          min-inline-size: 0;
          font-size: clamp(15px, 30cqw, 30px);
          line-height: 1;
          font-weight: 800;
          letter-spacing: -0.04em;
        }
        .unit {
          flex: none;
          align-self: flex-end;
          margin-block-end: clamp(1px, 4cqh, 5px);
          font-size: clamp(8px, 14cqw, 12px);
          line-height: 1;
          font-weight: 700;
          opacity: .62;
          letter-spacing: .02em;
        }
      </style>
      <div class="tile" role="status" aria-label="Total file size">
        <span class="value"></span>
        <span class="unit"></span>
      </div>
    `;
  }

  connectedCallback() {
    this.#render();
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

    while (value >= 1000 && unitIndex < units.length - 1) {
      value /= 1000;
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
    const valueNode = this.#root.querySelector(".value");
    const unitNode = this.#root.querySelector(".unit");

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
