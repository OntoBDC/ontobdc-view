const DOUBLE_TAP_WINDOW_MS = 350;
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

class OntoFileTreeTile extends HTMLElement {
  #root;
  #expandedPaths = new Set();
  #selectedPath = null;
  #lastTapPath = null;
  #lastTapTime = 0;

  // Not observing columns/rows (unused here) — bringToFront()'s layout pass rewrites them, which would re-trigger #render() and destroy the clicked row mid double-click.
  static get observedAttributes() {
    return ["data-ontobdc-resource"];
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
        :host(:fullscreen) {
          inline-size: 100vw;
          block-size: 100vh;
          background: var(--onto-theme-background, #ffffff);
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
          gap: clamp(6px, 2.4cqw, 12px);
          padding: clamp(12px, 4cqw, 20px);
          border-radius: var(--onto-theme-tile-border-radius, 16px);
          border: var(--onto-theme-tile-border-width, 1px) solid
            color-mix(in srgb, var(--onto-theme-accent, #0ea5e9) 45%, transparent);
          background:
            radial-gradient(130% 160% at 0% 0%, color-mix(in srgb, var(--onto-theme-accent, #0ea5e9) 18%, transparent), transparent 60%),
            color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 5%, var(--onto-theme-background, #ffffff));
          color: var(--onto-theme-foreground, #0f172a);
        }
        :host(:fullscreen) .tile {
          border-radius: 0;
        }
        .header {
          flex: none;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }
        .label {
          font-size: clamp(10px, 2.6cqw, 12px);
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 60%, transparent);
        }
        .toolbar {
          flex: none;
          display: flex;
          gap: 2px;
          opacity: .55;
          transition: opacity .15s ease;
        }
        .tile:hover .toolbar,
        .tile:focus-within .toolbar {
          opacity: 1;
        }
        .toolbar button {
          all: unset;
          cursor: pointer;
          display: grid;
          place-items: center;
          inline-size: 22px;
          block-size: 22px;
          border-radius: 6px;
          font-size: 13px;
          line-height: 1;
          color: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 70%, transparent);
        }
        .toolbar button:hover,
        .toolbar button:focus-visible {
          background: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 12%, transparent);
        }
        .scroll {
          flex: 1 1 auto;
          min-block-size: 0;
          overflow-y: auto;
          overflow-x: hidden;
        }
        ul.tree {
          list-style: none;
          margin: 0;
          padding-inline-start: 0;
        }
        ul.tree ul {
          list-style: none;
          margin: 0;
          padding-inline-start: 1.1em;
        }
        .node {
          display: flex;
          align-items: baseline;
          gap: .4em;
          padding: 1px 4px;
          border-radius: 4px;
          font-size: clamp(11px, 2.6cqw, 13px);
          line-height: 1.6;
          overflow-wrap: anywhere;
          cursor: pointer;
          /* Without this, a fast double-tap on mobile is grabbed by the
             browser as a double-tap-to-zoom gesture before dblclick (or our
             own touchend double-tap detection below) ever sees it. */
          touch-action: manipulation;
        }
        .node:hover,
        .node:focus-visible {
          background: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 8%, transparent);
          outline: none;
        }
        .node .icon {
          flex: none;
          opacity: .7;
        }
        .node.dir .name {
          font-weight: 700;
        }
        .node.file.selected {
          background: color-mix(in srgb, var(--onto-theme-accent, #0ea5e9) 22%, transparent);
          outline: 1px solid color-mix(in srgb, var(--onto-theme-accent, #0ea5e9) 55%, transparent);
        }
        .empty {
          font-size: clamp(11px, 2.6cqw, 13px);
          opacity: .6;
        }
      </style>
      <article class="tile">
        <div class="header">
          <div class="label"></div>
          <div class="toolbar">
            <button type="button" data-action="expand-all" class="expand-all-btn">&#8862;</button>
            <button type="button" data-action="collapse-all" class="collapse-all-btn">&#8863;</button>
            <button type="button" data-action="fullscreen" class="fullscreen-btn">&#9974;</button>
          </div>
        </div>
        <div class="scroll"><ul class="tree"></ul></div>
      </article>
    `;

    this.#root.querySelector('[data-action="expand-all"]').addEventListener("click", () => this.#expandAll());
    this.#root.querySelector('[data-action="collapse-all"]').addEventListener("click", () => this.#collapseAll());
    this.#root.querySelector('[data-action="fullscreen"]').addEventListener("click", () => this.#toggleFullscreen());
    this.#applyToolbarLabels();
  }

  connectedCallback() {
    this.#render();
    document.addEventListener("language-changed", this.#onLanguageChanged);
  }

  disconnectedCallback() {
    document.removeEventListener("language-changed", this.#onLanguageChanged);
  }

  #onLanguageChanged = () => {
    this.#applyToolbarLabels();
    this.#render();
  };

  #applyToolbarLabels() {
    const expandAll = t("expandAll");
    const collapseAll = t("collapseAll");
    const openFullscreen = t("openFullscreen");
    const expandBtn = this.#root.querySelector(".expand-all-btn");
    const collapseBtn = this.#root.querySelector(".collapse-all-btn");
    const fullscreenBtn = this.#root.querySelector(".fullscreen-btn");
    expandBtn.title = expandAll;
    expandBtn.setAttribute("aria-label", expandAll);
    collapseBtn.title = collapseAll;
    collapseBtn.setAttribute("aria-label", collapseAll);
    fullscreenBtn.title = openFullscreen;
    fullscreenBtn.setAttribute("aria-label", openFullscreen);
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

  #literal(entity, property, lang) {
    const values = entity?.[property];
    if (!Array.isArray(values) || values.length === 0) return "";

    const localized = lang ? values.find((value) => value["@language"] === lang) : null;
    const picked = localized || values[0];
    return String(picked["@value"] ?? picked["@id"] ?? "").trim();
  }

  #literalList(entity, property) {
    const values = entity?.[property];
    if (!Array.isArray(values)) return [];

    return values
      .map((value) => String(value?.["@value"] ?? value?.["@id"] ?? "").trim())
      .filter(Boolean);
  }

  #buildTree(paths) {
    const root = { children: new Map(), isFile: false, path: "" };
    for (const path of paths) {
      const segments = path.split("/").filter(Boolean);
      let node = root;
      let builtPath = "";
      segments.forEach((segment, index) => {
        builtPath = builtPath ? `${builtPath}/${segment}` : segment;
        if (!node.children.has(segment)) {
          node.children.set(segment, { children: new Map(), isFile: true, path: builtPath });
        }
        node = node.children.get(segment);
        if (index !== segments.length - 1) node.isFile = false;
      });
    }
    return root;
  }

  #allDirectoryPaths(node, into) {
    for (const child of node.children.values()) {
      if (!child.isFile) {
        into.add(child.path);
        this.#allDirectoryPaths(child, into);
      }
    }
    return into;
  }

  #renderNode(node) {
    const list = document.createElement("ul");
    const entries = [...node.children.entries()].sort((a, b) => {
      if (a[1].isFile !== b[1].isFile) return a[1].isFile ? 1 : -1;
      return a[0].localeCompare(b[0]);
    });

    for (const [name, child] of entries) {
      const item = document.createElement("li");
      const row = document.createElement("div");
      const expanded = this.#expandedPaths.has(child.path);
      row.className = `node ${child.isFile ? "file" : "dir"}${
        child.isFile && child.path === this.#selectedPath ? " selected" : ""
      }`;
      row.tabIndex = 0;
      row.dataset.path = child.path;
      row.dataset.kind = child.isFile ? "file" : "dir";

      const icon = child.isFile ? "\u{1F4C4}" : expanded ? "\u{1F4C2}" : "\u{1F4C1}";
      row.innerHTML = `<span class="icon">${icon}</span><span class="name"></span>`;
      row.querySelector(".name").textContent = name;

      if (child.isFile) {
        row.addEventListener("click", () => this.#selectFile(child.path));
        row.addEventListener("dblclick", () => this.#activateFile(child.path));
        row.addEventListener("touchend", (event) => this.#handleFileTouchEnd(event, child.path));
      } else {
        row.addEventListener("click", () => this.#toggleDirectory(child.path));
      }
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        row.click();
      });

      item.appendChild(row);
      if (!child.isFile && child.children.size && expanded) {
        item.appendChild(this.#renderNode(child));
      }
      list.appendChild(item);
    }

    return list;
  }

  #toggleDirectory(path) {
    if (this.#expandedPaths.has(path)) this.#expandedPaths.delete(path);
    else this.#expandedPaths.add(path);
    this.#render();
  }

  #expandAll() {
    const tree = this.#currentTree();
    if (!tree) return;
    this.#expandedPaths = this.#allDirectoryPaths(tree, new Set());
    this.#render();
  }

  #collapseAll() {
    this.#expandedPaths = new Set();
    this.#render();
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

  // `EntitySelected` (Presentation Global Event, domain-conversations 2026-08-08).
  // Updates the .selected class in place instead of calling #render(): a full
  // rebuild replaces the row DOM node mid-click, which stops the browser from
  // ever recognizing the second click of a double-click as the same target,
  // so native dblclick silently never fires on it.
  #selectFile(path) {
    const previousPath = this.#selectedPath;
    this.#selectedPath = path;
    this.#updateSelectionClass(previousPath, path);
    this.#emit("entity-selected", { path, kind: "file" });
  }

  #updateSelectionClass(previousPath, nextPath) {
    if (previousPath) {
      this.#root.querySelector(`.node.file[data-path="${CSS.escape(previousPath)}"]`)?.classList.remove("selected");
    }
    this.#root.querySelector(`.node.file[data-path="${CSS.escape(nextPath)}"]`)?.classList.add("selected");
  }

  // `ShowDetailsRequested` (same doc) — opening a viewer Tile is the listener's job, not this Tile's.
  #activateFile(path) {
    this.#emit("show-details-requested", { path, kind: "file" });
  }

  // Native dblclick is unreliable on touch devices (some browsers never
  // synthesize it for arbitrary elements at all), so files wouldn't open
  // on mobile without this. Tracks tap timing/target ourselves instead of
  // depending on that synthesis. preventDefault() here also stops the
  // browser from firing its own synthetic click/dblclick ~300ms later for
  // this same touch, so the two paths never double-handle one interaction.
  #handleFileTouchEnd(event, path) {
    event.preventDefault();
    const now = Date.now();
    const isDoubleTap = this.#lastTapPath === path && now - this.#lastTapTime < DOUBLE_TAP_WINDOW_MS;
    if (isDoubleTap) {
      this.#lastTapPath = null;
      this.#lastTapTime = 0;
      this.#activateFile(path);
    } else {
      this.#lastTapPath = path;
      this.#lastTapTime = now;
      this.#selectFile(path);
    }
  }

  #emit(type, detail) {
    this.dispatchEvent(
      new CustomEvent(type, {
        bubbles: true,
        composed: true,
        detail: {
          tile: this.localName,
          resource: this.getAttribute("data-ontobdc-resource") || "",
          ...detail,
        },
      }),
    );
  }

  #currentTree() {
    const entity = this.#entity();
    const paths = entity
      ? this.#literalList(entity, "http://ontobdc.org/ontology/domain/ns.ttl#filePath")
      : [];
    if (!paths.length) return null;
    return this.#buildTree(paths);
  }

  #render() {
    const entity = this.#entity();
    const lang = (document.documentElement.lang || "en").toLowerCase();

    const label = entity
      ? this.#literal(entity, "http://purl.org/dc/terms/title", lang) ||
        this.#literal(entity, "http://purl.org/dc/terms/title")
      : "";
    const paths = entity
      ? this.#literalList(entity, "http://ontobdc.org/ontology/domain/ns.ttl#filePath")
      : [];

    this.#root.querySelector(".label").textContent = label
      ? `${label} · ${paths.length}`
      : t("filesFallback");

    const scroll = this.#root.querySelector(".scroll");
    scroll.innerHTML = "";

    if (!paths.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = t("noFiles");
      scroll.appendChild(empty);
      return;
    }

    const tree = this.#renderNode(this.#buildTree(paths));
    tree.classList.add("tree");
    scroll.appendChild(tree);
  }
}

if (!customElements.get("onto-file-tree-tile")) {
  customElements.define("onto-file-tree-tile", OntoFileTreeTile);
}

export { OntoFileTreeTile };
