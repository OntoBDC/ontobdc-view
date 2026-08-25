"""The Logo/Language/Theme controls must persist a selection on their own.

`onto-language-tile` and `onto-theme-tile` prefer the page's URL-state
runtime, which ontobdc embeds and which keeps every parameter and every
internal link consistent. That runtime ships from a *different* package on
its own version line, so a Tile that only ever calls through it regresses
the moment the two are not in lockstep — silently, because an optional call
on a missing object is a no-op, not an error. The symptom is precisely the
bug these Tiles exist to not have: the control repaints the page, the
address bar never changes, and a reload reverts the selection.

These tests pin the fallback so that cannot come back.
"""
import re
from pathlib import Path

import pytest

ASSETS = Path(__file__).resolve().parents[1] / "src/ontobdc_view/component/asset"

TILES = [("onto-theme-tile.js", "THEME_PARAM"), ("onto-language-tile.js", "LANGUAGE_PARAM")]


@pytest.fixture(params=TILES, ids=[name for name, _ in TILES])
def tile(request):
    name, parameter = request.param
    return name, parameter, (ASSETS / name).read_text(encoding="utf-8")


def test_prefers_the_central_url_state_runtime(tile):
    _, _, source = tile
    assert "window.ontobdcUrlState" in source
    assert "state.select(" in source


def test_writes_the_parameter_itself_when_the_runtime_is_absent(tile):
    _, _, source = tile
    fallback = source[source.index("function selectUrlParam") :]
    fallback = fallback[: fallback.index("\n}\n") + 3]
    # The fallback has to do the whole job: build the URL and navigate.
    assert "new URL(location.href)" in fallback
    assert "searchParams.set(name, value)" in fallback
    assert "location.assign(" in fallback


def test_the_selection_never_routes_through_an_optional_call(tile):
    """`urlState()?.select(...)` is how this regressed: no runtime, no write,
    no error. The persist path must not be optional-chained."""
    _, _, source = tile
    assert not re.search(r"\?\.\s*select\s*\(", source)


def test_persist_is_invoked_on_every_change_path(tile):
    name, parameter, source = tile
    persist = "#persistThemeInUrl" if "theme" in name else "#persistLanguageInUrl"
    # Both the cycling control and the programmatic setter must persist.
    assert source.count(f"this.{persist}(") == 2
    assert f"selectUrlParam({parameter}," in source


def test_reads_the_parameter_without_depending_on_the_runtime(tile):
    _, parameter, source = tile
    assert f"new URLSearchParams(location.search).get({parameter})" in source


# ---------------------------------------------------------------- every tile

LINK_TILES = ["onto-workstream-tile.js", "onto-file-viewer-tile.js"]


@pytest.fixture(params=LINK_TILES)
def link_tile(request):
    return request.param, (ASSETS / request.param).read_text(encoding="utf-8")


def test_link_tiles_carry_presentation_state_without_the_runtime(link_tile):
    """A Tile that only decorates when the runtime happens to be there stops
    carrying language and theme onto the page it opens — silently."""
    _, source = link_tile
    assert "decorateInternalUrl" in source
    helper = source[source.index("function decorateInternalUrl") :]
    helper = helper[: helper.index("\n}\n") + 3]
    assert "new URL(href, location.href)" in helper
    assert "searchParams.set(name, carried)" in helper
    # Falls back to what the document is rendering, for a URL never normalized.
    assert "APPLIED_PRESENTATION_STATE" in source


def test_no_tile_routes_its_only_url_work_through_an_optional_call():
    """The regression shape, checked across every Tile at once."""
    offenders = []
    for path in sorted(ASSETS.glob("*.js")):
        source = path.read_text(encoding="utf-8")
        if "ontobdcUrlState" not in source:
            continue
        if re.search(r"ontobdcUrlState\?\.\s*(select|decorate)", source):
            offenders.append(path.name)
    assert not offenders, f"optional-only URL state in: {offenders}"


def test_every_tile_touching_url_state_declares_a_fallback():
    for path in sorted(ASSETS.glob("*.js")):
        source = path.read_text(encoding="utf-8")
        if "ontobdcUrlState" not in source:
            continue
        assert "selectUrlParam" in source or "decorateInternalUrl" in source, (
            f"{path.name} uses the runtime with no self-sufficient path"
        )
