from __future__ import annotations

import base64
import mimetypes
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote


@dataclass(frozen=True)
class PhotoDefinition:
    """Photo content frozen into a generated PhotoTile artifact.

    The browser component never receives a filesystem path. ``data_uri`` must contain
    the serialized image itself so generated HTML remains standalone/offline.
    Use ``PhotoDefinition.from_file(...)`` when the source starts as a local file.
    """

    id: str
    data_uri: str
    alt: str
    caption: str = ""
    author: str = ""
    date: str = ""
    location: str = ""
    mode: str = "photo"
    fit: str = "cover"
    focal_x: float = 0.5
    focal_y: float = 0.5

    def __post_init__(self) -> None:
        if not self.data_uri.startswith("data:"):
            raise ValueError(
                "PhotoDefinition.data_uri must contain a serialized data URI; "
                "filesystem paths and external URLs are not accepted"
            )

    @classmethod
    def from_file(
        cls,
        path: str | Path,
        *,
        id: str,
        alt: str,
        caption: str = "",
        author: str = "",
        date: str = "",
        location: str = "",
        mode: str = "photo",
        fit: str = "cover",
        focal_x: float = 0.5,
        focal_y: float = 0.5,
    ) -> "PhotoDefinition":
        """Read a local image and serialize it before creating the component payload."""
        image_path = Path(path).expanduser().resolve()
        if not image_path.is_file():
            raise FileNotFoundError(image_path)

        mime_type, _ = mimetypes.guess_type(image_path.name)
        if not mime_type or not mime_type.startswith("image/"):
            raise ValueError(f"could not infer an image MIME type for {image_path}")

        payload = base64.b64encode(image_path.read_bytes()).decode("ascii")
        data_uri = f"data:{mime_type};base64,{payload}"

        return cls(
            id=id,
            data_uri=data_uri,
            alt=alt,
            caption=caption,
            author=author,
            date=date,
            location=location,
            mode=mode,
            fit=fit,
            focal_x=focal_x,
            focal_y=focal_y,
        )


def _stub_photo_data_uri() -> str:
    svg = """<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'>
<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='midnightblue'/><stop offset='1' stop-color='steelblue'/></linearGradient></defs>
<rect width='1200' height='800' fill='url(#g)'/>
<rect x='90' y='95' width='1020' height='610' rx='30' fill='white' opacity='.08'/>
<circle cx='785' cy='285' r='95' fill='lightcyan' opacity='.9'/>
<path d='M80 690 360 370 545 555 690 420 1120 690Z' fill='lightsteelblue' opacity='.88'/>
<path d='M80 690 390 450 610 690Z' fill='slategray' opacity='.9'/>
<text x='120' y='170' fill='white' font-family='system-ui,sans-serif' font-size='58' font-weight='700'>OntoBDC PhotoTile</text>
<text x='122' y='225' fill='white' opacity='.75' font-family='system-ui,sans-serif' font-size='28'>stub de fotografia para preview</text>
</svg>"""
    return "data:image/svg+xml;charset=UTF-8," + quote(svg)


DEFAULT_PHOTO = PhotoDefinition(
    id="stub-photo",
    data_uri=_stub_photo_data_uri(),
    alt="Imagem de demonstração do PhotoTile",
    caption="Inspeção visual · imagem de demonstração",
    author="OntoBDC View",
    date="2026-08-08",
    location="Preview local",
    mode="photo",
    fit="cover",
    focal_x=0.58,
    focal_y=0.46,
)
