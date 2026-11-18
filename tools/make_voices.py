"""Pre-record natural voices for the built-in words and praise lines.
Usage: pip install edge-tts && python3 tools/make_voices.py   (run from the repo root)
Writes audio/<lang>/<hash>.mp3 and audio/index.json ({"th-TH": {"word": "th/abc.mp3"}, ...})."""
import asyncio, hashlib, json, os, re
import edge_tts

FALLBACK = {'th-TH': 'th-TH-NiwatNeural', 'en-US': 'en-US-JennyNeural', 'zh-CN': 'zh-CN-XiaoyiNeural'}  # used when the main voice returns no audio
VOICES = {'th-TH': ('th-TH-PremwadeeNeural', '-10%'), 'en-US': ('en-US-AnaNeural', '-5%'), 'zh-CN': ('zh-CN-XiaoxiaoNeural', '-10%')}
PRAISE = {
    'th-TH': ['เก่งมาก!', 'ยอดเยี่ยม!', 'สุดยอดไปเลย!', 'ผ่านแล้ว เก่งมาก!', 'ไม่เป็นไร ลองอีกครั้งนะ สู้ๆ!', 'เลื่อนขั้นแล้ว!'],
    'en-US': ['Great job!', 'Awesome!', 'Amazing!', 'Level passed! Well done!', 'Good try! Let\'s try again!', 'You ranked up!'],
    'zh-CN': ['很好！', '太棒了！', '真厉害！', '过关了，真棒！', '没关系，再试一次，加油！', '升级了！'],
}
LANG_OF = {'th': 'th-TH', 'en': 'en-US', 'zh': 'zh-CN'}

def bank_words():
    src = open('banks.js', encoding='utf-8').read()
    out = {}
    for lang, body in re.findall(r"\n  (th|en|zh): \{(.*?)\n  \}", src, re.S):
        out[LANG_OF[lang]] = sorted({w for w in re.findall(r"'([^']+)'", body) if not re.fullmatch(r'\d+-\d+', w)})
    return out

async def main():
    index = {}
    words = bank_words()
    for code, (voice, rate) in VOICES.items():
        os.makedirs(f'audio/{code[:2]}', exist_ok=True)
        index[code] = {}
        for text in words.get(code, []) + PRAISE[code]:
            rel = f"{code[:2]}/{hashlib.sha1(text.encode()).hexdigest()[:10]}.mp3"
            if not os.path.exists('audio/' + rel) or os.path.getsize('audio/' + rel) == 0:
                for attempt in range(4):
                    try:
                        await edge_tts.Communicate(text, voice if attempt < 2 else FALLBACK[code], rate=rate).save('audio/' + rel)
                        if os.path.getsize('audio/' + rel): break
                    except Exception as e:
                        print('retry', text, e); await asyncio.sleep(3 + attempt * 3)
            if os.path.exists('audio/' + rel) and os.path.getsize('audio/' + rel) > 0: index[code][text] = rel
            else: print('MISSING', text)
    json.dump(index, open('audio/index.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print({k: len(v) for k, v in index.items()})

asyncio.run(main())
