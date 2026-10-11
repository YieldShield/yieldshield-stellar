from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'frames'
OUT.mkdir(exist_ok=True)
BG='#f4f2e8'; INK='#1c2923'; ACCENT='#e0ed78'; LINE='#b5bbaa'
FONT=Path('/System/Library/Fonts/Supplemental')
def font(size,bold=False,serif=False):
    name=('Times New Roman'+(' Bold' if bold else '') if serif else 'Arial'+(' Bold' if bold else ''))+'.ttf'
    return ImageFont.truetype(str(FONT/name),size)
def base(kicker):
    im=Image.new('RGB',(1280,720),BG); d=ImageDraw.Draw(im)
    d.rectangle((0,0,1280,42),fill=INK)
    d.text((54,12),'STELLAR TESTNET  /  VALUELESS TEST ASSETS',font=font(16),fill=BG)
    d.text((54,77),'yieldshield',font=font(37,True),fill=INK)
    d.text((54,149),kicker,font=font(17,True),fill=INK)
    d.line((54,188,1226,188),fill=LINE,width=1)
    d.line((54,644,1226,644),fill=LINE,width=1)
    d.text((54,670),'AI-narrated presentation  ·  AI-assisted, unaudited prototype',font=font(17),fill=INK)
    return im,d
im,d=base('STELLAR RESERVE LAB')
d.text((54,229),'Explicit backing.',font=font(79,serif=True),fill=INK)
d.text((54,329),'Visible exit rights.',font=font(79,serif=True),fill=INK)
d.rectangle((54,475,590,536),fill=ACCENT)
d.text((75,494),'A team and product walkthrough',font=font(26),fill=INK)
d.text((54,575),'stellar.yieldshield.ai',font=font(26),fill=INK)
im.save(OUT/'00-title.png')
im,d=base('THE TEAM')
d.text((54,221),'David Hawig',font=font(61,serif=True),fill=INK)
d.text((54,306),'Founder & Managing Director',font=font(25,True),fill=INK)
d.text((54,355),'Former Director of Ecosystem',font=font(23),fill=INK)
d.text((54,389),'Web3 Foundation',font=font(23),fill=INK)
d.line((630,227,630,504),fill=LINE,width=1)
d.text((680,221),'Santiago Balaguer',font=font(54,serif=True),fill=INK)
d.text((680,306),'Cofounder & Product Lead',font=font(25,True),fill=INK)
d.text((680,355),'15 years in product',font=font(23),fill=INK)
d.text((680,389),'Including 5 years in crypto',font=font(23),fill=INK)
d.text((54,558),'Hawig Ventures UG (haftungsbeschränkt) · Germany',font=font(23),fill=INK)
im.save(OUT/'06-team.png')
im,d=base('THE NEXT PHASE')
d.text((54,220),'From prototype to reviewed release.',font=font(57,serif=True),fill=INK)
for i,t in enumerate(['Verified asset integrations','Conservative valuation','Monitoring and independent review']):
    y=327+i*67
    d.rectangle((56,y+3,77,y+24),fill=ACCENT)
    d.text((102,y),t,font=font(31),fill=INK)
d.text((54,573),'Explore: stellar.yieldshield.ai',font=font(29,True),fill=INK)
im.save(OUT/'07-next.png')
print('Rendered 3 original title cards; public screenshots remain unchanged.')
