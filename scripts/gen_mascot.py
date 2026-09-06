import asyncio, os, sys
from pathlib import Path
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration

KEY = os.environ['EMERGENT_LLM_KEY']
OUT = Path('/app/frontend/assets/images')
OUT.mkdir(parents=True, exist_ok=True)

STYLE = ("Kawaii cartoon mascot of a happy slice of toast bread with dripping golden honey on top, "
         "big cute eyes, rosy cheeks, simple thick clean outlines, flat vector sticker style, "
         "centered, on a plain solid white background, high quality, adorable, friendly. ")

JOBS = {
    'mascot_welcome': STYLE + "The toast is smiling and waving hello with one hand, wearing a tiny apron.",
    'mascot_box': STYLE + "The toast is holding an open cardboard box, looking helpful, as an empty-inventory illustration.",
    'mascot_happy': STYLE + "The toast is cheering with both arms up celebrating, confetti, super happy.",
    'mascot_sad': STYLE + "The toast looks a little sad and confused with a small sweat drop, for an error or empty state.",
}

async def main():
    gen = OpenAIImageGeneration(api_key=KEY)
    for name, prompt in JOBS.items():
        try:
            imgs = await gen.generate_images(prompt=prompt, model="gpt-image-1", number_of_images=1, quality="medium")
            (OUT / f"{name}.png").write_bytes(imgs[0])
            print("OK", name, len(imgs[0]))
        except Exception as e:
            print("FAIL", name, e)

asyncio.run(main())
