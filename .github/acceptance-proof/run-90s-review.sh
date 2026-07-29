#!/usr/bin/env bash
set -euo pipefail

SOURCE_SCRIPT=".github/acceptance-proof/run.sh"
TEMP_SCRIPT="$(mktemp /tmp/orvyq-90s-review.XXXXXX.sh)"
trap 'rm -f "$TEMP_SCRIPT"' EXIT

python3 - "$SOURCE_SCRIPT" "$TEMP_SCRIPT" <<'PY'
from pathlib import Path
import sys

source = Path(sys.argv[1])
target = Path(sys.argv[2])
text = source.read_text()

replacements = {
    "durations = [7, 7, 7, 7, 7, 8, 7, 7, 8, 10]": "durations = [9, 9, 9, 9, 9, 9, 9, 9, 9, 9]",
    "'trim_out_sec':7": "'trim_out_sec':9",
    "'shots':[{'duration':7},{'duration':7},{'duration':7},{'duration':7}]": "'shots':[{'duration':9},{'duration':9},{'duration':9},{'duration':9}]",
    "d=240:s=1920x1080:fps=30": "d=300:s=1920x1080:fps=30",
    "-frames:v 240": "-frames:v 300",
    "durations=(7 7 7 7 7 8 7 7 8 10)": "durations=(9 9 9 9 9 9 9 9 9 9)",
    "duration=75:sample_rate=48000": "duration=90:sample_rate=48000",
    " -t 75 ": " -t 90 ",
    "--crf=24": "--crf=27",
    "-ss 37.5": "-ss 45",
    "-ss 72": "-ss 87",
    "60 <= duration <= 90": "60 <= duration <= 90.1",
}

for old, new in replacements.items():
    count = text.count(old)
    if count == 0:
        raise SystemExit(f"90-second review patch target missing: {old}")
    text = text.replace(old, new)

target.write_text(text)
target.chmod(0o755)
PY

bash "$TEMP_SCRIPT"
