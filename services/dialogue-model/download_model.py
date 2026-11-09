"""Fetch a pinned open model at build/setup time; runtime inference never downloads."""
from pathlib import Path
import hashlib
import urllib.request
import json

MODEL = "bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF"
REVISION = "ae44f08e1392f39c0e474af10c3ff8355c8b6688"
FILE = "Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
SHA256 = "2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e"
folder = Path(__file__).parent / "models"
folder.mkdir(exist_ok=True)
target = folder / "dialogue.gguf"
def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()
if not target.exists() or digest(target) != SHA256:
    temporary = folder / "dialogue.gguf.partial"
    with urllib.request.urlopen(f"https://huggingface.co/{MODEL}/resolve/{REVISION}/{FILE}", timeout=60) as response, temporary.open("wb") as stream:
        while block := response.read(1024 * 1024):
            stream.write(block)
    if digest(temporary) != SHA256:
        raise RuntimeError("Model checksum mismatch")
    temporary.replace(target)
(folder / "manifest.json").write_text(json.dumps({"model": MODEL, "revision": REVISION, "sha256": SHA256}), encoding="utf-8")
print(json.dumps({"status": "verified", "model": MODEL, "sha256": SHA256}), flush=True)
