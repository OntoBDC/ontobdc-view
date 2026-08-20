# CLAUDE.md — ontobdc-view

Rules for any AI agent (Claude or otherwise) working in this repository. Read
this before making any change. If this file and the code disagree, say so
instead of silently picking one.

## 0. Project ecosystem

This repository is one part of a multi-repo system. These version numbers
drift — check each repo's own `pyproject.toml` `version` field (or, for the
ontology repo, its latest `vX.Y` branch) before trusting this table.

| Repo | What it is | WIP branch (as of this writing) |
|---|---|---|
| **`ontobdc-view`** *(this repo)* | Browser-side presentation layer: Web Component "Tiles" (closed shadow DOM), the ontology-driven Presentation Surface, i18n catalogs, standalone Page renderers (WorkStream 5W2H, file viewer). Python package `ontobdc_view`, no build step, no bundler. | `v0.5` |
| **`ontobdc-wip`** | Offline-first semantic runtime that consumes this repo — CLI, container/dataset storage, RDF/JSON-LD processing, the state-machine pipeline that discovers this package's `component/plugin/*.py` descriptors and embeds matched Tiles' JS into a generated Surface. Python package `ontobdc`, this repo's actual runtime consumer. | `v0.18` |
| **`infobim-wip`** | OpenBIM domain application built on top of `ontobdc` — BIM-specific entities, resource policy (IFC/DWG/etc.), its own CLI delegating to `ontobdc`'s. Python package `infobim`. | `v0.7` |
| **`Brasidata/brasidatacenter`** | External RDF/TTL vocabulary repo (e.g. `ontology/ontobdc/domain/view.ttl`) — canonical source for the `view:*` ontology terms the Presentation Surface model (`component/adapter/surface_definition.py`) parses. Not part of this repo's toolchain; new vocabulary terms belong there, not invented locally. | `v0.7` |

`ontobdc-view` and `ontobdc-wip` have only loose version pins between them
(see `infobim-wip`'s `pyproject.toml`, e.g. `ontobdc-view>=0.1.0`) — a fix
landing in this repo's branch does not mean it's what's actually running
wherever the pipeline is invoked from. When a reported bug won't reproduce,
check the *installed* version in that environment, not just this checkout.

## 1. What this package is

`ontobdc_view` ships the browser-side presentation layer for OntoBDC: Web
Components ("Tiles") with closed shadow DOM, an ontology-driven Presentation
Surface, i18n catalogs, and standalone Page renderers (e.g. the WorkStream
5W2H view, the file viewer). It has no server, no bundler, no build step —
every asset is either embedded verbatim into a generated `index.html` or
shipped as its own standalone HTML file. `ontobdc` (the `ontobdc-wip` repo)
is a separate package and the actual consumer: it discovers this package's
`component/plugin/*.py` descriptors, matches them against RO-Crate entities,
and calls `component_source(tag)` to embed each matched Tile's JS.

## 2. Branch discipline

- The active development branch is `v0.5`. Check `pyproject.toml`'s
  `version` field if this file drifts — it will, update this line when it
  does.
- Never push to `master` unless explicitly instructed.
- **Before starting any change, `git fetch origin <branch>` and diff HEAD
  against it.** Another agent or the user may have pushed directly to this
  branch without you knowing — this has happened in this repo. Do not
  assume the checkout you started with is current.
- **Before pushing, fetch and diff again.** If origin moved while you were
  working, merge/rebase and re-verify before pushing, don't force over it.

## 3. The one non-negotiable rule: no real file reads from the main Surface

The generated `index.html` (the "Surface") must **never** read, open, or
otherwise touch the bytes of a real container file — no `fetch()`, no
`img.src`, no `<embed src>`, no hashing, no stat-for-content. Every piece of
information about a file shown in the Surface (name, size, tree position)
comes exclusively from the RO-Crate JSON-LD embedded in the page
(`<script type="application/json" id="ontobdc-surface-jsonld">`).

The **only** exception: when the user explicitly double-clicks a file in
`onto-file-tree-tile`, that dispatches `show-details-requested`, which the
single Surface-wide `onto-file-viewer-tile` listens for. That Tile points an
`<iframe>` at the standalone `onto-file-viewer.html` page (written inside
the ignored `.__ontobdc__/` marker directory by `ontobdc`'s
`SurfacePackagedCapability` — not at the container root, so it never shows
up as an ordinary file in the RO-Crate inventory or file tree), passing the
file's path by reference in the query string. `onto-file-viewer.html` is
the *only* place in this whole system that ever reads real file content,
and an explicit double-click is the *only* moment it does so.

Why this matters concretely: containers can live inside cloud-synced folders
(OneDrive Files On-Demand and equivalents). Any eager read of a file's bytes
— even one that's invisible/closed in the UI — forces that file to download.
`data-tile-closed` only ever controls CSS visibility; it does **not** stop
`connectedCallback` from running. Any Tile that sets `img.src` / calls
`fetch()` / sets `<embed src>` unconditionally inside `connectedCallback` or
`#render()` re-introduces this bug, even if it "looks closed". Gate every
such read behind `this.dataset.tileClosed !== "true"`.

If you're asked to add a new file-preview mechanism: it must follow this
exact pattern (RO-Crate metadata in the Surface, real content only behind an
explicit user action in a page that isn't the Surface itself). Do not
propose an architecture change to fix a symptom here without first proving,
by direct reproduction (Playwright, `page.on("request", ...)`, a real click),
exactly which line reads a file when it shouldn't. Guessing at a redesign
instead of instrumenting the actual failure has already cost real time in
this project — see the `git log` around `onto-file-viewer-tile.js` if you
want the full story.

## 4. Tiles are autonomous — duplication across them is intentional

Each `component/asset/*.js` file is embedded as its own standalone
`<script type="module">`, in arbitrary combination, in arbitrary order, with
no bundler and no shared runtime module. This is deliberate: a Tile must
work if dropped into a page alone, with no other Tile's script having run
first. Because of that:

- `function t(key, vars)` (i18n resolution), `#entity()`/`#literal()` (JSON-LD
  reads), `#formatBytes()`, and the `connectedCallback`/`disconnectedCallback`
  listener-symmetry boilerplate are duplicated near-verbatim across most
  files in this directory. **This is not an oversight — do not "fix" it by
  introducing a shared base class, a shared ES module import, or a global
  runtime object that Tiles depend on at load time.** That would break the
  autonomy guarantee.
- If the duplication itself becomes the actual problem (the same bug fixed
  in one Tile and missed in the other dozen), the fix is a **build-time**
  generator that stamps a single source-of-truth snippet into each shipped
  file — keeping every final `<script>` still fully self-contained at
  runtime — not a runtime dependency between Tiles. Do not build this
  speculatively; only if asked.
- Two known real bugs from this exact pattern: `Object.freeze()` on a
  debug-instrumentation object crashed the whole Surface (a write to a
  frozen property throws in strict-mode `<script type="module">`), and a
  race condition where `this.closest("onto-presentation-surface")` could run
  before the Tile was actually inserted under the Surface, silently (via
  `?.`) never attaching a listener. Both are the reason rule 5 below exists.

## 5. Don't let `?.` hide a real failure

This codebase uses optional chaining heavily to avoid crashing on
DOM-timing edge cases. That's reasonable, but it means a wrong assumption
fails **silently** — no error, no log, the feature just doesn't work. When
debugging "nothing happens" reports, treat every `?.` on the path as a
suspect and prove — by running the actual interaction, not by reading the
code and guessing — whether it's short-circuiting. See
`onto-file-viewer-tile.js`'s `#eventTargetSurface()`/`MutationObserver`
fallback for the pattern used to make a `closest()` lookup retry instead of
silently giving up.

## 6. Testing conventions

- Playwright, headless Chromium. The pre-installed browser lives at
  `/opt/pw-browsers/chromium-<version>/chrome-linux/chrome` — if the
  `playwright` pip package's expected build number doesn't match what's
  installed, override `executable_path` via a **temporary**
  `test/conftest.py` `browser_type_launch_args` fixture, and delete it
  before committing. It is not a permanent project file.
- Closed shadow DOM is the real production shape. For tests that need to
  inspect inside it, use an init script that overrides
  `Element.prototype.attachShadow` to force `mode: "open"` — see
  `FORCE_OPEN_SHADOW_ROOT` in `test/test_file_tree_opens_viewer.py`. Prefer
  verifying the *real* interaction too when the bug is interaction-shaped:
  compute the target element's real screen coordinates (with the shadow
  forced open) and drive a genuine `page.mouse.dblclick(x, y)` OS-level
  click, not just a script-dispatched `dispatchEvent(new MouseEvent(...))` —
  the latter can pass even when a real double-click gesture wouldn't.
- Use `page.goto(f"file://{path}")`, not `page.set_content(...)`, for any
  test that needs real relative-URL resolution (network requests, iframe
  `src`, anything checking what actually got requested).
- When combining multiple components' JS into one test page, put each in
  its **own** `<script type="module">` tag. Concatenating two components'
  source into a single tag collides on their independently-declared
  top-level `const I18N` / `function t` and throws a `SyntaxError` that
  silently prevents every custom element after it from ever registering —
  this matches how the real pipeline (`embed_component_scripts`, in
  `ontobdc`'s `document.py`) already does it, one script tag per component.
- To assert "no real file was read", compare requested URLs against the
  file's actual `file://` URI (`(path).as_uri()`), not a substring — a
  viewer page's own URL (`onto-file-viewer.html?path=data%2Ffoo.csv`) can
  contain the target filename as a substring of its query string and
  produce a false pass/fail either way.

## 7. i18n

`component/adapter/i18n/` loads YAML catalogs per namespace.
`catalog_for_namespace(namespace)` always merges in the `"common"`
namespace's keys too (`merge_common_namespace=True`), so a Tile using
`common` keys (`open`, `close`, `noFile`, etc.) doesn't need to redeclare
them. `_I18N_NAMESPACE_BY_TAG` in `component_source.py` maps each custom
element tag to its namespace — a new Tile needs an entry there or it falls
back to `"common"` only.

## 8. Packaging

`pyproject.toml`'s `[tool.hatch.build.targets.wheel.package-data]` glob list
must include every non-`.py` asset type actually shipped (`**/*.js`,
`**/*.html`, i18n `**/*.yaml`, etc.). A feature that only exists in the repo
checkout and not in an installed wheel is not done — verify with a clean
`pip install` from a fresh venv, not just editable-install.

## 9. Completed interventions (do not re-open without being asked)

- **Ontology-driven Presentation Surface.** `onto-presentation-surface.js`'s
  region topology (Operation/Content/Pinned) is parsed from RDF
  (`view:PresentationSurface` etc., see the OntoBDC View Ontology) via
  `component/adapter/surface_definition.py`, not hardcoded. Shipped in
  `v0.3` — see `CHANGELOG.md` for the full model. Only touch this again if
  asked to extend the ontology model itself, not as a side effect of an
  unrelated Tile change.
- **Per-file preview Tiles replaced by RO-Crate-only Surface + explicit
  viewer.** See rule 3 above — this is current architecture, not an
  in-progress task.

## 10. Definition of done

A change here is complete only when:

- the requested behavior is verified by actually running it (Playwright for
  browser behavior, a real generated container for the full pipeline), not
  inferred from reading the diff;
- rule 3 (no real file reads from the Surface) still holds — check with a
  network trace, not by eye;
- rule 4 (Tile autonomy) still holds — no new shared-module dependency
  introduced between `component/asset/*.js` files;
- `CHANGELOG.md` is updated with the *why*, not just the *what*;
- the change is pushed to the current branch (rule 2), origin re-checked
  first;
- the agent states plainly what was verified and what wasn't, instead of an
  optimistic summary.
