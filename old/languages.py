from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class LanguageDefinition:
    code: str
    label: str
    short_label: str


DEFAULT_LANGUAGES: tuple[LanguageDefinition, ...] = (
    LanguageDefinition(code="pt-BR", label="Português", short_label="PT"),
    LanguageDefinition(code="en", label="English", short_label="EN"),
    LanguageDefinition(code="es", label="Español", short_label="ES"),
)


def normalize_languages(
    languages: Sequence[LanguageDefinition] | None = None,
) -> tuple[LanguageDefinition, ...]:
    resolved = tuple(languages or DEFAULT_LANGUAGES)
    if not resolved:
        raise ValueError("at least one language must be provided")

    codes = [language.code for language in resolved]
    if len(codes) != len(set(codes)):
        raise ValueError("language codes must be unique")

    return resolved
