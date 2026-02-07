(() => {
  const qs = (sel) => document.querySelector(sel);

  // ---------- Inject Shuffle Buttons into existing Layer 1 Context Menu ----------
  const loadMenu = qs('#layer1Ctx'); // created in vinly-setlist-ui1.js
  if (loadMenu) {
    // Add Setlist shuffle button if missing
    if (!qs('#shuffleSetlistBtn')) {
      const shuffleSetlistBtn = document.createElement('button');
      shuffleSetlistBtn.id = 'shuffleSetlistBtn';
      shuffleSetlistBtn.textContent = 'Setlist shuffle';
      shuffleSetlistBtn.style.display = 'none';
      loadMenu.appendChild(shuffleSetlistBtn);

      shuffleSetlistBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        loadMenu.style.display = 'none';
        if (window.currentSetlistShuffle?.artistId && window.currentSetlistShuffle.ready) {
          try {
            await generateSetlistShuffle(); // shuffle all albums
          } catch (err) {
            console.error('Shuffle failed:', err);
            alert('Shuffle failed.');
          }
        }
      });
    }

    // Add Album shuffle button if missing
    if (!qs('#shuffleAlbumBtn')) {
      const shuffleAlbumBtn = document.createElement('button');
      shuffleAlbumBtn.id = 'shuffleAlbumBtn';
      shuffleAlbumBtn.textContent = 'Shuffle';
      shuffleAlbumBtn.style.display = 'none';
      loadMenu.appendChild(shuffleAlbumBtn);

      shuffleAlbumBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        loadMenu.style.display = 'none';
        const albumId = e.target.dataset.album;
        if (!albumId) return;

        try {
          const parts = albumId.split('/');
          const artistId = parts[0];
          const albumName = parts[1];
          const coverUrl = `/Vinly Setlist/${encodeURIComponent(artistId)}/${encodeURIComponent(albumName)}/${encodeURIComponent(albumName)}.jpg`;

          const res = await fetch(`/api/albums/${encodeURIComponent(albumId)}/tracks`);
          const tracks = await res.json();
          if (!Array.isArray(tracks) || tracks.length === 0) {
            alert('No tracks found in album.');
            return;
          }

          // Shuffle and save
          const relPaths = tracks.map(t => t.filePath || t);
          const shuffled = relPaths.sort(() => Math.random() - 0.5);
          const textPayload = shuffled.join('\n');

          await fetch(`/api/artists/${encodeURIComponent(artistId)}/setlist-shuffle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textPayload })
          });

          // Load into player
          if (typeof window.stopDeck === 'function') window.stopDeck();

          window.currentMode = 'setlist';
          window.currentSetlistFile = null;
          window.currentSetlistCover = coverUrl;
          window.currentSetlistText = textPayload;
          window.currentSetlistShuffle = { artistId, coverUrl, ready: true };

          window.playlist = shuffled;
          window.currentIndex = 0;

          await preloadDurations(shuffled);
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

            if (shuffled.length) {
              audio.src = '/Vinly Setlist/' + shuffled[0];
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

          // Replace carousel with album cover
          const layer1 = document.getElementById('layer1');
          if (layer1) {
            layer1.innerHTML = '';

            const node = document.createElement('div');
            node.className = 'album';
            node.setAttribute('data-album-id', albumId);
            node.setAttribute('data-album-name', albumName);

            const img = document.createElement('img');
            img.src = coverUrl;
            img.alt = albumName;
            node.appendChild(img);

            const title = document.createElement('div');
            title.className = 'album-title';
            title.textContent = albumName;
            node.appendChild(title);

            layer1.appendChild(node);
          }

          console.log('Album shuffled and loaded.');
        } catch (err) {
          console.error('Album shuffle failed:', err);
          alert('Failed to shuffle album.');
        }
      });
    }
  }

// ---------- Global Album Shuffle ----------
window.generateAlbumShuffle = async function(albumId) {
  try {
    // Reset deck and audio state
    if (typeof window.stopDeck === 'function') {
      window.stopDeck(); // sets spinning = false, pauses audio, deck paused
    } else {
      // fallback if stopDeck not defined
      const audio = document.getElementById('audio');
      if (audio) {
        try { audio.pause(); } catch (_) {}
        audio.currentTime = 0;
        audio.removeAttribute('src');
        audio.load();
      }
      const recordWrapper = document.getElementById('recordWrapper');
      const deck = document.getElementById('deck');
      if (recordWrapper) recordWrapper.classList.remove('playing');
      if (deck) deck.classList.add('paused');
      spinning = false; // force baseline
    }

    // 2. Parse album info
    const [artistId, albumName] = albumId.split('/');
    const coverUrl = `/Vinly Setlist/${encodeURIComponent(artistId)}/${encodeURIComponent(albumName)}/${encodeURIComponent(albumName)}.jpg`;

    // 3. Fetch tracks for this album
    const res = await fetch(`/api/albums/${encodeURIComponent(albumId)}/tracks`);
    const tracks = await res.json();
    if (!Array.isArray(tracks) || tracks.length === 0) {
      alert('No tracks found in album.');
      return;
    }

    // 4. Shuffle tracks
    const shuffled = tracks.map(t => t.filePath || t).sort(() => Math.random() - 0.5);
    const textPayload = shuffled.join('\n');

    // 5. Save shuffled setlist into album folder
    await fetch(`/api/albums/${encodeURIComponent(artistId)}/${encodeURIComponent(albumName)}/setlist-shuffle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: textPayload })
    });

    // 6. Update global state
    window.currentMode = 'album';
    window.currentSetlistFile = `/Vinly Setlist/${artistId}/${albumName}/setlist-shuffle.txt`;
    window.currentSetlistCover = coverUrl;
    window.currentSetlistText = textPayload;
    window.currentSetlistShuffle = { artistId, albumName, coverUrl, ready: true };

    window.playlist = shuffled;
    window.currentIndex = 0;

    await preloadDurations(shuffled);
    if (!Array.isArray(window.trackDurations)) window.trackDurations = [];
    window.albumDuration = window.trackDurations.reduce((a, b) => a + (b || 0), 0);

    // 7. Load cover into deck
    const coverImg = document.getElementById('cover');
    if (coverImg) coverImg.src = coverUrl;
    const layer2 = document.getElementById('vinyl-layer-2');
    if (layer2) {
      layer2.style.backgroundImage = `url("${coverUrl}")`;
      layer2.style.backgroundRepeat = 'no-repeat';
      layer2.style.backgroundPosition = 'center center';
      layer2.style.backgroundSize = 'cover';
      layer2.classList.add('paused'); // keep paused until Start pressed
    }

    // 8. Preload first track
    const audio = document.getElementById('audio');
    if (audio && shuffled.length) {
      audio.src = '/Vinly Setlist/' + shuffled[0];
      audio.load();
    }

    // 9. Update title
    if (typeof window.updateTitle === 'function') {
      const justName = shuffled[0].split(/[/\\]/).pop().replace(/\.(mp3|wav|flac)$/i, '');
      window.updateTitle(justName + ' (Album Shuffle)');
    }

    // 10. Update UI
    if (typeof window.updateSetlistUI === 'function') {
      window.updateSetlistUI();
    }

  } catch (err) {
    alert('Failed to shuffle album.');
  }
};

  // ---------- Final global exposure ----------
  window.generateSetlistShuffle = typeof generateSetlistShuffle === 'function'
    ? generateSetlistShuffle
    : () => {
        console.warn('generateSetlistShuffle not defined yet.');
      };
})();
