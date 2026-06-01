#!/usr/bin/env python3
"""
PaddleOCR runner — invoked by the Electron main process to OCR a single image.

Contract:
    paddleocr_runner --image <path> [--det-model <dir>] [--rec-model <dir>] [--lang ch]
    paddleocr_runner --selftest    # quick check that the runtime is intact

stdout is one JSON object:
    {"ok": true,  "lines": [{"text": "...", "confidence": 0.97}, ...]}
or:
    {"ok": false, "error": "<message>"}

Designed to run as a frozen single-file executable (built with PyInstaller) so
the end user never needs Python on their PATH.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import traceback


def _emit(payload: dict) -> int:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()
    return 0 if payload.get("ok") else 1


def _selftest() -> int:
    try:
        from paddleocr import PaddleOCR  # noqa: F401
    except Exception as exc:  # pragma: no cover
        return _emit({"ok": False, "error": f"paddleocr import failed: {exc}"})
    return _emit({"ok": True, "version": getattr(__import__("paddleocr"), "__version__", "unknown")})


def _ocr(image: str, det_model: str | None, rec_model: str | None, lang: str) -> int:
    if not os.path.exists(image):
        return _emit({"ok": False, "error": f"image not found: {image}"})

    try:
        from paddleocr import PaddleOCR
    except Exception as exc:
        return _emit({"ok": False, "error": f"paddleocr import failed: {exc}"})

    kwargs = {"lang": lang, "use_angle_cls": True, "show_log": False}
    if det_model:
        kwargs["det_model_dir"] = det_model
    if rec_model:
        kwargs["rec_model_dir"] = rec_model

    try:
        ocr = PaddleOCR(**kwargs)
        result = ocr.ocr(image, cls=True)
    except Exception as exc:
        tb = traceback.format_exc(limit=2)
        return _emit({"ok": False, "error": f"ocr failed: {exc}", "trace": tb})

    lines: list[dict] = []
    if result:
        # PaddleOCR may return [[ [box, (text, conf)], ... ]] (one page) or list of pages.
        pages = result if isinstance(result[0], list) else [result]
        for page in pages:
            if not page:
                continue
            for entry in page:
                if not entry or len(entry) < 2:
                    continue
                _box, payload = entry[0], entry[1]
                if isinstance(payload, (list, tuple)) and len(payload) >= 2:
                    text, conf = payload[0], payload[1]
                    if isinstance(text, str) and text.strip():
                        try:
                            confidence = float(conf)
                        except (TypeError, ValueError):
                            confidence = 0.0
                        lines.append({"text": text, "confidence": confidence})

    return _emit({"ok": True, "lines": lines})


def main() -> int:
    parser = argparse.ArgumentParser(prog="paddleocr_runner")
    parser.add_argument("--image", help="path to the image to OCR")
    parser.add_argument("--det-model", help="path to the detection model dir")
    parser.add_argument("--rec-model", help="path to the recognition model dir")
    parser.add_argument("--lang", default="ch")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()

    if args.selftest:
        return _selftest()

    if not args.image:
        return _emit({"ok": False, "error": "missing --image"})

    return _ocr(args.image, args.det_model, args.rec_model, args.lang)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # last-resort guard
        sys.exit(_emit({"ok": False, "error": f"unhandled: {exc}"}))
