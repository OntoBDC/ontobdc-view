"""Regression coverage for a real-filesystem eager-load bug.

`onto-image-file-tile`/`onto-csv-file-tile` are `default_closed=True`
(`ComponentMetadata`): they're meant to stay inert — no real file content
read — until the user opens that specific file from `onto-file-tree-tile`.
`data-tile-closed="true"` only ever hid the Tile *visually*
(`test_hidden_file_tiles_stay_hidden_until_opened` in
`test_surface_browser.py` already covers that); it never gated the Tile's
own `connectedCallback` -> `#render()` path, which unconditionally set
`img.src`/called `fetch()` against the entity's real `obdc:filePath`. Every
closed per-file Tile in the Surface therefore still read its real file the
moment the page loaded — invisible, but not free: on a container that lives
inside a cloud-synced folder (OneDrive Files On-Demand and equivalents),
each of those reads forces the real file to download, for every file in the
container, on every open of the generated `index.html`.

These tests need `page.goto("file://...")` rather than `page.set_content`
(used elsewhere in this suite) — a relative resource path only produces an
inspectable network request when resolved against a real document URL.
"""

from __future__ import annotations

import json
from pathlib import Path

from ontobdc_view import component_source

SURFACE_JS = component_source("onto-presentation-surface")
IMAGE_TILE_JS = component_source("onto-image-file-tile")
CSV_TILE_JS = component_source("onto-csv-file-tile")


def _write_container(tmp_path: Path, *, relative_path: str, content: bytes) -> Path:
    file_path = tmp_path / relative_path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(content)
    return file_path


def _entity(*, resource_id: str, relative_path: str) -> dict:
    return {
        "@id": resource_id,
        "http://ontobdc.org/ontology/domain/ontobdc/ns.ttl#filePath": [{"@value": relative_path}],
        "http://purl.org/dc/terms/title": [{"@value": Path(relative_path).name}],
    }


def _write_index(tmp_path: Path, *, tile_js: str, tile_tag: str, entity: dict) -> Path:
    index_path = tmp_path / "index.html"
    index_path.write_text(
        f"""<!doctype html>
<html><head>
<script type="application/json" id="ontobdc-surface-jsonld">{json.dumps([entity])}</script>
<script type="module">{SURFACE_JS}</script>
<script type="module">{tile_js}</script>
</head>
<body>
  <onto-presentation-surface>
    <{tile_tag} id="tile" surface-region="content"
        data-ontobdc-resource="{entity['@id']}" data-tile-closed="true"></{tile_tag}>
  </onto-presentation-surface>
</body></html>
""",
        encoding="utf-8",
    )
    return index_path


def _requests_matching(requested: list, needle: str) -> list:
    return [url for url in requested if needle in url]


def _open_tile(page, relative_path: str) -> None:
    page.evaluate(
        "(path) => document.querySelector('onto-presentation-surface')"
        ".dispatchEvent(new CustomEvent('show-details-requested', { detail: { path } }))",
        relative_path,
    )
    page.wait_for_timeout(200)


def test_closed_image_tile_does_not_read_the_real_file_until_opened(page, tmp_path):
    relative_path = "photos/site1/photo1.jpg"
    _write_container(tmp_path, relative_path=relative_path, content=b"\xff\xd8\xff\xe0fake")
    entity = _entity(resource_id="urn:file:photo1", relative_path=relative_path)
    index_path = _write_index(tmp_path, tile_js=IMAGE_TILE_JS, tile_tag="onto-image-file-tile", entity=entity)

    requested: list[str] = []
    page.on("request", lambda request: requested.append(request.url))

    page.goto(index_path.as_uri())
    page.wait_for_timeout(200)
    assert not _requests_matching(requested, "photo1.jpg"), (
        "onto-image-file-tile read the real file while data-tile-closed=true"
    )

    _open_tile(page, relative_path)
    assert _requests_matching(requested, "photo1.jpg"), (
        "onto-image-file-tile should load the real file once opened"
    )


def test_closed_csv_tile_does_not_read_the_real_file_until_opened(page, tmp_path):
    relative_path = "data/readings.csv"
    _write_container(tmp_path, relative_path=relative_path, content=b"a,b\n1,2\n")
    entity = _entity(resource_id="urn:file:readings", relative_path=relative_path)
    index_path = _write_index(tmp_path, tile_js=CSV_TILE_JS, tile_tag="onto-csv-file-tile", entity=entity)

    requested: list[str] = []
    page.on("request", lambda request: requested.append(request.url))

    page.goto(index_path.as_uri())
    page.wait_for_timeout(200)
    assert not _requests_matching(requested, "readings.csv"), (
        "onto-csv-file-tile read the real file while data-tile-closed=true"
    )

    _open_tile(page, relative_path)
    assert _requests_matching(requested, "readings.csv"), (
        "onto-csv-file-tile should load the real file once opened"
    )
