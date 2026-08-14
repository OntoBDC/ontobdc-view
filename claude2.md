# Complement to `cloud.md`: DefaultSurfaceLayout selection by available surface size

This file extends `cloud.md`. Read and apply both documents together.

## Purpose

The first intervention makes a `PresentationSurface` declarative and ontology-driven. This complement adds **multiple default surface layouts selected automatically according to the logical capacity of the available presentation area**.

The goal is not CSS responsiveness and not browser breakpoints. The goal is semantic selection of an appropriate default `PresentationSurface` description before materialization.

The canonical vocabulary is in `Brasidata/brasidatacenter`, branch `feat/semantic-ui-layout`, file:

`ontology/ontobdc/domain/view.ttl`

The additions introduced for this purpose are:

- `view:DefaultSurfaceLayout`
- `view:minAvailableColumns`
- `view:maxAvailableColumns`
- `view:minAvailableRows`
- `view:maxAvailableRows`
- `view:layoutPriority`

`view:DefaultSurfaceLayout` is a specialization of `view:PresentationSurface`. A default layout therefore **is itself the complete surface description**: it may have regions, grid geometry, scroll policies and component placements exactly like any other `PresentationSurface`.

There is no separate YAML/JSON layout profile.

---

## Core semantics

A `DefaultSurfaceLayout` means:

> this PresentationSurface is eligible to be used as the default layout when the presentation environment has a logical capacity within the declared bounds.

Example:

```turtle
@prefix view: <http://datacenter.app.br/ontology/ontobdc/domain/view.ttl#> .
@prefix layout: <urn:ontobdc:layout:> .

layout:compact
    a view:DefaultSurfaceLayout ;
    view:minAvailableColumns 1 ;
    view:maxAvailableColumns 4 ;
    view:layoutPriority 10 ;
    view:columnCount 4 ;
    view:rowCount 12 ;
    view:hasRegion layout:compactOperation ;
    view:hasRegion layout:compactContent ;
    view:hasRegion layout:compactPinned .

layout:regular
    a view:DefaultSurfaceLayout ;
    view:minAvailableColumns 5 ;
    view:maxAvailableColumns 8 ;
    view:layoutPriority 10 ;
    view:columnCount 8 ;
    view:rowCount 12 ;
    view:hasRegion layout:regularOperation ;
    view:hasRegion layout:regularContent ;
    view:hasRegion layout:regularPinned .

layout:wide
    a view:DefaultSurfaceLayout ;
    view:minAvailableColumns 9 ;
    view:layoutPriority 10 ;
    view:columnCount 12 ;
    view:rowCount 12 ;
    view:hasRegion layout:wideOperation ;
    view:hasRegion layout:wideContent ;
    view:hasRegion layout:widePinned .
```

The labels `compact`, `regular`, `wide` above are only instance names in the example. Do not encode device categories such as mobile/tablet/desktop into the selection algorithm.

A narrow browser window, an embedded panel or another renderer with the same logical capacity must be able to select the same layout.

---

## Logical capacity, not pixel breakpoints

Do **not** implement rules such as:

```text
if width < 768 px -> mobile
if width < 1024 px -> tablet
else -> desktop
```

That would put browser/media-query semantics back into the presentation model.

Instead, derive the available logical capacity from the actual presentation area using the same concepts already present in the Surface model:

- available physical width/height known by the renderer;
- `slotTarget`;
- `gap`;
- `padding`.

The browser renderer currently derives columns approximately from:

```text
usefulWidth = totalWidth - 2 * padding
pitchTarget = slotTarget + gap
availableColumns = floor((usefulWidth + gap) / pitchTarget)
```

Keep this principle, but make it an explicit **capacity measurement phase** that occurs before default-layout selection.

Add the analogous calculation for available logical rows when height constraints are relevant:

```text
usefulHeight = totalHeight - 2 * padding
availableRows = floor((usefulHeight + gap) / (slotTarget + gap))
```

A renderer may calculate logical capacity differently if its physical medium differs, but it must expose equivalent logical column/row capacity to the selector.

`DefaultSurfaceLayout` matching operates on that logical capacity.

---

## Selection precedence

Implement the following precedence exactly:

### 1. Explicit non-default PresentationSurface

If the caller explicitly selects a concrete `view:PresentationSurface` that is not being supplied as a default candidate set, render it.

Do not silently replace an explicit surface because another default appears more suitable for the viewport.

### 2. Matching DefaultSurfaceLayout

When no explicit surface is selected, evaluate the available `view:DefaultSurfaceLayout` instances against the measured logical capacity.

A layout matches when every declared bound is satisfied:

```text
minAvailableColumns <= availableColumns
maxAvailableColumns >= availableColumns
minAvailableRows    <= availableRows
maxAvailableRows    >= availableRows
```

Missing minimum means no lower bound.
Missing maximum means no upper bound.

Columns and rows whose bounds are completely absent do not constrain matching.

### 3. Legacy fallback

Only if no semantic explicit surface exists and no `DefaultSurfaceLayout` matches, use the transitional legacy fallback described in `cloud.md`.

Do not make legacy fallback compete with semantic layouts.

---

## Deterministic choice when multiple defaults match

Overlapping ranges are legal because a deployment may intentionally provide specialized layouts.

Selection must therefore be deterministic.

Use this order:

1. highest `view:layoutPriority` wins;
2. if priorities are equal, prefer the candidate with the most specific declared capacity envelope;
3. if still tied, use the lexical RDF IRI as a deterministic final tie-breaker.

For specificity, prefer layouts with more declared bounds and, where comparable, narrower numeric ranges.

Do not depend on RDF serialization order, DOM order, file order or hash iteration order.

`layoutPriority` is selection priority only. It has nothing to do with z-index, visual stacking or component placement order.

---

## Resize behavior

Default layout selection must react when the actual presentation area changes enough to cross a semantic capacity boundary.

Example:

```text
available columns: 9 -> layout:wide
window narrows
available columns: 8 -> layout:regular
```

The selector should re-evaluate the matching default only when measured logical capacity changes, not on every raw resize event if the column/row capacity remains identical.

### Preserve runtime state across layout switches

Switching from one `DefaultSurfaceLayout` to another must **not recreate the application as if it were a fresh load**.

Preserve, as far as semantically possible:

- existing Tile/component instances;
- entity/resource identity represented by Tiles;
- content Tiles that have been opened;
- dynamic ContentRegion recency ordering;
- closed/open state;
- pin/unpin state;
- Tile-specific runtime state;
- current theme/language state;
- active presentation events/listeners.

What changes is the Surface topology and placement policy.

The preferred algorithm is:

1. measure new logical capacity;
2. select the new `DefaultSurfaceLayout`;
3. if the selected layout IRI is unchanged, only perform ordinary allocation/relayout;
4. if the selected layout IRI changed, build the new region topology;
5. migrate existing live Tile elements to compatible semantic regions;
6. apply declared ComponentPlacements for the newly selected layout;
7. preserve dynamic ContentRegion ordering for runtime contextual Tiles that are not fixed by declarative placement;
8. rerun allocation negotiation;
9. dispatch a meaningful Surface layout/profile change event.

Do not serialize and recreate every Tile unless technically unavoidable.

---

## Region identity during layout switching

Do not assume that two layouts use the same blank node or region IRI.

Map regions primarily by semantic RDF type when migrating runtime items:

- `view:OperationRegion`
- `view:ContentRegion`
- `view:PinnedRegion`

If a Surface contains multiple regions of the same type in the future, support explicit region identity/configuration rather than silently choosing the first.

For the current implementation, one Operation, one Content and one Pinned region per default layout is sufficient, but do not encode that as an ontology-level cardinality restriction unless the architecture explicitly decides to require it.

---

## Declarative placements may differ by size

This is one of the main reasons for introducing `DefaultSurfaceLayout`.

Different layouts may place different operational Tiles or place them differently without changing component definitions.

For example:

```text
wide OperationRegion:
    Start: Logo
    End: Language, Theme, Login

compact OperationRegion:
    Start: Logo
    End: Login
```

That does **not** mean Language and Theme cease to exist as components. It means they are not declared in that default surface layout's OperationRegion. A future compact layout could expose them through another Tile/menu/component if desired.

Do not hardcode these choices in `onto-presentation-surface.js`.

The layout RDF decides.

---

## Interaction with ComponentPlacement

Each `DefaultSurfaceLayout` is a normal `PresentationSurface`, therefore its regions use the same:

- `view:hasComponentPlacement`
- `view:placesComponent`
- `view:hasAlignment`
- `view:placementOrder`

No new placement model is introduced for responsive/default layouts.

Do not duplicate ComponentPlacement properties under DefaultSurfaceLayout.

---

## Interaction with PresentationRequest / SupportProfile / Allocation

Capacity selection and Tile allocation are separate stages.

Correct flow:

```text
physical presentation area
        ↓
measure logical capacity
        ↓
select DefaultSurfaceLayout
        ↓
materialize its semantic regions/placements
        ↓
resolve Tile PresentationRequest + SupportProfile
        ↓
perform runtime Allocation
```

Do not use a Tile's `minColumns`/`maxColumns` to select the Surface layout itself unless a later explicit capability/constraint mechanism says so.

`minAvailableColumns` and `maxAvailableColumns` describe **when the default Surface layout is eligible**.

`minColumns` and `maxColumns` in `PresentationSupportProfile` describe **what a Component can support once it is being allocated**.

Keep those concepts separate.

---

## Suggested implementation seam

Extend the internal model proposed in `cloud.md` with something equivalent to:

```text
SurfaceCapacity
    columns
    rows

DefaultSurfaceCandidate
    surfaceDefinition
    minAvailableColumns?
    maxAvailableColumns?
    minAvailableRows?
    maxAvailableRows?
    priority

DefaultSurfaceSelector
    select(capacity, candidates) -> SurfaceDefinition | None
```

These are internal implementation structures, not another external schema.

The parser should simply recognize that a `DefaultSurfaceLayout` is also a `PresentationSurface`, parse the normal Surface structure, and additionally parse its applicability constraints.

---

## Events / observability

When the selected default layout changes, emit a presentation-level event that makes the transition inspectable.

Recommended semantic intent:

```text
surface-default-layout-changed
```

with detail sufficient to trace:

```text
previous layout IRI
new layout IRI
available columns
available rows
```

This is a runtime event. Do not write the browser event name into the ontology unless OntoBDC's presentation event model explicitly formalizes it later.

Avoid firing a "layout changed" event on every pixel resize when the selected semantic layout has not changed.

---

## SHACL validation additions

Validate `DefaultSurfaceLayout` candidates before selection.

Required constraints:

- min/max available columns are positive integers when present;
- min/max available rows are positive integers when present;
- minimum must not exceed maximum for the same axis;
- layoutPriority is an integer when present;
- the candidate remains a valid `PresentationSurface` under existing Surface/Region/Placement shapes.

SHACL Core cannot express every cross-property condition as tersely as scalar constraints; if necessary use SHACL SPARQL for `min <= max`, or enforce the same invariant in the parser with a clear validation message.

Do not silently select an internally contradictory layout candidate.

---

## Tests to add

### Selector unit tests

1. 4 available columns selects a candidate covering 1..4.
2. 5 available columns selects a candidate covering 5..8.
3. 9 available columns selects a candidate whose lower bound is 9 and has no upper bound.
4. missing max bound behaves as unbounded above.
5. missing min bound behaves as unbounded below.
6. row constraints are honored when present.
7. higher layoutPriority wins when ranges overlap.
8. specificity resolves equal-priority overlaps deterministically.
9. IRI lexical order is the final deterministic tie-breaker.
10. contradictory min/max candidate is rejected rather than selected.
11. no matching candidate returns None and allows the caller to use legacy fallback.

### Browser integration tests

1. render with a width that produces compact logical capacity and verify compact Surface IRI selected;
2. enlarge until logical capacity crosses into regular and verify selection changes once;
3. enlarge into wide and verify wide selected;
4. resize within the same logical column count and verify no semantic layout switch;
5. verify Content Tiles survive compact -> regular -> wide switches;
6. verify pin state survives switches;
7. verify open/closed file Tile state survives switches;
8. verify dynamic ContentRegion order survives switches;
9. verify OperationRegion declared Tiles follow each selected layout's own ComponentPlacements;
10. verify explicit non-default PresentationSurface is not replaced by automatic default selection.

---

## Definition of done for this complement

This complement is complete when:

1. `view:DefaultSurfaceLayout` exists and is a specialization of `view:PresentationSurface`.
2. Default layouts declare applicability in logical columns/rows rather than CSS pixels/device classes.
3. the renderer measures available logical capacity before selecting a default layout.
4. multiple RDF-defined defaults can coexist.
5. selection is deterministic.
6. resize can switch default layouts when logical capacity crosses a declared boundary.
7. layout switching preserves live Tile/runtime state as far as semantically possible.
8. explicit surfaces take precedence over automatic defaults.
9. legacy fallback runs only when no explicit surface/default match exists.
10. no new YAML/JSON schema or CSS breakpoint contract is introduced.
11. tests cover selection and live layout switching.

The architectural principle is simple:

**the renderer does not decide what the compact/regular/wide screen looks like. It only measures what presentation capacity exists, selects the matching RDF-defined DefaultSurfaceLayout, and materializes it.**
