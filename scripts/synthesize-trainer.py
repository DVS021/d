"""Offline Russian voice generation; the website only serves the resulting MP3s."""
import argparse
import os
import json
import wave
from pathlib import Path

import onnxruntime
from piper import PiperVoice, SynthesisConfig
from piper.config import PiperConfig

# Synthesis stays local and does not need ONNX Runtime telemetry.
onnxruntime.disable_telemetry_events()
parser = argparse.ArgumentParser()
parser.add_argument('--model', required=True)
parser.add_argument('--manifest', required=True)
parser.add_argument('--threads', type=int, default=2)
parser.add_argument('--worker-count', type=int, default=1)
parser.add_argument('--worker-index', type=int, default=0)
args = parser.parse_args()
assert 1 <= args.threads <= 8 and 0 <= args.worker_index < args.worker_count <= 4
options = onnxruntime.SessionOptions()
options.intra_op_num_threads = args.threads
options.inter_op_num_threads = 1
options.add_session_config_entry('session.intra_op.allow_spinning', '0')
voice = PiperVoice(session=onnxruntime.InferenceSession(args.model, sess_options=options, providers=['CPUExecutionProvider']), config=PiperConfig.from_dict(json.loads(Path(args.model + '.json').read_text())))
items = json.loads(Path(args.manifest).read_text())
for index, item in enumerate(items, 1):
    if (index - 1) % args.worker_count != args.worker_index:
        continue
    target = Path(item['file'])
    if target.exists() and target.stat().st_size > 1000:
        print(f'Reusing {index}/{len(items)}', flush=True)
        continue
    temporary = str(target) + '.tmp.wav'
    style=item.get('style',{})
    config = SynthesisConfig(length_scale=style.get('lengthScale',1.08), noise_scale=0.5, noise_w_scale=0.65)
    with wave.open(temporary, 'wb') as output:
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
    os.replace(temporary, target)
    print(f'Voiced {index}/{len(items)}', flush=True)
