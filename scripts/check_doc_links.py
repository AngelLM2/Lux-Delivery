"""Checks every relative link and #anchor in the Markdown docs (GitHub slug rules).

    python scripts/check_doc_links.py      # exit code 1 if anything is broken
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    *ROOT.glob("*.md"),
    *ROOT.glob("docs/**/*.md"),
    *ROOT.glob("apps/*/README*.md"),
    *ROOT.glob("loadtest/*.md"),
]
LINK = re.compile(r"(?<!!)\[[^\]]*\]\(([^)\s]+)\)")
HEADING = re.compile(r"^(#{1,6})\s+(.*)$")


def slug(heading: str) -> str:
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", heading)  # [text](url) -> text
    text = text.replace("`", "").strip().lower()
    text = "".join(ch for ch in text if ch.isalnum() or ch in " -_")
    return text.replace(" ", "-")


def anchors(path: Path) -> set[str]:
    found: dict[str, int] = {}
    result = set()
    in_code = False
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("```"):
            in_code = not in_code
            continue
        match = HEADING.match(line)
        if match and not in_code:
            base = slug(match.group(2))
            count = found.get(base, 0)
            result.add(base if count == 0 else f"{base}-{count}")
            found[base] = count + 1
    return result


def main() -> int:
    broken = []
    cache: dict[Path, set[str]] = {}
    for file in FILES:
        in_code = False
        for number, line in enumerate(file.read_text(encoding="utf-8").splitlines(), 1):
            if line.startswith("```"):
                in_code = not in_code
            if in_code:
                continue
            for target in LINK.findall(re.sub(r"`[^`]*`", "", line)):  # ignore inline code spans
                if target.startswith(("http://", "https://", "mailto:")):
                    continue
                path_part, _, anchor = target.partition("#")
                destination = (file.parent / path_part).resolve() if path_part else file
                if not destination.exists():
                    broken.append(f"{file.relative_to(ROOT)}:{number}: missing file {target}")
                    continue
                if anchor and destination.suffix == ".md":
                    known = cache.setdefault(destination, anchors(destination))
                    if anchor not in known:
                        broken.append(f"{file.relative_to(ROOT)}:{number}: missing anchor {target}")
    for item in broken:
        print(item)
    print(f"{len(FILES)} files checked, {len(broken)} broken links")
    return 1 if broken else 0


if __name__ == "__main__":
    sys.exit(main())
