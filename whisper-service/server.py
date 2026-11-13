"""
C-Link private speech service.

It runs ONLY on this computer (127.0.0.1). A student's recorded interview goes from the browser to the C-Link website,
from the website to this service, and is turned into text here by the open-source Whisper model (faster-whisper).
Nothing is sent to any outside company. The recording is kept only in memory while it is being worked on: it is never
written to disk, and its content is never logged.

Start:   python server.py
Check:   http://127.0.0.1:8765/health
"""

import io
import json
import os
import secrets
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool

from media import audio_16k, remux_webm

# ---------- Settings (all can be changed in the project's .env file) ----------


def _read_dotenv() -> dict:
    """Reads ../.env (the website's own settings file) so the secret key lives in one place."""
    values = {}
    path = Path(__file__).resolve().parent.parent / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            values[key.strip()] = val.strip().strip('"').strip("'")
    return values


_ENV = _read_dotenv()


def setting(name: str, default: str = "") -> str:
    return os.environ.get(name) or _ENV.get(name) or default


API_KEY = setting("WHISPER_API_KEY")
MODEL_NAME = setting("WHISPER_MODEL", "small")      # tiny, base, small, medium
DEVICE = setting("WHISPER_DEVICE", "cpu").lower()   # cpu (safe default) or cuda (graphics card)
LANGUAGE = setting("WHISPER_LANGUAGE", "en")
PORT = int(setting("WHISPER_PORT", "8765"))
MAX_UPLOAD = 400 * 1024 * 1024       # a 15-minute recording is about 60 MB
MAX_WINDOWS = 10
MAX_WINDOW_SECONDS = 15 * 60

if len(API_KEY) < 24:
    raise SystemExit(
        "\nWHISPER_API_KEY is missing or too short.\n"
        "Add a long random value to the .env file in the project folder, for example:\n"
        '  WHISPER_API_KEY="<at least 24 random characters>"\n'
        "The website and this service must use the same value.\n"
    )
if DEVICE not in ("cpu", "cuda"):
    raise SystemExit("WHISPER_DEVICE must be cpu or cuda.")

# ---------- Loading the model ----------


def load_model():
    """Loads Whisper once. A short test run proves the chosen device really works."""
    import numpy as np
    from faster_whisper import WhisperModel

    compute = "float16" if DEVICE == "cuda" else "int8"
    print(f"Loading Whisper model '{MODEL_NAME}' on {DEVICE} ({compute}). The first run downloads it once...")
    model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=compute)
    segments, _ = model.transcribe(np.zeros(16000, dtype="float32"), language=LANGUAGE)
    list(segments)  # transcription is lazy; this makes it really run
    print("Speech model is ready.")
    return model


_model = None
_lock = threading.Lock()  # one job at a time keeps the laptop responsive


@asynccontextmanager
async def lifespan(_app):
    global _model
    _model = load_model()
    yield


app = FastAPI(title="C-Link private speech service", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


def check_key(provided: str):
    if not secrets.compare_digest(provided.encode(), API_KEY.encode()):
        raise HTTPException(status_code=401, detail="Not allowed.")


@app.get("/health")
def health(x_api_key: str = Header(default="")):
    check_key(x_api_key)
    return {"model_loaded": _model is not None, "model": MODEL_NAME, "device": DEVICE}


@app.post("/remux")
async def remux(request: Request, x_api_key: str = Header(default="")):
    """Body: the recording as the browser made it. Returns the same recording with a duration and a seek index."""
    check_key(x_api_key)
    declared = int(request.headers.get("content-length") or 0)
    if declared > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="That recording is too large.")
    data = await request.body()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="That recording is too large.")
    if len(data) < 1000:
        raise HTTPException(status_code=400, detail="That recording is too short.")

    def work():
        with _lock:
            return remux_webm(data)

    try:
        out, duration = await run_in_threadpool(work)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        # No details are returned or logged: they could contain the student's content.
        raise HTTPException(status_code=500, detail="The recording could not be processed.")
    return Response(content=out, media_type="video/webm", headers={"X-Duration-Sec": f"{duration:.3f}"})


@app.post("/transcribe")
def transcribe(
    file: UploadFile = File(...),
    windows: str = Form(...),
    hint: str = Form(""),
    x_api_key: str = Header(default=""),
):
    """
    Body (multipart): file = the recording; windows = JSON list of {index, startSec, endSec}; hint = a few words about
    the subject (helps with technical terms). Each window is transcribed on its own.
    """
    check_key(x_api_key)
    if _model is None:
        raise HTTPException(status_code=503, detail="The speech model is still loading.")
    try:
        wanted = json.loads(windows)
        assert isinstance(wanted, list) and 0 < len(wanted) <= MAX_WINDOWS
        parsed = []
        for w in wanted:
            index, start, end = int(w["index"]), float(w["startSec"]), float(w["endSec"])
            assert 0 <= start < end and end - start <= MAX_WINDOW_SECONDS
            parsed.append((index, start, end))
    except Exception:
        raise HTTPException(status_code=400, detail="The list of answer times is not valid.")

    data = file.file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="That recording is too large.")
    if len(data) < 1000:
        raise HTTPException(status_code=400, detail="That recording is too short.")

    results = []
    try:
        with _lock:
            audio = audio_16k(data)
            rate = 16000
            for index, start, end in parsed:
                piece = audio[int(start * rate): int(end * rate)]
                if piece.shape[0] < rate // 2:
                    results.append({"index": index, "text": "", "speech_sec": 0.0})
                    continue
                segments, _info = _model.transcribe(
                    piece,
                    language=LANGUAGE,
                    beam_size=5,
                    vad_filter=True,                  # skips silence, which also stops made-up words
                    condition_on_previous_text=False,
                    initial_prompt=hint or None,
                )
                parts, heard = [], 0.0
                for s in segments:
                    parts.append(s.text.strip())
                    heard += max(0.0, s.end - s.start)
                results.append({"index": index, "text": " ".join(p for p in parts if p).strip(), "speech_sec": round(heard, 1)})
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read that recording.")
    return {"results": results}


if __name__ == "__main__":
    import uvicorn

    # 127.0.0.1 means "this computer only": nobody else on the network can reach it.
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
