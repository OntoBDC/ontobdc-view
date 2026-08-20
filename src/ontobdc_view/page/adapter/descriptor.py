from __future__ import annotations

import importlib
import inspect
import pkgutil
from typing import Iterator, List, Optional, Type

from ontobdc.shared.domain.port.page import PagePort

from ontobdc_view.shared.domain.port.page_descriptor import PageDescriptorPort


class PageDescriptorAdapter(PageDescriptorPort):
    """Discovers `PagePort` subclasses registered under
    `ontobdc_view.page.plugin` and matches one by entity type URIs.
    """

    def matching_descriptor(
        self, entity_type_uris: List[str]
    ) -> Optional[Type[PagePort]]:
        type_set = set(entity_type_uris)
        for descriptor in self._iter_descriptors():
            required = set(descriptor.METADATA.required_uris)
            if required & type_set:
                return descriptor
        return None

    def _iter_descriptors(self) -> Iterator[Type[PagePort]]:
        package = importlib.import_module("ontobdc_view.page.plugin")
        package_prefix = f"{package.__name__}."
        for _, name, _ in pkgutil.walk_packages(package.__path__, package_prefix):
            module = importlib.import_module(name)
            for _, obj in inspect.getmembers(module):
                if not inspect.isclass(obj):
                    continue
                try:
                    if not issubclass(obj, PagePort) or obj is PagePort:
                        continue
                except TypeError:
                    continue
                yield obj
