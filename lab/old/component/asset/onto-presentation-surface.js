const PRESENTATION_GLOBAL_EVENT_TYPES = ["entity-selected", "show-details-requested"];
const SYSTEM_LOG_VISIBLE_MS = 2600;
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

// Legacy default topology, used only when no `surfaceDefinition` has been
// supplied — see the class doc comment on `surfaceDefinition` below.
const LEGACY_REGIONS = [
  { id: "operation", role: "OperationRegion", scrollable: false },
  { id: "content", role: "ContentRegion", scrollable: true },
  { id: "pinned", role: "PinnedRegion", scrollable: false },
];

const ALIGNMENT_RANK = { start: 0, center: 1, end: 2 };
// Placed within the "start" band (order values in the wild are small, e.g.
// 10/20/30) so an ad-hoc Tile with no ComponentPlacement sorts after real
// declared start-aligned Tiles but still well before center/end — a
// reasonable default, not itself a fourth alignment group.
const UNDECLARED_ORDER = ALIGNMENT_RANK.start * 100000 + 50000;
const ALIGNMENT_GROUP_SIZE = 100000;

//#region debug-point (infobim-view-slow-crash): H5 browser hang instrumentation
const DBG_SURFACE = {
  connectedCount: 0,
  connectedWallMs: 0,
  layoutCallCount: 0,
  layoutWallMs: 0,
  layoutFirstMs: 0,
  itemsInCallCount: 0,
  itemsInRoleCallCount: 0,
  fitsRegionCallCount: 0,
  childrenCount: 0,
  reconciledCount: 0,
  reconcileWallMs: 0,
};
// Not frozen: every field above is incremented/overwritten on every
// connectedCallback/layout pass below. `Object.freeze()` here (as this
// block previously had) makes every one of those a no-op assignment to a
// read-only property, which throws in the strict-mode-by-default module
// script this Tile is embedded as -- crashing the whole Surface into a
// blank page before it renders anything.
//#endregion

// `DefaultSurfaceLayout` selection (claude2.md) — pure functions so the
// same deterministic rules are easy to eyeball against the Python selector
// (`ontobdc_view.component.adapter.surface_layout_selection`) they mirror.
// Every OntoBDC renderer measuring the same logical capacity must pick the
// same candidate, so this is intentionally a straight port, not a
// reinterpretation.
function candidateMatchesCapacity(candidate, capacity) {
  if (isContradictoryCandidate(candidate)) return false;
  const columnsOk =
    (candidate.minAvailableColumns == null || candidate.minAvailableColumns <= capacity.columns)
    && (candidate.maxAvailableColumns == null || candidate.maxAvailableColumns >= capacity.columns);
  const rowsOk =
    (candidate.minAvailableRows == null || candidate.minAvailableRows <= capacity.rows)
    && (candidate.maxAvailableRows == null || candidate.maxAvailableRows >= capacity.rows);
  return columnsOk && rowsOk;
}

function isContradictoryCandidate(candidate) {
  const columnsContradictory =
    candidate.minAvailableColumns != null && candidate.maxAvailableColumns != null
    && candidate.minAvailableColumns > candidate.maxAvailableColumns;
  const rowsContradictory =
    candidate.minAvailableRows != null && candidate.maxAvailableRows != null
    && candidate.minAvailableRows > candidate.maxAvailableRows;
  return columnsContradictory || rowsContradictory;
}

function candidateSpecificity(candidate) {
  const bounds = [
    candidate.minAvailableColumns,
    candidate.maxAvailableColumns,
    candidate.minAvailableRows,
    candidate.maxAvailableRows,
  ];
  const declared = bounds.filter((bound) => bound != null).length;
  let width = 0;
  if (candidate.minAvailableColumns != null && candidate.maxAvailableColumns != null) {
    width += candidate.maxAvailableColumns - candidate.minAvailableColumns;
  }
  if (candidate.minAvailableRows != null && candidate.maxAvailableRows != null) {
    width += candidate.maxAvailableRows - candidate.minAvailableRows;
  }
  return { declared, width };
}

function selectDefaultSurfaceLayout(capacity, candidates) {
  const matching = (candidates ?? []).filter((candidate) => candidateMatchesCapacity(candidate, capacity));
  if (!matching.length) return null;

  matching.sort((a, b) => {
    const priorityDiff = (b.layoutPriority ?? 0) - (a.layoutPriority ?? 0);
    if (priorityDiff !== 0) return priorityDiff;
    const specificityA = candidateSpecificity(a);
    const specificityB = candidateSpecificity(b);
    if (specificityA.declared !== specificityB.declared) return specificityB.declared - specificityA.declared;
    if (specificityA.width !== specificityB.width) return specificityA.width - specificityB.width;
    if (a.iri < b.iri) return -1;
    if (a.iri > b.iri) return 1;
    return 0;
  });
  return matching[0];
}

class OntoPresentationSurface extends HTMLElement {
  #root;
  #surfaceEl;
  #systemLogEl;
  #regions = []; // [{ id, role, element, slotEl, placementByTag }]
  #regionById = new Map();
  #definition = null; // explicit SurfaceDefinition JSON, or null
  #defaultLayouts = []; // DefaultSurfaceLayout candidate SurfaceDefinition JSON list
  #activeSurfaceIri = null; // identity of the topology currently materialized: null means legacy
  #resizeObserver;
  #slotTarget = 72;
  #gap = 12;
  #padding = 16;
  #tileMargin = 0;
  #columns = 1;
  #slotSize = 72;
  #systemLogTimer = null;
  // H5 (infobim-view-slow-crash): inverted cache + debounce to drop layout
  // complexity from O(N·slots_changes) ≈ O(N²) down to O(N) amortized.
  #regionElements = new Map(); // regionId → Set<Element>
  #regionOccupiedColumns = new Map(); // regionId → number (sum of allocated columns for placed items)
  #layoutRafId = null;
  #childListObserver = null;

  static get observedAttributes() {
    return ["slot-target", "gap", "padding", "tile-margin"];
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
          block-size: 100dvh;
          min-inline-size: 0;
          min-block-size: 0;
          overflow: hidden;
          color: var(--onto-theme-foreground, #0f172a);
          background: var(--onto-theme-background, transparent);
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        *, *::before, *::after { box-sizing: border-box; }

        .surface {
          position: relative;
          inline-size: 100%;
          block-size: 100%;
          min-block-size: 0;
          display: grid;
          gap: var(--onto-surface-gap, 12px);
          padding: var(--onto-surface-padding, 16px);
        }

        /* Legacy default topology: fixed operation/content/pinned stack. */
        .surface:not([data-semantic="true"]) {
          grid-template-rows:
            var(--onto-surface-slot-size, 72px)
            minmax(0, 1fr)
            var(--onto-surface-slot-size, 72px);
        }

        .system-log {
          position: absolute;
          left: var(--onto-surface-padding, 16px);
          right: var(--onto-surface-padding, 16px);
          bottom: calc(
            var(--onto-surface-padding, 16px) +
            var(--onto-surface-slot-size, 72px) +
            var(--onto-surface-gap, 12px) + 4px
          );
          z-index: 1;
          padding: 3px 10px;
          border-radius: 6px;
          font-size: 11px;
          line-height: 1.4;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
          background: color-mix(in srgb, var(--onto-theme-background, #ffffff) 88%, black 12%);
          color: color-mix(in srgb, var(--onto-theme-foreground, #0f172a) 75%, transparent);
          opacity: 0;
          transform: translateY(3px);
          transition: opacity .18s ease, transform .18s ease;
        }

        .system-log[data-visible="true"] {
          opacity: 1;
          transform: translateY(0);
        }

        .region {
          min-inline-size: 0;
          min-block-size: 0;
          gap: var(--onto-surface-gap, 12px);
        }

        /* ContentRegion: a real 2D masonry-like grid (multi-row, variable
           Tile column/row spans). */
        .region[data-region-role="ContentRegion"] {
          display: grid;
          grid-template-columns: repeat(var(--onto-surface-columns, 1), minmax(0, 1fr));
          grid-auto-flow: row dense;
          grid-auto-rows: var(--onto-surface-slot-size, 72px);
          align-content: start;
        }

        /* Bounded (Operation/Pinned/generic) regions: a single-row toolbar.
           Flexbox lets declared end-aligned placements actually sit at the
           far edge (an auto inline-start margin at each alignment-group
           boundary — see #layoutBoundedRegion) instead of only affecting
           relative order. */
        .region:not([data-region-role="ContentRegion"]) {
          display: flex;
          flex-wrap: nowrap;
          /* stretch (the flex default): several Tiles (e.g. onto-logo-tile)
             size their own internal SVG/content relative to a stretched
             host rather than carrying their own intrinsic height — matches
             the height every Tile already got from CSS Grid's own default
             item-stretch behavior before bounded regions moved to flex. */
          align-items: stretch;
          block-size: var(--onto-surface-slot-size, 72px);
        }

        .region[data-scrollable="false"] {
          overflow: hidden;
        }

        .region[data-scrollable="true"] {
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain;
        }

        .region[data-region-role="ContentRegion"] ::slotted(*) {
          grid-column: span var(--onto-surface-column-span, 1);
          grid-row: span var(--onto-surface-row-span, 1);
        }

        .region:not([data-region-role="ContentRegion"]) ::slotted(*) {
          flex: 0 0 calc(
            var(--onto-surface-column-span, 1) * var(--onto-surface-slot-size, 72px)
            + (var(--onto-surface-column-span, 1) - 1) * var(--onto-surface-gap, 12px)
          );
          margin-inline-start: var(--onto-surface-push-before, 0);
        }

        ::slotted(*) {
          min-inline-size: 0;
          min-block-size: 0;
          inline-size: auto;
          block-size: auto;
          margin: var(--onto-surface-tile-margin, 0px);
          order: var(--onto-surface-order, 0);
        }

        ::slotted([data-surface-state="unplaced"]) {
          display: none !important;
        }
      </style>
      <section class="surface" part="surface" role="region">
        <div class="system-log" part="system-log" aria-live="polite"></div>
      </section>
    `;

    this.#surfaceEl = this.#root.querySelector(".surface");
    this.#systemLogEl = this.#root.querySelector(".system-log");
    this.#buildLegacyRegions();
  }

  connectedCallback() {
    //#region debug-point (infobim-view-slow-crash): H5 connect instrumentation
    const _dbg_t0 = performance.now();
    DBG_SURFACE.connectedCount += 1;
    DBG_SURFACE.childrenCount = this.children.length;
    console.debug("[OntoBDC Surface][DBG] connectedCallback start — children=%d", DBG_SURFACE.childrenCount);
    if (window.__ONTOBDC_SURFACE_DBG__ == null) window.__ONTOBDC_SURFACE_DBG__ = DBG_SURFACE;
    //#endregion
    this.#syncConfig();
    //#region debug-point (infobim-view-slow-crash): H5 reconcile timer
    const _dbg_trec0 = performance.now();
    DBG_SURFACE.reconciledCount = this.children.length;
    //#endregion
    this.#reconcileChildRegions();
    //#region debug-point (infobim-view-slow-crash): H5 reconcile timer stop
    DBG_SURFACE.reconcileWallMs += performance.now() - _dbg_trec0;
    console.debug("[OntoBDC Surface][DBG] reconcileChildRegions took %.2f ms for %d children",
      performance.now() - _dbg_trec0, DBG_SURFACE.reconciledCount);
    //#endregion
    // H5: ResizeObserver fires on every pixel nudge during window drag — coalesce via rAF.
    this.#resizeObserver = new ResizeObserver(() => this.#scheduleLayout());
    this.#resizeObserver.observe(this);
    // H5: ChildListObserver catches appendChild/remove/setRegion on light-DOM tiles so
    // the inverted cache stays correct without relying on per-tile slotchange spam.
    // attributeFilter: surface-region is the only attribute that changes a tile's bucket.
    this.#childListObserver = new MutationObserver((mutations) => {
      let needsRebuild = false;
      for (const mut of mutations) {
        if (mut.type === "childList" && (mut.addedNodes.length || mut.removedNodes.length)) {
          needsRebuild = true;
          break;
        }
        if (mut.type === "attributes" && mut.attributeName === "surface-region") {
          needsRebuild = true;
          break;
        }
      }
      if (needsRebuild) {
        this.#invalidateRegionCache();
        this.#scheduleLayout();
      }
    });
    this.#childListObserver.observe(this, {
      childList: true,
      subtree: false,
      attributes: true,
      attributeFilter: ["surface-region", "slot"],
    });
    for (const type of PRESENTATION_GLOBAL_EVENT_TYPES) {
      this.addEventListener(type, (event) => this.#writeSystemLog(type, event.detail));
    }
    //#region debug-point (infobim-view-slow-crash): H5 first layout timer
    const _dbg_t_layout_0 = performance.now();
    //#endregion
    // First layout runs synchronously so callers reading `columns`/`slotSize` get real values
    // immediately after mount. Subsequent mutations all go through #scheduleLayout debounce.
    this.#layoutSynchronous(true);
    //#region debug-point (infobim-view-slow-crash): H5 first layout timer stop
    DBG_SURFACE.layoutFirstMs = performance.now() - _dbg_t_layout_0;
    console.debug("[OntoBDC Surface][DBG] FIRST #layoutSync took %.2f ms — layoutCallCount=%d itemsInCall=%d itemsInRoleCall=%d fitsRegionCall=%d",
      DBG_SURFACE.layoutFirstMs,
      DBG_SURFACE.layoutCallCount,
      DBG_SURFACE.itemsInCallCount,
      DBG_SURFACE.itemsInRoleCallCount,
      DBG_SURFACE.fitsRegionCallCount);
    //#endregion
    this.#surfaceEl.setAttribute("aria-label", t("ariaLabel"));
    document.addEventListener("language-changed", this.#onLanguageChanged);
    //#region debug-point (infobim-view-slow-crash): H5 full connect timer end
    DBG_SURFACE.connectedWallMs = performance.now() - _dbg_t0;
    console.debug("[OntoBDC Surface][DBG] connectedCallback END — total=%.2f ms children=%d reconcile=%.2f ms firstLayout=%.2f ms",
      DBG_SURFACE.connectedWallMs,
      DBG_SURFACE.childrenCount,
      DBG_SURFACE.reconcileWallMs,
      DBG_SURFACE.layoutFirstMs);
    //#endregion
  }

  disconnectedCallback() {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#childListObserver?.disconnect();
    this.#childListObserver = null;
    if (this.#layoutRafId != null) {
      cancelAnimationFrame(this.#layoutRafId);
      this.#layoutRafId = null;
    }
    clearTimeout(this.#systemLogTimer);
    document.removeEventListener("language-changed", this.#onLanguageChanged);
  }

  // H5: coalesce N layout requests (N slotchange events, N resize nudges, N
  // present() calls inside a batch) into exactly ONE synchronous layout pass
  // painted on the next browser frame. Without this, 2000 tiles → 2000 full
  // layout passes → 4M node traversals → browser tab hangs.
  #scheduleLayout() {
    if (this.#layoutRafId != null) return; // already pending — coalescing
    this.#layoutRafId = requestAnimationFrame(() => {
      this.#layoutRafId = null;
      this.#layoutSynchronous(false);
    });
  }

  // Runs layout immediately instead of coalescing it onto the next frame —
  // for the imperative public API (present/dismiss/relayout/close/pin/...),
  // each normally called once per discrete user action rather than in a
  // tight per-tile loop, so the H5 coalescing above buys nothing here and
  // costs callers a stale frame: every one of those methods dispatches its
  // `surface-tile-*` event synchronously right after, so a caller (or a
  // test) reading `dataset.surfaceState` — or CSS driven by it — right
  // after the call would otherwise still see the pre-call layout.
  #flushLayout() {
    if (this.#layoutRafId != null) {
      cancelAnimationFrame(this.#layoutRafId);
      this.#layoutRafId = null;
    }
    this.#layoutSynchronous(false);
  }

  // H5: drop the inverted caches; lazily rebuilt on next #layoutSynchronous.
  #invalidateRegionCache() {
    this.#regionElements.clear();
    this.#regionOccupiedColumns.clear();
  }

  // H5: single-pass walk of this.children → populate #regionElements (bucketed
  // per regionId) and #regionOccupiedColumns (sum of allocated columns for
  // already-placed items). Called ONCE per layout pass instead of N× per-tile.
  #rebuildRegionCache() {
    this.#regionElements.clear();
    this.#regionOccupiedColumns.clear();
    for (const region of this.#regions) {
      this.#regionElements.set(region.id, new Set());
      this.#regionOccupiedColumns.set(region.id, 0);
    }
    for (const element of this.children) {
      const regionId = this.#regionOf(element);
      let bucket = this.#regionElements.get(regionId);
      if (bucket == null) {
        bucket = new Set();
        this.#regionElements.set(regionId, bucket);
        this.#regionOccupiedColumns.set(regionId, 0);
      }
      bucket.add(element);
      if (element.dataset.surfaceState !== "unplaced") {
        const alloc = this.#positiveInt(element.dataset.surfaceAllocatedColumns, null);
        if (alloc != null) {
          const prev = this.#regionOccupiedColumns.get(regionId) ?? 0;
          this.#regionOccupiedColumns.set(regionId, prev + alloc);
        }
      }
    }
  }

  #onLanguageChanged = () => {
    this.#surfaceEl.setAttribute("aria-label", t("ariaLabel"));
  };

  attributeChangedCallback() {
    this.#syncConfig();
    if (this.isConnected) this.#scheduleLayout();
  }

  get columns() { return this.#columns; }
  get slotSize() { return this.#slotSize; }
  get slotTarget() { return this.#slotTarget; }
  get gap() { return this.#gap; }
  get padding() { return this.#padding; }
  get tileMargin() { return this.#tileMargin; }

  get items() {
    return Array.from(this.children);
  }

  get operationItems() { return this.#itemsInRole("OperationRegion"); }
  get contentItems() { return this.#itemsInRole("ContentRegion"); }
  get pinnedItems() { return this.#itemsInRole("PinnedRegion"); }

  // Renderer-neutral RDF `view:PresentationSurface` description (already
  // resolved to a plain-JSON SurfaceDefinition — see
  // `ontobdc_view.component.adapter.surface_resolution.to_render_payload`;
  // this element never parses RDF/Turtle itself). Setting it is precedence
  // #1 (claude2.md "Selection precedence"): an explicit surface is never
  // silently replaced by a `defaultSurfaceLayouts` candidate, however well
  // that candidate would otherwise fit the measured capacity. Setting it to
  // `null`/`undefined` falls through to `defaultSurfaceLayouts` selection,
  // and from there to the legacy topology if nothing matches either — the
  // one explicit backward-compatibility fallback this element supports.
  get surfaceDefinition() { return this.#definition; }

  set surfaceDefinition(value) {
    this.#definition = value ?? null;
    if (this.isConnected) this.#scheduleLayout();
  }

  // Candidate `view:DefaultSurfaceLayout` pool (claude2.md), each already
  // resolved to the same plain-JSON SurfaceDefinition shape as
  // `surfaceDefinition` plus its applicability bounds (minAvailableColumns/
  // maxAvailableColumns/minAvailableRows/maxAvailableRows/layoutPriority).
  // Consulted only when `surfaceDefinition` is unset; the matching
  // candidate is re-evaluated whenever measured logical capacity changes
  // (see `#layout()`), not on every raw resize.
  get defaultSurfaceLayouts() { return this.#defaultLayouts; }

  set defaultSurfaceLayouts(value) {
    this.#defaultLayouts = Array.isArray(value) ? value : [];
    if (this.isConnected) this.#scheduleLayout();
  }

  present(element, options = {}) {
    if (!(element instanceof Element)) {
      throw new TypeError("present() expects a DOM Element");
    }

    const region = this.#normalizeRegionId(options.region ?? element.getAttribute("surface-region"));
    const regionRecord = this.#regionById.get(region);
    const columns = this.#positiveInt(options.columns ?? element.getAttribute("columns"), 1);
    const rows = regionRecord?.role === "ContentRegion"
      ? this.#positiveInt(options.rows ?? element.getAttribute("rows"), 1)
      : 1;
    const margin = this.#nonNegativeNumber(
      options.margin ?? element.getAttribute("surface-margin"),
      this.#tileMargin,
    );

    element.dataset.surfaceRequestedColumns = String(columns);
    element.dataset.surfaceRequestedRows = String(rows);
    element.dataset.surfaceRequestedMargin = String(margin);
    this.#setRegion(element, region);

    if (regionRecord && regionRecord.role !== "ContentRegion" && !this.#fitsRegionCapacity(element, region, columns)) {
      element.dataset.surfaceState = "unplaced";
      this.#dispatch("surface-placement-rejected", { element: element.localName, region, reason: "insufficient-width", columns });
      return false;
    }

    delete element.dataset.surfaceState;
    if (regionRecord?.role === "ContentRegion" && options.prepend !== false) this.prepend(element);
    else this.append(element);

    this.#flushLayout();
    this.#dispatch("surface-tile-presented", { element: element.localName, region, columns, rows, margin });
    return element;
  }

  dismiss(element) {
    if (!(element instanceof Element) || element.parentElement !== this) return false;
    const name = element.localName;
    const region = this.#regionOf(element);
    element.remove();
    this.#flushLayout();
    this.#dispatch("surface-tile-dismissed", { element: name, region });
    return true;
  }

  bringToFront(element) {
    if (!(element instanceof Element) || element.parentElement !== this) return false;
    if (this.#roleOf(element) !== "ContentRegion") return false;
    this.prepend(element);
    this.#flushLayout();
    this.#dispatch("surface-tile-promoted", { element: element.localName, region: this.#regionOf(element) });
    return true;
  }

  sendToEnd(element) {
    if (!(element instanceof Element) || element.parentElement !== this) return false;
    if (this.#roleOf(element) !== "ContentRegion") return false;
    this.append(element);
    this.#flushLayout();
    this.#dispatch("surface-tile-appended", { element: element.localName, region: this.#regionOf(element) });
    return true;
  }

  // Re-runs layout without moving or hiding anything — for a Tile that
  // changed its own sizing constraints (e.g. min-rows/max-rows, to expand
  // in place) and needs the grid to pick that up.
  relayout() {
    this.#flushLayout();
  }

  // Hides a content Tile (the closed/unplaced state a per-file viewer Tile
  // starts in) rather than removing it — the Tile stays a light-DOM child so
  // `show-details-requested` can reveal it again later. Use dismiss() for an
  // actual removal.
  close(element) {
    if (!(element instanceof Element) || element.parentElement !== this) return false;
    if (this.#roleOf(element) !== "ContentRegion") return false;
    element.dataset.tileClosed = "true";
    this.#flushLayout();
    this.#dispatch("surface-tile-closed", { element: element.localName, region: this.#regionOf(element) });
    return true;
  }

  pin(element) {
    if (!(element instanceof Element) || element.parentElement !== this) return false;
    const pinnedRegion = this.#regions.find((region) => region.role === "PinnedRegion");
    if (!pinnedRegion) return false;
    const columns = this.#positiveInt(
      element.dataset.surfaceRequestedColumns ?? element.getAttribute("columns"),
      1,
    );
    if (!this.#fitsRegionCapacity(element, pinnedRegion.id, columns)) {
      this.#dispatch("surface-placement-rejected", { element: element.localName, region: pinnedRegion.id, reason: "insufficient-width", columns });
      return false;
    }
    this.#setRegion(element, pinnedRegion.id);
    element.dataset.surfaceRequestedRows = "1";
    delete element.dataset.surfaceState;
    this.append(element);
    this.#flushLayout();
    this.#dispatch("surface-tile-pinned", { element: element.localName });
    return true;
  }

  unpin(element) {
    if (!(element instanceof Element) || element.parentElement !== this) return false;
    if (this.#roleOf(element) !== "PinnedRegion") return false;
    const contentRegion = this.#regions.find((region) => region.role === "ContentRegion");
    if (!contentRegion) return false;
    this.#setRegion(element, contentRegion.id);
    this.prepend(element);
    this.#flushLayout();
    this.#dispatch("surface-tile-unpinned", { element: element.localName });
    return true;
  }

  #syncConfig() {
    this.#slotTarget = this.#positiveNumber(this.getAttribute("slot-target"), 72);
    this.#gap = this.#positiveNumber(this.getAttribute("gap"), 12, true);
    this.#padding = this.#positiveNumber(this.getAttribute("padding"), 16, true);
    this.#tileMargin = this.#nonNegativeNumber(this.getAttribute("tile-margin"), 0);
  }

  // Selection precedence (claude2.md): an explicit `surfaceDefinition`
  // always wins; otherwise the `defaultSurfaceLayouts` candidate matching
  // `capacity` (or none, if nothing matches); otherwise legacy (`iri: null`).
  #resolveActiveSurface(capacity) {
    if (this.#definition) {
      return { surfaceLike: this.#definition, iri: this.#definition.iri ?? "urn:ontobdc:surface:explicit", isDefault: false };
    }
    if (this.#defaultLayouts.length) {
      const match = selectDefaultSurfaceLayout(capacity, this.#defaultLayouts);
      if (match) return { surfaceLike: match, iri: match.iri, isDefault: true };
    }
    return { surfaceLike: null, iri: null, isDefault: false };
  }

  // Runs once per `#layout()` call — cheap when nothing changed, since it
  // only rebuilds when the *resolved* topology identity actually differs
  // from what's currently materialized. This is what makes "re-evaluate
  // only when logical capacity changes enough to cross a boundary" true
  // without a separate capacity-memoization step: capacity can change
  // (e.g. 11 -> 10 columns) while the winning candidate stays the same, in
  // which case there is nothing to rebuild here.
  // Returns true when the topology actually changed (region ids got swapped
  // out) so callers know to invalidate downstream caches keyed on region id.
  #reconcileTopology(capacity) {
    const resolved = this.#resolveActiveSurface(capacity);
    const previousIri = this.#activeSurfaceIri;
    if (resolved.iri === previousIri) return false;

    // Snapshot by role (not by the old region ids, which a new topology's
    // regions have no reason to reuse — claude2.md "Region identity during
    // layout switching") before tearing down the old region elements, so a
    // pinned/content Tile lands in whichever new region shares its role.
    const previousRoleByElement = new Map(
      Array.from(this.children).map((element) => [element, this.#roleOf(element)]),
    );

    if (resolved.surfaceLike) this.#buildSemanticRegions(resolved.surfaceLike);
    else this.#buildLegacyRegions();
    this.#migrateChildrenAcrossTopologyChange(previousRoleByElement);

    this.#activeSurfaceIri = resolved.iri;
    this.#dispatchDefaultLayoutChanged(previousIri, resolved, capacity);
    return true;
  }

  // Reassigns every existing light-DOM Tile to the newly built region
  // sharing its previous role, without moving it in `this.children` —
  // preserving element identity, dataset/runtime state and ContentRegion
  // recency order across a topology switch (claude2.md "Preserve runtime
  // state across layout switches"). A role with no counterpart in the new
  // topology (e.g. switching to a layout with no PinnedRegion) falls back
  // to ContentRegion, then the first declared region — the same default an
  // unrecognized `surface-region` value already gets.
  #migrateChildrenAcrossTopologyChange(previousRoleByElement) {
    for (const element of this.children) {
      const previousRole = previousRoleByElement.get(element);
      const target =
        this.#regions.find((region) => region.role === previousRole)
        ?? this.#regions.find((region) => region.role === "ContentRegion")
        ?? this.#regions[0];
      this.#setRegion(element, target ? target.id : this.#normalizeRegionId(null));
    }
  }

  #dispatchDefaultLayoutChanged(previousIri, resolved, capacity) {
    this.dispatchEvent(new CustomEvent("surface-default-layout-changed", {
      bubbles: true,
      composed: true,
      detail: {
        previousLayoutIri: previousIri,
        layoutIri: resolved.iri,
        isDefaultLayout: resolved.isDefault,
        availableColumns: capacity.columns,
        availableRows: capacity.rows,
      },
    }));
  }

  // Builds the legacy fixed operation/content/pinned topology — the one
  // explicit backward-compatibility fallback (see `surfaceDefinition`).
  #buildLegacyRegions() {
    this.#surfaceEl.dataset.semantic = "false";
    this.#surfaceEl.style.removeProperty("grid-template-columns");
    this.#surfaceEl.style.removeProperty("grid-template-rows");
    this.#surfaceEl.style.removeProperty("--onto-surface-grid-columns");
    this.#setRegionElements(LEGACY_REGIONS.map((region) => ({ ...region, placements: [] })));
  }

  // Materializes region containers from a resolved SurfaceDefinition
  // (Phase 3 of the ontology-driven Surface intervention): region count,
  // logical geometry and scrollability all come from `definition.regions`
  // instead of a hardcoded three-region template. CSS Grid is this
  // renderer's own implementation choice for the surface-level logical
  // grid — the semantic decisions above are what came from the RDF model.
  #buildSemanticRegions(definition) {
    const regions = Array.isArray(definition?.regions) ? definition.regions : [];
    // `columnCount`/`rowCount` (and therefore per-region rowStart/columnStart/
    // rowSpan/columnSpan, which are coordinates *within* that logical grid)
    // are optional on `view:PresentationSurface` — a layout like the shipped
    // default (`ontobdc_view.default_surface_layouts()`) declares regions
    // and their roles/placements but no fine-grained grid geometry at all.
    // Forcing a 1x1 grid in that case (the previous behavior) let a single
    // implicit `1fr` row swallow the whole surface height behind whichever
    // region happened to be auto-placed into it. Falling back to ordering
    // regions by role instead reproduces the legacy stack (bounded regions
    // sized to content, ContentRegion flexible) for any region set, not
    // just the hardcoded three.
    const hasExplicitGeometry =
      this.#positiveInt(definition?.columns, 0) > 0 && this.#positiveInt(definition?.rows, 0) > 0;

    this.#surfaceEl.dataset.semantic = "true";
    if (hasExplicitGeometry) {
      const gridColumns = this.#positiveInt(definition.columns, 1);
      const gridRows = this.#positiveInt(definition.rows, 1);
      this.#surfaceEl.style.setProperty("--onto-surface-grid-columns", String(gridColumns));
      this.#surfaceEl.style.gridTemplateColumns = `repeat(${gridColumns}, minmax(0, 1fr))`;
      this.#surfaceEl.style.gridTemplateRows = this.#semanticRowTracks(regions, gridRows);
    } else {
      this.#surfaceEl.style.removeProperty("--onto-surface-grid-columns");
      this.#surfaceEl.style.gridTemplateColumns = "minmax(0, 1fr)";
      this.#surfaceEl.style.gridTemplateRows = this.#roleOrderedRowTracks(regions);
    }

    this.#setRegionElements(regions.map((region, index) => ({
      id: this.#regionSlug(region.iri, index),
      role: this.#regionRole(region.role),
      scrollable: Boolean(region.scrollable),
      rowStart: region.rowStart,
      columnStart: region.columnStart,
      rowSpan: region.rowSpan,
      columnSpan: region.columnSpan,
      placements: Array.isArray(region.placements) ? region.placements : [],
    })));
  }

  // A bounded (non-ContentRegion) region declared with a single logical
  // row is sized to the slot pitch, exactly like the legacy operation/
  // pinned rows; every other row stays flexible. This reproduces the
  // CLAUDE.md brief's target example (operation/pinned pinned to a slot,
  // content flexible) without hardcoding row 1/row N as special.
  #semanticRowTracks(regions, gridRows) {
    const tracks = new Array(gridRows).fill("minmax(0, 1fr)");
    for (const region of regions) {
      if (this.#regionRole(region.role) === "ContentRegion") continue;
      if (region.rowSpan !== 1 || !Number.isInteger(region.rowStart)) continue;
      const index = region.rowStart - 1;
      if (index >= 0 && index < tracks.length) tracks[index] = "var(--onto-surface-slot-size, 72px)";
    }
    return tracks.join(" ");
  }

  // Used when the SurfaceDefinition declares regions/roles/placements but no
  // `columnCount`/`rowCount` grid geometry (see `#buildSemanticRegions`).
  // One implicit row per region, in declared order — `auto` (sized to its
  // own content) for bounded regions, flexible for ContentRegion — the same
  // shape the legacy operation/content/pinned stack already has, generalized
  // to whatever regions/roles are actually declared.
  #roleOrderedRowTracks(regions) {
    if (!regions.length) return "";
    return regions
      .map((region) => (this.#regionRole(region.role) === "ContentRegion" ? "minmax(0, 1fr)" : "auto"))
      .join(" ");
  }

  #regionRole(role) {
    return ["OperationRegion", "ContentRegion", "PinnedRegion"].includes(role) ? role : "PresentationRegion";
  }

  #regionSlug(iri, fallbackIndex) {
    const match = /[#/:]([^#/:]+)$/.exec(String(iri ?? ""));
    return (match ? match[1] : `region-${fallbackIndex}`).toLowerCase();
  }

  #setRegionElements(regionDescriptors) {
    for (const region of this.#regions) region.element.remove();
    this.#regions = [];
    this.#regionById = new Map();

    for (const descriptor of regionDescriptors) {
      const element = document.createElement("div");
      element.className = "region";
      element.part = descriptor.id;
      element.dataset.region = descriptor.id;
      element.dataset.regionRole = descriptor.role;
      element.dataset.scrollable = String(descriptor.scrollable);
      if (Number.isInteger(descriptor.columnStart) && Number.isInteger(descriptor.columnSpan)) {
        element.style.gridColumn = `${descriptor.columnStart} / span ${descriptor.columnSpan}`;
      }
      if (Number.isInteger(descriptor.rowStart) && Number.isInteger(descriptor.rowSpan)) {
        element.style.gridRow = `${descriptor.rowStart} / span ${descriptor.rowSpan}`;
      }

      const slotEl = document.createElement("slot");
      slotEl.name = descriptor.id;
      slotEl.addEventListener("slotchange", () => {
        this.#invalidateRegionCache();
        this.#scheduleLayout();
      });
      element.appendChild(slotEl);
      this.#systemLogEl.insertAdjacentElement("beforebegin", element);

      const placementByTag = new Map();
      for (const placement of descriptor.placements) {
        if (!placement?.tag) continue;
        const rank = ALIGNMENT_RANK[placement.alignment] ?? ALIGNMENT_RANK.start;
        placementByTag.set(placement.tag, rank * 100000 + this.#positiveInt(placement.order, 0));
      }

      const region = { id: descriptor.id, role: descriptor.role, element, slotEl, placementByTag };
      this.#regions.push(region);
      this.#regionById.set(descriptor.id, region);
    }
  }

  // Re-resolves every light-DOM child's region against the currently
  // active region set (legacy or semantic) — needed both on connect and
  // whenever `surfaceDefinition` changes the available region ids, since a
  // child's previous region id may no longer exist.
  #reconcileChildRegions() {
    for (const element of this.children) {
      this.#setRegion(element, this.#normalizeRegionId(element.getAttribute("surface-region") ?? element.slot));
    }
  }

  #layoutSynchronous(forceRebuild = false) {
    if (!this.isConnected) return;

    //#region debug-point (infobim-view-slow-crash): H5 layout instrumentation
    const _dbg_t0 = performance.now();
    DBG_SURFACE.layoutCallCount += 1;
    //#endregion
    if (forceRebuild || this.#regionElements.size === 0) this.#rebuildRegionCache();
    const rect = this.getBoundingClientRect();
    const totalWidth = Math.max(1, rect.width);
    const totalHeight = Math.max(1, rect.height);
    const usefulWidth = Math.max(1, totalWidth - this.#padding * 2);
    const usefulHeight = Math.max(1, totalHeight - this.#padding * 2);
    const pitchTarget = this.#slotTarget + this.#gap;

    this.#columns = Math.max(1, Math.floor((usefulWidth + this.#gap) / Math.max(1, pitchTarget)));
    this.#slotSize = Math.max(
      1,
      (usefulWidth - Math.max(0, this.#columns - 1) * this.#gap) / this.#columns,
    );
    // Same principle as the column capacity above, over the vertical axis
    // (claude2.md "Logical capacity, not pixel breakpoints") — this is the
    // capacity-measurement phase that runs before DefaultSurfaceLayout
    // selection, not a per-Tile sizing concern.
    const availableRows = Math.max(1, Math.floor((usefulHeight + this.#gap) / Math.max(1, pitchTarget)));

    // H5: Topology changes may replace the region set entirely (new ids, new
    // roles) — the inverted cache must be bucketed by the *new* region ids.
    const topologyChanged = this.#reconcileTopology({ columns: this.#columns, rows: availableRows });
    if (topologyChanged) this.#rebuildRegionCache();

    for (const region of this.#regions) {
      region.element.style.setProperty("--onto-surface-columns", String(this.#columns));
      region.element.style.setProperty("--onto-surface-slot-size", `${this.#slotSize}px`);
      region.element.style.setProperty("--onto-surface-gap", `${this.#gap}px`);
    }
    this.#surfaceEl.style.setProperty("--onto-surface-slot-size", `${this.#slotSize}px`);
    this.#surfaceEl.style.setProperty("--onto-surface-gap", `${this.#gap}px`);
    this.#surfaceEl.style.setProperty("--onto-surface-padding", `${this.#padding}px`);

    for (const region of this.#regions) {
      if (region.role === "ContentRegion") this.#layoutContentRegion(region);
      else this.#layoutBoundedRegion(region);
    }

    // H5: Per-tile surfaceState / surfaceAllocatedColumns were just rewritten
    // by the layout loops above — rebuild so the next present()/pin() call
    // sees accurate capacity totals (instead of stale previous-layout ones).
    this.#rebuildRegionCache();

    this.dispatchEvent(new CustomEvent("surface-layout-changed", {
      bubbles: true,
      composed: true,
      detail: {
        width: totalWidth,
        columns: this.#columns,
        slotSize: this.#slotSize,
        gap: this.#gap,
        padding: this.#padding,
        tileMargin: this.#tileMargin,
        operationCount: this.operationItems.length,
        contentCount: this.contentItems.length,
        pinnedCount: this.pinnedItems.length,
      },
    }));
    //#region debug-point (infobim-view-slow-crash): H5 layout instrumentation end
    const _took = performance.now() - _dbg_t0;
    DBG_SURFACE.layoutWallMs += _took;
    if (DBG_SURFACE.layoutCallCount <= 3 || _took > 250 || (DBG_SURFACE.layoutCallCount % 25) === 0) {
      console.debug("[OntoBDC Surface][DBG] #layout#%d took %.2f ms (cum=%.2f ms) — itemsIn=%d itemsInRole=%d fits=%d operation=%d content=%d pinned=%d children=%d",
        DBG_SURFACE.layoutCallCount,
        _took,
        DBG_SURFACE.layoutWallMs,
        DBG_SURFACE.itemsInCallCount,
        DBG_SURFACE.itemsInRoleCallCount,
        DBG_SURFACE.fitsRegionCallCount,
        this.operationItems.length,
        this.contentItems.length,
        this.pinnedItems.length,
        this.children.length);
    }
    //#endregion
  }

  #layoutBoundedRegion(region) {
    const items = this.#itemsIn(region.id);
    const orderOf = (element) => region.placementByTag.get(element.localName) ?? UNDECLARED_ORDER;

    // Push-to-edge (claude2.md's Start/End OperationRegion example): an
    // auto inline-start margin at each point where the declared alignment
    // group changes, walked in declared-order — not DOM order, which is
    // unrelated to alignment groups. Flexbox turns that margin into "eat
    // all remaining free space here", separating e.g. a Logo (start) from
    // Theme/Login (end) instead of only ordering them adjacently.
    const byDeclaredOrder = [...items].sort((a, b) => orderOf(a) - orderOf(b));
    let previousGroup = null;
    for (const element of byDeclaredOrder) {
      const order = orderOf(element);
      const group = Math.floor(order / ALIGNMENT_GROUP_SIZE);
      const startsNewGroup = previousGroup !== null && group > previousGroup;
      element.style.setProperty("--onto-surface-order", String(order));
      element.style.setProperty("--onto-surface-push-before", startsNewGroup ? "auto" : "0");
      previousGroup = group;
    }

    let used = 0;
    for (const element of items) {
      const allocatedColumns = this.#allocateColumns(element);
      const fits = used + allocatedColumns <= this.#columns;
      element.dataset.surfaceState = fits ? "placed" : "unplaced";
      if (fits) used += allocatedColumns;
      this.#applyAllocation(element, allocatedColumns, 1);
    }
  }

  #layoutContentRegion(region) {
    for (const element of this.#itemsIn(region.id)) {
      // A Tile can opt out of the initial layout (e.g. a per-file viewer
      // that should only appear once the user opens that file) by setting
      // `data-tile-closed="true"`. It stays a light-DOM child — so
      // `show-details-requested` listeners can find and reveal it — just
      // hidden and out of the grid flow until it clears the flag itself.
      if (element.dataset.tileClosed === "true") {
        element.dataset.surfaceState = "unplaced";
        continue;
      }
      delete element.dataset.surfaceState;
      const allocatedColumns = this.#allocateColumns(element);
      const requestedRows = this.#positiveInt(
        element.dataset.surfaceRequestedRows ?? element.getAttribute("rows"),
        1,
      );
      const minRows = this.#positiveInt(element.getAttribute("min-rows"), 1);
      const maxRows = this.#positiveInt(element.getAttribute("max-rows"), requestedRows);
      const allocatedRows = Math.max(1, Math.min(maxRows, Math.max(minRows, requestedRows)));
      this.#applyAllocation(element, allocatedColumns, allocatedRows);
    }
  }

  #allocateColumns(element) {
    const requestedColumns = this.#positiveInt(
      element.dataset.surfaceRequestedColumns ?? element.getAttribute("columns"),
      1,
    );
    const minColumns = this.#positiveInt(element.getAttribute("min-columns"), 1);
    const maxColumns = this.#positiveInt(element.getAttribute("max-columns"), this.#columns);
    return Math.max(1, Math.min(this.#columns, maxColumns, Math.max(minColumns, requestedColumns)));
  }

  #applyAllocation(element, columns, rows) {
    const margin = this.#nonNegativeNumber(
      element.dataset.surfaceRequestedMargin ?? element.getAttribute("surface-margin"),
      this.#tileMargin,
    );
    element.style.setProperty("--onto-surface-column-span", String(columns));
    element.style.setProperty("--onto-surface-row-span", String(rows));
    element.style.setProperty("--onto-surface-tile-margin", `${margin}px`);
    element.setAttribute("columns", String(columns));
    element.setAttribute("rows", String(rows));
    element.dataset.surfaceAllocatedColumns = String(columns);
    element.dataset.surfaceAllocatedRows = String(rows);
    element.dataset.surfaceAllocatedMargin = String(margin);
  }

  #fitsRegionCapacity(element, regionId, requestedColumns) {
    //#region debug-point (infobim-view-slow-crash): H5 fitsRegion call counter
    DBG_SURFACE.fitsRegionCallCount += 1;
    //#endregion
    // H5: read pre-computed occupied-column sum directly instead of walking
    // every tile in the region (was O(N) per present()/pin() call → O(N²)
    // when N tiles get presented in a loop over a bounded region). Then
    // subtract self if element is already placed in the same region so we
    // don't double-count the tile being re-evaluated.
    let occupied = this.#regionOccupiedColumns.get(regionId) ?? 0;
    if (this.#regionOf(element) === regionId && element.dataset.surfaceState !== "unplaced") {
      const selfAlloc = this.#positiveInt(element.dataset.surfaceAllocatedColumns, null);
      if (selfAlloc != null) occupied = Math.max(0, occupied - selfAlloc);
    }
    const columns = Math.max(1, Math.min(this.#columns, requestedColumns));
    return occupied + columns <= this.#columns;
  }

  #itemsIn(regionId) {
    //#region debug-point (infobim-view-slow-crash): H5 itemsIn call counter (was O(N²), now O(1) cache lookup)
    DBG_SURFACE.itemsInCallCount += 1;
    //#endregion
    // H5: bucketed per-region Set — built once per layout in
    // #rebuildRegionCache. Previously Array.from(children).filter() = O(N).
    const bucket = this.#regionElements.get(regionId);
    return bucket == null ? [] : Array.from(bucket);
  }

  #itemsInRole(role) {
    //#region debug-point (infobim-view-slow-crash): H5 itemsInRole call counter
    DBG_SURFACE.itemsInRoleCallCount += 1;
    //#endregion
    // H5: iterate only regions whose role matches (usually 1 region per
    // role, i.e. 1-3 iterations) instead of walking every light-DOM child.
    const result = [];
    for (const region of this.#regions) {
      if (region.role !== role) continue;
      const bucket = this.#regionElements.get(region.id);
      if (bucket == null) continue;
      for (const el of bucket) result.push(el);
    }
    return result;
  }

  #regionOf(element) {
    return this.#normalizeRegionId(element.getAttribute("surface-region") ?? element.slot);
  }

  #roleOf(element) {
    return this.#regionById.get(this.#regionOf(element))?.role;
  }

  #setRegion(element, regionId) {
    element.setAttribute("surface-region", regionId);
    element.slot = regionId;
  }

  // Unknown/missing values fall back to this element's ContentRegion (or,
  // for a semantic surface with none, its first declared region) — the
  // same "unmarked tile -> content" default the legacy element always had.
  #normalizeRegionId(value) {
    if (value && this.#regionById.has(value)) return value;
    return (
      this.#regions.find((region) => region.role === "ContentRegion")?.id
      ?? this.#regions[0]?.id
      ?? "content"
    );
  }

  #dispatch(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
    this.#writeSystemLog(type, detail);
  }

  #writeSystemLog(type, detail) {
    const hint = detail && typeof detail === "object" ? detail.path ?? detail.element ?? "" : "";
    this.#systemLogEl.textContent = hint ? `${type} · ${hint}` : type;
    this.#systemLogEl.dataset.visible = "true";
    clearTimeout(this.#systemLogTimer);
    this.#systemLogTimer = setTimeout(() => {
      this.#systemLogEl.dataset.visible = "false";
    }, SYSTEM_LOG_VISIBLE_MS);
  }

  #positiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  #positiveNumber(value, fallback, allowZero = false) {
    const parsed = Number.parseFloat(String(value ?? ""));
    if (!Number.isFinite(parsed)) return fallback;
    if (allowZero ? parsed >= 0 : parsed > 0) return parsed;
    return fallback;
  }

  #nonNegativeNumber(value, fallback) {
    const parsed = Number.parseFloat(String(value ?? ""));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }
}

if (!customElements.get("onto-presentation-surface")) {
  customElements.define("onto-presentation-surface", OntoPresentationSurface);
}

export { OntoPresentationSurface };
