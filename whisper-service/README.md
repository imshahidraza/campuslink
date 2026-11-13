# C-Link private speech service

Turns the spoken answers of a recorded video interview into text, **on your own computer**. It uses the open-source Whisper model through `faster-whisper`. Nothing is sent to any outside company.

It also repairs the browser's recording (a browser writes a WebM file without a length, so it can't be skipped through). The repair copies the video and audio as they are; it does not re-encode anything, so no `ffmpeg` is needed.

The website talks to it on `127.0.0.1` only, with a secret key. Nobody else on the network can reach it.

## One-time setup (Windows PowerShell)

Use Python 3.10 or newer (it was tested here with 3.13 on Linux; the Windows steps below are written from the standard commands and not yet run on a Windows PC).

```powershell
cd campuslink\whisper-service
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Add these lines to the **`.env`** file in the main `campuslink` folder (the same file the website uses):

```
WHISPER_API_KEY="put-any-random-text-here-at-least-24-characters"
# optional
# WHISPER_MODEL="small"        # tiny, base, small or medium. Bigger is more accurate and slower.
# WHISPER_DEVICE="cpu"         # cpu is the safe default. cuda uses the graphics card (see below).
# WHISPER_LANGUAGE="en"
# WHISPER_PORT="8765"
# WHISPER_URL="http://127.0.0.1:8765"
```

The website and this service read the same key, so they always match. A key shorter than 24 characters is refused.

## Every time you want video interviews

Open a second PowerShell window next to the one running the website:

```powershell
cd campuslink\whisper-service
.venv\Scripts\Activate.ps1
python server.py
```

Wait for `Speech model is ready.` The very first start downloads the model once (about 0.5 GB for `small`), so it needs the internet that one time. After that it works offline.

If the service is not running when an interview is submitted, the recruiter sees "The speech service is not running. No marks were given..." on each answer and a **Process again** button. Start the service, press the button, and nothing is lost.

Keep **Ollama** running too (`ollama serve`), because Gemma gives the advice on each answer.

## Using the graphics card

On a laptop with an NVIDIA card, set `WHISPER_DEVICE="cuda"`. This needs the CUDA 12 and cuDNN 9 libraries; if the service stops with a CUDA or cuDNN message, go back to `cpu`. The model is tested once at start, so a bad setup shows up straight away, not in the middle of an interview.

`cpu` with `small` is fine for the demo: a 15-minute interview is turned into text in a few minutes, in the background.

## What it does and does not do

- Runs one job at a time and refuses anything that is not from the website (wrong or missing key gives 401).
- Keeps the recording only in memory while working on it. It is never written to disk and its content is never logged.
- Transcribes only the time windows the website sends (one per answer). Silence is skipped, which also stops Whisper from inventing words.
- It is speech-to-text only. It does not judge a voice, an accent, a face or a background.

## Pinned versions

`faster-whisper` 1.x needs PyAV 15 or 16, so `requirements.txt` limits `av` to `>=15,<17`. Please do not upgrade it on its own.
