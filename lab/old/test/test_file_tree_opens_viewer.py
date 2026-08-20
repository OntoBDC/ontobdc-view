"""Opening a file from `onto-file-tree-tile` reveals the single Surface-wide
`onto-file-viewer-tile` and points its `<iframe>` at the standalone
`onto-file-viewer.html` page, with the path passed by reference in the
query string -- rather than embedding a per-file preview Tile in the main
Surface. The main Surface (and everything embedded in it) must only ever
show RO-Crate metadata; the iframe's real file read only ever happens for
the one file just opened, inside that one always-present viewer Tile.

Needs `page.goto("file://...")` rather than `page.set_content`: a relative
resource path (the iframe's `src`) only produces an inspectable network
request when resolved against a real document URL.
"""

from __future__ import annotations

import json
from pathlib import Path

from ontobdc_view import component_source

FORCE_OPEN_SHADOW_ROOT = """
(() => {
  const original = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    return original.call(this, { ...init, mode: "open" });
  };
})();
"""

SURFACE_JS = component_source("onto-presentation-surface")
TREE_JS = component_source("onto-file-tree-tile")
VIEWER_TILE_JS = component_source("onto-file-viewer-tile")


def _write_container(tmp_path: Path) -> Path:
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "table_1.csv").write_text("a,b\n1,2\n", encoding="utf-8")
    (tmp_path / ".__ontobdc__").mkdir()
    (tmp_path / ".__ontobdc__" / "onto-file-viewer.html").write_text(
        "<!doctype html><title>stub</title>", encoding="utf-8"
    )

    entity = {
        "@id": "urn:test:files",
        "http://purl.org/dc/terms/title": [{"@value": "Files"}],
        "http://ontobdc.org/ontology/domain/ns.ttl#filePath": [
            {"@value": "data/table_1.csv"},
        ],
    }
    index_path = tmp_path / "index.html"
    index_path.write_text(
        f"""<!doctype html>
<html><head>
<script type="application/json" id="ontobdc-surface-jsonld">{json.dumps([entity])}</script>
<script type="module">{FORCE_OPEN_SHADOW_ROOT}</script>
<script type="module">{SURFACE_JS}</script>
<script type="module">{TREE_JS}</script>
<script type="module">{VIEWER_TILE_JS}</script>
</head>
<body>
  <onto-presentation-surface>
    <onto-file-tree-tile surface-region="content" data-ontobdc-resource="urn:test:files"></onto-file-tree-tile>
    <onto-file-viewer-tile surface-region="content" data-tile-closed="true"></onto-file-viewer-tile>
  </onto-presentation-surface>
</body></html>""",
        encoding="utf-8",
    )
    return index_path


def test_double_clicking_a_file_reveals_the_viewer_tile_pointed_at_it(page, tmp_path: Path):
    index_path = _write_container(tmp_path)
    real_csv_uri = (tmp_path / "data" / "table_1.csv").as_uri()

    requested: list[str] = []
    page.on("request", lambda req: requested.append(req.url))

    page.goto(index_path.as_uri())
    page.wait_for_function("customElements.get('onto-file-viewer-tile') !== undefined")
    page.wait_for_timeout(200)

    csv_requests_before = [u for u in requested if u == real_csv_uri]
    assert not csv_requests_before, "the real file must not be read before it is opened"

    viewer_state_before = page.evaluate(
        "() => document.querySelector('onto-file-viewer-tile').dataset.tileClosed"
    )
    assert viewer_state_before == "true"

    page.evaluate(
        """() => {
            const tree = document.querySelector('onto-file-tree-tile');
            tree.shadowRoot.querySelector('[data-action="expand-all"]')?.click();
        }"""
    )
    page.wait_for_timeout(200)

    clicked = page.evaluate(
        """() => {
            const tree = document.querySelector('onto-file-tree-tile');
            const row = tree.shadowRoot.querySelector('[data-path="data/table_1.csv"]');
            if (!row) return 'no-row';
            row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
            return 'dispatched';
        }"""
    )
    assert clicked == "dispatched"
    page.wait_for_timeout(300)

    viewer_state_after = page.evaluate(
        "() => document.querySelector('onto-file-viewer-tile').dataset.tileClosed"
    )
    assert viewer_state_after is None, "the viewer Tile should be revealed after opening a file"

    iframe_src = page.evaluate(
        """() => document.querySelector('onto-file-viewer-tile').shadowRoot
            .querySelector('iframe')?.getAttribute('src')"""
    )
    expected_viewer_uri = (tmp_path / ".__ontobdc__" / "onto-file-viewer.html").as_uri()
    assert iframe_src == f"{expected_viewer_uri}?path=data%2Ftable_1.csv"

    csv_requests_after = [u for u in requested if u == real_csv_uri]
    assert not csv_requests_after, (
        "opening the viewer stub (which never fetches the CSV itself) must "
        "not have caused any read of the real file either"
    )
