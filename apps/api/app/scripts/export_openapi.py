"""Writes the OpenAPI contract consumed by the frontend type generator.

    python -m app.scripts.export_openapi ../web/openapi.json

CI runs it and fails on `git diff`, so the API and the web types can never drift silently.
"""

import json
import sys
from pathlib import Path

from app.main import app


def main() -> None:
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "openapi.json")
    target.write_text(json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"OpenAPI written to {target}")


if __name__ == "__main__":
    main()
