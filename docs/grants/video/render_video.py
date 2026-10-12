"""Assemble actual UI captures with ElevenLabs speech and synchronized captions.

Install imageio-ffmpeg into an isolated environment (or set FFMPEG to an existing
binary). No network access, wallet actions or new voice generation occurs here.
"""
from pathlib import Path
import json
import os
import re
import subprocess
import textwrap

ROOT = Path(__file__).resolve().parent
FFMPEG = os.environ.get('FFMPEG')
if not FFMPEG:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
FONT = os.environ.get('VIDEO_FONT', '/System/Library/Fonts/Supplemental/Arial.ttf')
OUT = ROOT / 'exports'
BUILD = ROOT / '.render'
OUT.mkdir(exist_ok=True)
BUILD.mkdir(exist_ok=True)
FPS = 25
DURATION = 116.0
# Times correspond to paragraph transitions in the generated narration. A slow
# vertical pan is a presentation of a static capture, not simulated interaction.
SCENES = [
    ('00-title.png', 0, 8.8, None, 'TEAM AND PRODUCT WALKTHROUGH'),
    ('02-markets.jpg', 8.8, 22.4, (370, 430), 'MARKETS / Separate vaults and backing assets'),
    ('01-protect.jpg', 22.4, 44.6, (290, 350), 'PROTECT / Receipts, backing and exit terms'),
    ('03-provide.jpg', 44.6, 61.2, (450, 470), 'PROVIDE / First-loss backing capital'),
    ('04-acquire-backing.jpg', 61.2, 69.4, (420, 450), 'FUNDING / Acquire the correct backing asset'),
    ('05-return-to-pool.jpg', 69.4, 74.2, (285, 440), 'RETURN TO PROVIDE / Original pool and amount'),
    ('06-team.png', 74.2, 90.4, None, 'THE TEAM'),
    ('07-next.png', 90.4, DURATION, None, 'THE NEXT PHASE'),
]


def run(args):
    subprocess.run([str(FFMPEG), '-hide_banner', '-loglevel', 'warning', '-y', *map(str,args)], check=True)


def stamp(seconds, ass=False):
    units = round(seconds * (100 if ass else 1000))
    base = 100 if ass else 1000
    s, f = divmod(units, base)
    m, s = divmod(s, 60)
    h, m = divmod(m, 60)
    return f'{h}:{m:02}:{s:02}.{f:02}' if ass else f'{h:02}:{m:02}:{s:02},{f:03}'


cues = json.loads((ROOT / 'captions-elevenlabs.json').read_text())
normalize = lambda s: re.sub(r'\s+', ' ', s).strip()
assert normalize(' '.join(c['text'] for c in cues)) == normalize((ROOT / 'narration.txt').read_text())
assert all(a['end'] <= b['start'] for a,b in zip(cues,cues[1:]))
ass = '''[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,26,&H00F8F8F4,&H00F8F8F4,&H00222F1C,&H00222F1C,0,0,0,0,100,100,0,0,1,0,0,2,44,44,22,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
srt=[]
for i,c in enumerate(cues,1):
    lines=textwrap.wrap(normalize(c['text']),width=84,break_long_words=False)
    assert len(lines)<=2
    start=max(0,round(c['start'],2)); end=round(c['end'],2)
    ass += f"Dialogue: 0,{stamp(start,True)},{stamp(end,True)},Default,,0,0,0,," + r'\N'.join(lines) + '\n'
    srt.append(f"{i}\n{stamp(start)} --> {stamp(end)}\n"+'\n'.join(lines)+'\n')
(ROOT/'captions.ass').write_text(ass)
(OUT/'yieldshield-stellar-demo.srt').write_text('\n'.join(srt))

segments=[]
for i,(filename,start,end,pan,label) in enumerate(SCENES):
    duration=end-start
    header=BUILD/f'header-{i}.txt';header.write_text(label)
    common="pad=1280:720:0:0:color=0x1c2b24,setsar=1"
    if pan:
        y0,y1=pan
        vf=(f"crop=1264:590:0:'{y0}+({y1-y0})*min(t/{duration:.3f},1)',"
            "scale=1280:598:flags=lanczos:out_range=tv:out_color_matrix=bt709,pad=1280:630:0:32:color=0x1c2b24,"
            +common+f",drawtext=fontfile='{FONT}':textfile='{header}':fontcolor=0xf3f1e7:fontsize=15:x=24:y=9")
    else:
        vf='crop=1280:630:0:0,scale=1280:630:out_range=tv:out_color_matrix=bt709,'+common
    vf+=f",drawtext=fontfile='{FONT}':text='TESTNET / AI NARRATION':fontcolor=0xe2ed77:fontsize=13:x=w-tw-22:y=10"
    segment=BUILD/f'scene-{i}.mp4'; segments.append(segment)
    run(['-loop','1','-framerate',FPS,'-i',ROOT/'frames'/filename,'-vf',vf,'-frames:v',round(duration*FPS),'-an','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',segment])
concat=BUILD/'segments.txt'
concat.write_text(''.join(f"file '{p.as_posix()}'\n" for p in segments))
run(['-f','concat','-safe','0','-i',concat,'-i',ROOT/'narration.mp3',
     '-vf',f"ass='{ROOT/'captions.ass'}'",'-af','loudnorm=I=-16:TP=-1.5:LRA=11,apad',
     '-t',DURATION,'-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p',
     '-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',
     '-metadata','title=YieldShield Stellar — team and product demo',
     '-metadata','comment=AI-narrated Testnet UI walkthrough. Valueless test assets. Unaudited.',
     OUT/'yieldshield-stellar-demo.mp4'])
print(OUT/'yieldshield-stellar-demo.mp4')
