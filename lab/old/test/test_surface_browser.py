"""Browser-level behavior of `onto-presentation-surface` (closed shadow root).

`onto-presentation-surface` uses `attachShadow({ mode: "closed" })`, so a
plain `page.evaluate` can't reach `element.shadowRoot`. There is no prior
Playwright/CDP precedent in this monorepo to follow (verified — none of the
submodules had browser test infra before this change), so the technique
established here is: an init script that forces every `attachShadow` call to
`mode: "open"` before the component module ever runs. This only affects what
test code can *observe*; the component still requests `mode: "closed"`, and
nothing about its actual layout/CSS/event behavior changes.
"""

from __future__ import annotations

import json
from typing import Any, Dict

import pytest

from ontobdc_view import component_source

FORCE_OPEN_SHADOW_ROOT = """
(() => {
  const original = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    return original.call(this, { ...init, mode: "open" });
  };
})();
"""

BASE_STYLE = """
<style>
  html, body { margin: 0; height: 100%; }
  onto-presentation-surface { display: block; width: 900px; height: 600px; }
</style>
"""


def _semantic_definition(*, content_scrollable: bool = True) -> Dict[str, Any]:
    return {
        "columns": 12,
        "rows": 12,
        "slotTarget": 72,
        "gap": 12,
        "padding": 16,
        "regions": [
            {
                "iri": "urn:ontobdc:screen:operation",
                "role": "OperationRegion",
                "rowStart": 1,
                "columnStart": 1,
                "rowSpan": 1,
                "columnSpan": 12,
                "scrollable": False,
                "placements": [
                    {"iri": "urn:ontobdc:screen:logoPlacement", "tag": "x-logo", "alignment": "start", "order": 10},
                    {"iri": "urn:ontobdc:screen:themePlacement", "tag": "x-theme", "alignment": "end", "order": 10},
                    {"iri": "urn:ontobdc:screen:loginPlacement", "tag": "x-login", "alignment": "end", "order": 20},
                ],
            },
            {
                "iri": "urn:ontobdc:screen:content",
                "role": "ContentRegion",
                "rowStart": 2,
                "columnStart": 1,
                "rowSpan": 10,
                "columnSpan": 12,
                "scrollable": content_scrollable,
                "placements": [],
            },
            {
                "iri": "urn:ontobdc:screen:pinned",
                "role": "PinnedRegion",
                "rowStart": 12,
                "columnStart": 1,
                "rowSpan": 1,
                "columnSpan": 12,
                "scrollable": False,
                "placements": [],
            },
        ],
    }


def _load_surface(page, *, body: str = "") -> None:
    surface_js = component_source("onto-presentation-surface")
    page.set_content(
        f"""<!doctype html>
<html><head>{BASE_STYLE}</head><body>
  <onto-presentation-surface id="surface">{body}</onto-presentation-surface>
  <script type="module">
{FORCE_OPEN_SHADOW_ROOT}
{surface_js}
  </script>
</body></html>"""
    )
    page.wait_for_function("customElements.get('onto-presentation-surface') !== undefined")


def _set_definition(page, definition: Dict[str, Any]) -> None:
    page.evaluate(
        "(definition) => { document.querySelector('#surface').surfaceDefinition = definition; }",
        definition,
    )


def _region_ids(page) -> list:
    return page.evaluate(
        "() => Array.from(document.querySelector('#surface').shadowRoot.querySelectorAll('[data-region]'))"
        ".map(el => el.dataset.region)"
    )


def test_semantic_definition_renders_all_declared_regions(page):
    _load_surface(page)
    _set_definition(page, _semantic_definition())
    assert set(_region_ids(page)) == {"operation", "content", "pinned"}


def test_scrollable_follows_region_definition(page):
    _load_surface(page)
    _set_definition(page, _semantic_definition(content_scrollable=True))
    scrollable = page.evaluate(
        "() => document.querySelector('#surface').shadowRoot"
        ".querySelector('[data-region=\"content\"]').dataset.scrollable"
    )
    assert scrollable == "true"


def test_non_scrollable_content_region_does_not_get_legacy_scroll_default(page):
    _load_surface(page)
    _set_definition(page, _semantic_definition(content_scrollable=False))
    scrollable = page.evaluate(
        "() => document.querySelector('#surface').shadowRoot"
        ".querySelector('[data-region=\"content\"]').dataset.scrollable"
    )
    overflow_y = page.evaluate(
        "() => getComputedStyle(document.querySelector('#surface').shadowRoot"
        ".querySelector('[data-region=\"content\"]')).overflowY"
    )
    assert scrollable == "false"
    assert overflow_y == "hidden"


def test_logo_at_start_theme_and_login_at_declared_end_order(page):
    body = (
        '<x-login surface-region="operation" columns="1"></x-login>'
        '<x-logo surface-region="operation" columns="2"></x-logo>'
        '<x-theme surface-region="operation" columns="1"></x-theme>'
    )
    _load_surface(page, body=body)
    _set_definition(page, _semantic_definition())

    order = page.evaluate(
        "() => Array.from(document.querySelector('#surface').children)"
        ".map(el => ({tag: el.localName, order: getComputedStyle(el).order}))"
        ".sort((a, b) => Number(a.order) - Number(b.order))"
        ".map(item => item.tag)"
    )
    assert order == ["x-logo", "x-theme", "x-login"]


def test_end_aligned_operation_tiles_are_visually_pushed_to_the_far_edge(page):
    # Order alone (previous test) isn't the same as actually landing at the
    # opposite edge — this asserts real screen-space separation between the
    # start-aligned Logo and the end-aligned group, not just relative order.
    body = (
        '<x-logo surface-region="operation" columns="1"></x-logo>'
        '<x-theme surface-region="operation" columns="1"></x-theme>'
    )
    _load_surface(page, body=body)
    _set_definition(page, _semantic_definition())

    logo_right = page.evaluate("() => document.querySelector('x-logo').getBoundingClientRect().right")
    theme_left = page.evaluate("() => document.querySelector('x-theme').getBoundingClientRect().left")
    surface_width = page.evaluate("() => document.querySelector('#surface').getBoundingClientRect().width")

    gap = theme_left - logo_right
    assert gap > surface_width * 0.5  # most of the row's width, not just the base 12px item gap


def test_bounded_region_height_matches_one_slot_without_declared_geometry(page):
    # Regression: a SurfaceDefinition/DefaultSurfaceLayout with regions but
    # no columnCount/rowCount/rowStart geometry (e.g. the shipped
    # ontobdc_view.default_surface_layouts()) must not let an implicit `1fr`
    # row stretch a bounded region far past its own content height.
    body = '<x-logo surface-region="operation"></x-logo>'
    definition = _semantic_definition()
    definition["columns"] = None
    definition["rows"] = None
    for region in definition["regions"]:
        region["rowStart"] = None
        region["columnStart"] = None
        region["rowSpan"] = None
        region["columnSpan"] = None
    _load_surface(page, body=body)
    _set_definition(page, definition)

    operation_height = page.evaluate(
        "() => document.querySelector('#surface').shadowRoot"
        ".querySelector('[data-region-role=\"OperationRegion\"]').getBoundingClientRect().height"
    )
    slot_size = page.evaluate("() => document.querySelector('#surface').slotSize")
    assert operation_height < slot_size * 2


def test_pin_places_tile_in_pinned_region_and_unpin_reverts(page):
    body = '<x-note surface-region="content" columns="2" rows="1"></x-note>'
    _load_surface(page, body=body)
    _set_definition(page, _semantic_definition())

    pinned = page.evaluate("() => document.querySelector('#surface').pin(document.querySelector('x-note'))")
    assert pinned is True
    region_after_pin = page.evaluate("() => document.querySelector('x-note').getAttribute('surface-region')")
    assert region_after_pin == "pinned"

    unpinned = page.evaluate("() => document.querySelector('#surface').unpin(document.querySelector('x-note'))")
    assert unpinned is True
    region_after_unpin = page.evaluate("() => document.querySelector('x-note').getAttribute('surface-region')")
    assert region_after_unpin == "content"


def test_bring_to_front_and_send_to_end_still_work_in_content_region(page):
    body = (
        '<x-a surface-region="content" data-id="a"></x-a>'
        '<x-b surface-region="content" data-id="b"></x-b>'
    )
    _load_surface(page, body=body)
    _set_definition(page, _semantic_definition())

    page.evaluate("() => document.querySelector('#surface').bringToFront(document.querySelector('[data-id=\"b\"]'))")
    order_after_front = page.evaluate("() => Array.from(document.querySelectorAll('[data-id]')).map(el => el.dataset.id)")
    assert order_after_front == ["b", "a"]

    page.evaluate("() => document.querySelector('#surface').sendToEnd(document.querySelector('[data-id=\"b\"]'))")
    order_after_end = page.evaluate("() => Array.from(document.querySelectorAll('[data-id]')).map(el => el.dataset.id)")
    assert order_after_end == ["a", "b"]


def test_hidden_file_tiles_stay_hidden_until_opened(page):
    body = '<x-file surface-region="content" data-tile-closed="true"></x-file>'
    _load_surface(page, body=body)
    _set_definition(page, _semantic_definition())

    state = page.evaluate("() => document.querySelector('x-file').dataset.surfaceState")
    assert state == "unplaced"

    page.evaluate("() => { delete document.querySelector('x-file').dataset.tileClosed; document.querySelector('#surface').relayout(); }")
    state_after_open = page.evaluate("() => document.querySelector('x-file').dataset.surfaceState")
    assert state_after_open != "unplaced"


def test_resize_recalculates_allocation_without_changing_semantic_order(page):
    body = (
        '<x-logo surface-region="operation" columns="2"></x-logo>'
        '<x-theme surface-region="operation" columns="1"></x-theme>'
    )
    _load_surface(page, body=body)
    _set_definition(page, _semantic_definition())

    page.evaluate("() => { document.querySelector('#surface').style.width = '500px'; }")
    page.wait_for_timeout(150)

    tags_after_resize = page.evaluate(
        "() => Array.from(document.querySelector('#surface').children)"
        ".map(el => ({tag: el.localName, order: getComputedStyle(el).order}))"
        ".sort((a, b) => Number(a.order) - Number(b.order))"
        ".map(item => item.tag)"
    )
    assert tags_after_resize == ["x-logo", "x-theme"]


def test_legacy_fallback_still_renders_without_a_surface_definition(page):
    body = '<x-note surface-region="content"></x-note>'
    _load_surface(page, body=body)

    assert set(_region_ids(page)) == {"operation", "content", "pinned"}
    scrollable = page.evaluate(
        "() => document.querySelector('#surface').shadowRoot"
        ".querySelector('[data-region=\"content\"]').dataset.scrollable"
    )
    assert scrollable == "true"


def test_real_tile_assets_render_inside_semantic_operation_region(page):
    surface_js = component_source("onto-presentation-surface")
    logo_js = component_source("onto-logo-tile")
    theme_js = component_source("onto-theme-tile")
    page.set_content(
        f"""<!doctype html>
<html><head>{BASE_STYLE}</head><body>
  <onto-presentation-surface id="surface">
    <onto-logo-tile surface-region="operation" columns="2"></onto-logo-tile>
    <onto-theme-tile surface-region="operation" columns="1"></onto-theme-tile>
  </onto-presentation-surface>
  <script type="module">
{FORCE_OPEN_SHADOW_ROOT}
{surface_js}
{theme_js}
{logo_js}
  </script>
</body></html>"""
    )
    page.wait_for_function("customElements.get('onto-presentation-surface') !== undefined")

    definition = _semantic_definition()
    definition["regions"][0]["placements"] = [
        {"iri": "p1", "tag": "onto-logo-tile", "alignment": "start", "order": 10},
        {"iri": "p2", "tag": "onto-theme-tile", "alignment": "end", "order": 10},
    ]
    _set_definition(page, definition)

    placed = page.evaluate(
        "() => Array.from(document.querySelectorAll('onto-logo-tile, onto-theme-tile'))"
        ".every(el => el.dataset.surfaceState !== 'unplaced')"
    )
    assert placed


# --- claude2.md: DefaultSurfaceLayout selection by available surface size ---
#
# Default `slotTarget=72, gap=12, padding=16` give
# `columns = floor((width - 32 + 12) / 84)`. Widths below are chosen to land
# deterministically inside each tier of the doc's own compact(1-4)/
# regular(5-8)/wide(9+) example; each test also reads `surface.columns` back
# so a miscalculated width fails with a clear number rather than a confusing
# IRI mismatch.

def _operation_region(iri, placements, scrollable=False):
    return {
        "iri": iri,
        "role": "OperationRegion",
        "rowStart": 1, "columnStart": 1, "rowSpan": 1, "columnSpan": 12,
        "scrollable": scrollable,
        "placements": placements,
    }


def _plain_region(iri, role, scrollable):
    return {
        "iri": iri, "role": role,
        "rowStart": None, "columnStart": None, "rowSpan": None, "columnSpan": None,
        "scrollable": scrollable, "placements": [],
    }


def _tiered_layout(name, min_columns, max_columns, operation_placements):
    return {
        "iri": f"urn:ontobdc:layout:{name}",
        "columns": max_columns or 12, "rows": 12, "slotTarget": 72, "gap": 12, "padding": 16,
        "isDefaultLayout": True,
        "minAvailableColumns": min_columns, "maxAvailableColumns": max_columns,
        "minAvailableRows": None, "maxAvailableRows": None, "layoutPriority": 10,
        "regions": [
            _operation_region(f"urn:ontobdc:layout:{name}:operation", operation_placements),
            _plain_region(f"urn:ontobdc:layout:{name}:content", "ContentRegion", True),
            _plain_region(f"urn:ontobdc:layout:{name}:pinned", "PinnedRegion", False),
        ],
    }


def _placement(tag, alignment, order):
    return {"iri": f"urn:placement:{tag}:{alignment}:{order}", "tag": tag, "alignment": alignment, "order": order}


COMPACT_LAYOUT = _tiered_layout(
    "compact", 1, 4,
    [_placement("x-logo", "start", 10), _placement("x-login", "end", 10)],
)
REGULAR_LAYOUT = _tiered_layout(
    "regular", 5, 8,
    [_placement("x-logo", "start", 10), _placement("x-theme", "end", 10), _placement("x-login", "end", 20)],
)
WIDE_LAYOUT = _tiered_layout(
    "wide", 9, None,
    [
        _placement("x-logo", "start", 10),
        _placement("x-language", "end", 10),
        _placement("x-theme", "end", 20),
        _placement("x-login", "end", 30),
    ],
)
TIERED_LAYOUTS = [COMPACT_LAYOUT, REGULAR_LAYOUT, WIDE_LAYOUT]

# widths chosen against the formula in the module docstring above
COMPACT_WIDTH = 300   # -> 3 columns
REGULAR_WIDTH = 600   # -> 6 columns
WIDE_WIDTH = 900       # -> 10 columns
WIDE_BOUNDARY_WIDTH = 800   # -> 9 columns (wide's declared lower bound)
REGULAR_BOUNDARY_WIDTH = 700  # -> 8 columns (regular's declared upper bound)


def _load_tiered_surface(page, *, width, body=""):
    _load_surface(page, body=body)
    # Registered as part of this same document (right after `set_content`,
    # before anything that could trigger the first selection) — a listener
    # attached via a separate `page.evaluate` *before* `_load_surface` would
    # be wiped out along with the rest of the old document by `set_content`.
    page.evaluate(
        "() => { window.__defaultLayoutEvents = []; document.addEventListener('surface-default-layout-changed',"
        " (e) => window.__defaultLayoutEvents.push(e.detail)); }"
    )
    page.evaluate(f"() => {{ document.querySelector('#surface').style.width = '{width}px'; }}")
    page.evaluate(
        "(layouts) => { document.querySelector('#surface').defaultSurfaceLayouts = layouts; }",
        TIERED_LAYOUTS,
    )
    page.wait_for_timeout(100)


def _default_layout_events(page):
    return page.evaluate("() => window.__defaultLayoutEvents ?? []")


def test_selection_reported_via_default_layout_changed_event(page):
    _load_tiered_surface(page, width=COMPACT_WIDTH)
    events = _default_layout_events(page)
    assert events[-1]["layoutIri"] == "urn:ontobdc:layout:compact"
    assert events[-1]["isDefaultLayout"] is True
    assert events[-1]["availableColumns"] == 3


def test_regular_width_selects_regular_layout(page):
    _load_tiered_surface(page, width=REGULAR_WIDTH)
    events = _default_layout_events(page)
    assert events[-1]["layoutIri"] == "urn:ontobdc:layout:regular"


def test_wide_width_selects_wide_layout(page):
    _load_tiered_surface(page, width=WIDE_WIDTH)
    events = _default_layout_events(page)
    assert events[-1]["layoutIri"] == "urn:ontobdc:layout:wide"


def test_resize_across_boundary_switches_layout_once(page):
    _load_tiered_surface(page, width=WIDE_BOUNDARY_WIDTH)
    first_selection_count = len(_default_layout_events(page))

    page.evaluate(f"() => {{ document.querySelector('#surface').style.width = '{REGULAR_BOUNDARY_WIDTH}px'; }}")
    page.wait_for_timeout(150)

    events = _default_layout_events(page)
    assert events[first_selection_count - 1]["layoutIri"] == "urn:ontobdc:layout:wide"
    assert events[-1]["layoutIri"] == "urn:ontobdc:layout:regular"
    assert len(events) == first_selection_count + 1


def test_resize_within_same_logical_columns_does_not_switch(page):
    _load_tiered_surface(page, width=WIDE_WIDTH)
    count_after_initial = len(_default_layout_events(page))

    # WIDE_WIDTH=900 -> 10 columns; nudging by a few px stays >= 9 columns
    # (still "wide"), so no new selection event should fire.
    page.evaluate("() => { document.querySelector('#surface').style.width = '905px'; }")
    page.wait_for_timeout(150)

    assert len(_default_layout_events(page)) == count_after_initial


def test_content_tiles_survive_layout_switches(page):
    body = '<x-note surface-region="content" data-marker="kept"></x-note>'
    _load_tiered_surface(page, width=COMPACT_WIDTH, body=body)
    page.evaluate("() => { document.querySelector('x-note').__identity = 'same-node'; }")

    for width in (REGULAR_WIDTH, WIDE_WIDTH, COMPACT_WIDTH):
        page.evaluate(f"() => {{ document.querySelector('#surface').style.width = '{width}px'; }}")
        page.wait_for_timeout(100)

    survived = page.evaluate("() => document.querySelector('x-note')?.__identity")
    assert survived == "same-node"
    assert page.evaluate("() => document.querySelector('x-note').dataset.marker") == "kept"


def test_pin_state_survives_layout_switches(page):
    body = '<x-note surface-region="content"></x-note>'
    _load_tiered_surface(page, width=COMPACT_WIDTH, body=body)
    page.evaluate("() => document.querySelector('#surface').pin(document.querySelector('x-note'))")
    assert page.evaluate("() => document.querySelector('#surface').pinnedItems.length") == 1

    page.evaluate(f"() => {{ document.querySelector('#surface').style.width = '{WIDE_WIDTH}px'; }}")
    page.wait_for_timeout(150)

    assert page.evaluate("() => document.querySelector('#surface').pinnedItems.length") == 1
    assert page.evaluate("() => document.querySelector('#surface').pinnedItems[0] === document.querySelector('x-note')")


def test_closed_file_tile_state_survives_layout_switches(page):
    body = '<x-file surface-region="content" data-tile-closed="true"></x-file>'
    _load_tiered_surface(page, width=COMPACT_WIDTH, body=body)
    assert page.evaluate("() => document.querySelector('x-file').dataset.surfaceState") == "unplaced"

    page.evaluate(f"() => {{ document.querySelector('#surface').style.width = '{WIDE_WIDTH}px'; }}")
    page.wait_for_timeout(150)

    assert page.evaluate("() => document.querySelector('x-file').dataset.tileClosed") == "true"
    assert page.evaluate("() => document.querySelector('x-file').dataset.surfaceState") == "unplaced"


def test_dynamic_content_region_order_survives_layout_switches(page):
    body = '<x-a surface-region="content" data-id="a"></x-a><x-b surface-region="content" data-id="b"></x-b>'
    _load_tiered_surface(page, width=COMPACT_WIDTH, body=body)
    page.evaluate("() => document.querySelector('#surface').bringToFront(document.querySelector('[data-id=\"b\"]'))")

    page.evaluate(f"() => {{ document.querySelector('#surface').style.width = '{WIDE_WIDTH}px'; }}")
    page.wait_for_timeout(150)

    order = page.evaluate("() => Array.from(document.querySelectorAll('[data-id]')).map(el => el.dataset.id)")
    assert order == ["b", "a"]


def test_operation_region_follows_each_selected_layouts_own_placements(page):
    body = (
        '<x-login surface-region="operation"></x-login>'
        '<x-logo surface-region="operation"></x-logo>'
        '<x-theme surface-region="operation"></x-theme>'
        '<x-language surface-region="operation"></x-language>'
    )
    _load_tiered_surface(page, width=COMPACT_WIDTH, body=body)
    compact_order = page.evaluate(
        "() => Array.from(document.querySelector('#surface').operationItems)"
        ".map(el => ({tag: el.localName, order: getComputedStyle(el).order}))"
        ".sort((a, b) => Number(a.order) - Number(b.order)).map(item => item.tag)"
    )
    # compact's OperationRegion only declares Logo (start) and Login (end)
    # (claude2.md example). Theme/Language have no declared placement in
    # this layout, so they land in the undeclared band — after the real
    # start-aligned Logo but still before the declared end-aligned Login.
    assert compact_order[0] == "x-logo"
    assert compact_order[-1] == "x-login"
    assert set(compact_order[1:-1]) == {"x-theme", "x-language"}

    page.evaluate(f"() => {{ document.querySelector('#surface').style.width = '{WIDE_WIDTH}px'; }}")
    page.wait_for_timeout(150)

    wide_order = page.evaluate(
        "() => Array.from(document.querySelector('#surface').operationItems)"
        ".map(el => ({tag: el.localName, order: getComputedStyle(el).order}))"
        ".sort((a, b) => Number(a.order) - Number(b.order)).map(item => item.tag)"
    )
    assert wide_order == ["x-logo", "x-language", "x-theme", "x-login"]


def test_explicit_surface_definition_is_not_replaced_by_default_layouts(page):
    _load_surface(page)
    explicit = _semantic_definition()
    explicit["iri"] = "urn:ontobdc:screen:explicit"
    page.evaluate("(definition) => { document.querySelector('#surface').surfaceDefinition = definition; }", explicit)
    page.evaluate("(layouts) => { document.querySelector('#surface').defaultSurfaceLayouts = layouts; }", TIERED_LAYOUTS)
    page.evaluate(f"() => {{ document.querySelector('#surface').style.width = '{COMPACT_WIDTH}px'; }}")
    page.wait_for_timeout(150)

    assert page.evaluate("() => document.querySelector('#surface').surfaceDefinition.iri") == "urn:ontobdc:screen:explicit"
    region_ids = _region_ids(page)
    assert set(region_ids) == {"operation", "content", "pinned"}
