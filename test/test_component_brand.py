import json
import re
from pathlib import Path

from ontobdc_view.component.adapter.source import ComponentSourceAdapter

_BRAND_RE = re.compile(r"const BRAND = (.*?);")


def _brand_from_source(source: str) -> dict:
    return json.loads(_BRAND_RE.search(source).group(1))


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


def test_malformed_project_config_falls_back_to_default_brand(tmp_path: Path):
    config_dir = tmp_path / ".__ontobdc__"
    config_dir.mkdir()
    (config_dir / "config.yaml").write_text("brand: [not, a, mapping]\n", encoding="utf-8")

    brand = _brand_from_source(
        ComponentSourceAdapter().component_source("onto-logo-tile", root_path=str(tmp_path))
    )
    assert brand["name"] == "OntoBDC"
