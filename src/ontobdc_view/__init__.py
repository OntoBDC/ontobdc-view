from .component.adapter.source import ComponentSourceAdapter
from .component.adapter.source import theme_catalog as _theme_catalog
from .page.adapter.asset import PageAssetAdapter
from .page.adapter.entity_view import EntityViewRenderAdapter
from .page.adapter.gantt_script import GanttScriptAdapter
from .page.adapter.work_stream import WorkStreamScriptAdapter

__all__ = [
    "__version__",
    "component_source",
    "theme_catalog",
    "page_asset_root",
    "page_asset_path",
    "read_page_asset",
    "render_entity_view",
    "file_viewer_source",
    "work_stream_script_source",
    "gantt_script_source",
]

__version__ = "0.1.0"

_page_asset = PageAssetAdapter()

component_source = ComponentSourceAdapter().component_source
# The catalog `onto-theme-tile` is built with. Public so the generation
# pipeline can declare the same first-entry default in the page URL that
# the tile itself falls back to, instead of hardcoding a second copy.
theme_catalog = _theme_catalog
page_asset_root = _page_asset.page_asset_root
page_asset_path = _page_asset.page_asset_path
read_page_asset = _page_asset.read_page_asset
file_viewer_source = _page_asset.file_viewer_source
render_entity_view = EntityViewRenderAdapter().render_entity_view
work_stream_script_source = WorkStreamScriptAdapter().script_source
gantt_script_source = GanttScriptAdapter().script_source
