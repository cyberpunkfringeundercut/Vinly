(() => {
  const qs = (sel) => document.querySelector(sel);

  window.currentMode = null; // "album" or "setlist"
  let setlistBtn = null;

  function updateSetlistUI() {
    if (!setlistBtn) return;
    if (window.currentMode === "setlist") {
      setlistBtn.style.display = "inline-block";
    } else {
      setlistBtn.style.display = "none";
    }
  }

  async function hardResetAndReload() {
    const audio = qs('#audio');

    if (audio) {
      try { audio.pause() } catch (_) {}
      try { audio.src = ''; audio.load() } catch (_) {}

      audio.onplay = null;
      audio.onended = null;
      audio.onloadedmetadata = null;
      audio.ontimeupdate = null;

      audio.replaceWith(audio);
    }

    if (window._lrcListener && audio) {
      try { audio.removeEventListener('timeupdate', window._lrcListener) } catch (_) {}
      window._lrcListener = null;
    }

    const recordWrapper = qs('#recordWrapper');
    const deck = qs('#deck');
    if (recordWrapper) recordWrapper.classList.remove('playing');
    if (deck) deck.classList.add('paused');

    window.playlist = [];
    window.setlist = [];
    window.currentIndex = 0;
    window.trackDurations = [];
    window.albumDuration = 0;

    try { localStorage.removeItem('vinylSetlist') } catch (_) {}

    if (window.currentSetlistFile && typeof window.loadSetlistIntoVinly === 'function') {
      window.currentMode = "setlist";
      await window.loadSetlistIntoVinly(window.currentSetlistFile);
    } else {
      window.currentMode = "album";
    }

    updateSetlistUI();

    const powerBtn = qs('#powerBtn');
    if (powerBtn) powerBtn.classList.add('on');

    if (recordWrapper) recordWrapper.classList.remove('playing');
    if (deck) deck.classList.add('paused');

    const a2 = qs('#audio');

    if (typeof window.updateTitle === 'function') window.updateTitle();

    if (a2 && a2.src) {
      if (window.isLrcMode && typeof window.loadLrcForCurrentTrack === 'function') {
        window.loadLrcForCurrentTrack(a2);
      } else if (typeof window.loadLyrics === 'function') {
        window.loadLyrics(a2.src);
      }
    }
  }

document.addEventListener('DOMContentLoaded', () => {
  const layer1Ctx = qs('#layer1Ctx');
  if (!layer1Ctx) return;

  // Only inject if we are in setlist mode and a file is loaded
  if (window.currentMode === "setlist" && window.currentSetlistFile) {
    if (!layer1Ctx.querySelector('#editSetlistBtn')) {
      setlistBtn = document.createElement('button');
      setlistBtn.id = 'editSetlistBtn';
      setlistBtn.textContent = 'Setlist';
      layer1Ctx.appendChild(setlistBtn);

      setlistBtn.addEventListener('click', () => {
        if (window.currentMode === "setlist") {
          layer1Ctx.style.display = 'none';
          openSetlistOverlay();
        }
      });
    }
    updateSetlistUI();
  }
});

  const overlay = document.createElement('div');
  overlay.id = 'overlaySetlist';

  const panel = document.createElement('div');
  panel.id = 'overlaySetlistPanel';

  const title = document.createElement('h3');
  title.textContent = 'Setlist';
  panel.appendChild(title);

  const listBox = document.createElement('div');
  listBox.id = 'setlistEditorList';
  panel.appendChild(listBox);

  const closeBtn = document.createElement('button');
  closeBtn.id = 'setlistCloseBtn';
  closeBtn.textContent = 'Close';
  panel.appendChild(closeBtn);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  closeBtn.addEventListener('click', async () => {
    overlay.style.display = 'none';
    if (window.currentMode === "setlist") {
      await hardResetAndReload();
    }
  });

  function openSetlistOverlay() {
    if (window.currentMode !== "setlist") return;
    if (!window.playlist || !Array.isArray(window.playlist)) return;

    window.setlist = [...window.playlist];
    listBox.innerHTML = '';

    window.setlist.forEach((track, index) => {
      const row = document.createElement('div');
      row.className = 'setlistRow';
      row.draggable = true;
      row.dataset.index = index;

      const name = typeof track === 'string'
        ? track.split('/').pop()
        : (track.title || '[Unknown track]');

      row.textContent = name;

      addDragHandlers(row);
      listBox.appendChild(row);
    });

    overlay.style.display = 'block';
  }

  let dragSrcEl = null;

  function addDragHandlers(row) {
    row.addEventListener('dragstart', (e) => {
      dragSrcEl = row;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', row.dataset.index) } catch (_) {}
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    row.addEventListener('drop', async (e) => {
      e.stopPropagation();
      if (!dragSrcEl || dragSrcEl === row) return;

      const parent = row.parentNode;

      const srcIndex = parseInt(dragSrcEl.dataset.index, 10);
      const destIndex = parseInt(row.dataset.index, 10);

      if (srcIndex < destIndex) {
        parent.insertBefore(dragSrcEl, row.nextSibling);
      } else {
        parent.insertBefore(dragSrcEl, row);
      }

      await reorderSetlist(srcIndex, destIndex);

      Array.from(parent.children).forEach((child, i) => {
        child.dataset.index = i;
      });
    });
  }

  async function reorderSetlist(from, to) {
    if (window.currentMode !== "setlist") return;

    const list = window.setlist;
    if (!list || !Array.isArray(list)) return;

    const moved = list.splice(from, 1)[0];
    list.splice(to, 0, moved);

    window.playlist = [...window.setlist];

    if (typeof window.recalculateAlbumDuration === 'function') {
      try { window.recalculateAlbumDuration() } catch (_) {}
    }

    if (window.currentSetlistFile) {
      try {
        await fetch('/api/setlists/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file: window.currentSetlistFile,
            tracks: list
          })
        });
        try { localStorage.setItem('vinylSetlist', JSON.stringify(list)) } catch (_) {}
      } catch (err) {
        console.error('[SetlistEditor] Failed to save reordered setlist:', err);
      }
    } else {
      try { localStorage.setItem('vinylSetlist', JSON.stringify(list)) } catch (_) {}
    }
  }

  // Wrap loaders to set mode and update UI
  if (typeof window.loadSetlistIntoVinly === 'function') {
    const originalLoadSetlist = window.loadSetlistIntoVinly;
    window.loadSetlistIntoVinly = async function(file) {
      window.currentMode = "setlist";
      window.currentSetlistFile = file;
      const result = await originalLoadSetlist.call(this, file);
      updateSetlistUI();
      return result;
    };
  }

  if (typeof window.loadAlbum === 'function') {
    const originalLoadAlbum = window.loadAlbum;
    window.loadAlbum = function(albumId) {
      window.currentMode = "album";
      window.currentSetlistFile = null;
      const result = originalLoadAlbum.call(this, albumId);
      updateSetlistUI();
      return result;
    };
  }

window.openSetlistOverlay = openSetlistOverlay;
})();