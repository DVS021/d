"""Offline owner-timbre conversion. The reference and voice parameters stay private."""
import argparse,os,time
from pathlib import Path
import json
p=argparse.ArgumentParser()
for name in ['manifest','model','reference','work-dir']:p.add_argument('--'+name,required=True)
a=p.parse_args();work=Path(a.work_dir);work.mkdir(parents=True,exist_ok=True)
os.environ.setdefault('HF_HOME',str(work/'hf-cache'))
os.environ.setdefault('NUMBA_CACHE_DIR',str(work/'numba-cache'))
import torch,numpy as np,soundfile as sf,librosa,onnxruntime as ort
from openvoice.api import ToneColorConverter
from openvoice.mel_processing import spectrogram_torch
torch.set_num_threads(2);torch.set_num_interop_threads(1)
modeldir=Path(a.model)
converter=ToneColorConverter(str(modeldir/'config.json'),device='cpu')
converter.load_ckpt(str(modeldir/'checkpoint.pth'))
items=json.loads(Path(a.manifest).read_text())
# All baseline recordings use the same speaker. Their embedding is calculated once.
src=converter.extract_se([x['baseFile'] for x in items[:5]])
reference=Path(a.reference)
references=sorted(str(x) for x in reference.glob('*.wav')) if reference.is_dir() else [str(reference)]
if not references:raise ValueError('No owner-only reference recordings')
tgt=converter.extract_se(references)
class ConversionGraph(torch.nn.Module):
 def __init__(self,m):super().__init__();self.m=m
 def forward(self,spec,lengths,source,target):return self.m.voice_conversion(spec,lengths,source,target,tau=.3)[0]
onnxfile=modeldir/'converter.onnx'
if not onnxfile.exists():
 with torch.inference_mode():
  torch.onnx.export(ConversionGraph(converter.model).eval(),(torch.rand(1,513,64),torch.tensor([64]),src,tgt),str(onnxfile),opset_version=17,input_names=['spec','lengths','src','tgt'],output_names=['audio'],dynamic_axes={'spec':{2:'frames'},'audio':{2:'samples'}})
options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
options.add_session_config_entry('session.intra_op.allow_spinning','0')
options.enable_mem_pattern=False
session=ort.InferenceSession(str(onnxfile),sess_options=options,providers=['CPUExecutionProvider'])
print('Owner timbre ready; source pronunciation and text preserved',flush=True)
h=converter.hps.data
for i,item in enumerate(items,1):
 targetfile=Path(item['file'])
 if targetfile.exists():print(f'Reusing {i}/{len(items)}',flush=True);continue
 start=time.time();print(f'Converting response {i}/{len(items)}',flush=True);wav,_=librosa.load(item['baseFile'],sr=h.sampling_rate)
 with torch.inference_mode():
  spec=spectrogram_torch(torch.tensor(wav).unsqueeze(0),h.filter_length,h.sampling_rate,h.hop_length,h.win_length,center=False)
 out=session.run(None,{'spec':spec.numpy(),'lengths':np.array([spec.size(-1)],dtype=np.int64),'src':src.numpy(),'tgt':tgt.numpy()})[0][0,0]
 if not np.isfinite(out).all() or len(out)<h.sampling_rate:raise ValueError('Invalid converted audio')
 print(f'Timbre ready {i}/{len(items)}: {time.time()-start:.1f}s',flush=True)
 # Keep the converter's built-in watermark; only ready audio is released.
 out=converter.add_watermark(out,'owner')
 sf.write(targetfile,out,h.sampling_rate)
 print(f'Completed {i}/{len(items)}: {len(out)/h.sampling_rate:.1f}s audio, {time.time()-start:.1f}s conversion',flush=True)
