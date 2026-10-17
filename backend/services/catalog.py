import json
from pathlib import Path

from pydantic import ValidationError

from schemas import CatalogItemResponse, CatalogResponse


class CatalogConfigurationError(RuntimeError):
    pass


class TownCatalog:
    def __init__(self, items: list[CatalogItemResponse]) -> None:
        self.items = items
        self._items_by_id = {item.id: item for item in items}
        if len(self._items_by_id) != len(items):
            raise CatalogConfigurationError("Town catalog IDs must be unique")

    @classmethod
    def load(cls, path: Path) -> "TownCatalog":
        try:
            with path.open(encoding="utf-8") as catalog_file:
                payload = json.load(catalog_file)
            response = CatalogResponse.model_validate({"items": payload})
        except (OSError, ValueError, ValidationError) as error:
            raise CatalogConfigurationError(f"Unable to load town catalog: {path}") from error
        return cls(response.items)

    def get(self, item_id: str) -> CatalogItemResponse | None:
        return self._items_by_id.get(item_id)

    def response(self) -> CatalogResponse:
        return CatalogResponse(items=self.items)
