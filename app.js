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
};

// ─── DOM ─────────────────────────────────────────────────────────────────────

const textInput       = document.getElementById('textInput');
const voiceSelect     = document.getElementById('voiceSelect');
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

// ─── Voices ──────────────────────────────────────────────────────────────────

let voices = [];

function loadVoices() {
  voices = window.speechSynthesis.getVoices();
  voiceSelect.innerHTML = '';
  if (!voices.length) {
    voiceSelect.innerHTML = '<option value="">No voices available</option>';
    return;
  }
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
textInput.addEventListener('input', updateStats);
speedRange.addEventListener('input', updateStats);
updateStats();

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
  [playBtn, fsPlayBtn].forEach(btn => {
    btn.querySelector('.icon-play').classList.toggle('hidden', playing);
    btn.querySelector('.icon-pause').classList.toggle('hidden', !playing);
  });
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
      currentSentText.textContent = 'Waiting for text...';
    }
  }, 3000);
}

// ─── Controls ────────────────────────────────────────────────────────────────

function doPlay() {
  const raw = textInput.value.trim();
  if (!raw) { showToast('⚠️ Please paste or type some text first!'); textInput.focus(); return; }

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
  currentSentText.textContent = 'Waiting for text...';
  fsSentence.textContent = 'Press Play to start reading...';
  currentSentText.classList.remove('reading');
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
stopBtn.addEventListener('click', doStop);
restartBtn.addEventListener('click', doRestart);
prevBtn.addEventListener('click', doPrev);
nextBtn.addEventListener('click', doNext);
fsPrevBtn.addEventListener('click', doPrev);
fsNextBtn.addEventListener('click', doNext);

clearBtn.addEventListener('click', () => {
  doStop();
  textInput.value = '';
  updateStats();
  showToast('🗑 Text cleared');
});

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    textInput.value = text;
    updateStats();
    showToast('📋 Text pasted!');
    textInput.focus();
  } catch {
    showToast('⚠️ Paste failed – use Ctrl+V instead');
  }
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

console.log('VoiceRead initialized ✓  |  Shortcuts: Space=Play/Pause  F=Fullscreen  Esc=Close/Stop  ←/→=Prev/Next');
