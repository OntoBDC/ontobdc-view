# WorkStream generalization — ontology and semantic-contract review

## Scope

This review compares the semantic assumptions embedded in the rich InfoBIM WorkStream 5W2H implementation (`EliasMPJunior/infobim-wip`, branch `v0.4`) with the current OntoBDC `v0.15` baseline created from `master`.

The goal is **not** to copy the InfoBIM semantic model into OntoBDC. The goal is to identify which concepts are genuinely generic, which are BIM/project-specific, and which old integration assumptions no longer match the current OntoBDC architecture.

## Main finding

The useful abstraction is already larger than InfoBIM:

> A WorkStream has dimensions/facets; arbitrary resources may be discovered, related, previewed and annotated in the context of those dimensions; resource identity remains independent from the representation chosen for display.

That is generic OntoBDC behavior. `Project`, drawing/DWG policy and InfoBIM-specific inventory rules are not.

The old InfoBIM renderer also expects ontology files to exist as package assets under `ontobdc/view/plugin/ontology`. The current OntoBDC v0.15 tree does **not** contain that package ontology directory or those TTL files. Therefore their old filenames and paths are historical integration evidence, not a contract to restore blindly.

## Semantic contracts found in the InfoBIM reference

The `WorkStream5W2HHtmlRenderer` in InfoBIM v0.4 declares five OntoBDC ontology assets:

- `file_display.ttl`
- `enrichment_annotation.ttl`
- `enrichment_annotation_facade.ttl`
- `visual_representation_type.ttl`
- `visual_representation_type_facade.ttl`

The same renderer delegates annotation behavior to OntoBDC annotation modules and WorkStream integration modules. The browser runtime also embeds ISO 21597 ICDD Linkset vocabulary use for resource relationships.

These concepts need to be reviewed separately instead of treating the five filenames as one monolithic ontology dependency.

## 1. Annotation / enrichment semantics

### Keep

Annotation is clearly generic and is already part of the OntoBDC contract. The current OntoBDC annotation model distinguishes logical target, Subject, people roles, category, lifecycle, selectors and visual representation. That separation should remain authoritative.

The generic WorkStream surface should be able to:

- show annotations for arbitrary resources;
- create annotations when the selected resource/representation supports it;
- open the global annotation workspace;
- open the Subject Page;
- preserve representation-local geometry;
- associate annotations with WorkStream context/dimensions without collapsing Subject, target and WorkStream into the same concept.

### Do not import from InfoBIM

Do not bring BIM resolution into the generic annotation contract. `annotation_bim_resolver.js` is a domain extension, not an OntoBDC requirement.

Any InfoBIM-specific labels in annotation configuration (`InfoBIM Annotation`, project wording, BIM semantic types) must disappear or become injected/profile-level labels.

### Ontology action

Do not recreate `enrichment_annotation.ttl` or `enrichment_annotation_facade.ttl` merely because the old renderer lists them. First locate the current annotation semantic source used by v0.15 runtime/containers and map the old concepts to the current URIs. Only add or modify ontology resources if an actual missing semantic concept is demonstrated.

## 2. Logical resource versus visual representation

### Keep

This is one of the strongest generic contracts in the reference implementation.

A resource can be the semantic object that is related to a WorkStream dimension while another representation is selected only for browser display. The relation must continue to point to the logical resource, not silently migrate to a PDF/image representation.

This general rule belongs in OntoBDC:

`LogicalResource != DisplayRepresentation`

### Remove from generic core

The InfoBIM implementation contains a hard-coded DWG rule: a `.dwg` logical resource may be displayed using a same-stem `.png` or `.pdf` candidate. That is useful in BIM/AEC, but it is not a generic OntoBDC rule.

The generic runtime must not know that DWG exists.

### Generalization

Representation selection should be driven by semantic/declarative data such as:

- representation type;
- MIME/media type;
- relation between logical source and representation;
- browser capability;
- optional domain display profile.

InfoBIM may later contribute a profile saying that a DWG has browser representations such as PDF/PNG. OntoBDC should only execute the generic representation-selection contract.

### Ontology action

Treat `visual_representation_type.ttl` and its facade name as evidence of this contract, not as files to resurrect. Reconcile the concept with the current v0.15 semantic representation model before adding anything.

## 3. File/resource display policy

### Keep

The old `file_display.ttl` idea is fundamentally generic: user-facing resource visibility/category should be declarative rather than a pile of extension checks in JavaScript.

The InfoBIM browser code consumed display profiles containing:

- required semantic types;
- accepted MIME types;
- accepted extensions;
- a display category.

That mechanism is useful beyond BIM.

### Change

The categories used by the InfoBIM page are domain/UI choices:

- Drawings / Pranchas
- Documents
- Communication
- Photos

A generic OntoBDC WorkStream must not make `Drawings` or `DWG` part of its core ontology. The core may support generic resource grouping/display categories, but domain-specific category instances belong to a profile or extension.

A reasonable generic baseline is to permit arbitrary category identifiers/labels supplied by semantic data. Do not prematurely standardize a fixed list unless the existing OntoBDC ontology already defines one.

### Ontology action

Recover the semantic intent of `file_display.ttl` into the current ontology-loading architecture, if that intent is not already represented. Do not reintroduce an ontology solely as a static package asset because the old JavaScript happened to load it from that path.

## 4. WorkStream and 5W2H

### Keep WorkStream as the generic concept

The generic concept is a WorkStream/context of work with identifiable dimensions/facets and relationships to resources, annotations and evidence.

### Keep 5W2H as a profile/view

The seven dimensions are useful and should remain supported:

- What
- Why
- Where
- When
- Who
- How
- HowMuch

But 5W2H should not define WorkStream itself. It is one structured presentation/profile of WorkStream.

This leaves room for other WorkStream structures without forking the resource/annotation/relation machinery.

### Remove

The following are InfoBIM/project assumptions and must not be part of generic WorkStream semantics:

- `Project` as required parent;
- `projectId` / `projectName` as required payload fields;
- project folder authorization language;
- project RO-Crate refresh as WorkStream behavior;
- project-specific workbook assumptions as the definition of WorkStream;
- InfoBIM branding.

The generic WorkStream surface may operate in a container/dataset, but `container` is an infrastructure/storage context, not a BIM `Project`.

## 5. Relationships and ISO 21597 / ICDD

### Keep the relationship capability

The important generic behavior is:

> A WorkStream dimension can relate to an arbitrary resource, and that relation can be added, removed, queried and persisted.

The InfoBIM prototype proves this with ICDD `DirectedBinaryLink` serialization.

### Separate model from serialization

Do not define WorkStream semantics as “an ICDD file named `WorkStreamResource.ttl` under this project path”. That couples the concept to one serialization/layout.

Prefer:

- generic WorkStream/resource relation in the semantic model;
- deterministic persistence contract;
- ISO 21597/ICDD as one valid adapter/serialization when appropriate.

This preserves the very useful standards-based path without forcing every OntoBDC WorkStream consumer to be an ICDD project container.

## 6. RO-Crate / inventory behavior

The InfoBIM implementation reads project resources from RO-Crate and can explicitly rebuild a project RO-Crate by scanning the selected folder.

Resource inventory is useful. **Project refresh is not WorkStream semantics.**

For OntoBDC:

- WorkStream should consume whatever resource inventory/facade the current container/dataset runtime exposes;
- it must not own a special browser-side “project inventory rebuild” implementation;
- it should not assume a resource is a construction-project file;
- resource discovery should use the current OntoBDC serialized/facade contract rather than reproducing the old InfoBIM inventory stack inside the page.

## 7. Current v0.15 mismatch that must be resolved deliberately

The InfoBIM v0.4 renderer searches for:

`ontobdc/view/plugin/ontology/{five TTL files}`

and copies them into the generated InfoBIM asset directory.

The current OntoBDC v0.15 baseline has no `src/ontobdc/view/plugin/ontology` directory and no packaged `.ttl` files in the repository tree. It does have the current native annotation/workstream browser modules and the newer semantic surface pipeline.

Therefore:

1. do **not** copy those historical TTL paths into v0.15 just to satisfy the old renderer;
2. identify where the current v0.15 semantic namespaces/TBox contracts are sourced;
3. map each old semantic responsibility to the current contract;
4. add a new ontology term only if the current model genuinely cannot express the required generic behavior;
5. keep domain-specific InfoBIM/BIM terms outside the generic ontology.

## 8. Target conceptual model for the port

These names are conceptual, not a request to mint new URIs. Existing OntoBDC terms take precedence.

- **WorkStream** — the work context/entity.
- **WorkStreamDimension / Facet** — a dimension such as a 5W2H field.
- **Resource** — arbitrary logical resource that can be discovered/related.
- **ResourceRelation / EvidenceRelation** — relation between a WorkStream/dimension and a resource.
- **Annotation** — existing strict OntoBDC enrichment/annotation contract.
- **VisualRepresentation** — displayable representation distinct from logical resource identity.
- **RepresentationPolicy/Profile** — declarative selection of a suitable representation.
- **DisplayCategory/Profile** — optional semantic grouping/visibility rule for resources.

The first implementation should prefer mapping onto existing URIs/classes/predicates over creating these as new names.

## 9. What Claudia should inspect before implementation

1. Current v0.15 WorkStream JS modules:
   - `src/ontobdc/view/plugin/asset/js/workstream/workstream_context.js`
   - `src/ontobdc/view/plugin/asset/js/workstream/workstream_annotations.js`
2. Current annotation asset tree under `src/ontobdc/view/plugin/asset/js/annotation/`.
3. Current semantic surface pipeline (`standard_surface_html.yaml`, matching/gathering/enrichment/packaging capabilities).
4. Current ontology loader/namespace infrastructure under `src/ontobdc/shared/adapter/ontology.py` and related domain ports.
5. Existing WorkStream vocabulary/URIs in current serialized examples/tests before minting anything.
6. Existing visual representation semantics used by the annotation runtime.

## 10. Proposed implementation boundary

The port should be considered successful when OntoBDC can render a generic WorkStream 5W2H surface that:

- is not branded InfoBIM;
- does not require a Project entity;
- renders 5W2H fields from semantic/runtime data;
- shows a generic hierarchical resource tree;
- supports Related / Suggested / Found as generic views when data exists;
- previews resources through generic representation selection;
- relates/unrelates arbitrary resources to dimensions;
- uses the native annotation runtime, workspace and Subject Page;
- operates locally/offline under the current OntoBDC surface/container rules;
- contains no hard-coded knowledge of DWG, IFC or construction-project categories.

Everything beyond that — BIM categories, DWG representation rules, construction project inventory, InfoBIM labels — belongs back in InfoBIM or another domain extension.
