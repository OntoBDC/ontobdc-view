"""Third-party browser libraries a Page's runtime needs, served as source.

A Page lists every runtime file it loads, and the generation pipeline writes
each of those files by asking this package for its content. A vendored
library is no different from a generated script as far as that pipeline is
concerned -- it is a name on the Page's list that has to resolve to text --
so it is served the same way rather than through a copy step of its own. A
file the Page names but nothing can produce is exactly how a runtime ends up
missing at load time with no build error to show for it.
"""
from __future__ import annotations

from importlib.resources import files
from importlib.resources.abc import Traversable

VENDOR_SHEET_JS_NAME: str = "xlsx-0.18.5.full.min"


def vendor_asset_root() -> Traversable:
    return files("ontobdc_view").joinpath("component", "asset", "vendor")


def vendor_asset_source(name: str, *, encoding: str = "utf-8") -> str:
    """Return a vendored library's source by the name the Page loads it as."""
    asset: Traversable = vendor_asset_root().joinpath(f"{name}.js")
    try:
        return asset.read_text(encoding=encoding)
    except (FileNotFoundError, OSError) as error:
        raise ValueError(
            f"Vendored browser asset is not packaged with ontobdc_view: {name}"
        ) from error
