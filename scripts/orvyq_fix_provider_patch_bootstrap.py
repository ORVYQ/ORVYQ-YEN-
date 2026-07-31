#!/usr/bin/env python3
import subprocess
from pathlib import Path

patch = Path("scripts/orvyq_apply_provider_resilience_patch.py")
text = patch.read_text()
old = '''function numericHeader(headers, name) {
  const value = Number(headers?.get?.(name));
  return Number.isFinite(value) ? value : null;
}'''
new = '''function numericHeader(headers, name) {
  const raw = headers?.get?.(name);
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"numericHeader patch expected one match, found {count}")
patch.write_text(text.replace(old, new, 1))
Path(__file__).unlink(missing_ok=True)
subprocess.run(["python3", str(patch)], check=True)
