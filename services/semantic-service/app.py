"""Private CPU semantic router. Model files are bundled at build time; no remote inference."""
import json
import os
import threading
import unicodedata
import dialogue
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

ort.disable_telemetry_events()


class SemanticRouter:
    def __init__(self, model_dir, catalog_path):
        if os.environ.get("DIALOGUE_MODEL_URL"):
            self.manifest = {"model":dialogue.MODEL, "revision":dialogue.REVISION}
            self.entries = json.loads(Path(catalog_path).read_text(encoding="utf-8"))["intents"]
            # Prefill the domain instructions before readiness, instead of making
            # the first user's request pay the cold prompt-processing cost.
            dialogue.classify("Xin chào", timeout=90)
            dialogue.classify("Nên chọn nơi nào?", timeout=90, conversation={"lastIntent":"COMPARE_HOTELS","displayedHotels":2,"recentUserQuestions":[]})
            return
        folder = Path(model_dir)
        self.manifest = json.loads((folder / "manifest.json").read_text())
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        self.session = ort.InferenceSession(str(folder / "model.onnx"), options, providers=["CPUExecutionProvider"])
        self.input_names = {item.name for item in self.session.get_inputs()}
        self.tokenizer = Tokenizer.from_file(str(folder / "tokenizer.json"))
        self.tokenizer.enable_truncation(max_length=192)
        self.tokenizer.enable_padding(pad_id=self.tokenizer.token_to_id("<pad>") or 1, pad_token="<pad>")
        self.lock = threading.Lock()
        catalog = json.loads(Path(catalog_path).read_text(encoding="utf-8"))
        self.entries = catalog["intents"]
        # Apply the same accent tolerance to every capability, not individual phrases.
        def variants(texts):
            folded = ["".join(c for c in unicodedata.normalize("NFD", text.replace("đ", "d").replace("Đ", "D")) if not unicodedata.combining(c)) for text in texts]
            return list(dict.fromkeys(texts + folded))
        for entry in self.entries:
            entry["texts"] = variants(entry["texts"])
        examples = [text for entry in self.entries for text in entry["texts"]]
        self.vectors = self.embed(examples)
        self.slices = []
        start = 0
        for entry in self.entries:
            self.slices.append((start, start + len(entry["texts"])))
            start += len(entry["texts"])
        self.actions = list(catalog["actions"])
        self.action_vectors = [self.embed(variants(catalog["actions"][key])) for key in self.actions]
        self.preferences = list(catalog["preferences"])
        self.preference_vectors = [self.embed(catalog["preferences"][key]) for key in self.preferences]

    def embed(self, texts):
        result = []
        # E5 uses query prefixes for symmetric semantic similarity.
        with self.lock:
            for start in range(0, len(texts), 16):
                rows = self.tokenizer.encode_batch(["query: " + text for text in texts[start:start + 16]])
                ids = np.asarray([row.ids for row in rows], dtype=np.int64)
                mask = np.asarray([row.attention_mask for row in rows], dtype=np.int64)
                all_inputs = {"input_ids": ids, "attention_mask": mask, "token_type_ids": np.zeros_like(ids)}
                hidden = self.session.run(None, {key: value for key, value in all_inputs.items() if key in self.input_names})[0]
                pooled = (hidden * mask[:, :, None]).sum(axis=1) / np.maximum(mask.sum(axis=1)[:, None], 1)
                normalized = pooled / np.maximum(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-12)
                result.append(normalized.astype(np.float32))
        return np.concatenate(result)

    def classify(self, message, hotel_context=False, conversation=None):
        if os.environ.get("DIALOGUE_MODEL_URL"):
            # Propagate model failures as HTTP 503; never silently substitute another model.
            return dialogue.classify(message, hotel_context, conversation=conversation)
        query = self.embed([message])[0]
        similarities = self.vectors @ query
        scores = []
        for entry, (start, end) in zip(self.entries, self.slices):
            best = np.sort(similarities[start:end])[-2:]
            score = float(best[-1] * .8 + best.mean() * .2)
            scores.append((score, entry))
        scores.sort(key=lambda row: row[0], reverse=True)
        winner_score, winner = scores[0]
        preference_scores = [float((vectors @ query).max()) for vectors in self.preference_vectors]
        preference_index = int(np.argmax(preference_scores))
        ordered_preferences = sorted(preference_scores, reverse=True)
        preference = self.preferences[preference_index]
        if ordered_preferences[0] < .88 or ordered_preferences[0] - ordered_preferences[1] < .008:
            preference = "BALANCED"
        if hotel_context and winner["intent"] == "GENERAL" and winner.get("topic") in ("PAYMENT", "DEPOSIT") and preference in ("CHEAPEST", "LARGEST"):
            room = next(row for row in scores if row[1]["intent"] == "ROOM_RECOMMEND")
            if winner_score - room[0] < .035:
                winner_score, winner = room
        action_scores = [float((vectors @ query).max()) for vectors in self.action_vectors]
        action_index = int(np.argmax(action_scores))
        action = self.actions[action_index] if action_scores[action_index] >= .86 else "NONE"
        # Cosine similarity is not a probability. Abstain instead of guessing.
        clarify = winner["intent"] == "CLARIFY" or winner_score < .83 or winner_score - scores[1][0] < .003
        return {
            "action": action,
            "actionConfidence": round(action_scores[action_index], 5),
            "actionMargin": round(sorted(action_scores, reverse=True)[0] - sorted(action_scores, reverse=True)[1], 5),
            "intent": "CLARIFY" if clarify else winner["intent"],
            "behavior": "CLARIFY" if clarify else "ANSWER",
            "topic": winner["topic"],
            "preference": preference,
            "confidence": round(winner_score, 5),
            "margin": round(winner_score - scores[1][0], 5),
            "model": self.manifest["model"],
            "revision": self.manifest["revision"],
        }


router = None


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body):
        encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        if self.path != "/health":
            return self.reply(404, {"error": "Not found"})
        self.reply(200, {"status": "UP", "model": router.manifest["model"], "revision": router.manifest["revision"], "remoteInference": False})

    def do_POST(self):
        if self.path != "/classify":
            return self.reply(404, {"error": "Not found"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 16000:
                return self.reply(400, {"error": "Invalid request size"})
            request = json.loads(self.rfile.read(size))
            message = request.get("message")
            if not isinstance(message, str) or not message.strip() or len(message) > 2000:
                return self.reply(400, {"error": "Invalid message"})
            conversation = request.get("conversation")
            if conversation is not None and (not isinstance(conversation, dict) or len(json.dumps(conversation,ensure_ascii=False).encode("utf-8")) > 8000):
                return self.reply(400, {"error": "Invalid conversation context"})
            self.reply(200, router.classify(message.strip(), request.get("hotelContext") is True, conversation))
        except (ValueError, TypeError, json.JSONDecodeError):
            self.reply(400, {"error": "Invalid JSON"})
        except Exception:
            self.reply(503, {"error": "Semantic inference unavailable"})

    def log_message(self, *_):
        pass  # Conversation content and request payloads are never logged.


if __name__ == "__main__":
    router = SemanticRouter(os.environ.get("MODEL_DIR", "/models/e5"), "intents.json")
    print(json.dumps({"status": "ready", "model": router.manifest["model"], "remoteInference": False}), flush=True)
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8091"))), Handler).serve_forever()
