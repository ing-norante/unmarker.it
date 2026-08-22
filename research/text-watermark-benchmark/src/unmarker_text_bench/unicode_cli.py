from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .unicode_hygiene import clean_unicode


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Conservatively remove high-confidence invisible Unicode carriers"
    )
    parser.add_argument(
        "input",
        nargs="?",
        type=Path,
        help="UTF-8 input file; read standard input when omitted",
    )
    parser.add_argument("--output", type=Path, help="Write cleaned UTF-8 text here")
    parser.add_argument("--report", type=Path, help="Write the JSON audit report here")
    parser.add_argument(
        "--nfkc",
        action="store_true",
        help="Opt in to compatibility normalization (disabled by default)",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    source = args.input.read_text(encoding="utf-8") if args.input else sys.stdin.read()
    result = clean_unicode(source, nfkc=args.nfkc)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(result.text, encoding="utf-8")
    else:
        sys.stdout.write(result.text)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(
            json.dumps(result.to_dict(), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
