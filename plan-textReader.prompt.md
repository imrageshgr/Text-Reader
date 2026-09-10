## Plan: Universal Text Reader

Build on the existing browser speech reader by adding a document-ingestion pipeline:

`file or pasted text → extraction/OCR → normalized document → optional translation → English speech playback`

The existing playback, sentence navigation, fullscreen mode, and highlighting will remain the core reading experience.

**Steps**

1. **Create a shared document model**
   - Preserve source text, filename/type, page information, detected language, translated text, and sentence records.
   - Prevent source text, displayed text, translated text, and spoken text from becoming misaligned.
   - Keep the existing manual textarea workflow working.

2. **Add input sources**
   - Support pasted text, `.txt`, Markdown, and common text documents.
   - Add file selection and drag-and-drop.
   - Validate unsupported, empty, oversized, or unreadable files with clear status messages.

3. **Add PDF support**
   - Use PDF.js for selectable-text PDFs.
   - Extract text page by page while reporting progress.
   - Detect scanned/image-only PDFs and route them to OCR.

4. **Add image and scanned-PDF OCR**
   - Use Tesseract.js or a replaceable OCR provider.
   - Process pages/images independently so progress, retry, cancellation, and errors are possible.
   - Preserve page order and allow the extracted text to be reviewed before reading.

5. **Add English-focused reading behavior**
   - Filter available voices by language.
   - Prefer English voices and provide a useful fallback when no English voice is installed.
   - Clearly report unsupported or non-English text.
   - Continue reading valid English content where possible instead of failing the entire document.

6. **Add optional translation**
   - Add source-language and target-language controls.
   - Add an explicit translation action and translated-text preview.
   - Use a provider abstraction so the service can be changed later.
   - Do not embed private API keys in the static frontend. A backend/proxy will be required for providers that need secret credentials.
   - Kannada will be included as an initial target-language option, alongside common languages.

7. **Improve the existing interface**
   - Keep the current dark glass/purple design.
   - Add upload/drop-zone states, extraction/OCR progress, translation progress, errors, disabled states, and cancellation.
   - Preserve the existing playback controls, waveform, fullscreen reading mode, and sentence highlighting.
   - Ensure keyboard and mobile accessibility.

8. **Harden the reader**
   - Handle long documents, delayed browser voices, unavailable speech-boundary events, missing speech synthesis, pause/resume issues, and malformed files.
   - Keep OCR and translation work from freezing the interface.
   - Avoid uploading documents remotely without clear user awareness.

**Relevant files**

- [index.html](index.html) — add upload controls, drag-and-drop area, language selectors, translation controls, status messages, and progress regions.
- [app.js](app.js) — add document state, file adapters, PDF/OCR processing, translation integration, language handling, and normalized sentence records.
- [style.css](style.css) — style the new input workflow, progress/error states, responsive controls, and accessibility states.
- A future dependency/configuration file — needed for PDF.js, Tesseract.js, and possibly a translation backend.

**Verification**

1. Test pasted text, `.txt`, Markdown, selectable PDF, scanned PDF, and image input.
2. Test unsupported files, empty files, malformed PDFs, OCR failures, and cancelled processing.
3. Confirm sentence navigation, word highlighting, pause/resume, restart, and fullscreen mode remain aligned after extraction, OCR, and translation.
4. Test missing English voices, delayed voice loading, unsupported languages, and browsers without speech-boundary events.
5. Test desktop and mobile layouts with keyboard navigation.
6. Confirm no private translation credentials are exposed in frontend source.
7. Test large documents for memory use and UI responsiveness.

**Decisions**

- Full requested input scope is included in the first product direction.
- Implementation will still be staged so each capability can be verified independently.
- English reading is the primary speech contract.
- Kannada is an initial translation target.
- Existing visual design will be preserved.
- Accounts, cloud document storage, handwriting recognition, audio export, and persistent document history are outside the first version.

The plan is ready for your review.
