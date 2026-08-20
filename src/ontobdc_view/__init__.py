from .component.adapter.source import ComponentSourceAdapter
from .page.adapter.asset import PageAssetAdapter
from .page.adapter.entity_view_render import EntityViewRenderAdapter
from .page.adapter.work_stream_script import WorkStreamScriptAdapter

__all__ = [
    "__version__",
    "component_source",
    "page_asset_root",
    "page_asset_path",
    "read_page_asset",
    "render_entity_view",
    "file_viewer_source",
    "work_stream_script_source",
]

__version__ = "0.1.0"

_page_asset = PageAssetAdapter()

component_source = ComponentSourceAdapter().component_source
page_asset_root = _page_asset.page_asset_root
page_asset_path = _page_asset.page_asset_path
read_page_asset = _page_asset.read_page_asset
file_viewer_source = _page_asset.file_viewer_source
render_entity_view = EntityViewRenderAdapter().render_entity_view
work_stream_script_source = WorkStreamScriptAdapter().script_source
