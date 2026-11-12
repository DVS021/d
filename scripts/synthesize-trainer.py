"""Offline Russian voice generation; the website only serves the resulting MP3s."""
import argparse
import json
import wave
from pathlib import Path

import onnxruntime
from piper import PiperVoice, SynthesisConfig

# Synthesis stays local and does not need ONNX Runtime telemetry.
onnxruntime.disable_telemetry_events()
parser = argparse.ArgumentParser()
parser.add_argument('--model', required=True)
parser.add_argument('--manifest', required=True)
args = parser.parse_args()
voice = PiperVoice.load(args.model)
items = json.loads(Path(args.manifest).read_text())
for index, item in enumerate(items, 1):
    style=item.get('style',{})
    config = SynthesisConfig(length_scale=style.get('lengthScale',1.08), noise_scale=0.5, noise_w_scale=0.65)
    with wave.open(item['file'], 'wb') as output:
        first = True
        for chunk in voice.synthesize(item['text'], syn_config=config):
            if first:
                output.setframerate(chunk.sample_rate)
                output.setsampwidth(chunk.sample_width)
                output.setnchannels(chunk.sample_channels)
                first = False
            output.writeframes(chunk.audio_int16_bytes)
            # Give the listener time to separate sentences and the final question.
            output.writeframes(b'\x00' * int(chunk.sample_rate * style.get('pause',.28)) * chunk.sample_width * chunk.sample_channels)
    print(f'Voiced {index}/{len(items)}', flush=True)
