from pathlib import Path

ROOT = Path(__file__).resolve().parent
PARTS = ROOT / "workstream_5w2h.js.parts"
OUTPUT = ROOT / "workstream_5w2h.js"

chunks = [path.read_text(encoding="utf-8") for path in sorted(PARTS.glob("*.js"))]
OUTPUT.write_text("\n".join(chunks) + "\n", encoding="utf-8")
print(OUTPUT)
