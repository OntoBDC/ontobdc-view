from ontobdc_view.component.plugin.file_size_tile import FileSizeTileComponent


def test_file_size_tile_is_fixed_one_by_one_chrome_tile():
    metadata = FileSizeTileComponent.METADATA
    assert metadata.tile_class.endswith("#FileSizeTile")
    assert metadata.required_uris == []
    assert metadata.min_columns == metadata.max_columns == 1
    assert metadata.min_rows == metadata.max_rows == 1
