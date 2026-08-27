"""Every runtime file a Page loads has to be producible by this package.

The Gantt Page listed `xlsx-0.18.5.full.min` among its `<script src>` tags
while no adapter could produce it and nothing copied it into the container.
Nothing failed at build time; the page simply came up with its runtime
missing, which on `file://` reads as nine dead script tags and an empty
chart. A name on a Page's list that resolves to nothing is the whole defect,
so this pins the two lists against the two adapters that serve them.
"""
import re
from pathlib import Path
from typing import List, Tuple

import pytest

import ontobdc_view

SOURCE: str = (
    Path(__file__).resolve().parents[1]
    / "src/ontobdc_view/page/adapter/entity_view.py"
).read_text(encoding="utf-8")


def names_in(list_name: str) -> Tuple[str, ...]:
    block = re.search(rf"{list_name}[^)]*\)", SOURCE, re.DOTALL)
    assert block, f"{list_name} not found in entity_view.py"
    return tuple(re.findall(r'"([^"]+)"', block.group(0)))


GANTT_NAMES: Tuple[str, ...] = names_in("_GANTT_SCRIPT_NAMES")
WORKSTREAM_NAMES: Tuple[str, ...] = names_in("_WORKSTREAM_SCRIPT_NAMES")


@pytest.mark.parametrize("name", GANTT_NAMES)
def test_every_gantt_script_the_page_loads_can_be_produced(name: str) -> None:
    source: str = ontobdc_view.gantt_script_source(name)
    assert source.strip(), name


@pytest.mark.parametrize("name", WORKSTREAM_NAMES)
def test_every_work_stream_script_the_page_loads_can_be_produced(
    name: str,
) -> None:
    source: str = ontobdc_view.work_stream_script_source(name)
    assert source.strip(), name


def test_the_vendored_sheet_js_is_served_like_any_other_runtime_file() -> None:
    """Not through a copy step of its own: the pipeline writes what
    `script_source` returns, so a vendored library has to arrive that way
    or it does not arrive at all."""
    from ontobdc_view.shared.adapter.vendor import VENDOR_SHEET_JS_NAME

    assert VENDOR_SHEET_JS_NAME in GANTT_NAMES
    assert VENDOR_SHEET_JS_NAME in WORKSTREAM_NAMES

    source: str = ontobdc_view.gantt_script_source(VENDOR_SHEET_JS_NAME)
    assert len(source) > 100_000, "this should be the real SheetJS build"
    assert "XLSX" in source
    assert source == ontobdc_view.work_stream_script_source(VENDOR_SHEET_JS_NAME)


def test_an_unpackaged_vendor_asset_is_reported_not_returned_empty() -> None:
    from ontobdc_view.shared.adapter.vendor import vendor_asset_source

    with pytest.raises(ValueError, match="not packaged"):
        vendor_asset_source("nao-existe-esta-lib")


def test_the_two_pages_agree_on_the_vendored_build() -> None:
    """One library, one version, both Pages -- a second copy at a different
    version is a bug that only shows up in whichever page loads it second."""
    vendored: List[str] = sorted(
        name for name in set(GANTT_NAMES) | set(WORKSTREAM_NAMES)
        if name.startswith("xlsx-")
    )
    assert len(vendored) == 1, vendored
