from abc import ABC, abstractmethod
from importlib.resources.abc import Traversable


class PageAssetPort(ABC):
    """Resolves and reads a Page's packaged assets (Jinja template, CSS, JS).

    Mirrors `ComponentSourcePort`'s role for Tiles, but for the built-in
    Page detail views (e.g. the WorkStream 5W2H page) and the standalone
    file-viewer page, both packaged under `ontobdc_view/page/asset/`.
    """

    @abstractmethod
    def page_asset_root(self) -> Traversable:
        """Return the Traversable root containing Page HTML/CSS/JS assets."""

    @abstractmethod
    def page_asset_path(self, name: str) -> Traversable:
        """Return a packaged Page asset's Traversable path by filename."""

    @abstractmethod
    def read_page_asset(self, name: str, *, encoding: str = "utf-8") -> str:
        """Read a packaged Page asset (template/CSS/JS) as text."""

    @abstractmethod
    def file_viewer_source(self) -> str:
        """Return the standalone file-viewer page's ready-to-write HTML.

        This is the one place any real container file is ever read from
        the generated Surface: the main `index.html` (and every Tile it
        embeds) shows only RO-Crate metadata, never file bytes.
        `onto-file-tree-tile` opens this page (written inside the ignored
        OntoBDC marker directory at `.__ontobdc__/onto-file-viewer.html`,
        so it never surfaces as a user file) with the clicked file's path
        passed by reference in the query string (`?path=...`) — only then
        does a real file ever get requested, and only that one file.
        """
