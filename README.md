# Word Drop (อ่านให้ทัน!)

A falling-word reading game for kids. Words, Chinese characters or sums drop from the top like Tetris; the child reads each one aloud before it lands on the stack. The microphone checks the answer (Web Speech API), and a parent "✓ He read it!" button always works too.

Static site: no build step, no server code. Serve the folder with any static server, e.g. `python3 -m http.server 8080`.

## Subjects
- **Thai**, **English**, **Chinese (Simplified)**: built-in word banks for ages 4–6, 7–9 and 10–12 (`banks.js`), plus your own lists.
- **Math**: generated sums that get harder level by level and by age. The child says the answer in English, Thai or Chinese (set per profile).
- **Mix**: 15 items per level mixing all four; the mic switches language for each item.

## Levels and scoring
- 15 items per level; each item is worth up to 100 points (100 within 1 s, down to 60 just before it lands, 0 if missed, half with "Hear it").
- 80% of the points passes the level and unlocks the next one.
- Level 1 starts at 3 s per item (setting), each level 0.1 s faster, minimum 1.8 s.

## Profiles and daily record
- Each child has a profile with name and age; age picks the built-in words and math difficulty.
- Daily goal (levels passed per day), day streak and a 14-day calendar.
- Everything is stored in the browser's `localStorage`.

## Making lists from a schoolbook photo
- **Google Lens (free):** copy the text in Lens, then "📋 Paste text" in the app.
- **Gemini (optional, most accurate):** add a Gemini API key in Settings (saved only in that browser). Photos are read and split into words or sums, and Gemini can add ~30 more items at the same difficulty as the page. "✨ Make words for age N" creates a list from a topic.
- **Built-in reader:** Tesseract.js, works offline but makes mistakes.

Lists can be shared with the 🔗 button (the list is encoded in the link).
