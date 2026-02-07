let lyricsIndex = [];

// Track whether we are in LRC mode
window.isLrcMode = false;

// ✅ Global reference to active LRC listener (prevents cross‑song contamination)
window._lrcListener = null;

// Preload the list of available lyrics files from the server
async function initLyricsIndex() {
  try {
    const res = await fetch('/lyrics-index');
    lyricsIndex = res.ok ? await res.json() : [];
  } catch {
    lyricsIndex = [];
  }
}

// Helper to update lyrics text consistently
function updateLyricsText(text) {
  const lyricsEl = document.getElementById('lyricsText');
  if (lyricsEl) {
    lyricsEl.textContent = text;
  }
}

// Normalize trackFile into a relative path
function normalizeTrackFile(trackFile) {
  if (!trackFile) return '';
  try {
    const u = new URL(trackFile, window.location.origin);
    trackFile = u.pathname;
  } catch {}
  return trackFile;
}

// Convert backend txtFile path into a URL relative to /public
function toPublicUrl(filePath) {
  return '/' + filePath.replace(/^.*public[\\/]/, '').replace(/\\/g, '/');
}

// Load TXT lyrics (normal mode)
async function loadLyrics(trackFile) {
  if (window.isLrcMode) return; // ✅ Do not load TXT if in LRC mode

  if (!trackFile) {
    updateLyricsText('No lyrics loaded');
    return;
  }

  const relFile = normalizeTrackFile(trackFile);
  const relFileDec = decodeURIComponent(relFile);

  let relativePath = relFileDec.replace(/\.(mp3|wav|wma|aac|flac|ogg|m4a|mid|midi|aiff|au)$/i, '');
  relativePath = relativePath.replace(/\.+$/, '').trim();
  const indexKey = relativePath.replace(/^\/?Vinly Setlist\//, '');

  const lyricsPath = '/Vinly Setlist/' + indexKey + '.txt';

  try {
    const res = await fetch(lyricsPath);
    if (res.ok) {
      const text = await res.text();
      updateLyricsText(text || 'No lyrics available');
      if (!lyricsIndex.includes(indexKey)) lyricsIndex.push(indexKey);
      return;
    }
  } catch {}

  try {
    const res = await fetch(`/lyrics?trackFile=${encodeURIComponent(relFileDec)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.lyrics) {
        updateLyricsText(data.lyrics || 'No lyrics available');
      } else if (data.txtFile) {
        try {
          const txtRes = await fetch(toPublicUrl(data.txtFile));
          if (txtRes.ok) {
            const text = await txtRes.text();
            updateLyricsText(text || 'No lyrics available');
          } else {
            updateLyricsText('Lyrics fetch failed');
          }
        } catch {
          updateLyricsText('Lyrics fetch failed');
        }
      }
      if (!lyricsIndex.includes(indexKey)) lyricsIndex.push(indexKey);
    } else {
      try {
        const txtRes = await fetch(lyricsPath);
        if (txtRes.ok) {
          const text = await txtRes.text();
          updateLyricsText(text || 'No lyrics available');
        } else {
          updateLyricsText('Lyrics fetch failed');
        }
      } catch {
        updateLyricsText('Lyrics fetch failed');
      }
    }
  } catch (err) {
    console.error('Lyrics load failed', err);
    updateLyricsText('Lyrics error');
  }
}

// ✅ Load LRC for current track (auto-advance + needle drag + album load)
window.loadLrcForCurrentTrack = async function(audio) {
  if (!audio || !audio.src) return;

  const audioPath = new URL(audio.src, window.location.origin).pathname;
  const lrcPath = audioPath.replace(/\.[^.]+$/, '.lrc');

  try {
    const text = await fetch(lrcPath).then(r => r.text());
    const lrcLines = parseLrc(text);

    const lrcLyrics = document.getElementById('lrcLyrics');
    if (lrcLyrics) lrcLyrics.style.display = 'block';

    showLrcLyrics(audio, lrcLines);
    applyFontSize(window.lyricsFontSizePx);
  } catch (err) {
    console.error('Failed to load next LRC:', err);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const audio = document.getElementById('audio');
  const layerLyrics = document.getElementById('layerLyrics');
  if (!layerLyrics) return;

  function ensureChild(id, tag = 'div') {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement(tag);
      el.id = id;
    } else if (el.parentElement && el.parentElement !== layerLyrics) {
      el.parentElement.removeChild(el);
    }
    if (el.parentElement !== layerLyrics) {
      layerLyrics.appendChild(el);
    }
    return el;
  }

  const lyricsText = ensureChild('lyricsText', 'div');

  Object.assign(lyricsText.style, {
    position: 'relative',
    zIndex: '2',
    fontFamily: "'Orbitron', 'Segoe UI', sans-serif;",
    fontWeight: '700',
    fontSize: '20px',
    lineHeight: '1.9',
    letterSpacing: '0.8px',
    whiteSpace: 'pre-wrap',
    color: '#000',
    background: 'transparent',
    maxWidth: '80%',
    margin: '0 auto',
    padding: '20px',
    overflow: 'visible',
    maxHeight: 'none',
    textShadow:
      `0 0 3px #fff,
       0 0 6px rgba(255,255,255,0.9),
       1px 1px 2px rgba(255,255,255,0.7),
       -1px -1px 2px rgba(255,255,255,0.7),
       2px 2px 3px rgba(0,0,0,0.9),
       -2px -2px 3px rgba(0,0,0,0.8)`
  });

  initLyricsIndex();

  if (audio) {
    audio.addEventListener('play', () => {
      if (!window.isLrcMode) {
        const src = audio.getAttribute('src');
        if (src) loadLyrics(src);
      } else {
        window.loadLrcForCurrentTrack(audio);
      }
    });

    audio.addEventListener('ended', () => {
      if (window.isLrcMode) {
        window.loadLrcForCurrentTrack(audio);
      } else {
        const src = audio.getAttribute('src');
        if (src) loadLyrics(src);
      }
    });
  }
});

// Render lyrics as clickable buttons for editing timestamps
function renderLyricsAsButtons(text, existingLrc = []) {
  const lyricsEl = document.getElementById('lyricsText');
  lyricsEl.innerHTML = '';

  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (!line.trim()) return;

    const btn = document.createElement('button');
    btn.className = 'lyricLineBtn';
    btn.textContent = line;
    btn.dataset.lineIndex = idx;
    btn.dataset.time = '';

    if (existingLrc[idx]) {
      btn.dataset.time = existingLrc[idx].time;
      btn.classList.add('lrcSaved');
    }

    btn.addEventListener('click', async () => {
      const audio = document.getElementById('audio');
      if (!audio || !audio.src) return;

      const currentTime = audio.currentTime.toFixed(2);
      btn.dataset.time = currentTime;
      btn.classList.add('lrcSaved');

      const audioPath = new URL(audio.src, window.location.origin).pathname;
      const lrcPath   = audioPath.replace(/\.[^.]+$/, '.lrc');

      try {
        const res = await fetch('/save-lrc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filepath: lrcPath,
            lineIndex: btn.dataset.lineIndex,
            text: btn.textContent,
            time: currentTime
          })
        });
        const data = await res.json();
        console.log('Saved LRC:', data);
      } catch (err) {
        console.error('Failed to save LRC:', err);
      }
    });

    lyricsEl.appendChild(btn);
  });
}

function parseLrc(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const closeBracket = line.indexOf(']');
    if (line.startsWith('[') && closeBracket > 0) {
      const timePart = line.substring(1, closeBracket);
      const lyricText = line.substring(closeBracket + 1).trim();
      const parts = timePart.split(':');
      const minutes = parseInt(parts[0], 10) || 0;
      let seconds = 0;
      let millis = 0;
      if (parts[1]) {
        const secParts = parts[1].split('.');
        seconds = parseInt(secParts[0], 10) || 0;
        if (secParts[1]) {
          millis = parseInt(secParts[1], 10) || 0;
          millis = millis / (secParts[1].length > 2 ? 1000 : 100);
        }
      }
      const time = minutes * 60 + seconds + millis;
      entries.push({ time, text: lyricText });
    }
  }
  return entries;
}

// ✅ FIXED: LRC listener now resets per track (no cross‑song contamination)
function showLrcLyrics(audio, lrcLines) {
  const lrcLyrics = document.getElementById('lrcLyrics');
  let currentIndex = 0;

  // ✅ Remove old listener
  if (window._lrcListener) {
    audio.removeEventListener('timeupdate', window._lrcListener);
  }

  // ✅ Create new listener
  window._lrcListener = () => {
    if (currentIndex >= lrcLines.length) return;

    const entry = lrcLines[currentIndex];

    // ✅ Skip invalid timestamps
    if (!entry || !Number.isFinite(entry.time)) return;

    if (audio.currentTime >= entry.time) {
      lrcLyrics.textContent = entry.text;
      lrcLyrics.classList.remove('Lyrics');
      void lrcLyrics.offsetWidth;
      lrcLyrics.classList.add('Lyrics');
      currentIndex++;
    }
  };

  // ✅ Attach new listener
  audio.addEventListener('timeupdate', window._lrcListener);
}

// --- Font size state + helper ---
if (typeof window.lyricsFontSizePx === 'undefined') {
  window.lyricsFontSizePx = 20;
}

function applyFontSize(px) {
  window.lyricsFontSizePx = px;
  const pxStr = px + 'px';

  const lyricsTextEl = document.getElementById('lyricsText');
  if (lyricsTextEl) {
    lyricsTextEl.style.fontSize = pxStr;
    lyricsTextEl.style.lineHeight = '1.9';
  }

  const btns = document.querySelectorAll('.lyricLineBtn');
  btns.forEach(btn => {
    btn.style.fontSize = pxStr;
    btn.style.lineHeight = '1.9';
  });

  const lrcLyrics = document.getElementById('lrcLyrics');
  if (lrcLyrics) {
    lrcLyrics.style.fontSize = pxStr;
    lrcLyrics.style.lineHeight = '1.9';
  }
}

function syncSlider() {
  const slider = document.getElementById('fontSizeSlider');
  if (slider) slider.value = String(window.lyricsFontSizePx);
}

// --- Context menu with font slider ---
document.addEventListener('DOMContentLoaded', () => {
  const layerLyrics = document.getElementById('layerLyrics');
  const contextMenu = document.createElement('div');
  contextMenu.id = 'contextMenu';
  contextMenu.innerHTML = `
    <button id="lrcLyricsBtn">LRC Lyrics</button>
    <button id="lyricsBtn">Lyrics</button>
    <div id="fontSizeControl" style="display:none; padding:8px;">
      <label for="fontSizeSlider" style="color:#00ffe0;">Font size</label>
      <input type="range" id="fontSizeSlider" min="12" max="48" value="20" />
    </div>
    <button id="exitBtn" style="display:none;">Exit</button>
  `;
  document.body.appendChild(contextMenu);

  let lyricsTextCache = '';

  layerLyrics.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    contextMenu.style.left = e.pageX + 'px';
    contextMenu.style.top = e.pageY + 'px';
    contextMenu.style.display = 'block';
    const lyricsTextEl = document.getElementById('lyricsText');
    lyricsTextCache = lyricsTextEl ? lyricsTextEl.textContent : '';
    document.getElementById('fontSizeControl').style.display = 'block';
    syncSlider();
    applyFontSize(window.lyricsFontSizePx);
  });

  document.addEventListener('click', () => {
    contextMenu.style.display = 'none';
  });

  const fontSizeSlider = document.getElementById('fontSizeSlider');
  fontSizeSlider.addEventListener('input', () => {
    const val = parseInt(fontSizeSlider.value, 10);
    if (!Number.isNaN(val)) applyFontSize(val);
  });

  // ✅ Enter LRC mode (editing mode)
  document.getElementById('lrcLyricsBtn').addEventListener('click', () => {
    window.isLrcMode = true;

    if (lyricsTextCache) {
      document.getElementById('lrcLyricsBtn').style.display = 'none';
      document.getElementById('lyricsBtn').style.display = 'none';
      document.getElementById('exitBtn').style.display = 'block';
      document.getElementById('fontSizeControl').style.display = 'block';
      renderLyricsAsButtons(lyricsTextCache);
      Promise.resolve().then(() => applyFontSize(window.lyricsFontSizePx));
    }
  });

  // ✅ Enter animated LRC playback mode
  document.getElementById('lyricsBtn').addEventListener('click', () => {
    window.isLrcMode = true;

    document.getElementById('lrcLyricsBtn').style.display = 'none';
    document.getElementById('lyricsBtn').style.display = 'none';
    document.getElementById('exitBtn').style.display = 'block';
    document.getElementById('fontSizeControl').style.display = 'block';

    document.getElementById('lyricsText').style.display = 'none';

    const audio = document.getElementById('audio');
    if (!audio || !audio.src) return;

    window.loadLrcForCurrentTrack(audio);
  });

  // ✅ Exit LRC mode
  document.getElementById('exitBtn').addEventListener('click', () => {
    window.isLrcMode = false;

    document.getElementById('lrcLyricsBtn').style.display = 'block';
    document.getElementById('lyricsBtn').style.display = 'block';
    document.getElementById('exitBtn').style.display = 'none';
    document.getElementById('fontSizeControl').style.display = 'block';

    document.getElementById('lyricsText').style.display = 'block';
    const lrcLyrics = document.getElementById('lrcLyrics');
    if (lrcLyrics) lrcLyrics.style.display = 'none';

    const audio = document.getElementById('audio');
    if (audio && audio.src) {
      loadLyrics(audio.src);
    } else {
      updateLyricsText(lyricsTextCache);
    }

    Promise.resolve().then(() => applyFontSize(window.lyricsFontSizePx));
  });
});

window.loadLyrics = loadLyrics;