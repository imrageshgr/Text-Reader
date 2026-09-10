/**
 * VoiceRead – Smart Text-to-Speech Reader
 * - Filters dashes/hyphens from spoken text
 * - Fullscreen reading overlay
 * - Word-by-word highlighting via SpeechSynthesisUtterance.onboundary
 */

// ─── Abbreviations ───────────────────────────────────────────────────────────

const ABBREVIATIONS = {
  'ChatGPT':'Chat G P T','GPT-4':'G P T 4','GPT-3':'G P T 3',
  'GPT-4o':'G P T 4 oh','GPT-3.5':'G P T 3 point 5',
  'DALL·E':'Dolly','DALL-E':'Dolly','OpenAI':'Open A I',
  'AI':'A I','ML':'M L','NLP':'N L P','API':'A P I',
  'UI':'U I','UX':'U X','HTML':'H T M L','CSS':'C S S',
  'JS':'JavaScript','JSON':'Jason','URL':'U R L',
  'HTTP':'H T T P','HTTPS':'H T T P S','SQL':'S Q L',
  'CPU':'C P U','GPU':'G P U','RAM':'ram','LLM':'L L M',
  'LLMs':'L L Ms','AGI':'A G I','VPN':'V P N',
  'SaaS':'sass','PaaS':'pass','IaaS':'I as a service',
  'IoT':'Internet of Things','e.g.':'for example,',
  'i.e.':'that is,','etc.':'etcetera','vs.':'versus','vs':'versus',
  'Dr.':'Doctor','Mr.':'Mister','Mrs.':'Missus','Ms.':'Miss',
  'Prof.':'Professor','approx.':'approximately','est.':'established',
  'dept.':'department','avg.':'average','max.':'maximum',
  'min.':'minimum','fig.':'figure','ref.':'reference',
  'km':'kilometers','kg':'kilograms','hrs':'hours',
  'mins':'minutes','secs':'seconds','NASA':'nasa',
  'WHO':'the World Health Organization','UN':'the United Nations',
  'EU':'the European Union','USA':'the U S A','UK':'the U K',
  'IMHO':'in my humble opinion','FYI':'for your information',
  'ASAP':'as soon as possible','TBD':'to be determined',
  'TL;DR':'too long, did not read','IMO':'in my opinion',
};

/**
 * Strip formatting/decorative symbols that should NEVER be spoken.
 *
 * REMOVED (silently):  ** * # _ ` ~ | > bullets --- -- horizontal rules
 *                       markdown links [text](url) → just "text"
 *                       markdown images ![alt](url) → just "alt"
 * KEPT (spoken):       + = % × ÷ ^ math chars, numbers, punctuation
 */
function cleanFormattingSymbols(text) {
  // ── Horizontal rules (lines of --- === *** ___) → blank line
  text = text.replace(/^[ \t]*([\-_*=]){3,}[ \t]*$/gm, '');

  // ── Markdown headings: # Heading → Heading
  text = text.replace(/^#{1,6}\s+/gm, '');

  // ── Markdown images: ![alt](url) → alt
  text = text.replace(/!\[([^\]]*?)\]\([^)]*?\)/g, '$1');

  // ── Markdown links: [text](url) → text
  text = text.replace(/\[([^\]]*?)\]\([^)]*?\)/g, '$1');

  // ── Bold+italic: ***text*** or ___text___ → text
  text = text.replace(/[*_]{3}([^*_]+?)[*_]{3}/g, '$1');

  // ── Bold: **text** or __text__ → text
  text = text.replace(/[*_]{2}([^*_]+?)[*_]{2}/g, '$1');

  // ── Italic: *text* or _text_ → text
  text = text.replace(/[*_]([^*_\n]+?)[*_]/g, '$1');

  // ── Strikethrough: ~~text~~ → text
  text = text.replace(/~~([^~]+?)~~/g, '$1');

  // ── Inline code: `code` → code (read the content, skip the backticks)
  text = text.replace(/`([^`]+?)`/g, '$1');

  // ── Fenced code blocks: ```...``` → (skip or read the content without backticks)
  text = text.replace(/```[\s\S]*?```/g, '');

  // ── Blockquote markers at line start: > text → text
  text = text.replace(/^>+\s*/gm, '');

  // ── Bullet points: lines starting with * - • ◦ · + (as bullet, not math)
  //    Only remove when at start of line followed by a space
  text = text.replace(/^[ \t]*[*\-•◦·][ \t]+/gm, '');

  // ── Numbered list dots: "1. " "2. " → keep the number, remove the dot+space
  //    Actually keep them; readers say "one." naturally.

  // ── Lone pipe characters used in tables | col | col | → space
  text = text.replace(/\|/g, ' ');

  // ── Multiple dashes (em-dashes used as separators, not math minus)
  text = text.replace(/-{2,}/g, ' ');

  // ── Lone hyphen surrounded by spaces: " - " → " "
  text = text.replace(/ - /g, ' ');

  // ── Leading hyphens on a line (leftover bullets): "- item" → "item"
  text = text.replace(/^-+\s+/gm, '');

  // ── Tilde characters not part of strikethrough (leftover single ~)
  text = text.replace(/~/g, '');

  // ── Caret ^ used as superscript marker (not XOR in plain text)
  //    Leave it for now – math text uses it meaningfully.

  // ── Collapse multiple blank lines into one
  text = text.replace(/\n{3,}/g, '\n\n');

  return text;
}

/**
 * Expand math/tech symbols into words for TTS (spoken form).
 * ONLY called on the TTS copy, not the display copy.
 */
const MATH_SYMBOL_MAP = {
  '&':' and ','@':' at ','%':' percent ',
  '+':' plus ','=':' equals ',
  '×':' times ','÷':' divided by ',
  '≈':' approximately equals ','≠':' not equal to ',
  '≤':' less than or equal to ','≥':' greater than or equal to ',
  '<':' less than ','>':' greater than ',
  '→':' leads to ','←':' from ','↑':' up ','↓':' down ',
  '…':'. ',
  '\u2013':' , ','\u2014':' , ',  // en-dash, em-dash
};

function expandAbbreviations(text) {
  // Expand math symbols
  for (const [sym, word] of Object.entries(MATH_SYMBOL_MAP)) {
    text = text.split(sym).join(word);
  }
  // Expand known abbreviations
  for (const [abbr, expanded] of Object.entries(ABBREVIATIONS)) {
    const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`(?<![\\w])${escaped}(?![\\w])`, 'g'), expanded);
  }
  return text;
}

function splitIntoSentences(text) {
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const raw = text.split(/(?<=[.!?])\s+(?=[A-Z\u00C0-\u024F\n])/);
  const sentences = [];
  for (const part of raw) {
    const paras = part.split(/\n{2,}/);
    for (const para of paras) {
      const t = para.trim();
      if (t.length > 0) sentences.push(t);
    }
  }
  return sentences.filter(s => s.length > 0);
}

function addNaturalPauses(text) {
  text = text.replace(/([,;:])\s*/g, '$1 ');
  text = text.replace(/\(/g, ', ').replace(/\)/g, ', ');
  return text;
}

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  sentences: [],        // processed sentences for TTS
  displaySentences: [], // original sentences for display (with words)
  currentIndex: 0,
  isPlaying: false,
  isPaused: false,
  utterance: null,
  startTime: null,
  elapsedTimer: null,
  totalElapsed: 0,
  fsOpen: false,
  currentWordIndex: -1,
  document: {
    name: '',
    type: 'text',
    sourceText: '',
    activeText: '',
    sourceLanguage: 'auto',
    translated: false,
  },
  isProcessing: false,
  cancelProcessing: false,
  selectedText: '',
};

// ─── DOM ─────────────────────────────────────────────────────────────────────

const textInput       = document.getElementById('textInput');
const voiceSelect     = document.getElementById('voiceSelect');
const voiceHelp       = document.getElementById('voiceHelp');
const speedRange      = document.getElementById('speedRange');
const pitchRange      = document.getElementById('pitchRange');
const volumeRange     = document.getElementById('volumeRange');
const speedValue      = document.getElementById('speedValue');
const pitchValue      = document.getElementById('pitchValue');
const volumeValue     = document.getElementById('volumeValue');
const expandAbbrCb    = document.getElementById('expandAbbr');
const naturalPausesCb = document.getElementById('naturalPauses');
const playBtn         = document.getElementById('playBtn');
const stopBtn         = document.getElementById('stopBtn');
const restartBtn      = document.getElementById('restartBtn');
const prevBtn         = document.getElementById('prevBtn');
const nextBtn         = document.getElementById('nextBtn');
const clearBtn        = document.getElementById('clearBtn');
const pasteBtn        = document.getElementById('pasteBtn');
const fullscreenBtn   = document.getElementById('fullscreenBtn');
const statusBadge     = document.getElementById('statusBadge');
const statusText      = document.getElementById('statusText');
const currentSentText = document.getElementById('currentSentenceText');
const waveform        = document.getElementById('waveform');
const progressFill    = document.getElementById('progressFill');
const sentenceCounter = document.getElementById('sentenceCounter');
const timeElapsed     = document.getElementById('timeElapsed');
const wordCount       = document.getElementById('wordCount');
const estTime         = document.getElementById('estTime');
const toastEl         = document.getElementById('toast');
const readAloudBtn    = document.getElementById('readAloudBtn');
const fileInput       = document.getElementById('fileInput');
const dropZone        = document.getElementById('dropZone');
const sourceStatus    = document.getElementById('sourceStatus');
const sourceStatusText = document.getElementById('sourceStatusText');
const processingPanel = document.getElementById('processingPanel');
const processingLabel = document.getElementById('processingLabel');
const processingPercent = document.getElementById('processingPercent');
const processingFill  = document.getElementById('processingFill');
const cancelProcessingBtn = document.getElementById('cancelProcessingBtn');
const sourceLanguage  = document.getElementById('sourceLanguage');
const targetLanguage  = document.getElementById('targetLanguage');
const translateBtn    = document.getElementById('translateBtn');
const meaningInput    = document.getElementById('meaningInput');
const meaningLanguage = document.getElementById('meaningLanguage');
const understandBtn   = document.getElementById('understandBtn');
const meaningResult   = document.getElementById('meaningResult');
const meaningWord     = document.getElementById('meaningWord');
const meaningPronunciation = document.getElementById('meaningPronunciation');
const meaningDefinition = document.getElementById('meaningDefinition');
const meaningTranslation = document.getElementById('meaningTranslation');
const meaningExample  = document.getElementById('meaningExample');
const meaningExampleText = document.getElementById('meaningExampleText');
const meaningNote     = document.getElementById('meaningNote');
const pronounceBtn    = document.getElementById('pronounceBtn');

// Fullscreen elements
const fsOverlay       = document.getElementById('fsOverlay');
const fsCloseBtn      = document.getElementById('fsCloseBtn');
const fsPlayBtn       = document.getElementById('fsPlayBtn');
const fsPrevBtn       = document.getElementById('fsPrevBtn');
const fsNextBtn       = document.getElementById('fsNextBtn');
const fsSentence      = document.getElementById('fsSentence');
const fsProgressFill  = document.getElementById('fsProgressFill');
const fsSentCounter   = document.getElementById('fsSentenceCounter');
const fsWaveform      = document.getElementById('fsWaveform');

// ─── Document input ─────────────────────────────────────────────────────────

function setSourceStatus(message, mode = '') {
  sourceStatusText.textContent = message;
  sourceStatus.className = `source-status${mode ? ` ${mode}` : ''}`;
}

function setProcessing(label, percent = 0) {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  processingPanel.classList.remove('hidden');
  processingLabel.textContent = label;
  processingPercent.textContent = `${safePercent}%`;
  processingFill.style.width = `${safePercent}%`;
  state.isProcessing = true;
}

function finishProcessing() {
  processingPanel.classList.add('hidden');
  state.isProcessing = false;
}

function assertNotCancelled() {
  if (state.cancelProcessing) throw new Error('PROCESSING_CANCELLED');
}

function setDocumentText(text, metadata = {}) {
  const cleanText = String(text || '').trim();
  textInput.value = cleanText;
  textInput.setSelectionRange(0, 0);
  state.selectedText = '';
  state.document = {
    ...state.document,
    ...metadata,
    sourceText: cleanText,
    activeText: cleanText,
    translated: false,
  };
  sourceLanguage.value = metadata.sourceLanguage || sourceLanguage.value || 'auto';
  translateBtn.disabled = !cleanText;
  updateStats();
  updateSelectionState();
}

function getSelectedText() {
  const start = textInput.selectionStart ?? 0;
  const end = textInput.selectionEnd ?? 0;
  return start === end ? '' : textInput.value.slice(start, end).trim();
}

function updateSelectionState() {
  state.selectedText = getSelectedText();
  const hasSelection = Boolean(state.selectedText);
  readAloudBtn.disabled = !textInput.value.trim();
  readAloudBtn.classList.toggle('has-selection', hasSelection);
  if (hasSelection && document.activeElement !== meaningInput) meaningInput.value = state.selectedText;
  understandBtn.disabled = !meaningInput.value.trim();

  if (state.isPlaying || state.isPaused) return;
  if (hasSelection) {
    currentSentText.textContent = 'Selected text is ready to read';
    fsSentence.textContent = 'Selected text is ready to read';
    setSourceStatus(`${state.selectedText.length.toLocaleString()} characters selected`, 'success');
  } else if (textInput.value.trim()) {
    currentSentText.textContent = 'Full text is ready to read';
    fsSentence.textContent = 'Full text is ready to read';
    setSourceStatus('Text loaded. Highlight a part to read only that part, or read all.', '');
  } else {
    currentSentText.textContent = 'Select text to read';
    fsSentence.textContent = 'Select text to read';
  }
}

function setMeaningLoading(message) {
  meaningResult.classList.remove('hidden');
  meaningWord.textContent = 'Looking it up...';
  meaningPronunciation.textContent = '';
  meaningDefinition.textContent = message;
  meaningTranslation.textContent = '';
  meaningExample.classList.add('hidden');
  meaningNote.textContent = '';
}

async function translatePhrase(phrase, language) {
  if (language === 'en') return phrase;
  const response = await fetchWithTimeout(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(phrase)}&langpair=en|${encodeURIComponent(language)}`);
  if (!response.ok) throw new Error('Translation service is unavailable.');
  const payload = await response.json();
  return payload.responseData?.translatedText || 'Translation unavailable.';
}

async function fetchWithTimeout(url, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function explainSelection() {
  const phrase = meaningInput.value.trim();
  if (!phrase) return;
  setMeaningLoading('Finding a clear explanation...');
  understandBtn.disabled = true;
  const isWord = /^[a-zA-Z][a-zA-Z'-]*$/.test(phrase);
  try {
    let definition = 'This is a phrase or sentence. The translation below gives its meaning in your chosen language.';
    let pronunciation = '';
    let example = '';
    if (isWord) {
      const response = await fetchWithTimeout(`https://api.datamuse.com/words?sp=${encodeURIComponent(phrase.toLowerCase())}&md=dps&max=1`);
      if (response.ok) {
        const entries = await response.json();
        const entry = entries[0];
        const definitionEntry = entry?.defs?.find(item => item.includes('\t')) || entry?.defs?.[0] || '';
        definition = definitionEntry.split('\t').pop() || definition;
      }
    }
    if (!example) {
      example = isWord
        ? `I learned the word “${phrase}” while reading today.`
        : `This sentence can be used when explaining “${phrase}” to someone else.`;
    }
    const translation = await translatePhrase(phrase, meaningLanguage.value);
    meaningResult.classList.remove('hidden');
    meaningWord.textContent = phrase;
    meaningPronunciation.textContent = pronunciation ? `Pronunciation: ${pronunciation}` : 'Pronunciation: use the speaker button.';
    meaningDefinition.textContent = definition;
    meaningTranslation.textContent = `Translation: ${translation}`;
    meaningExampleText.textContent = example;
    meaningExample.classList.toggle('hidden', !example);
    meaningNote.textContent = isWord ? 'Definition from an English dictionary.' : 'For longer selections, the translation is shown as the main meaning.';
  } catch (error) {
    meaningResult.classList.remove('hidden');
    meaningWord.textContent = phrase;
    meaningPronunciation.textContent = '';
    meaningDefinition.textContent = 'I could not reach the meaning service. Please check your connection and try again.';
    meaningTranslation.textContent = '';
    meaningExample.classList.add('hidden');
    meaningNote.textContent = error.message;
  } finally {
    understandBtn.disabled = !meaningInput.value.trim();
  }
}

function pronounceMeaning() {
  const phrase = meaningInput.value.trim();
  if (!phrase || !('speechSynthesis' in window)) {
    showToast('Pronunciation is not supported by this browser.');
    return;
  }
  if (!voices.length) {
    showToast('No speech voice is available. Install an English system voice, then reload.');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(phrase);
  utterance.lang = 'en-US';
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

function fileKind(file) {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(name)) return 'image';
  if (file.type === 'text/plain' || file.type === 'text/markdown' || /\.(txt|md|markdown)$/i.test(name)) return 'text';
  return '';
}

async function extractPdfText(data) {
  if (!window.pdfjsLib) throw new Error('PDF tools are still loading. Please try again.');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await window.pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    assertNotCancelled();
    setProcessing(`Reading PDF page ${pageNumber} of ${pdf.numPages}`, ((pageNumber - 1) / pdf.numPages) * 70);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(pdfItemsToLines(content.items));
  }
  const cleanedPages = removePdfFurniture(pages);
  const text = cleanedPages.filter(Boolean).join('\n\n');
  return { text, pages: cleanedPages, pdf };
}

function pdfItemsToLines(items) {
  const lines = [];
  const sortedItems = items
    .filter(item => item.str?.trim())
    .sort((a, b) => {
      const yDifference = (b.transform?.[5] || 0) - (a.transform?.[5] || 0);
      return Math.abs(yDifference) > 3 ? yDifference : (a.transform?.[4] || 0) - (b.transform?.[4] || 0);
    });

  sortedItems.forEach(item => {
    const y = item.transform?.[5] || 0;
    let line = lines.find(candidate => Math.abs(candidate.y - y) <= 3);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  });

  return lines
    .sort((a, b) => b.y - a.y)
    .map(line => line.items
      .sort((a, b) => (a.transform?.[4] || 0) - (b.transform?.[4] || 0))
      .map(item => item.str.trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
    .join('\n');
}

function removePdfFurniture(pages) {
  const pageLines = pages.map(page => page.split(/\n+/).map(line => line.trim()).filter(Boolean));
  const candidates = [];
  pageLines.forEach(lines => {
    candidates.push(...lines.slice(0, 2), ...lines.slice(-2));
  });
  const counts = new Map();
  candidates.forEach(line => {
    const key = line.toLowerCase().replace(/\s+/g, ' ');
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const repeatThreshold = Math.max(2, Math.ceil(pageLines.length * 0.5));
  const repeatedFurniture = new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= repeatThreshold)
      .map(([line]) => line),
  );

  return pageLines.map(lines => lines
    .filter(line => !/^page\s*\d+(\s*(of|\/)\s*\d+)?$/i.test(line))
    .filter(line => !repeatedFurniture.has(line.toLowerCase().replace(/\s+/g, ' ')))
    .join('\n'));
}

async function recognizeImage(image, label = 'Reading image') {
  if (!window.Tesseract) throw new Error('OCR tools are still loading. Please try again.');
  const result = await window.Tesseract.recognize(image, 'eng', {
    logger: message => {
      if (message.status === 'recognizing text' && typeof message.progress === 'number') {
        setProcessing(label, 70 + message.progress * 30);
      }
    },
  });
  return result.data.text.trim();
}

async function ocrPdf(data, pdfInfo) {
  const pdf = pdfInfo || await window.pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    assertNotCancelled();
    setProcessing(`Scanning PDF page ${pageNumber} of ${pdf.numPages}`, ((pageNumber - 1) / pdf.numPages) * 70);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    pages.push(await recognizeImage(canvas, `Scanning PDF page ${pageNumber} of ${pdf.numPages}`));
  }
  return removePdfFurniture(pages).filter(Boolean).join('\n\n');
}

async function processFile(file) {
  const kind = fileKind(file);
  if (!kind) throw new Error('This file type is not supported. Choose TXT, Markdown, PDF, or an image.');
  if (file.size > 25 * 1024 * 1024) throw new Error('This file is larger than 25 MB. Please choose a smaller document.');

  state.cancelProcessing = false;
  setProcessing(`Opening ${file.name}`, 5);
  let text = '';
  if (kind === 'text') {
    text = await file.text();
    setProcessing('Text document ready', 100);
  } else if (kind === 'image') {
    text = await recognizeImage(file, `Reading ${file.name}`);
  } else {
    const data = await file.arrayBuffer();
    const extracted = await extractPdfText(data);
    text = extracted.text;
    if (text.replace(/\s/g, '').length < 40) {
      text = await ocrPdf(data, extracted.pdf);
    } else {
      setProcessing('PDF text ready', 100);
    }
  }
  assertNotCancelled();
  if (!text.trim()) throw new Error('No readable English text was found in this file.');
  setDocumentText(text, { name: file.name, type: kind });
  finishProcessing();
  setSourceStatus(`${file.name} is ready to read`, 'success');
  showToast(`${file.name} loaded`);
}

async function handleFile(file) {
  if (!file) return;
  doStop();
  try {
    await processFile(file);
  } catch (error) {
    finishProcessing();
    if (error.message === 'PROCESSING_CANCELLED') {
      setSourceStatus('Processing cancelled');
      return;
    }
    console.error(error);
    setSourceStatus(error.message || 'Could not read this file.', 'error');
    showToast(error.message || 'Could not read this file.');
  }
}

async function translateActiveText() {
  const text = state.document.sourceText || textInput.value.trim();
  const target = targetLanguage.value;
  if (!text || target === 'en') {
    if (target === 'en') setDocumentText(state.document.sourceText || text, { translated: false });
    return;
  }
  state.cancelProcessing = false;
  setProcessing('Translating text...', 10);
  translateBtn.disabled = true;
  try {
    const chunks = text.match(/[\s\S]{1,450}/g) || [];
    const translated = [];
    for (let index = 0; index < chunks.length; index += 1) {
      assertNotCancelled();
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunks[index])}&langpair=${encodeURIComponent((sourceLanguage.value === 'auto' ? 'en' : sourceLanguage.value) + '|' + target)}`);
      if (!response.ok) throw new Error('Translation service is unavailable right now.');
      const payload = await response.json();
      if (!payload.responseData?.translatedText) throw new Error('The translation service returned no text.');
      translated.push(payload.responseData.translatedText);
      setProcessing(`Translating part ${index + 1} of ${chunks.length}`, ((index + 1) / chunks.length) * 100);
    }
    setDocumentText(translated.join(' '), { translated: true, sourceLanguage: sourceLanguage.value });
    finishProcessing();
    setSourceStatus(`Translated to ${targetLanguage.options[targetLanguage.selectedIndex].text}`, 'success');
    showToast('Translation ready');
  } catch (error) {
    finishProcessing();
    setSourceStatus(error.message === 'PROCESSING_CANCELLED' ? 'Translation cancelled' : error.message, 'error');
    showToast(error.message === 'PROCESSING_CANCELLED' ? 'Translation cancelled' : 'Translation failed');
  } finally {
    translateBtn.disabled = !textInput.value.trim();
  }
}

// ─── Voices ──────────────────────────────────────────────────────────────────

let voices = [];

function loadVoices() {
  voices = window.speechSynthesis.getVoices();
  voiceSelect.innerHTML = '';
  if (!voices.length) {
    voiceSelect.innerHTML = '<option value="">No voices available</option>';
    voiceHelp.textContent = 'No speech voice is installed. Install an English system voice, then reload this page.';
    voiceHelp.className = 'voice-help warning';
    updateSelectionState();
    return;
  }
  voiceHelp.textContent = `${voices.length} voice${voices.length === 1 ? '' : 's'} available. English voices are listed first.`;
  voiceHelp.className = 'voice-help';
  const engVoices = voices.filter(v => v.lang.startsWith('en'));
  const othVoices = voices.filter(v => !v.lang.startsWith('en'));

  const makeGroup = (label, list, offset) => {
    if (!list.length) return;
    const g = document.createElement('optgroup');
    g.label = label;
    list.forEach(v => {
      const opt = document.createElement('option');
      opt.dataset.voiceIndex = voices.indexOf(v);
      opt.textContent = `${v.name} (${v.lang})${v.localService ? ' ★' : ''}`;
      g.appendChild(opt);
    });
    voiceSelect.appendChild(g);
  };
  makeGroup('English Voices ★', engVoices, 0);
  makeGroup('Other Languages', othVoices, engVoices.length);

  const preferred = voices.find(v => v.lang.startsWith('en') && v.localService && /natural|premium|enhanced/i.test(v.name))
    || voices.find(v => v.lang === 'en-US' && v.localService)
    || voices.find(v => v.lang.startsWith('en'))
    || voices[0];
  if (preferred) {
    const opt = voiceSelect.querySelector(`[data-voice-index="${voices.indexOf(preferred)}"]`);
    if (opt) opt.selected = true;
  }
  updateSelectionState();
}
window.speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

function getSelectedVoice() {
  const sel = voiceSelect.querySelector('option:checked');
  return sel ? voices[parseInt(sel.dataset.voiceIndex)] || null : null;
}

// ─── Text Processing ─────────────────────────────────────────────────────────

function processText(raw) {
  let text = raw.trim();
  if (!text) return { tts: [], display: [] };

  // Step 1: Strip all formatting/decorative symbols (**, *, #, _, `, ~, |, dashes...)
  //         This applies to BOTH display and TTS so the shown text is also clean.
  text = cleanFormattingSymbols(text);

  // Step 2: Split for display (clean text, no abbreviation expansion)
  const displaySents = splitIntoSentences(text);

  // Step 3: For TTS, also expand abbreviations and math symbols into spoken words
  let ttsText = expandAbbrCb.checked ? expandAbbreviations(text) : text;
  let ttsSents = splitIntoSentences(ttsText);

  if (naturalPausesCb.checked) {
    ttsSents = ttsSents.map(s => addNaturalPauses(s));
  }

  return { tts: ttsSents, display: displaySents };
}

// ─── Word-by-word highlighting ────────────────────────────────────────────────

/**
 * Build word <span> elements for the fullscreen sentence display.
 * Returns array of span elements.
 */
function buildWordSpans(sentence) {
  fsSentence.innerHTML = '';
  const words = sentence.split(/(\s+)/); // keep spaces
  const spans = [];
  words.forEach(token => {
    if (/^\s+$/.test(token)) {
      fsSentence.appendChild(document.createTextNode(token));
    } else if (token.length > 0) {
      const span = document.createElement('span');
      span.className = 'fs-word';
      span.textContent = token;
      fsSentence.appendChild(span);
      spans.push(span);
    }
  });
  return spans;
}

let wordSpans = [];

function highlightWordAt(charIndex, charLength) {
  // Remove previous highlight
  wordSpans.forEach(s => s.classList.remove('active'));
  if (!wordSpans.length) return;

  // Find which span corresponds to charIndex
  // We track cumulative char positions
  let pos = 0;
  for (const span of wordSpans) {
    const len = span.textContent.length;
    if (charIndex >= pos && charIndex < pos + len) {
      span.classList.add('active');
      // Scroll into view smoothly if needed
      span.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      break;
    }
    pos += len + 1; // +1 for space
  }
}

// ─── Stats ───────────────────────────────────────────────────────────────────

function updateStats() {
  const text = textInput.value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  wordCount.textContent = `${words.toLocaleString()} words · ${text.length.toLocaleString()} characters`;
  const speed = parseFloat(speedRange.value) || 1;
  const mins = Math.ceil(words / (150 * speed));
  estTime.textContent = mins < 1 ? '< 1 min read' : `~${mins} min read`;
}
textInput.addEventListener('input', () => {
  state.document.sourceText = textInput.value;
  state.document.activeText = textInput.value;
  state.document.translated = false;
  translateBtn.disabled = !textInput.value.trim();
  updateStats();
  updateSelectionState();
});
textInput.addEventListener('select', updateSelectionState);
textInput.addEventListener('keyup', updateSelectionState);
document.addEventListener('selectionchange', () => {
  if (document.activeElement === textInput) updateSelectionState();
});
speedRange.addEventListener('input', updateStats);
updateStats();
updateSelectionState();

// ─── Timer ───────────────────────────────────────────────────────────────────

function startTimer() {
  state.startTime = Date.now();
  state.elapsedTimer = setInterval(() => {
    if (!state.isPlaying || state.isPaused) return;
    state.totalElapsed += Date.now() - state.startTime;
    state.startTime = Date.now();
    const secs = Math.floor(state.totalElapsed / 1000);
    timeElapsed.textContent = `${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;
  }, 500);
}
function stopTimer() { clearInterval(state.elapsedTimer); state.elapsedTimer = null; }
function resetTimer() { stopTimer(); state.totalElapsed = 0; timeElapsed.textContent = '0:00'; }

// ─── UI helpers ──────────────────────────────────────────────────────────────

function setStatus(label, mode = '') {
  statusText.textContent = label;
  statusBadge.className = 'status-badge' + (mode ? ` ${mode}` : '');
}

function setPlayIcon(playing) {
  [playBtn, fsPlayBtn, readAloudBtn].forEach(btn => {
    btn.querySelector('.icon-play').classList.toggle('hidden', playing);
    btn.querySelector('.icon-pause').classList.toggle('hidden', !playing);
  });
  readAloudBtn.querySelector('span').textContent = playing ? 'Pause reading' : 'Read aloud';
}

function updateProgress() {
  const total = state.sentences.length;
  const cur = state.currentIndex;
  const pct = total > 0 ? (cur / total) * 100 : 0;
  progressFill.style.width = `${pct}%`;
  fsProgressFill.style.width = `${pct}%`;
  sentenceCounter.textContent = `Sentence ${cur} / ${total}`;
  fsSentCounter.textContent = `${cur} / ${total}`;
}

function setWaveActive(active) {
  waveform.classList.toggle('active', active);
  fsWaveform.classList.toggle('active', active);
}

function showToast(msg, duration = 2500) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), duration);
}

// ─── Fullscreen ───────────────────────────────────────────────────────────────

function openFullscreen() {
  state.fsOpen = true;
  fsOverlay.classList.add('open');
  fsOverlay.setAttribute('aria-hidden', 'false');
  fullscreenBtn.classList.add('fs-active');
  document.body.style.overflow = 'hidden';
}

function closeFullscreen() {
  state.fsOpen = false;
  fsOverlay.classList.remove('open');
  fsOverlay.setAttribute('aria-hidden', 'true');
  fullscreenBtn.classList.remove('fs-active');
  document.body.style.overflow = '';
}

fullscreenBtn.addEventListener('click', () => {
  if (state.fsOpen) closeFullscreen();
  else openFullscreen();
});
fsCloseBtn.addEventListener('click', closeFullscreen);

// ─── Speech Engine ────────────────────────────────────────────────────────────

function speak(index) {
  if (index >= state.sentences.length) { onFinished(); return; }

  state.currentIndex = index;
  const ttsSentence     = state.sentences[index];
  const displaySentence = state.displaySentences[index] || ttsSentence;

  // Normal view sentence text
  currentSentText.textContent = displaySentence;
  currentSentText.classList.add('reading');

  // Fullscreen: build word spans
  wordSpans = buildWordSpans(displaySentence);

  updateProgress();

  const utterance = new SpeechSynthesisUtterance(ttsSentence);
  utterance.rate   = parseFloat(speedRange.value);
  utterance.pitch  = parseFloat(pitchRange.value);
  utterance.volume = parseFloat(volumeRange.value);
  const voice = getSelectedVoice();
  if (voice) utterance.voice = voice;

  // Word boundary → highlight
  utterance.onboundary = (e) => {
    if (e.name === 'word') {
      highlightWordAt(e.charIndex, e.charLength);
    }
  };

  utterance.onstart = () => setWaveActive(true);

  utterance.onend = () => {
    wordSpans.forEach(s => s.classList.remove('active'));
    if (state.isPlaying && !state.isPaused) speak(index + 1);
  };

  utterance.onerror = (e) => {
    if (e.error === 'interrupted' || e.error === 'canceled') return;
    console.warn('Speech error:', e.error);
    if (state.isPlaying) speak(index + 1);
  };

  state.utterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function onFinished() {
  state.isPlaying = false;
  state.isPaused  = false;
  setWaveActive(false);
  setPlayIcon(false);
  setStatus('Finished ✓');
  stopTimer();
  progressFill.style.width = '100%';
  fsProgressFill.style.width = '100%';
  sentenceCounter.textContent = `Sentence ${state.sentences.length} / ${state.sentences.length}`;
  fsSentCounter.textContent = `${state.sentences.length} / ${state.sentences.length}`;
  currentSentText.textContent = '✓ Reading complete';
  fsSentence.textContent = '✓ Reading complete';
  showToast('🎉 Reading complete!');
  setTimeout(() => {
    if (!state.isPlaying) {
      setStatus('Ready');
      updateSelectionState();
    }
  }, 3000);
}

// ─── Controls ────────────────────────────────────────────────────────────────

function doPlay() {
  const raw = getSelectedText() || textInput.value.trim();
  if (!textInput.value.trim()) {
    showToast('Paste or upload text first.');
    textInput.focus();
    return;
  }

  if (!('speechSynthesis' in window)) {
    setStatus('Speech unavailable', 'paused');
    showToast('Your browser does not support speech reading. Try Chrome or Edge.');
    return;
  }

  if (!voices.length) {
    setStatus('Voice unavailable', 'paused');
    showToast('No speech voice is installed in this browser. Install an English system voice, then reload.');
    return;
  }

  if (state.isPaused) {
    state.isPaused = false;
    state.isPlaying = true;
    window.speechSynthesis.resume();
    setPlayIcon(true);
    setStatus('Reading...', 'playing');
    setWaveActive(true);
    state.startTime = Date.now();
    return;
  }

  window.speechSynthesis.cancel();
  const { tts, display } = processText(raw);
  if (!tts.length) { showToast('⚠️ No readable text found.'); return; }

  state.sentences        = tts;
  state.displaySentences = display;
  state.currentIndex     = 0;
  state.isPlaying        = true;
  state.isPaused         = false;

  resetTimer();
  startTimer();
  setPlayIcon(true);
  setStatus('Reading...', 'playing');
  updateProgress();

  // Auto-open fullscreen when play starts (if not already open, user can close)
  // Comment this line out if you don't want auto-open:
  // openFullscreen();

  speak(0);
}

function doPause() {
  if (!state.isPlaying) return;
  state.isPaused = true;
  state.isPlaying = false;
  window.speechSynthesis.pause();
  setWaveActive(false);
  setPlayIcon(false);
  setStatus('Paused', 'paused');
  if (state.startTime) {
    state.totalElapsed += Date.now() - state.startTime;
    state.startTime = null;
  }
}

function doStop() {
  window.speechSynthesis.cancel();
  state.isPlaying = false;
  state.isPaused  = false;
  state.sentences = [];
  state.displaySentences = [];
  state.currentIndex = 0;
  wordSpans = [];
  setWaveActive(false);
  setPlayIcon(false);
  setStatus('Ready');
  resetTimer();
  progressFill.style.width = '0%';
  fsProgressFill.style.width = '0%';
  sentenceCounter.textContent = 'Sentence 0 / 0';
  fsSentCounter.textContent = '0 / 0';
  currentSentText.textContent = 'Select text to read';
  fsSentence.textContent = 'Select text to read';
  currentSentText.classList.remove('reading');
  updateSelectionState();
}

function doRestart() {
  window.speechSynthesis.cancel();
  const wasPlaying = state.sentences.length > 0;
  state.isPlaying = false;
  state.isPaused  = false;
  state.currentIndex = 0;
  setWaveActive(false);
  setPlayIcon(false);
  resetTimer();
  updateProgress();
  if (wasPlaying) { showToast('↺ Restarted'); doPlay(); }
}

function doPrev() {
  if (!state.sentences.length) return;
  window.speechSynthesis.cancel();
  state.isPlaying = true;
  state.isPaused  = false;
  setPlayIcon(true);
  setStatus('Reading...', 'playing');
  speak(Math.max(0, state.currentIndex - 1));
}

function doNext() {
  if (!state.sentences.length) return;
  window.speechSynthesis.cancel();
  state.isPlaying = true;
  state.isPaused  = false;
  setPlayIcon(true);
  setStatus('Reading...', 'playing');
  speak(Math.min(state.sentences.length - 1, state.currentIndex + 1));
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

playBtn.addEventListener('click', () => state.isPlaying ? doPause() : doPlay());
fsPlayBtn.addEventListener('click', () => state.isPlaying ? doPause() : doPlay());
readAloudBtn.addEventListener('click', () => state.isPlaying ? doPause() : doPlay());
meaningInput.addEventListener('input', () => {
  understandBtn.disabled = !meaningInput.value.trim();
});
understandBtn.addEventListener('click', explainSelection);
meaningInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') explainSelection();
});
pronounceBtn.addEventListener('click', pronounceMeaning);
stopBtn.addEventListener('click', doStop);
restartBtn.addEventListener('click', doRestart);
prevBtn.addEventListener('click', doPrev);
nextBtn.addEventListener('click', doNext);
fsPrevBtn.addEventListener('click', doPrev);
fsNextBtn.addEventListener('click', doNext);

clearBtn.addEventListener('click', () => {
  doStop();
  textInput.value = '';
  fileInput.value = '';
  state.document = {
    name: '',
    type: 'text',
    sourceText: '',
    activeText: '',
    sourceLanguage: 'auto',
    translated: false,
  };
  state.selectedText = '';
  sourceLanguage.value = 'auto';
  targetLanguage.value = 'en';
  translateBtn.disabled = true;
  setSourceStatus('Ready for a document');
  updateStats();
  showToast('🗑 Text cleared');
});

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    textInput.value = text;
    textInput.setSelectionRange(0, 0);
    updateStats();
    updateSelectionState();
    showToast('📋 Text pasted!');
    textInput.focus();
  } catch {
    showToast('⚠️ Paste failed – use Ctrl+V instead');
  }
});

fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});
dropZone.addEventListener('dragover', event => {
  event.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', event => {
  event.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFile(event.dataTransfer.files[0]);
});

cancelProcessingBtn.addEventListener('click', () => {
  state.cancelProcessing = true;
  setProcessing('Stopping...', 0);
});

translateBtn.addEventListener('click', translateActiveText);
targetLanguage.addEventListener('change', () => {
  translateBtn.disabled = !textInput.value.trim() || targetLanguage.value === 'en';
});
sourceLanguage.addEventListener('change', () => {
  state.document.sourceLanguage = sourceLanguage.value;
});

speedRange.addEventListener('input', () => {
  speedValue.textContent = `${parseFloat(speedRange.value).toFixed(1)}×`;
  updateStats();
  if (state.isPlaying || state.isPaused) {
    const idx = state.currentIndex;
    window.speechSynthesis.cancel();
    if (state.isPlaying) speak(idx);
  }
});

pitchRange.addEventListener('input', () => {
  pitchValue.textContent = parseFloat(pitchRange.value).toFixed(1);
});

volumeRange.addEventListener('input', () => {
  volumeValue.textContent = `${Math.round(parseFloat(volumeRange.value) * 100)}%`;
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.target === textInput) return;
  if (e.code === 'Space')       { e.preventDefault(); state.isPlaying ? doPause() : doPlay(); }
  if (e.code === 'Escape')      { if (state.fsOpen) closeFullscreen(); else doStop(); }
  if (e.code === 'ArrowRight')  { e.preventDefault(); doNext(); }
  if (e.code === 'ArrowLeft')   { e.preventDefault(); doPrev(); }
  if (e.code === 'KeyF')        { state.fsOpen ? closeFullscreen() : openFullscreen(); }
});

// Chrome bug: speech stops after ~15s
setInterval(() => {
  if (state.isPlaying && !state.isPaused && window.speechSynthesis.speaking) {
    window.speechSynthesis.pause();
    window.speechSynthesis.resume();
  }
}, 10000);

window.addEventListener('beforeunload', () => window.speechSynthesis.cancel());

// ─── Init ─────────────────────────────────────────────────────────────────────

if (!('speechSynthesis' in window)) {
  showToast('❌ Your browser does not support Text-to-Speech. Use Chrome or Edge.');
  playBtn.disabled = true;
  setStatus('Not supported');
} else {
  setStatus('Ready');
}

readAloudBtn.disabled = !('speechSynthesis' in window);

console.log('VoiceRead initialized ✓  |  Shortcuts: Space=Play/Pause  F=Fullscreen  Esc=Close/Stop  ←/→=Prev/Next');
