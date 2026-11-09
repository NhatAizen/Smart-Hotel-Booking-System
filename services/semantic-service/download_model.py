import hashlib, json, pathlib, urllib.request
REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78"
MODEL = "Xenova/multilingual-e5-small"
folder = pathlib.Path("/models/e5")
folder.mkdir(parents=True, exist_ok=True)
manifest = {"model": MODEL, "revision": REVISION, "files": {}}
for remote, name in [("onnx/model_quantized.onnx", "model.onnx"), ("tokenizer.json", "tokenizer.json")]:
    target = folder / name
    with urllib.request.urlopen(f"https://huggingface.co/{MODEL}/resolve/{REVISION}/{remote}", timeout=180) as response, target.open("wb") as output:
        while chunk := response.read(1024 * 1024): output.write(chunk)
    manifest["files"][name] = hashlib.sha256(target.read_bytes()).hexdigest()
(folder / "manifest.json").write_text(json.dumps(manifest))
