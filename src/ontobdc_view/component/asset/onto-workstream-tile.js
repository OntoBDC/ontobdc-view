const WORK_STREAM_TYPE_NS = "http://datacenter.app.br/ontology/productivity/entity/work_stream/type.ttl#";

const DESCRIPTION_PROPERTY = "http://purl.org/dc/terms/description";

// Canonical URL-controlled presentation parameters. The page's URL-state
// runtime owns this list when it is present, and this Tile defers to it —
// but a Tile is self-sufficient by contract, so it also has to know the
// list itself. A control that quietly stops carrying state because a
// runtime from another package is missing is a broken control, not a
// degraded one.
const PRESENTATION_PARAMS = ["lang", "theme"];

// What the document is actually rendering, for a page whose URL was never
// normalized: the link must carry the state the user is looking at, not
// nothing.
const APPLIED_PRESENTATION_STATE = {
  lang: () =>
    document.documentElement.lang
    || document.documentElement.dataset.language
    || "",
  theme: () => document.documentElement.dataset.theme || "",
};

/**
 * Return `href` carrying the active presentation state, so a separate
 * generated document opens in the language and theme in use here.
 *
 * Prefers the page's URL-state runtime; falls back to the same rule when it
 * is absent. A parameter the link already declares always wins, so
 * inheriting never overwrites an explicit choice.
 */
function decorateInternalUrl(href) {
  const state = window.ontobdcUrlState;
  if (state && typeof state.decorate === "function") return state.decorate(href);

  try {
    const target = new URL(href, location.href);
    const current = new URLSearchParams(location.search);
    for (const name of PRESENTATION_PARAMS) {
      if (target.searchParams.has(name)) continue;
      const carried = current.get(name) || APPLIED_PRESENTATION_STATE[name]();
      if (carried) target.searchParams.set(name, carried);
    }
    return target.href;
  } catch {
    return href;
  }
}


// Ordered, WorkStream-specific: which facade-mapped properties to show when
// expanded, and under what label. GlobalId/Name are already shown in the
// compact header (identifier/name), and Description always shows just
// below it, so neither is repeated here.
const FIELD_DEFINITIONS = [
  { key: "what", property: `${WORK_STREAM_TYPE_NS}what` },
  { key: "why", property: `${WORK_STREAM_TYPE_NS}why` },
  { key: "who", property: `${WORK_STREAM_TYPE_NS}who` },
  { key: "where", property: `${WORK_STREAM_TYPE_NS}where` },
  { key: "when", property: `${WORK_STREAM_TYPE_NS}when` },
  { key: "how", property: `${WORK_STREAM_TYPE_NS}how` },
  { key: "howMuch", property: `${WORK_STREAM_TYPE_NS}howMuch` },
];

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

class OntoWorkStreamTile extends HTMLElement {
  #root;
  #expanded = false;
  #originalRows = null;
  #originalMaxRows = null;
  #originalMinRows = 2;
  #onThemeChanged = () => this.#syncUrlState();

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
            color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 22%, transparent);
          background: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 5%, var(--onto-theme-background, #ffffff));
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
        .identifier {
          font-size: clamp(9px, 2.4cqw, 11px);
          font-weight: 600;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 62%, transparent);
          overflow-wrap: anywhere;
        }
        .description {
          font-size: clamp(11px, 2.6cqw, 13px);
          line-height: 1.4;
          overflow-wrap: anywhere;
          color: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 82%, transparent);
        }
        .description:empty {
          display: none;
        }
        .fields {
          display: none;
          grid-template-columns: 1fr;
          gap: clamp(6px, 1.6cqh, 12px);
          padding-block-start: clamp(4px, 1.2cqh, 10px);
          border-block-start: 1px solid color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 14%, transparent);
        }
        .tile.expanded .fields {
          display: grid;
        }
        /* No populated FacadeField to show: no divider/padding either, or
           expanding would grow the Tile just to show empty space. */
        .fields:empty {
          display: none !important;
          border: 0;
          padding: 0;
        }
        .field-label {
          font-size: clamp(9px, 2.2cqw, 11px);
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: color-mix(in srgb, var(--onto-theme-accent, #0ea5e9) 85%, var(--onto-theme-foreground, #0f172a));
        }
        .field-value {
          font-size: clamp(11px, 2.6cqw, 13px);
          line-height: 1.4;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
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
        .footer-end {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .badge {
          font-size: clamp(10px, 2.6cqw, 12px);
          font-weight: 600;
          padding: .3em .75em;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--onto-theme-accent, #0ea5e9) 45%, transparent);
          color: var(--onto-theme-accent, #0ea5e9);
          white-space: nowrap;
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
        .icon-btn:disabled,
        .icon-btn[aria-disabled="true"] {
          opacity: .35;
          cursor: default;
          pointer-events: none;
        }
        .icon-btn svg {
          inline-size: 14px;
          block-size: 14px;
          transition: transform .15s ease;
        }
        .icon-btn.expand-btn.is-expanded svg {
          transform: rotate(180deg);
        }
      </style>
      <article class="tile">
        <div class="header-row" style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
          <div class="label workstream-label"></div>
          <div class="actions">
            <a class="icon-btn open-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
            <button type="button" class="icon-btn expand-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>
        <div class="body">
          <div class="name"></div>
          <div class="identifier"></div>
          <div class="description"></div>
        </div>
        <div class="fields"></div>
        <div class="footer">
          <span class="dims"></span>
          <span class="badge">workstream</span>
        </div>
      </article>
    `;

    this.#root.querySelector(".open-link").addEventListener("click", (event) => event.stopPropagation());
    this.#root.querySelector(".open-link").setAttribute("title", t("openView"));
    this.#root.querySelector(".open-link").setAttribute("aria-label", t("openView"));
    this.#root.querySelector(".expand-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      this.#toggleExpand();
    });
    this.#root.querySelector(".workstream-label").textContent = t("fallbackName");
    this.#updateExpandButton();
  }

  #onLanguageChanged = () => {
    this.#root.querySelector(".open-link").setAttribute("title", t("openView"));
    this.#root.querySelector(".open-link").setAttribute("aria-label", t("openView"));
    this.#root.querySelector(".workstream-label").textContent = t("fallbackName");
    this.#updateExpandButton();
    this.#render();
  };

  connectedCallback() {
    // append()/insertBefore() disconnect+reconnect a custom element even
    // when it's only moving within the same parent (sendToEnd, mid-expand)
    // — capture the pre-expand size exactly once, or a reconnect during an
    // active expand would overwrite it with the already-grown size.
    if (this.#originalRows === null) {
      this.#originalRows = this.getAttribute("rows") || "2";
      this.#originalMaxRows = this.getAttribute("max-rows") || this.#originalRows;
      this.#originalMinRows = Math.max(1, Number.parseInt(this.getAttribute("min-rows") || "1", 10));
    }
    this.#render();
    // The open-link's ?theme= is snapshotted at render time — keep it in
    // sync if the user toggles theme after this Tile already rendered.
    document.addEventListener("theme-changed", this.#onThemeChanged);
    document.addEventListener("language-changed", this.#onLanguageChanged);
  }

  disconnectedCallback() {
    document.removeEventListener("theme-changed", this.#onThemeChanged);
    document.removeEventListener("language-changed", this.#onLanguageChanged);
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#render();
  }

  // The detail page is a separate document, so it can only learn the active
  // presentation state (theme, language, ...) from the link that opens it.
  #syncUrlState() {
    const openLink = this.#root.querySelector(".open-link");
    if (!openLink.hasAttribute("href")) return;
    openLink.href = decorateInternalUrl(openLink.getAttribute("href"));
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

  #populatedFields(entity) {
    if (!entity) return [];
    return FIELD_DEFINITIONS.map(({ key, property }) => ({
      label: t(key),
      value: this.#literal(entity, property),
    })).filter(({ value }) => value);
  }

  // Expand: send the Tile to the end of the content region (where growing
  // its row-span won't disrupt anything above it), then grow it downward
  // until its own content — the FacadeField list — fits without clipping.
  // Starts from a heuristic estimate and corrects upward against the
  // actually rendered height, since text length varies per entity.
  async #toggleExpand() {
    if (this.#expanded) {
      this.#collapse();
      return;
    }
    this.#expanded = true;
    const tileEl = this.#root.querySelector(".tile");
    tileEl.classList.add("expanded");
    this.#updateExpandButton();

    const surface = this.closest("onto-presentation-surface");
    let rows = this.#estimateRowsNeeded();
    this.setAttribute("max-rows", String(rows));
    this.setAttribute("rows", String(rows));
    surface?.sendToEnd(this);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (tileEl.scrollHeight <= tileEl.clientHeight + 1) break;
      rows += 1;
      this.setAttribute("max-rows", String(rows));
      this.setAttribute("rows", String(rows));
      surface?.relayout();
    }

    requestAnimationFrame(() => this.scrollIntoView({ behavior: "smooth", block: "end" }));
  }

  // Collapse: shrink back to the original declared size, but the Tile
  // stays wherever it currently is — sendToEnd() during expand already
  // moved it, and there is no "send back" to its earlier position.
  #collapse() {
    this.#expanded = false;
    this.#root.querySelector(".tile").classList.remove("expanded");
    this.#updateExpandButton();
    this.setAttribute("rows", this.#originalRows);
    this.setAttribute("max-rows", this.#originalMaxRows);
    this.closest("onto-presentation-surface")?.relayout();
  }

  #estimateRowsNeeded() {
    const entity = this.#entity();
    const fieldCount = this.#populatedFields(entity).length;
    if (!fieldCount) return this.#originalMinRows;
    // Rough starting guess (label + value line per field, plus header/
    // footer chrome) — the post-layout correction loop above grows this
    // further if the actual rendered content doesn't fit.
    const estimated = Math.ceil((fieldCount * 2 + 3) / 3);
    return Math.max(this.#originalMinRows, estimated);
  }

  #updateExpandButton() {
    const button = this.#root.querySelector(".expand-btn");
    button.classList.toggle("is-expanded", this.#expanded);
    const label = this.#expanded ? t("collapse") : t("expand");
    button.title = label;
    button.setAttribute("aria-label", label);
  }

  #render() {
    const columns = Math.max(1, Number.parseInt(this.getAttribute("columns") || "1", 10));
    const rows = Math.max(1, Number.parseInt(this.getAttribute("rows") || "1", 10));
    const resourceId = this.getAttribute("data-ontobdc-resource") || "";
    const entity = this.#entity();
    const lang = (document.documentElement.lang || "en").toLowerCase();

    const identifier = entity
      ? this.#literal(entity, "http://purl.org/dc/terms/identifier") || entity["@id"] || resourceId
      : resourceId;
    const name = entity
      ? this.#literal(entity, "http://purl.org/dc/terms/title", lang) ||
        this.#literal(entity, "http://purl.org/dc/terms/title")
      : "";

    this.#root.querySelector(".name").textContent = name || identifier || t("fallbackName");
    this.#root.querySelector(".identifier").textContent = identifier;
    this.#root.querySelector(".description").textContent = entity
      ? this.#literal(entity, DESCRIPTION_PROPERTY)
      : "";
    this.#root.querySelector(".dims").textContent = `${columns} × ${rows}`;

    // Points at the standalone WorkStream detail page
    // (.__ontobdc__/view/work_stream/{identifier}.html, relative to the
    // Surface's own index.html) — generated by EntityViewsPublishedCapability
    // via ontobdc_view's WorkStreamViewPage (see ontobdc_view.render_entity_view).
    // Opens in the same tab (no target="_blank"); the active presentation
    // state is carried by #syncUrlState below, since the detail page is a
    // separate document with no other way to know what was active on the
    // Surface.
    const openLink = this.#root.querySelector(".open-link");
    if (identifier) {
      openLink.href = `.__ontobdc__/view/work_stream/${encodeURIComponent(identifier)}.html`;
      this.#syncUrlState();
      openLink.removeAttribute("aria-disabled");
    } else {
      openLink.removeAttribute("href");
      openLink.setAttribute("aria-disabled", "true");
    }

    const fields = this.#populatedFields(entity);
    const fieldsContainer = this.#root.querySelector(".fields");
    fieldsContainer.innerHTML = "";
    for (const { label, value } of fields) {
      const row = document.createElement("div");
      row.className = "field";
      const labelEl = document.createElement("div");
      labelEl.className = "field-label";
      labelEl.textContent = label;
      const valueEl = document.createElement("div");
      valueEl.className = "field-value";
      valueEl.textContent = value;
      row.append(labelEl, valueEl);
      fieldsContainer.appendChild(row);
    }

    // Nothing to expand into — don't offer an action that would just grow
    // the Tile to show empty space.
    const expandButton = this.#root.querySelector(".expand-btn");
    expandButton.disabled = fields.length === 0;
    if (fields.length === 0) expandButton.title = t("noDetailsToShow");
  }
}

if (!customElements.get("onto-workstream-tile")) {
  customElements.define("onto-workstream-tile", OntoWorkStreamTile);
}

export { OntoWorkStreamTile };
