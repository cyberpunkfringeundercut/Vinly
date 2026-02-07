(() => {
  const qs = (sel) => document.querySelector(sel);
  const ce = (tag) => document.createElement(tag);

  function decodeName(s = '') {
    try { return decodeURIComponent(s); } catch { return s; }
  }

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function toRelativeUnderVinlySetlist(absOrRel) {
    const norm = (absOrRel || '').replace(/\\/g, '/');
    const key = '/Vinly Setlist/';
    const idx = norm.toLowerCase().lastIndexOf(key.toLowerCase());
    if (idx >= 0) return norm.substring(idx + key.length);
    return norm.replace(/^\/+/, '').replace(/^Vinly Setlist\/+/i, '');
  }

  // ---------- Overlay builders ----------
  function makeOverlay(id, titleText) {
    let wrap = qs(`#${id}`);
    if (!wrap) {
      wrap = ce('div');
      wrap.id = id;
      wrap.className = 'overlaySetlist';
      document.body.appendChild(wrap);
    }
    let panel = wrap.firstElementChild;
    if (!panel) {
      panel = ce('div');
      panel.className = 'overlayPanel';
      wrap.appendChild(panel);
    }
    panel.innerHTML = `<h3>${titleText}</h3>`;
    return { wrap, panel };
  }

  function makeListBox() {
    const sel = ce('select');
    sel.className = 'setlistListBox';
    sel.size = 8;
    return sel;
  }

  function makeTextBox(placeholder = 'Title') {
    const input = ce('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.className = 'setlistTextBox';
    return input;
  }

  function makeBtn(label, id) {
    const b = ce('button');
    b.textContent = label;
    if (id) b.id = id;
    b.className = 'setlistBtn';
    return b;
  }

  function show(el) { el.style.display = 'block'; }
  function hide(el) { el.style.display = 'none'; }

  // ---------- Durations preload ----------
  async function preloadDurations(relSetlist) {
    const tempAudio = new Audio();
    tempAudio.preload = 'metadata';
    const durations = [];

    for (let i = 0; i < relSetlist.length; i++) {
      const url = '/Vinly Setlist/' + relSetlist[i];
      durations[i] = 0;
      await new Promise((resolve) => {
        const onLoaded = () => {
          durations[i] = Number.isFinite(tempAudio.duration) ? tempAudio.duration : 0;
          tempAudio.removeEventListener('loadedmetadata', onLoaded);
          resolve();
        };
        const onError = () => {
          durations[i] = 0;
          tempAudio.removeEventListener('error', onError);
          resolve();
        };
        tempAudio.addEventListener('loadedmetadata', onLoaded);
        tempAudio.addEventListener('error', onError);
        tempAudio.src = url;
      });
    }
    window.trackDurations = durations;
    window.albumDuration = durations.reduce((a, b) => a + b, 0);
  }

  // ---------- Album cover ----------
  function renderSetlistCard(titleBase) {
    const carousel = qs('#folderCarousel');
    if (!carousel) return null;
    carousel.innerHTML = '';

    const card = ce('div');
    card.className = 'folderBox';

    const img = ce('img');
    img.src = `/Setlist/${encodeURIComponent(titleBase)}.jpg`;
    img.onerror = () => { img.src = '/Vinly Setlist Background/default.jpg'; };

    const label = ce('span');
    label.className = 'label';
    label.textContent = decodeName(titleBase);

    card.appendChild(img);
    card.appendChild(label);
    carousel.appendChild(card);
    return { card, img, label };
  }

  // ---------- Helpers to enable or disable vinly.js ----------
  function disableVinlyJS(audio) {
    if (!audio) return;
    audio.onended = null;
    audio.removeEventListener('ended', window.vinlyHandleEnded);
    audio.removeEventListener('play', window.vinlyHandlePlay);
  }

  function enableVinlyJS(audio) {
    if (!audio) return;
    if (typeof window.vinlyHandleEnded === 'function') {
      audio.addEventListener('ended', window.vinlyHandleEnded);
    }
    if (typeof window.vinlyHandlePlay === 'function') {
      audio.addEventListener('play', window.vinlyHandlePlay);
    }
  }

  // ---------- Setlist ----------
  function bindControls(audio) {
    const powerBtn = qs('#powerBtn');
    const startStopBtn = qs('#startStopBtn');
    const recordWrapper = qs('#recordWrapper');
    const deck = qs('#deck');
    const needle = qs('#needle');

    if (!audio || !powerBtn || !startStopBtn || !recordWrapper || !deck) return;

    let poweredOn = false;
    let playing = false;

    const setSpinning = (on) => {
      if (on) {
        recordWrapper.classList.add('playing');
        deck.classList.remove('paused');
      } else {
        recordWrapper.classList.remove('playing');
        deck.classList.add('paused');
      }
    };

    powerBtn.onclick = null;
    startStopBtn.onclick = null;
    audio.onended = null;

    powerBtn.onclick = () => {
      poweredOn = !poweredOn;
      powerBtn.classList.toggle('on', poweredOn);

      if (!poweredOn) {
        audio.pause();
        playing = false;
        setSpinning(false);
      } else {
        setSpinning(false);
        if (audio.src) {
          if (window.isLrcMode && typeof window.loadLrcForCurrentTrack === 'function') {
            window.loadLrcForCurrentTrack(audio);
          } else if (typeof window.loadLyrics === 'function') {
            window.loadLyrics(audio.src);
          }
          if (typeof window.updateTitle === 'function') window.updateTitle();
        }
      }
    };

    if (needle) {
      audio.addEventListener('play', () => needle.classList.add('engaged'));
      audio.addEventListener('pause', () => needle.classList.remove('engaged'));
      audio.addEventListener('ended', () => needle.classList.remove('engaged'));
    }

    audio.addEventListener('loadedmetadata', () => {
      if (typeof window.updateTitle === 'function') window.updateTitle();
      if (window.isLrcMode && typeof window.loadLrcForCurrentTrack === 'function') {
        window.loadLrcForCurrentTrack(audio);
      } else if (typeof window.loadLyrics === 'function') {
        window.loadLyrics(audio.src);
      }
    });

    audio.addEventListener('play', () => {
      playing = true;
      setSpinning(true);
      if (typeof window.updateTitle === 'function') window.updateTitle();
      if (window.isLrcMode && typeof window.loadLrcForCurrentTrack === 'function') {
        window.loadLrcForCurrentTrack(audio);
      } else if (typeof window.loadLyrics === 'function') {
        window.loadLyrics(audio.src);
      }
    });

    audio.addEventListener('ended', () => {
      playing = false;
      setSpinning(false);
      handleEnded();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const audio = qs('#audio');
    bindControls(audio);
  });

  // Expose for shuffle integration
  window.bindControls = bindControls;
  window.preloadDurations = preloadDurations;
  window.disableVinlyJS = disableVinlyJS;
  window.enableVinlyJS = enableVinlyJS;
  window.renderSetlistCard = renderSetlistCard;

// ---------- Core: Load setlist ----------
async function loadSetlistIntoVinly(selectedFile) {
  if (typeof window.stopDeck === 'function') window.stopDeck();

  // mark mode
  window.currentMode = "setlist";
  window.currentSetlistFile = selectedFile;

  // fetch setlist items
  const payload = await fetchJSON(`/api/setlists/load?file=${encodeURIComponent(selectedFile)}`);
  const items = Array.isArray(payload.items) ? payload.items : [];

  const relPlaylist = items.map(it => {
    const norm = (it.path || '').replace(/\\/g, '/');
    const key = 'Vinly Setlist/';
    const idx = norm.toLowerCase().lastIndexOf(key.toLowerCase());
    if (idx >= 0) return norm.substring(idx + key.length);
    return norm.replace(/^\/+/, '').replace(/^Vinly Setlist\/+/i, '');
  });

  window.playlist = relPlaylist;
  window.currentIndex = 0;

  // preload durations
  await preloadDurations(relPlaylist);
  if (!Array.isArray(window.trackDurations)) window.trackDurations = [];
  window.albumDuration = window.trackDurations.reduce((a, b) => a + (b || 0), 0);

  // cover image
  const baseTitle = selectedFile.replace(/\.txt$/i, '');
  const coverImg = document.getElementById('cover');
  if (coverImg) {
    coverImg.src = `/Setlist/${encodeURIComponent(baseTitle)}.jpg`;
  }

  // audio element
  const audio = document.getElementById('audio');
  if (audio) {
    try { audio.pause() } catch (_) {}
    audio.onended = null;
    audio.onplay = null;
    audio.onloadedmetadata = null;
    audio.ontimeupdate = null;
    audio.replaceWith(audio);

    audio.addEventListener('ended', handleEnded);

    if (window.playlist.length) {
      audio.src = '/Vinly Setlist/' + window.playlist[0];
      audio.load();
    }

    bindControls(audio);

    if (typeof window.updateTitle === 'function') window.updateTitle();

    if (window.isLrcMode && typeof window.loadLrcForCurrentTrack === 'function') {
      window.loadLrcForCurrentTrack(audio);
    } else if (typeof window.loadLyrics === 'function' && audio.src) {
      window.loadLyrics(audio.src);
    }
  }

  // refresh UI
  if (typeof window.updateSetlistUI === 'function') {
    window.updateSetlistUI();
  } else {
    const btn = document.getElementById('editSetlistBtn');
    if (btn) btn.style.display = 'inline-block';
  }

// --- render album cover ---
const carousel = qs('#folderCarousel');
if (carousel) {
  carousel.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'folderBox';

  const img = document.createElement('img');
  img.src = `/Setlist/${encodeURIComponent(baseTitle)}.jpg`;

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = decodeURIComponent(baseTitle);

  card.appendChild(img);
  card.appendChild(label);
  carousel.appendChild(card);

  card.addEventListener('click', async () => {
    await loadSetlistIntoVinly(selectedFile);
    const audio2 = qs('#audio');
    const recordWrapper = qs('#recordWrapper');
    const deck = qs('#deck');
    if (audio2) {
      try { audio2.pause(); } catch (_) {}
      audio2.currentTime = 0;
    }
    if (recordWrapper) recordWrapper.classList.remove('playing');
    if (deck) deck.classList.add('paused');
    if (typeof window.updateTitle === 'function') window.updateTitle();
    if (audio2 && audio2.src && typeof window.loadLyrics === 'function' && !window.isLrcMode) {
      window.loadLyrics(audio2.src);
    }
  });
 }
}

// ---------- Handle ended ----------
function handleEnded() {
  const audio = qs('#audio');
  const next = window.currentIndex + 1;

  if (!audio || !window.setlist || !window.setlist.length) return;

  if (next < window.setlist.length) {
    // Advance to next track
    window.currentIndex = next;
    audio.src = '/Vinly Setlist/' + window.setlist[window.currentIndex];
    audio.load();

    const powerOn = qs('#powerBtn')?.classList.contains('on');
    if (powerOn) {
      audio.play().then(() => {
        if (typeof window.startDeck === 'function') window.startDeck();
      }).catch(err => console.warn('Autoplay blocked on advance:', err));
    }

    if (typeof window.updateTitle === 'function') window.updateTitle();
    if (window.isLrcMode && typeof window.loadLrcForCurrentTrack === 'function') {
      window.loadLrcForCurrentTrack(audio);
    } else if (typeof window.loadLyrics === 'function') {
      window.loadLyrics(audio.src);
    }
  } else {
    // End of setlist: stop or loop back
    if (typeof window.stopDeck === 'function') window.stopDeck();
    window.currentIndex = 0;
    audio.src = '/Vinly Setlist/' + window.setlist[0];
    audio.load();

    const powerOn = qs('#powerBtn')?.classList.contains('on');
    if (powerOn) {
      audio.play().then(() => {
        if (typeof window.startDeck === 'function') window.startDeck();
      }).catch(err => console.warn('Autoplay blocked on restart:', err));
    }

    if (typeof window.updateTitle === 'function') window.updateTitle();
    if (window.isLrcMode && typeof window.loadLrcForCurrentTrack === 'function') {
      window.loadLrcForCurrentTrack(audio);
    } else if (typeof window.loadLyrics === 'function') {
      window.loadLyrics(audio.src);
    }
  }
}

// ---------- Overlay 1: Add ----------
const { wrap: overlay1, panel: panel1 } = makeOverlay('overlaySetlistAdd', 'Add to setlist');
const listBox = makeListBox();
const addOkBtn = makeBtn('Ok', 'addOkBtn');
const addCancelBtn = makeBtn('Cancel', 'addCancelBtn');
const createNewBtn = makeBtn('Create new setlist', 'createNewBtn');

panel1.appendChild(listBox);
panel1.appendChild(addOkBtn);
panel1.appendChild(addCancelBtn);
createNewBtn.style.display = 'block';
createNewBtn.style.marginTop = '12px';
createNewBtn.style.marginLeft = 'auto';
createNewBtn.style.marginRight = 'auto';
panel1.appendChild(createNewBtn);

addCancelBtn.addEventListener('click', () => hide(overlay1));
createNewBtn.addEventListener('click', () => { hide(overlay1); show(overlay2); });

addOkBtn.addEventListener('click', async () => {
  const audio = qs('#audio');
  const currentSrc = audio?.src || '';
  if (!currentSrc) return alert('No track is playing.');
  const url = new URL(currentSrc, window.location.origin);
  const pathName = decodeURIComponent(url.pathname);
  try {
    await fetchJSON('/api/setlists/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list: listBox.value || '', trackPath: pathName })
    });
    hide(overlay1);
  } catch (err) {
    console.error('Append setlist failed:', err);
    alert('Failed to save to setlist.');
  }
});

async function refreshSetlistListBox() {
  listBox.innerHTML = '';
  try {
    const sets = await fetchJSON('/api/setlists');
    (sets || []).forEach(name => {
      const opt = ce('option');
      opt.value = name;
      opt.textContent = decodeName(name.replace(/\.txt$/i, ''));
      listBox.appendChild(opt);
    });
  } catch (err) {
    console.warn('Setlists fetch failed:', err);
  }
}

// ---------- Overlay 2: Create new setlist ----------
const { wrap: overlay2, panel: panel2 } = makeOverlay('overlaySetlistCreate', 'Create Setlist');
const createTitleBox = makeTextBox('Setlist title');
const createOkBtn = makeBtn('Ok', 'createOkBtn');
const createCancelBtn = makeBtn('Cancel', 'createCancelBtn');
panel2.appendChild(createTitleBox);
panel2.appendChild(createOkBtn);
panel2.appendChild(createCancelBtn);

createCancelBtn.addEventListener('click', () => {
  hide(overlay2);
  show(overlay1);
});

createOkBtn.addEventListener('click', async () => {
  const rawTitle = (createTitleBox.value || '').trim();
  if (!rawTitle) return;
  try {
    await fetchJSON('/api/setlists/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: rawTitle })
    });
    hide(overlay2);
    await refreshSetlistListBox();
    show(overlay1);
  } catch (err) {
    console.error('Create setlist failed:', err);
    alert('Failed to create setlist.');
  }
});

// ---------- Overlay Load ----------
const { wrap: overlayLoad, panel: panelLoad } = makeOverlay('overlaySetlistLoad', 'Load setlist');
const loadListBox = makeListBox();
const loadOkBtn = makeBtn('Ok', 'loadOkBtn');
const loadCancelBtn = makeBtn('Cancel', 'loadCancelBtn');
panelLoad.appendChild(loadListBox);
panelLoad.appendChild(loadOkBtn);
panelLoad.appendChild(loadCancelBtn);

loadCancelBtn.addEventListener('click', () => hide(overlayLoad));
loadOkBtn.addEventListener('click', async () => {
  const selected = loadListBox.value || '';
  if (!selected) return;
  await loadSetlistIntoVinly(selected);
  hide(overlayLoad);
});
// ---------- Context menus (Layer 1 & 2) ----------

const layer1 = qs('#layerTop'); // ensure this matches your actual container id
let loadMenu = qs('#layer1Ctx');

// Create the menu only if it doesn't already exist
if (!loadMenu) {
  loadMenu = ce('div');
  loadMenu.id = 'layer1Ctx';
  loadMenu.className = 'layerCtxMenu';
  loadMenu.innerHTML = `
    <button id="loadSetlistBtn">Load setlist</button>
    <button id="deleteSetlistBtn">Delete setlist</button>
    <button id="shuffleSetlistBtn" style="display:none;">Setlist shuffle</button>
    <button id="shuffleAlbumBtn" style="display:none;">Shuffle</button>
    <button id="editSetlistBtn" style="display:none;">Setlist</button>
  `;
  document.body.appendChild(loadMenu);
}

layer1.addEventListener('contextmenu', async (e) => {
  e.preventDefault();

  // Detect album node: folderBox (setlist cover) or album (regular cover)
  const albumNode = e.target.closest('.folderBox, .album');

  const loadBtn = qs('#loadSetlistBtn');
  const deleteBtn = qs('#deleteSetlistBtn');
  const shuffleSetlistBtn = qs('#shuffleSetlistBtn');
  const shuffleAlbumBtn = qs('#shuffleAlbumBtn');
  const editSetlistBtn = qs('#editSetlistBtn');

  if (albumNode) {
    // Album context
    loadBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
    shuffleSetlistBtn.style.display = 'none';
    if (editSetlistBtn) editSetlistBtn.style.display = 'none';

    // Prefer data attributes; fallback to label text only if necessary
    const albumIdAttr = albumNode.getAttribute('data-album-id'); // expected "artist/album"
    const artistIdAttr = albumNode.getAttribute('data-artist-id');
    const labelText = albumNode.querySelector('.label, .album-title')?.textContent?.trim();

    let albumId = albumIdAttr;
    if (!albumId) {
      // Try to reconstruct albumId if artist context exists and we have label
      const artistContext = artistIdAttr || window.currentSetlistShuffle?.artistId || '';
      if (artistContext && labelText) {
        // Use labelText as album slug if you have a slugger; otherwise direct text
        albumId = `${artistContext}/${labelText}`;
      }
    }

    if (albumId) {
      shuffleAlbumBtn.dataset.album = albumId;
      shuffleAlbumBtn.style.display = 'block';
    } else {
      shuffleAlbumBtn.style.display = 'none';
    }
  } else {
    // Empty layer context
    loadBtn.style.display = 'block';
    deleteBtn.style.display = 'block';
    shuffleAlbumBtn.style.display = 'none';

    if (window.currentMode === "setlist" && window.currentSetlistFile) {
      // Saved setlist loaded → show Edit Setlist
      if (editSetlistBtn) editSetlistBtn.style.display = 'block';
      shuffleSetlistBtn.style.display = 'none';
    } else if (window.currentSetlistShuffle?.artistId && window.currentSetlistShuffle.ready) {
      // Shuffle mode → show Setlist shuffle
      shuffleSetlistBtn.style.display = 'block';
      if (editSetlistBtn) editSetlistBtn.style.display = 'none';
    } else {
      shuffleSetlistBtn.style.display = 'none';
      if (editSetlistBtn) editSetlistBtn.style.display = 'none';
    }
  }

// Position menu
loadMenu.style.left = e.pageX + 'px';
loadMenu.style.top = e.pageY + 'px';

// Only show if at least one button is visible
const anyVisible = Array.from(loadMenu.querySelectorAll('button'))
  .some(btn => btn.style.display !== 'none');

if (anyVisible) {
  loadMenu.style.display = 'block';

  // Refresh the load overlay listBox
  if (typeof loadListBox !== 'undefined' && loadListBox) {
    loadListBox.innerHTML = '';
    try {
      const sets = await fetchJSON('/api/setlists');
      (sets || []).forEach(name => {
        const opt = ce('option');
        opt.value = name;
        opt.textContent = decodeName(name.replace(/\.txt$/i, ''));
        loadListBox.appendChild(opt);
      });
    } catch (err) {
      console.warn('Setlists fetch failed:', err);
    }
  }

  // Constrain inside viewport
  const menuWidth = loadMenu.offsetWidth;
  const maxLeft = window.innerWidth - menuWidth - 4;
  if (e.pageX > maxLeft) loadMenu.style.left = maxLeft + 'px';
  if (parseInt(loadMenu.style.left, 10) < 4) loadMenu.style.left = '4px';
} else {
  // Prevent blank strip
  loadMenu.style.display = 'none';
}
});


// Close menu on outside click
document.addEventListener('click', () => {
  loadMenu.style.display = 'none';
});

// Load setlist → show overlayLoad
qs('#loadSetlistBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  loadMenu.style.display = 'none';
  if (typeof overlayLoad !== 'undefined' && overlayLoad) {
    show(overlayLoad);
  } else {
    console.warn('overlayLoad not found. Ensure vinly-setlist-ui1.js is loaded.');
  }
});

// Delete setlist → show overlaySetlistDelete
qs('#deleteSetlistBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  loadMenu.style.display = 'none';
  if (typeof overlaySetlistDelete !== 'undefined' && overlaySetlistDelete) {
    show(overlaySetlistDelete);
  } else {
    console.warn('overlaySetlistDelete not found. Ensure vinly-setlist-ui2.js is loaded.');
  }
});

// Setlist shuffle → call global
qs('#shuffleSetlistBtn').addEventListener('click', async (e) => {
  e.stopPropagation();
  loadMenu.style.display = 'none';
  if (typeof window.generateSetlistShuffle === 'function') {
    try {
      await window.generateSetlistShuffle();
    } catch (err) {
      console.error('Shuffle failed:', err);
      alert('Shuffle failed.');
    }
  }
});

// Shuffle album → call global album shuffle
qs('#shuffleAlbumBtn').addEventListener('click', async (e) => {
  e.stopPropagation();
  loadMenu.style.display = 'none';
  const albumId = e.target.dataset.album;
  if (!albumId) return;
  if (typeof window.generateAlbumShuffle === 'function') {
    await window.generateAlbumShuffle(albumId);
  }
});


// Edit setlist → open overlay
qs('#editSetlistBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  loadMenu.style.display = 'none';
  if (window.currentMode === "setlist" && typeof window.openSetlistOverlay === 'function') {
    window.openSetlistOverlay();
  }
});

// ---------- Layer 2 Context Menu ----------
const layer2 = qs('#layerVinly');
const addMenu = ce('div');
addMenu.id = 'layer2Ctx';
addMenu.className = 'layerCtxMenu';
addMenu.innerHTML = `
  <button id="addToSetlistBtn">Add to setlist</button>
  <button id="deleteFromSetlistBtn">Delete</button>
`;
document.body.appendChild(addMenu);

layer2.addEventListener('contextmenu', async (e) => {
  const audio = qs('#audio');
  if (!audio || audio.paused) return;
  e.preventDefault();

  const deleteBtn = qs('#deleteFromSetlistBtn');
  if (deleteBtn) {
    if (window.currentMode === 'setlist' && window.currentSetlistFile) {
      deleteBtn.style.display = 'block';
    } else {
      deleteBtn.style.display = 'none';
    }
  }

  addMenu.style.left = e.pageX + 'px';
  addMenu.style.top = e.pageY + 'px';
  addMenu.style.display = 'block';

  await refreshSetlistListBox();

  const menuWidth = addMenu.offsetWidth;
  const maxLeft = window.innerWidth - menuWidth - 4;
  if (e.pageX > maxLeft) addMenu.style.left = maxLeft + 'px';
  if (parseInt(addMenu.style.left, 10) < 4) addMenu.style.left = '4px';
});

document.addEventListener('click', () => {
  loadMenu.style.display = 'none';
  addMenu.style.display = 'none';
});

qs('#addToSetlistBtn').addEventListener('click', () => {
  addMenu.style.display = 'none';
  show(overlay1);
});

// ---------- Final global exposure ----------
window.refreshSetlistListBox = refreshSetlistListBox;
window.handleEnded = handleEnded;
window.loadSetlistIntoVinly = loadSetlistIntoVinly;
})();
