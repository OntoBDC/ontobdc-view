from ontobdc_view import component_path, read_component
from ontobdc_view.component.plugin.date_time_tile import DateTimeTileComponent


def test_date_time_tile_is_packaged():
    assert component_path("onto-date-time-tile.js").is_file()


def test_date_time_tile_contract():
    metadata = DateTimeTileComponent.METADATA
    assert metadata.tag == "onto-date-time-tile"
    assert metadata.min_columns == 1
    assert metadata.max_columns == 2
    assert metadata.min_rows == 1
    assert metadata.max_rows == 1


def test_date_time_tile_progresses_from_time_to_date_time():
    source = read_component("onto-date-time-tile.js")
    assert 'data-layout="date-time"' in source
    assert 'hour: "2-digit"' in source
    assert 'day: "2-digit"' in source
    assert 'customElements.define("onto-date-time-tile"' in source
