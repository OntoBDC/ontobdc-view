from ontobdc_view import component_path, read_component
from ontobdc_view.component.plugin.wind_speed_tile import WindSpeedTileComponent


def test_wind_speed_tile_contract():
    metadata = WindSpeedTileComponent.METADATA
    assert metadata.tag == "onto-wind-speed-tile"
    assert metadata.min_columns == 1
    assert metadata.max_columns == 3
    assert metadata.min_rows == 1
    assert metadata.max_rows == 2


def test_wind_speed_tile_asset_is_packaged():
    path = component_path("onto-wind-speed-tile.js")
    assert path.is_file()
    source = read_component("onto-wind-speed-tile.js")
    assert 'customElements.define("onto-wind-speed-tile"' in source
    assert "data-wind-speed" in source
    assert "data-wind-direction" in source
    assert "data-wind-gust" in source
