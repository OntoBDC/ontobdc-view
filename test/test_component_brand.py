import json
from pathlib import Path

from ontobdc_view.component.adapter.source import ComponentSourceAdapter

_BRAND_MARKER = "const BRAND = "


def _brand_from_source(source: str) -> dict:
    # A plain non-greedy regex up to the next ";" breaks once mark_svg/
    # logotype_svg embed a data URI (e.g. "data:image/png;base64,...") --
    # the ";" inside that JSON string isn't a statement terminator to the
    # JS parser, but it is to a naive regex. Decode the JSON object
    # in-place instead so embedded ";" characters are handled correctly.
    start = source.index(_BRAND_MARKER) + len(_BRAND_MARKER)
    return json.JSONDecoder().raw_decode(source, start)[0]


def test_default_brand_used_without_root_path():
    brand = _brand_from_source(ComponentSourceAdapter().component_source("onto-logo-tile"))
    assert brand["name"] == "OntoBDC"
    assert "circle" in brand["mark_svg"]


def test_default_brand_used_when_project_has_no_config(tmp_path: Path):
    brand = _brand_from_source(
        ComponentSourceAdapter().component_source("onto-logo-tile", root_path=str(tmp_path))
    )
    assert brand["name"] == "OntoBDC"


def test_project_brand_overrides_only_declared_keys(tmp_path: Path):
    config_dir = tmp_path / ".__ontobdc__"
    config_dir.mkdir()
    (config_dir / "config.yaml").write_text(
        "brand:\n"
        '  name: "Acme Corp"\n'
        '  mark_svg: "<svg>ACME</svg>"\n'
        '  slogan: "Built for concrete"\n',
        encoding="utf-8",
    )

    default_brand = _brand_from_source(ComponentSourceAdapter().component_source("onto-logo-tile"))
    brand = _brand_from_source(
        ComponentSourceAdapter().component_source("onto-logo-tile", root_path=str(tmp_path))
    )

    assert brand["name"] == "Acme Corp"
    assert brand["mark_svg"] == "<svg>ACME</svg>"
    assert brand["slogan"] == "Built for concrete"
    # logotype_svg wasn't declared in the project's override -- keeps the
    # shipped default instead of disappearing.
    assert brand["logotype_svg"] == default_brand["logotype_svg"]


def test_brand_falls_back_to_png_when_svg_is_missing(tmp_path: Path):
    assets_dir = tmp_path / ".__ontobdc__" / "asset"
    assets_dir.mkdir(parents=True)
    png_bytes = bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753"
        "de0000000c4944415408d763f8ffff3f0005fe02fea739669b0000000049454e44ae426082"
    )
    (assets_dir / "OntoBDCBrand.png").write_bytes(png_bytes)
    (assets_dir / "OntoBDCLogotype.png").write_bytes(png_bytes)

    brand = _brand_from_source(
        ComponentSourceAdapter().component_source("onto-logo-tile", root_path=str(tmp_path))
    )

    assert brand["name"] == "OntoBDC"
    assert brand["mark_svg"].startswith('<img src="data:image/png;base64,')
    assert brand["logotype_svg"].startswith('<img src="data:image/png;base64,')


def test_malformed_project_config_falls_back_to_default_brand(tmp_path: Path):
    config_dir = tmp_path / ".__ontobdc__"
    config_dir.mkdir()
    (config_dir / "config.yaml").write_text("brand: [not, a, mapping]\n", encoding="utf-8")

    brand = _brand_from_source(
        ComponentSourceAdapter().component_source("onto-logo-tile", root_path=str(tmp_path))
    )
    assert brand["name"] == "OntoBDC"
