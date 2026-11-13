"""
Media helpers for the C-Link speech service. No AI in here, and no network.

remux_webm():   a browser's live recording (MediaRecorder) is a WebM file with no duration and no seek index, so a video
                player cannot jump around in it. This rewrites the same pictures and sound into a proper WebM file with
                both. Nothing is re-encoded, so it is fast and loses no quality.
audio_16k():    the sound of a recording as 16 kHz mono numbers, which is what Whisper reads.
"""

import io

import av
import numpy as np


def remux_webm(data: bytes) -> tuple[bytes, float]:
    """Returns (new WebM bytes, duration in seconds). Raises ValueError if the file can't be read."""
    try:
        source = av.open(io.BytesIO(data), mode="r")
    except Exception as exc:  # av raises its own error types
        raise ValueError("The recording could not be opened.") from exc

    out_buffer = io.BytesIO()
    try:
        target = av.open(out_buffer, mode="w", format="webm")
        streams = {}
        for s in source.streams:
            if s.type in ("video", "audio"):
                streams[s.index] = target.add_stream_from_template(s)
        if not streams:
            raise ValueError("The recording has no picture or sound.")

        # Collect the packets, so every stream can start at zero together (keeps picture and sound in step).
        packets = []
        for packet in source.demux():
            if packet.pts is None or packet.stream.index not in streams:
                continue
            packets.append(packet)
        if not packets:
            raise ValueError("The recording is empty.")

        def seconds(p) -> float:
            return float(p.pts * p.time_base)

        origin = min(seconds(p) for p in packets)
        end_time = 0.0
        for p in packets:
            tb = p.time_base
            shift = int(round(origin / float(tb)))
            p.pts = p.pts - shift
            p.dts = (p.dts - shift) if p.dts is not None else p.pts
            if p.dts > p.pts:
                p.dts = p.pts
            length = (p.duration or 0) * float(tb)
            end_time = max(end_time, float(p.pts * tb) + length)
            p.stream = streams[p.stream.index]
            target.mux(p)
        target.close()
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("The recording could not be rewritten.") from exc
    finally:
        source.close()

    result = out_buffer.getvalue()
    # If a packet carried no length, fall back to the last start time plus a frame.
    return result, round(end_time, 3)


def audio_16k(data: bytes) -> np.ndarray:
    """All the sound of the recording, 16 kHz, mono, float32 in -1..1."""
    from faster_whisper.audio import decode_audio

    return decode_audio(io.BytesIO(data), sampling_rate=16000)
