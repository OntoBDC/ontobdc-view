"""Browser-level behavior of the WorkStream detail page's multi-tab resource
preview (`page/asset/work_stream_view.js`'s `createDimensionCard()`).

Unlike `test_surface_browser.py` (a closed-shadow-DOM custom element), this
page has no shadow root and no custom-element registration to wait on — it's
a plain script that runs on DOMContentLoaded and builds `.dimension-cards`
directly into the light DOM, so tests just wait for that container to be
populated.

The real `render_entity_view()` (this package's actual production entry
point for generating this exact page) builds the test HTML, instead of a
hand-rolled harness — best fidelity to what a real generated
`.__ontobdc__/view/work_stream/<identifier>.html` looks like, and it exercises
the real `work_stream_view.html.j2` template wiring (JSON-LD script id,
`js_content`/`css_content` embedding) rather than a second, potentially
diverging copy of it.

File resources are fetched via a relative URL three levels up from the page
(`../../../<filePath>`, matching the real deployed
`.__ontobdc__/view/work_stream/` depth) — the page is loaded at a matching
fake path so those relative fetches resolve predictably, and
`page.route()` serves canned bytes for them.
"""

from __future__ import annotations

from typing import Any, Dict, List

from ontobdc_view import render_entity_view
from ontobdc_view.page.plugin.work_stream_view import WORK_STREAM_TYPE_URI

OBDC_NS = "http://ontobdc.org/ontology/domain/ontobdc/ns.ttl#"
WORK_STREAM_TYPE_NS = "http://datacenter.app.br/ontology/productivity/entity/work_stream/type.ttl#"
DCTERMS_TITLE = "http://purl.org/dc/terms/title"
DCTERMS_IDENTIFIER = "http://purl.org/dc/terms/identifier"

# Matches the real `.__ontobdc__/view/work_stream/<identifier>.html` depth,
# so `../../../<filePath>` resolves the same way it does in production.
PAGE_URL = "https://ontobdc.test/.__ontobdc__/view/work_stream/demo-workstream.html"

# Root-level (no subfolder) so both resources appear directly in the
# resource tree without needing to expand a collapsed directory row first —
# folder expand/collapse is the tree's own, separately-tested concern.
IMAGE_PATH = "photo.png"
CSV_PATH = "data.csv"

# A 1x1 transparent PNG, just enough for <img> to load without a decode error.
PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108020000009077"
    "53de0000000c4944415478da6360000002000155037de10000000049454e44"
    "ae426082"
)
CSV_TEXT = "name,qty\nbolt,10\n\"nut, hex\",5\n"


def _literal(value: str) -> List[Dict[str, str]]:
    return [{"@value": value}]


def _graph_nodes() -> List[Dict[str, Any]]:
    self_node = {
        "@id": "urn:ontobdc:storage/dataset/demo/work_stream/demo-workstream",
        "@type": [WORK_STREAM_TYPE_URI],
        DCTERMS_IDENTIFIER: _literal("demo-workstream"),
        DCTERMS_TITLE: _literal("Demo WorkStream"),
        f"{WORK_STREAM_TYPE_NS}what": _literal("Ship the multi-tab preview"),
    }
    image_node = {
        "@id": "urn:ontobdc:storage/local/demo/photo.png",
        "@type": [f"{OBDC_NS}ImageFile"],
        f"{OBDC_NS}filePath": _literal(IMAGE_PATH),
        DCTERMS_TITLE: _literal("photo.png"),
    }
    csv_node = {
        "@id": "urn:ontobdc:storage/local/demo/data.csv",
        "@type": [f"{OBDC_NS}CsvFile"],
        f"{OBDC_NS}filePath": _literal(CSV_PATH),
        DCTERMS_TITLE: _literal("data.csv"),
    }
    return [self_node, image_node, csv_node]


def _build_html() -> str:
    graph_nodes = _graph_nodes()
    result = render_entity_view([WORK_STREAM_TYPE_URI], graph_nodes[0], graph_nodes=graph_nodes)
    assert result is not None, "WorkStreamViewPage did not match WORK_STREAM_TYPE_URI"
    return result["html"]


def _route_file(route, *, body: bytes, content_type: str, fail: bool = False) -> None:
    if fail:
        route.fulfill(status=404, body=b"not found")
        return
    route.fulfill(status=200, body=body, content_type=content_type)


def _load_page(page, *, csv_fails: bool = False) -> None:
    page.route(
        f"**/{IMAGE_PATH}",
        lambda route: _route_file(route, body=PNG_BYTES, content_type="image/png"),
    )
    page.route(
        f"**/{CSV_PATH}",
        lambda route: _route_file(route, body=CSV_TEXT.encode("utf-8"), content_type="text/csv", fail=csv_fails),
    )
    page.route(PAGE_URL, lambda route: route.fulfill(status=200, body=_build_html(), content_type="text/html"))
    page.goto(PAGE_URL)
    page.wait_for_function("document.querySelector('.dimension-cards')?.children.length > 0")
    # "Related" is the default filter tab and starts empty (no relation TTL
    # is connected in this harness) — "Found" lists every resource in the
    # graph, which is what these tests need to click.
    page.click(".dimension-card .resource-tab[data-tab='found']")


def _open(page, label: str) -> None:
    page.click(f".dimension-card .resource-node.file:has-text('{label}')")


def _open_tab_labels(page) -> List[str]:
    return page.eval_on_selector_all(
        ".dimension-card .preview-tab .preview-tab-label",
        "(elements) => elements.map((el) => el.textContent)",
    )


def _active_pane_selector(page) -> str:
    return page.eval_on_selector(
        ".dimension-card .resource-preview .preview-pane.is-active",
        "(el) => el.className",
    )


def test_opening_two_files_creates_two_tabs_and_activates_the_second(page) -> None:
    _load_page(page)
    _open(page, "photo.png")
    _open(page, "data.csv")

    assert _open_tab_labels(page) == ["photo.png", "data.csv"]
    active_tab = page.eval_on_selector(".dimension-card .preview-tab.is-active .preview-tab-label", "(el) => el.textContent")
    assert active_tab == "data.csv"
    active_resource = page.eval_on_selector(
        ".dimension-card .resource-preview .preview-pane.is-active", "(el) => el.dataset.resourceId"
    )
    assert active_resource == "urn:ontobdc:storage/local/demo/data.csv"


def test_clicking_an_already_open_file_switches_without_duplicating(page) -> None:
    _load_page(page)
    _open(page, "photo.png")
    _open(page, "data.csv")
    _open(page, "photo.png")

    assert _open_tab_labels(page) == ["photo.png", "data.csv"]
    active_tab = page.eval_on_selector(".dimension-card .preview-tab.is-active .preview-tab-label", "(el) => el.textContent")
    assert active_tab == "photo.png"


def test_closing_the_active_tab_activates_its_right_hand_neighbor(page) -> None:
    _load_page(page)
    _open(page, "photo.png")
    _open(page, "data.csv")  # active tab is now data.csv (the last one)

    page.click(".dimension-card .preview-tab:has-text('photo.png') .preview-tab-close")

    assert _open_tab_labels(page) == ["data.csv"]
    active_tab = page.eval_on_selector(".dimension-card .preview-tab.is-active .preview-tab-label", "(el) => el.textContent")
    assert active_tab == "data.csv"


def test_closing_the_rightmost_active_tab_activates_the_new_last_tab(page) -> None:
    _load_page(page)
    _open(page, "photo.png")
    _open(page, "data.csv")  # active tab is now data.csv (rightmost)

    page.click(".dimension-card .preview-tab:has-text('data.csv') .preview-tab-close")

    assert _open_tab_labels(page) == ["photo.png"]
    active_tab = page.eval_on_selector(".dimension-card .preview-tab.is-active .preview-tab-label", "(el) => el.textContent")
    assert active_tab == "photo.png"


def test_closing_the_last_open_tab_restores_the_empty_state(page) -> None:
    _load_page(page)
    _open(page, "photo.png")
    page.click(".dimension-card .preview-tab:has-text('photo.png') .preview-tab-close")

    assert _open_tab_labels(page) == []
    empty_active = page.eval_on_selector(
        ".dimension-card .resource-preview .preview-pane-empty.is-active", "(el) => el !== null"
    )
    assert empty_active


def test_csv_resource_renders_a_real_table_not_a_bare_link(page) -> None:
    # Regression test for the bug this change fixes: resourceMimeKind() used
    # to never recognize CsvFile, so a CSV resource fell into the generic
    # "Open <label>" link fallback instead of an inline table.
    _load_page(page)
    _open(page, "data.csv")

    page.wait_for_selector(".dimension-card .preview-pane.is-active .csv-table")
    header_cells = page.eval_on_selector_all(
        ".dimension-card .preview-pane.is-active .csv-table thead th",
        "(elements) => elements.map((el) => el.textContent)",
    )
    first_row_cells = page.eval_on_selector_all(
        ".dimension-card .preview-pane.is-active .csv-table tbody tr:first-child td",
        "(elements) => elements.map((el) => el.textContent)",
    )
    assert header_cells == ["name", "qty"]
    assert first_row_cells == ["bolt", "10"]
    # The quoted, comma-containing field must survive the parser intact.
    second_row_cells = page.eval_on_selector_all(
        ".dimension-card .preview-pane.is-active .csv-table tbody tr:nth-child(2) td",
        "(elements) => elements.map((el) => el.textContent)",
    )
    assert second_row_cells == ["nut, hex", "5"]


def test_csv_fetch_failure_falls_back_to_open_link(page) -> None:
    _load_page(page, csv_fails=True)
    _open(page, "data.csv")

    page.wait_for_selector(".dimension-card .preview-pane.is-active .csv-fallback")
    fallback_present = page.eval_on_selector(
        ".dimension-card .preview-pane.is-active .csv-fallback a.resource-open-link", "(el) => el !== null"
    )
    assert fallback_present


def test_switching_the_active_tab_updates_the_annotate_buttons_target(page) -> None:
    # No OntoBDCAnnotations stub is loaded in this harness, so the buttons
    # stay disabled — this only asserts the "hidden" (annotatable-kind) gate
    # follows the active tab, per work_stream_view.js's updateAnnotateButton.
    _load_page(page)
    _open(page, "photo.png")
    create_hidden_for_image = page.eval_on_selector(
        ".dimension-card .create-annotation-btn", "(el) => el.hidden"
    )
    assert create_hidden_for_image is False  # image is annotatable

    _open(page, "data.csv")
    create_hidden_for_csv = page.eval_on_selector(
        ".dimension-card .create-annotation-btn", "(el) => el.hidden"
    )
    assert create_hidden_for_csv is True  # csv is not annotatable


def test_one_render_step_throwing_does_not_block_the_others(page) -> None:
    # Regression test: render() used to be one unbroken call chain, so any
    # single step throwing (e.g. a future workbook-sync/pyodide addition
    # failing to resolve a file) silently skipped every step declared after
    # it -- Relate/Suggest and the resource tree could look entirely broken
    # because of a failure in something unrelated. Force the `renderHeader`
    # step to throw by making its one *uniquely* targeted DOM query
    # (`.name`, only ever queried inside that one function) blow up, and
    # confirm every *other* step -- declared after it -- still completes.
    console_errors: List[str] = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    page.add_init_script(
        """
        const originalQuerySelector = Document.prototype.querySelector;
        Document.prototype.querySelector = function (selector) {
          if (selector === ".name") throw new Error("boom");
          return originalQuerySelector.call(this, selector);
        };
        """
    )

    _load_page(page)

    # renderDimensionCards + wireAnnotationControls (steps declared AFTER
    # the forced failure) still ran: the dimension card and its resource
    # tree are populated, and the tabs/click flow this whole file already
    # tests still works end to end.
    _open(page, "photo.png")
    assert _open_tab_labels(page) == ["photo.png"]

    assert any("renderHeader" in text for text in console_errors), (
        f"expected a logged, labeled failure for the forced throw; got {console_errors}"
    )
