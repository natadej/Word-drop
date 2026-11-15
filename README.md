# Thai Word Drop (อ่านให้ทัน!)

A Tetris-style Thai reading game for kids. Thai words fall down the screen, and the child reads each one aloud before it lands on the stack.

## Level 1: Word Drop
- **Make a word list from a photo**: take a photo of Thai text (a book page or worksheet). On-device Thai OCR (Tesseract.js) reads it, and `Intl.Segmenter` splits it into words. You can delete, join and edit words before saving. You can also paste text.
- **Gameplay**: one word falls at a time. The child reads it aloud. Thai speech recognition (`th-TH`, Web Speech API) clears the word when it hears it, and the parent can also tap **✓ He read it!**.
- **Scoring**: faster reading earns more points (10–100 per word), with a streak multiplier up to ×3. Using **🔊 Hear it** halves the points for that word. Every 5 words read, the words fall faster.
- **Missed words** land on the stack and come back again soon. Reading a stacked word, or tapping it, clears it for +5. The game ends when a column reaches the top, and the end screen lists the words to practise.
- **Share a list**: 🔗 makes a link that adds the word list on another device.

## Run
Static files only: `python3 -m http.server 8080`, then open http://localhost:8080.
Speech recognition needs HTTPS (or localhost) and works best in Chrome, especially Chrome on Android.
