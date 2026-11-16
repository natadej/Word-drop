# Word Drop (อ่านให้ทัน!)

A falling-word reading game for kids. Words, Chinese characters or sums drop from the top like Tetris; the child reads each one aloud before it lands on the stack. The microphone checks the answer (Web Speech API), and a parent "✓ He read it!" button always works too.

Static site: no build step, no server code. Serve the folder with any static server, e.g. `python3 -m http.server 8080`.

## Subjects
- **Thai**, **English**, **Chinese (Simplified)**: built-in word banks for ages 4–6, 7–9 and 10–12 (`banks.js`), plus your own lists.
- **Math**: generated sums that get harder level by level and by age. The child says the answer in English, Thai or Chinese (set per profile).
- **Mix**: 15 items per level mixing all four; the mic switches language for each item.

## Levels and scoring
- 15 items per level; each item is worth up to 100 points (timed from when it touches the red line: 100 within 1 s, down to 60 just before it lands, 0 if missed, half with "Hear it").
- 80% of the points passes the level and unlocks the next one.
- **🎯 Smart practice** (built-in words) and **📚 book lists** pick words for each child: every word is tracked, and it counts as learned after it is read well in 3 rounds (a miss resets it). Each round mixes words he is still learning, new words at his reading level, 1–2 harder "stretch" words and one old word to check. The reading level (shown on the list) starts from age or book photos, goes up when he reads words above it and when most words at his level are learned, and goes down when he struggles.
- Level 1 starts at 3 s per item (setting), each level 0.1 s faster, minimum 1.8 s.

## Thai phonics and Listen & repeat
- **🔤 Phonics** (Thai tab): one level per lesson: พยัญชนะ ก–ฮ in 4 levels (อักษรกลาง, อักษรสูง, อักษรต่ำคู่, อักษรต่ำเดี่ยว), สระ, แม่ ก กา, สระเสียงสั้น/ยาว, สระประสม, วรรณยุกต์ and ผันเสียง, แม่ กง กน กม เกย เกอว กก กด กบ, คำควบกล้ำ, อักษรนำ, คำหลายพยางค์ and ตัวการันต์ (`thai.js`).
- Before a level, a quick **Listen & repeat** warm-up shows each new word split into พยัญชนะต้น, สระ, ตัวสะกด (แม่ …) and วรรณยุกต์, spells it aloud (e.g. บอ-อา-นอ-บาน-ไม้โท-บ้าน) and waits for the child to say it (mic or ✓). Words he already knows are left out. ⏭ skips it; it can be turned off in Settings.

## Profiles and daily record
- Each child has a profile with name and age; age picks the built-in words and math difficulty.
- Daily goal (levels passed per day), day streak and a 14-day calendar.
- Everything is stored in the browser (`localStorage`; full-size book photos in IndexedDB).
- **☁️ Sync with Google (optional):** sign in with Google in Settings and profiles, lists, progress, learned words and book photos follow you to every device signed in with the same account (Firebase Auth + Firestore, `cloud.js`). One-time setup by the parent:
  1. Create a free project at console.firebase.google.com, add a **Web app** and copy its `firebaseConfig`.
  2. **Authentication → Sign-in method → Google**: enable. **Settings → Authorized domains**: add the domain the game is served from.
  3. **Firestore Database**: create, then set the rules below.
  4. In the game: Settings → Sync with Google → One-time setup → paste the config → Sign in. On other devices use “📲 Set up another device” (a link that carries the config), then sign in.
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{db}/documents {
      match /users/{uid}/{doc=**} { allow read, write: if request.auth != null && request.auth.uid == uid; }
    }
  }
  ```
  The config is kept only in the browser, not in this repo.

## Making lists from a schoolbook photo
- **Google Lens (free):** copy the text in Lens, then "📋 Paste text" in the app.
- **Gemini (optional, most accurate):** add a Gemini API key in Settings (saved only in that browser). Photos are read and split into words or sums, and Gemini can add ~30 more items at the same difficulty as the page. "✨ Make words for age N" creates a list from a topic.
- **OpenThai reader (free, Thai and English):** [OpenThai 2.0 OCR Text](https://huggingface.co/iapp/OpenThai2.0-OCR-Text) by iApp (Apache-2.0, see `openthai/NOTICE`), run on the device with ONNX Runtime Web (`openthai.js`, a JavaScript port of the model's line engine). The photo never leaves the device; the ~4 MB model is downloaded once and kept in the browser cache. Also used when Gemini fails.
- **Built-in reader for 中文 and math:** Tesseract.js, makes mistakes.

## Book photos set the difficulty
Every photo you read is kept per child and subject as a reference: a small thumbnail, the words or sums found on it, and a school grade level (estimated by Gemini, or by word length/number size with the free readers).
- **📚 From <name>'s books**: one list per subject that grows with every photo.
- Once a subject has photos, its difficulty comes from them instead of age (weighted average of the last 6, newest counting most). This picks the built-in word bank, math difficulty, Mix content and what Gemini generates.
- Photos are shown under the word lists; tap one to view (full size) or delete it, optionally with the list made from it. 🗑 on the book list deletes the whole book; 🗑 on a list deletes it (optionally with its photos).

Lists can be shared with the 🔗 button (the list is encoded in the link).
