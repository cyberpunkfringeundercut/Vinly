(() => {
  const qs = (sel) => document.querySelector(sel);

  // ------------------------------------------------------------
  // 1. Shuffle Utilities
  // ------------------------------------------------------------
  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return res.json();
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Post failed: ${res.status}`);
    return res.json();
  }

  function loadCover(url) {
    const cover = document.getElementById('cover');
    if (cover) cover.src = url;

    const layer2 = document.getElementById('vinyl-layer-2');
    if (layer2) {
      layer2.style.backgroundImage = `url("${url}")`;
      layer2.style.backgroundRepeat = 'no-repeat';
      layer2.style.backgroundPosition = 'center center';
      layer2.style.backgroundSize = 'cover';
      layer2.classList.add('active');
    }
  }

function shuffleCover() {
  const layer1 = document.getElementById('layer1');
  const shuffle = window.currentSetlistShuffle;

  if (!layer1 || !shuffle?.coverUrl || !shuffle?.artistId) return;

  const label = decodeURIComponent(shuffle.artistId);
  const coverUrl = shuffle.coverUrl;

  layer1.innerHTML = '';
  layer1.setAttribute('data-artist-id', shuffle.artistId);

  const node = document.createElement('div');
  node.className = 'album';
  node.setAttribute('data-album-id', 'shuffle-setlist');
  node.setAttribute('data-album-name', label);

  const img = document.createElement('img');
  img.src = coverUrl;
  img.alt = label;
  node.appendChild(img);

  const title = document.createElement('div');
  title.className = 'album-title';
  title.textContent = label;
  node.appendChild(title);

  node.addEventListener('click', async () => {
    if (typeof window.loadSetlist === 'function') {
      await window.loadSetlist();
    }

    const audio = document.getElementById('audio');
    const recordWrapper = document.getElementById('recordWrapper');
    const deck = document.getElementById('deck');

    if (audio) {
      try { audio.pause(); } catch (_) {}
      audio.currentTime = 0;
    }
    if (recordWrapper) recordWrapper.classList.remove('playing');
    if (deck) deck.classList.add('paused');

    if (typeof window.updateTitle === 'function') window.updateTitle();

    if (audio?.src && typeof window.loadLyrics === 'function' && !window.isLrcMode) {
      window.loadLyrics(audio.src);
    }

    if (typeof window.updateShuffleUI === 'function') {
      window.updateShuffleUI();
    }
  });

  layer1.appendChild(node);
}


  function replaceCarouselWithCover(coverUrl, label = '') {
   const layer1 = document.getElementById('layer1');
if (layer1 && window.currentSetlistCover) {
  layer1.innerHTML = '';

  const isShuffle = !!window.currentSetlistShuffle?.ready;
  const albumId = isShuffle ? 'shuffle-setlist' : selectedFile;
  const labelText = isShuffle
    ? decodeURIComponent(window.currentSetlistShuffle.artistId)
    : decodeURIComponent(selectedFile.replace(/\.txt$/i, ''));

  // Ensure artist context is preserved for context menu and UI logic
  const artistId = isShuffle
    ? window.currentSetlistShuffle.artistId
    : labelText.split('/')[0];

  layer1.setAttribute('data-artist-id', artistId);

  const node = document.createElement('div');
  node.className = 'album';
  node.setAttribute('data-album-id', albumId);
  node.setAttribute('data-album-name', labelText);

  const img = document.createElement('img');
  img.src = window.currentSetlistCover;
  img.alt = labelText;
  node.appendChild(img);

  const title = document.createElement('div');
  title.className = 'album-title';
  title.textContent = labelText;
  node.appendChild(title);

  node.addEventListener('click', async () => {
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

    if (typeof window.updateShuffleUI === 'function') {
      window.updateShuffleUI();
    }
  });

  layer1.appendChild(node);
}
}

  async function loadShuffledTracks(artistId, coverUrl, tracks) {
    if (typeof window.stopDeck === 'function') window.stopDeck();

    const shuffled = shuffleArray(tracks);
    const relPaths = shuffled.map(t => t.filePath || t);
    const textPayload = relPaths.join('\n');

    await postJSON(`/api/artists/${encodeURIComponent(artistId)}/setlist-shuffle`, {
      text: textPayload
    });

    window.currentMode = 'setlist';
    window.currentSetlistFile = null;
    window.currentSetlistCover = coverUrl;
    window.currentSetlistText = textPayload;
    window.currentSetlistShuffle = { artistId, coverUrl, ready: true };

    window.playlist = relPaths;
    window.currentIndex = 0;

    await preloadDurations(relPaths);
    if (!Array.isArray(window.trackDurations)) window.trackDurations = [];
    window.albumDuration = window.trackDurations.reduce((a, b) => a + (b || 0), 0);

    const coverImg = document.getElementById('cover');
    if (coverImg) coverImg.src = coverUrl;

    const audio = document.getElementById('audio');
    if (audio) {
      try { audio.pause(); } catch (_) {}
      audio.onended = null;
      audio.onplay = null;
      audio.onloadedmetadata = null;
      audio.ontimeupdate = null;
      audio.replaceWith(audio);

      audio.addEventListener('ended', handleEnded);

      if (relPaths.length) {
        audio.src = '/Vinly Setlist/' + relPaths[0];
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

    if (typeof window.updateSetlistUI === 'function') {
      window.updateSetlistUI();
    } else {
      const btn = document.getElementById('editSetlistBtn');
      if (btn) btn.style.display = 'inline-block';
    }

    shuffleCover();
  }

  // ------------------------------------------------------------
  // 2. Context Menu Logic
  // ------------------------------------------------------------
  document.addEventListener('contextmenu', async (e) => {
    const albumNode = e.target.closest('.album');
    const layer1 = document.getElementById('layer1');
    const ctxMenu = document.getElementById('layer1Ctx');
    if (!ctxMenu || !layer1) return;

    e.preventDefault();
    ctxMenu.innerHTML = '';
    ctxMenu.style.display = 'block';
    ctxMenu.style.left = `${e.pageX}px`;
    ctxMenu.style.top = `${e.pageY}px`;

    const artistId = layer1.getAttribute('data-artist-id');
    if (!artistId) return;

    if (albumNode && albumNode.querySelector('img')) {
      // Right-clicked on specific album
      const albumId = albumNode.getAttribute('data-album-id');
      const albumName = albumNode.getAttribute('data-album-name') || 'Album';

      const shuffleBtn = document.createElement('button');
shuffleBtn.textContent = 'Setlist Shuffle';
shuffleBtn.onclick = async () => {
  ctxMenu.style.display = 'none';
  try {
    const albums = await fetchJSON(`/api/artists/${encodeURIComponent(artistId)}/albums`);
    const allTracks = [];
    for (const album of albums) {
      try {
        const tracks = await fetchJSON(`/api/albums/${encodeURIComponent(album.id)}/tracks`);
        allTracks.push(...tracks);
      } catch (err) {
        console.warn(`[Shuffle] Failed to fetch tracks for album ${album.name}`, err);
      }
    }

    const coverUrl = `/Vinly Setlist/${encodeURIComponent(artistId)}/${encodeURIComponent(artistId)}.jpg`; // ✅ FIXED
    loadCover(coverUrl);
    await loadShuffledTracks(artistId, coverUrl, allTracks);
  } catch (err) {
    console.error('[Shuffle] Artist shuffle failed:', err);
  }
};

      ctxMenu.appendChild(shuffleBtn);
    } else {
      // Right-clicked on empty layer1
      const shuffleBtn = document.createElement('button');
      shuffleBtn.textContent = 'Setlist Shuffle';
      shuffleBtn.onclick = async () => {
        ctxMenu.style.display = 'none';
        try {
          const albums = await fetchJSON(`/api/artists/${encodeURIComponent(artistId)}/albums`);
          const allTracks = [];
          for (const album of albums) {
            try {
              const tracks = await fetchJSON(`/api/albums/${encodeURIComponent(album.id)}/tracks`);
              allTracks.push(...tracks);
            } catch (err) {
              console.warn(`[Shuffle] Failed to fetch tracks for album ${album.name}`, err);
            }
          }
          const coverUrl = `/Vinly Setlist/${encodeURIComponent(artistId)}/${encodeURIComponent(artistId)}.jpg`;
          loadCover(coverUrl);
          await loadShuffledTracks(artistId, coverUrl, allTracks);
          shuffleCover(); // ✅ render the correct carousel node

        } catch (err) {
          console.error('[Shuffle] Artist shuffle failed:', err);
        }
      };
      ctxMenu.appendChild(shuffleBtn);

      const loadBtn = document.createElement('button');
      loadBtn.textContent = 'Load Setlist';
      loadBtn.onclick = () => {
        ctxMenu.style.display = 'none';
        if (typeof window.loadSetlist === 'function') window.loadSetlist();
      };
      ctxMenu.appendChild(loadBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete Setlist';
      deleteBtn.onclick = () => {
        ctxMenu.style.display = 'none';
        if (typeof window.deleteSetlist === 'function') window.deleteSetlist();
      };
      ctxMenu.appendChild(deleteBtn);
    }
  });

  // ------------------------------------------------------------
  // 3. Cleanup on album click
  // ------------------------------------------------------------
  if (typeof window.loadAlbum === 'function') {
    const originalLoadAlbum = window.loadAlbum;
    window.loadAlbum = function(albumId) {
      const ctx = document.getElementById('layer1Ctx');
      if (ctx) ctx.style.display = 'none';
      const layer1 = document.getElementById('layer1');
      if (layer1) layer1.innerHTML = '';
      return originalLoadAlbum.call(this, albumId);
    };
  }

  // ------------------------------------------------------------
  // 4. Global Exposure
  // ------------------------------------------------------------
  window.generateSetlistShuffle = async function () {
    const artistId = window.currentSetlistShuffle?.artistId;
    if (!artistId) {
      alert('No artist selected.');
      return;
    }

    try {
      const albums = await fetchJSON(`/api/artists/${encodeURIComponent(artistId)}/albums`);
      const allTracks = [];

      for (const album of albums) {
        try {
          const tracks = await fetchJSON(`/api/albums/${encodeURIComponent(album.id)}/tracks`);
          allTracks.push(...tracks);
        } catch (err) {
          console.warn(`[Shuffle] Failed to fetch tracks for album ${album.name}`, err);
        }
      }

      if (allTracks.length === 0) {
        alert('No tracks found across albums.');
        return;
      }

      const coverUrl = `/Vinly Setlist/${encodeURIComponent(artistId)}/${encodeURIComponent(artistId)}.jpg`;
      loadCover(coverUrl);
      await loadShuffledTracks(artistId, coverUrl, allTracks);
      shuffleCover(); // ✅ render the correct carousel node

    } catch (err) {
      console.error('[Shuffle] generateSetlistShuffle failed:', err);
      alert('Setlist shuffle failed.');
    }
  };

  // ------------------------------------------------------------
  // 5. Right-click cleanup on global click
  // ------------------------------------------------------------
  document.addEventListener('click', () => {
    const ctx = document.getElementById('layer1Ctx');
    if (ctx) ctx.style.display = 'none';
  });
})();