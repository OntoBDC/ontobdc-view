# InfoBIM WorkStream reference source

This lab captures the latest rich WorkStream 5W2H implementation found in `EliasMPJunior/infobim-wip`, branch `v0.4`, as reference material for the OntoBDC v0.15 generalization.

## Lineage

- Original complete evidence-management implementation: PR #27 / branch `feat/5w2h`.
- PR #27 head commit: `b02c43d27d85114dd4b64234b7f40cb5abc7ca9e`.
- PR #27 merge commit: `626ce95ff0e29bbba91456c644b2cc5676f9026c`.
- Spatial annotation evolution continued in PRs #29 and #30 (`feat/spatial-annotations`).
- The combined latest reference used here is branch `v0.4`.

## Reference files

The InfoBIM-owned source files relevant to this port are:

- `src/infobim/view/adapter/html.py`
- `src/infobim/view/plugin/template/workstream_5w2h.html.j2`
- `src/infobim/view/plugin/asset/js/workstream_5w2h.js`
- `src/infobim/view/plugin/asset/css/project_dashboard.css`
- `src/infobim/view/plugin/asset/css/annotation_visual.css`
- `src/infobim/view/plugin/asset/js/email_reader.js`
- `src/infobim/view/plugin/asset/js/annotation_bim_resolver.js`
- `src/infobim/view/plugin/asset/js/annotation_presentation.js`
- `src/infobim/view/plugin/asset/js/annotation_query_integration.js`
- `src/infobim/view/plugin/asset/js/pyodide_bootstrap.js`

## Snapshot stored in this lab

The following v0.4 source has been copied into `reference/` for direct inspection:

- `html.py` — renderer/integration source;
- `workstream_5w2h.html.j2` — complete generated-page template;
- `project_dashboard.css` — complete WorkStream/dashboard styling;
- `annotation_visual.css` — InfoBIM theme bridge over OntoBDC annotation visuals;
- `annotation_bim_resolver.js` — deliberately preserved as an example of what **must not** become generic core behavior;
- `annotation_presentation.js` — annotation labels/theme integration;
- `annotation_query_integration.js` — workspace/Subject Page integration glue;
- `pyodide_bootstrap.js` — project dashboard Pyodide bootstrap reference.

The main `workstream_5w2h.js` source is preserved in ordered chunks under `reference/workstream_5w2h.js.parts/` because it is a large source file. The chunks cover the complete v0.4 file in source order. Its source blob is:

- SHA: `cf46b9d96e88f1f28dd5808e10000aaa294c99d4`
- size: 65,892 bytes

`reference/assemble_workstream_js.py` rebuilds the inspection copy from the ordered chunks. The historical file is reference material only; it is not meant to run as part of OntoBDC v0.15.

### `email_reader.js`

The v0.4 `email_reader.js` is a 654,137-byte minified/bundled parser rather than the WorkStream semantic/runtime logic itself. The GitHub connector exposes it as one enormous minified line, so it is intentionally **not duplicated byte-for-byte** in this lab snapshot. Its exact source identity is recorded in `reference/EMAIL_READER_BUNDLE.md`:

- source: `EliasMPJunior/infobim-wip:v0.4/src/infobim/view/plugin/asset/js/email_reader.js`
- blob SHA: `657814d9503597430d19be48e17923ed0cdf3fda`
- size: 654,137 bytes

If generic communication preview remains in scope, treat e-mail parsing as a replaceable preview adapter/dependency. Do not make this bundled parser part of WorkStream semantics.

## OntoBDC-native dependencies

The v0.4 template/renderer also consumes OntoBDC-native annotation and WorkStream modules. Those are **not duplicated into the lab** because they already exist in the OntoBDC v0.15 source tree and should remain authoritative:

- `src/ontobdc/view/plugin/asset/js/annotation/*`
- `src/ontobdc/view/plugin/asset/js/workstream/workstream_context.js`
- `src/ontobdc/view/plugin/asset/js/workstream/workstream_annotations.js`

`spatial_annotations.js` appears in the earlier PR #29 change set, but it is not part of the final InfoBIM v0.4 JS directory used as the latest baseline. Its responsibilities evolved into the OntoBDC-native annotation runtime referenced by the final template. Do not resurrect the superseded file merely because it existed during the feature history.

## Important distinction

Files under `lab/workstream-generalization/reference/` are historical/reference source. They intentionally contain InfoBIM/project/BIM assumptions. Claudia must generalize behavior into the current OntoBDC architecture rather than import these files as production modules.

See `ONTOLOGY_REVIEW.md` before changing semantic contracts.
