from __future__ import annotations

from importlib.resources import files
from importlib.resources.abc import Traversable

from ontobdc_view.shared.domain.port.page_asset import PageAssetPort


class PageAssetAdapter(PageAssetPort):
    """Reads Page HTML/CSS/JS assets packaged under `ontobdc_view/page/asset/`."""

    def page_asset_root(self) -> Traversable:
        return files("ontobdc_view").joinpath("page", "asset")

    def page_asset_path(self, name: str) -> Traversable:
        return self.page_asset_root().joinpath(name)

    def read_page_asset(self, name: str, *, encoding: str = "utf-8") -> str:
        return self.page_asset_path(name).read_text(encoding=encoding)

    def file_viewer_source(self) -> str:
        return self.read_page_asset("file_viewer.html")
