# Intervention: ontology-driven PresentationSurface layout

## Objective

Refactor the OntoBDC View presentation surface so that the screen layout is no longer structurally hardcoded by the renderer. The canonical description of a screen must be RDF using the OntoBDC View Ontology from `Brasidata/brasidatacenter`, branch `feat/semantic-ui-layout`, file:

`ontology/ontobdc/domain/view.ttl`

The renderer remains responsible for materialization. It must not become the source of truth for which regions exist, where they are placed, whether a region scrolls, or which Tiles belong to a region.

The desired end state is: give the runtime an RDF description of one `view:PresentationSurface`, plus the available Tile/component implementations and runtime data, and the renderer can assemble that surface without a page-specific layout hardcoded in JavaScript, HTML, Python, CSS, YAML, or JSON.

This intervention is specifically about **surface composition**. Do not redesign Tile internals unnecessarily.

---

## Non-negotiable semantic rules

### 1. RDF/ontology is canonical; there is no canonical YAML layout

Do not introduce a YAML/JSON screen schema as a parallel source of truth. A YAML or JSON representation may exist later only as a serialization/convenience layer if explicitly required, but this intervention must consume the RDF model directly or an in-memory projection derived mechanically from RDF.

The vocabulary is defined in `view.ttl`. Screen instances are RDF instances of that vocabulary.

### 2. `PinnedRegion` does not mean CSS `position: fixed`

This distinction is mandatory.

`view:PinnedRegion` means only: **the region containing Tiles that are explicitly pinned/selected for persistent presentation by the user or another authorized actor**.

It does not prescribe browser positioning, `position: fixed`, `sticky`, absolute positioning, z-index, viewport attachment, or any other rendering mechanism.

The renderer is free to realize the region however appropriate for the target surface, but the ontology must never encode CSS concepts as the meaning of `PinnedRegion`.

### 3. Layout semantics must remain renderer-neutral

The ontology describes logical facts such as:

- surface has N logical columns and N logical rows;
- surface has Operation, Content and/or Pinned regions;
- a region starts at logical row/column X;
- a region spans Y rows/columns;
- a region is scrollable or not;
- a component placement belongs to a region;
- a placement has logical ordering;
- a placement aligns to logical start, center or end.

The ontology does **not** describe:

- CSS grid syntax;
- flexbox syntax;
- `position`, `overflow-y`, `justify-content`, etc.;
- pixel coordinates for components;
- DOM order as the semantic contract.

Mapping semantic properties to browser implementation is the renderer's responsibility.

### 4. Runtime `Allocation` remains distinct from declarative `ComponentPlacement`

Do not collapse these concepts.

`view:ComponentPlacement` is part of the screen description: what component belongs in what logical region, with what ordering/alignment intent.

`view:Allocation` is a runtime result: the concrete allocation negotiated between an actual component and an actual available presentation surface.

A screen may declare a placement before the renderer knows the final physical width or resulting allocation.

### 5. Preserve dynamic ContentRegion behavior

The existing ContentRegion behavior includes recency/navigation operations such as `bringToFront`, `sendToEnd`, opening hidden per-file Tiles, expansion and re-layout. Preserve these behaviors unless they directly contradict the ontology.

The declarative layout defines the region and its base policy. It must not freeze the dynamic ordering of contextual content where the current model intentionally allows recency-based reordering.

### 6. SHACL UI is not the surface layout language

SHACL 1.2 User Interfaces (`http://www.w3.org/ns/shacl-ui#`) may be used later/alongside this work for rendering the **inside of a semantic Tile** from RDF + SHACL shapes.

Boundary:

- OntoBDC View Ontology: composition of PresentationSurface / PresentationRegion / Tiles / placements / allocation.
- SHACL + SHACL UI: projection of RDF resource properties inside a semantic resource component (viewer/editor selection, field order/grouping, etc.).
- Renderer: materialization of both models for the target environment.

Do not use SHACL UI to define OperationRegion, ContentRegion, PinnedRegion, surface grid, region spans, pinned Tiles, or application navigation. Do not invent OntoBDC equivalents of `shui:viewer`/`shui:editor` for RDF form fields.

SHACL UI is currently a W3C Working Draft, so any implementation hook must be modular and must not make basic Surface rendering depend on the draft.

---

## Ontology changes already provided in Brasidata/brasidatacenter

The homonymous branch adds/clarifies the following model. Treat these terms as authoritative instead of recreating a local vocabulary.

### New/clarified classes

- `view:ComponentPlacement`
- `view:PresentationAlignment`
- existing `view:PresentationSurface`
- existing `view:PresentationRegion`
- existing `view:OperationRegion`
- existing `view:ContentRegion`
- existing `view:PinnedRegion`
- existing `view:Component`
- existing `view:Tile`
- existing `view:PresentationRequest`
- existing `view:PresentationSupportProfile`
- existing `view:Allocation`

### Alignment individuals

- `view:StartAlignment`
- `view:CenterAlignment`
- `view:EndAlignment`

These are logical alignment intents, not CSS keywords.

### Surface geometry

- `view:columnCount`
- `view:rowCount`
- existing `view:slotTarget`
- existing `view:slotSize`
- existing `view:gap`
- existing `view:padding`

### Region geometry/policy

- `view:rowStart`
- `view:columnStart`
- `view:rowSpan`
- `view:columnSpan`
- `view:scrollable`

Coordinates are logical and 1-based. The renderer maps them to the target platform.

### Component placement

- `view:hasComponentPlacement`
- `view:placesComponent`
- `view:hasAlignment`
- `view:placementOrder`

`view:placedInRegion` remains useful for a materialized/runtime relationship, but declarative screen composition must be represented through `ComponentPlacement` so that placement-specific metadata does not contaminate reusable component definitions.

---

## Target RDF pattern

A screen equivalent to the current basic Surface should be expressible in RDF approximately as follows. This is an example instance graph, not a second schema.

```turtle
@prefix view: <http://datacenter.app.br/ontology/ontobdc/domain/view.ttl#> .
@prefix screen: <urn:ontobdc:screen:> .

screen:main
    a view:PresentationSurface ;
    view:columnCount 12 ;
    view:rowCount 12 ;
    view:hasRegion screen:operation ;
    view:hasRegion screen:content ;
    view:hasRegion screen:pinned .

screen:operation
    a view:OperationRegion ;
    view:rowStart 1 ;
    view:columnStart 1 ;
    view:rowSpan 1 ;
    view:columnSpan 12 ;
    view:scrollable false ;
    view:hasComponentPlacement screen:logoPlacement ;
    view:hasComponentPlacement screen:themePlacement ;
    view:hasComponentPlacement screen:loginPlacement .

screen:content
    a view:ContentRegion ;
    view:rowStart 2 ;
    view:columnStart 1 ;
    view:rowSpan 10 ;
    view:columnSpan 12 ;
    view:scrollable true .

screen:pinned
    a view:PinnedRegion ;
    view:rowStart 12 ;
    view:columnStart 1 ;
    view:rowSpan 1 ;
    view:columnSpan 12 ;
    view:scrollable false .

screen:logo
    a view:LogoTile .

screen:theme
    a view:ThemeTile .

# Login may initially use a generic Component/Tile implementation until a
# dedicated ontology class exists; do not invent a class just to satisfy
# this example.
screen:login
    a view:Tile .

screen:logoPlacement
    a view:ComponentPlacement ;
    view:placesComponent screen:logo ;
    view:hasAlignment view:StartAlignment ;
    view:placementOrder 10 .

screen:themePlacement
    a view:ComponentPlacement ;
    view:placesComponent screen:theme ;
    view:hasAlignment view:EndAlignment ;
    view:placementOrder 10 .

screen:loginPlacement
    a view:ComponentPlacement ;
    view:placesComponent screen:login ;
    view:hasAlignment view:EndAlignment ;
    view:placementOrder 20 .
```

The important semantic result is:

- logo is at the logical start of OperationRegion;
- theme and login are at the logical end;
- theme precedes login inside that end group;
- there is no fake Spacer Tile;
- there is no CSS semantic contract;
- ContentRegion is declared scrollable;
- PinnedRegion merely receives pinned component placements.

---

## Current implementation problem to remove

The current `src/ontobdc_view/component/asset/onto-presentation-surface.js` embeds structural assumptions directly in the custom element:

1. The shadow DOM always creates exactly three `<div>` regions: `operation`, `content`, `pinned`.
2. Their vertical order is fixed by the component template.
3. The Surface template fixes a three-row arrangement.
4. `content` is always scrollable in the browser implementation.
5. operation and pinned are always non-scrolling.
6. region names are normalized from a hardcoded `['operation', 'content', 'pinned']` list.
7. some logic refers to operation/pinned collectively as "fixed regions". This name is semantically dangerous because Pinned is not `position: fixed` and must be removed/renamed in the refactor.

The allocation algorithm itself is useful and should largely be preserved. The hardcoded **screen topology** is what must move out.

---

## Required implementation architecture

### Phase 1 — introduce an internal semantic Surface model

Create a small renderer-side model representing the parsed ontology, but do not make it a new public schema.

Suggested internal structures (names may vary):

```text
SurfaceDefinition
  id
  columns
  rows
  slotTarget
  gap
  padding
  regions[]

RegionDefinition
  id
  rdfType
  rowStart
  columnStart
  rowSpan
  columnSpan
  scrollable
  placements[]

PlacementDefinition
  id
  componentId
  alignment
  order
```

This is an implementation projection of RDF. It must be constructed from RDF predicates, not maintained manually in parallel.

Keep RDF identifiers/IRIs available in the internal objects for tracing/debugging.

### Phase 2 — add an RDF-to-SurfaceDefinition parser

Implement a parser/adapter that receives a graph and one `PresentationSurface` focus node and produces the internal model.

Required behavior:

1. resolve `view:hasRegion` objects;
2. identify each region's RDF type;
3. read logical geometry properties;
4. read `view:scrollable`;
5. resolve `view:hasComponentPlacement`;
6. for every placement, resolve exactly one `view:placesComponent`;
7. read `view:hasAlignment` and `view:placementOrder`;
8. preserve component IRI so the existing component registry/metadata can resolve its renderer implementation;
9. sort placements deterministically within each logical alignment group by `placementOrder`, then stable IRI fallback;
10. fail loudly or emit a clear validation error for contradictory/unusable surface definitions; do not silently make a random page.

Prefer using the project's existing RDF stack/rdflib where available. Do not write a hand-made Turtle parser.

### Phase 3 — make `onto-presentation-surface` topology data-driven

Refactor `onto-presentation-surface.js` so it no longer assumes that region DOM nodes are statically authored in the constructor.

The component must be able to materialize region containers from a resolved SurfaceDefinition.

Browser-specific implementation is free to use CSS Grid internally, but the semantic decisions must come from the definition:

- number/logical extent of regions;
- region placement;
- region span;
- whether scrolling is enabled;
- region identity/type;
- component placement alignment/order.

Do not expose CSS values as new ontology vocabulary.

### Phase 4 — stop using DOM order as the source of declared Operation/Pinned order

For declared placements, order comes from `view:placementOrder` and grouping/alignment from `view:hasAlignment`.

For dynamic `ContentRegion` items, continue supporting recency ordering and runtime mutations. The declared base composition and the runtime content ordering are not the same concept.

### Phase 5 — resolve Tiles from semantic component identity

Do not encode `onto-logo-tile`, `onto-theme-tile`, etc. directly in the screen ontology.

The RDF describes component instances/types. The existing component plugin/metadata machinery should resolve those semantic component classes/instances to concrete custom-element implementations.

Review the descriptors under:

`src/ontobdc_view/component/plugin/`

and assets under:

`src/ontobdc_view/component/asset/`

The existing separation between Python component descriptors and JS Tile assets should remain.

If a resolver is missing between an RDF component instance/type and a Component descriptor, add that resolver in the presentation package rather than putting custom-element tag names in the ontology.

### Phase 6 — preserve PresentationRequest / SupportProfile / Allocation negotiation

Do not replace the current sizing negotiation with static screen coordinates for Tiles.

The screen definition determines the **region** and declared component placement. Individual Tile sizing must continue to honor:

- `PresentationRequest` / requested columns and rows;
- `PresentationSupportProfile` / min/max/preferred columns and rows;
- runtime `Allocation` / allocated columns and rows.

A ComponentPlacement must not become another copy of those three concepts.

### Phase 7 — rename misleading implementation language

Inside the renderer, replace method/variable names such as `#fitsFixedRegion` when they mean "single-row bounded operational/pinned region" or similar.

Use names based on actual semantics, e.g. `#fitsRegionCapacity`, `#fitsBoundedRegion`, or another accurate name.

Do not introduce the word `fixed` as shorthand for PinnedRegion.

---

## SHACL validation

The updated `view.ttl` includes SHACL shapes for the new structural vocabulary.

Before rendering, where practical, validate the screen graph against these shapes. At minimum surface parsing must enforce equivalent invariants.

Important validations include:

- positive row/column counts when declared;
- positive region row/column start/span when declared;
- boolean `scrollable`;
- `ComponentPlacement` has exactly one `placesComponent`;
- alignment is a `PresentationAlignment` when present;
- placement order is non-negative when present.

Do not confuse this use of SHACL validation with SHACL UI. SHACL validates the surface description; SHACL UI is for rendering RDF resource properties inside suitable components.

---

## SHACL UI integration seam — prepare, do not overbuild

This intervention should leave a clean place for a future `SemanticResourceTile`/SHACL renderer, but it does not need to implement the entire W3C draft now.

When such a Tile exists, the runtime flow should be conceptually:

```text
PresentationSurface ontology
  -> choose/place Tile in region

Semantic Tile
  -> focus RDF node + shapes graph + node shape
  -> SHACL UI renderer
  -> Tile internal human-facing view/editor
```

Surface layout never depends on `shui:editor` or `shui:viewer`.

Do not add custom OntoBDC properties duplicating SHACL UI concepts such as editor widget, viewer widget, property role, form field order/grouping, etc.

---

## Backward compatibility

Current generated Surfaces must continue to render during migration.

Implement one explicit fallback path only:

- if no semantic SurfaceDefinition is supplied, instantiate the existing default three-region surface behavior;
- if a semantic definition is supplied, it is authoritative.

The fallback must be clearly marked transitional and isolated. Do not merge semantic and legacy configuration heuristically in dozens of places.

Existing Tile APIs that should continue to work:

- `present()`
- `dismiss()`
- `bringToFront()`
- `sendToEnd()`
- `relayout()`
- `close()`
- `pin()`
- `unpin()`

However, adapt them so region lookup uses semantic region identity/type rather than a hardcoded three-string enum where appropriate.

`pin()` means move/present the Tile in the PinnedRegion. It does not change browser positioning.

---

## Tests to add

Add tests at both parser/model and browser-rendering levels.

### RDF/model tests

1. Parse a Surface with Operation/Content/Pinned regions.
2. Parse logical row/column geometry correctly.
3. Parse `scrollable true/false` correctly.
4. Parse start/end aligned placements.
5. Order Theme before Login when their placement orders are 10 and 20.
6. Reject/flag a ComponentPlacement without `placesComponent`.
7. Reject/flag invalid negative/zero geometry where disallowed.
8. Ensure PinnedRegion carries no fixed/sticky/browser semantic.

### Browser integration tests

1. Given the example surface graph, render all declared regions.
2. Logo appears in the logical start group of OperationRegion.
3. Theme and Login appear in the logical end group, in declared order.
4. ContentRegion scrolling follows `view:scrollable` rather than being hardcoded.
5. A non-scrollable ContentRegion does not get scroll behavior from old defaults.
6. Pinned Tiles render in PinnedRegion and `pin()/unpin()` still work.
7. Content `bringToFront()` and `sendToEnd()` still work.
8. hidden file Tiles still remain hidden until opened.
9. resizing still recalculates physical allocation without changing semantic region membership/order.
10. legacy fallback still renders when no semantic surface graph is supplied.

Where Playwright/CDP is already used for closed-shadow-root behavior, continue using the existing test technique rather than weakening encapsulation just for tests.

---

## Definition of done

The intervention is complete only when all of the following are true:

1. A PresentationSurface can be structurally described as RDF using the Brasidata View Ontology.
2. The renderer consumes that description and materializes region topology from it.
3. Operation/Content/Pinned are no longer structurally hardcoded as the only possible DOM topology in the core rendering path.
4. `scrollable` is driven by the region definition.
5. component membership/order/alignment in declared regions is driven by `ComponentPlacement`.
6. there is no YAML/JSON parallel layout contract.
7. there is no CSS vocabulary in the ontology.
8. PinnedRegion is never interpreted as CSS fixed/sticky positioning.
9. existing runtime allocation and dynamic ContentRegion behavior still work.
10. a default legacy surface can still be rendered when no semantic SurfaceDefinition is passed.
11. the code contains a clean boundary for future SHACL UI-based semantic Tile internals without using SHACL UI as the screen layout language.
12. tests demonstrate the ontology -> parser -> Surface renderer chain end to end.

---

## Scope discipline

Do not broaden this task into a redesign of all OntoBDC View components, Pages, annotation UI, state management, or general application navigation.

Do not create a generic frontend framework.

Do not convert existing Tiles to SHACL UI just because the draft exists.

Do not add new ontology terms locally in `ontobdc-view` when they belong in `Brasidata/brasidatacenter`. If a missing semantic term is discovered, document it and add it to the homonymous `brasidatacenter` branch first.

The goal is narrow and concrete: **make the Surface gabarito declarative, ontological, renderer-neutral, and executable by the existing Tiles presentation runtime.**
