(() => {
  let allFiles = [];
  let folders = [];
  let currentFolderIndex = 0;
  const audio = document.getElementById('audio');

  // ---------- Render artist (folder) ----------
  function renderFolderBox(folder) {
    const box = document.createElement('div');
    box.className = 'folderBox';
    box.innerHTML = `
      <img src="/cover/folder/${encodeURIComponent(folder)}" alt="${folder}" />
      <div class="label">${folder}</div>
    `;
    box.addEventListener('click', () => loadSubFolders(folder));
    return box;
  }

  // ---------- Render album (subfolder) ----------
  function renderSubFolderBox(folder, subfolder) {
    const box = document.createElement('div');
    box.className = 'folderBox';

    const img = document.createElement('img');
    img.src = `/cover/subfolder/${encodeURIComponent(folder)}/${encodeURIComponent(subfolder)}`;
    img.alt = subfolder;

    img.onload = () => {
      if (window.currentAlbumContext) {
        window.currentAlbumContext.albumsLoaded = true;
        if (typeof window.updateShuffleUI === 'function') {
          window.updateShuffleUI();
        }
      }
    };

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = subfolder;

    box.appendChild(img);
    box.appendChild(label);

    box.addEventListener('click', () => {
      if (typeof window.stopDeck === 'function') window.stopDeck();
      const subPath = `${folder}/${subfolder}`;
      loadAlbum(subPath);
    });

    return box;
  }

  function renderCurrentFolder() {
    const carousel = document.getElementById('folderCarousel');
    carousel.innerHTML = '';
    const folder = folders[currentFolderIndex];
    if (folder) {
      carousel.appendChild(renderFolderBox(folder));
    }
  }

  // ---------- Load artist (subfolders) ----------
  async function loadSubFolders(folder) {
    try {
      const artistFolder = folder;
      window.currentMode = "album";
      window.currentSetlistFile = null;

      window.currentSetlistShuffle = {
        artistId: artistFolder,
        coverUrl: `/Vinly Setlist/${encodeURIComponent(artistFolder)}/${encodeURIComponent(artistFolder)}.jpg`,
        ready: false
      };

      const res = await fetch(`/subfolders/${encodeURIComponent(artistFolder)}`);
      const subfolders = await res.json();

      window.currentSetlistShuffle.ready = true;

      if (typeof window.updateShuffleUI === 'function') {
        window.updateShuffleUI();
      }

      const carousel = document.getElementById('folderCarousel');
      carousel.innerHTML = '';
      subfolders.forEach(sub => {
        carousel.appendChild(renderSubFolderBox(artistFolder, sub));
      });

    } catch (err) {
      console.error('Error loading subfolders', err);
      window.currentSetlistShuffle = null;
      if (typeof window.updateShuffleUI === 'function') {
        window.updateShuffleUI();
      }
    }
  }

  function normalizeSrc(src) {
    try {
      const u = new URL(src, window.location.origin);
      return decodeURIComponent(u.pathname);
    } catch {
      return decodeURIComponent(src);
    }
  }

  function prepareTrack(index) {
    if (index >= 0 && index < window.playlist.length) {
      window.currentIndex = index;
      const relSrc = '/Vinly Setlist/' + window.playlist[window.currentIndex];
      audio.src = relSrc;

      if (typeof updateTitle === 'function') updateTitle();

      if (window.isLrcMode && typeof window.loadLrcForCurrentTrack === 'function') {
        window.loadLrcForCurrentTrack(audio);
      } else if (typeof loadLyrics === 'function') {
        loadLyrics(normalizeSrc(relSrc));
      }
    }
  }

  function loadAlbum(subfolder) {
    const audioExtensions = ['mp3','wav','wma','aac','flac','ogg','m4a','mid','midi','aiff','au'];
    window.playlist = allFiles.filter(f =>
      f.startsWith(subfolder + '/') &&
      audioExtensions.some(ext => f.toLowerCase().endsWith('.' + ext))
    ).sort((a, b) => {
      const ax = a.split('/').pop();
      const bx = b.split('/').pop();
      const na = parseInt(ax, 10);
      const nb = parseInt(bx, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return ax.localeCompare(bx, undefined, { sensitivity: 'base' });
    });

    window.currentIndex = 0;
    window.trackDurations = new Array(window.playlist.length).fill(0);
    window.albumDuration = 0;

    if (window.playlist.length > 0) {
      updateCover(subfolder);
      if (typeof updateTitle === 'function') updateTitle();

      let i = 0;
      const loadNextDuration = () => {
        if (i >= window.playlist.length) {
          window.albumDuration = window.trackDurations.reduce((a, b) => a + b, 0);
          prepareTrack(window.currentIndex);
          if (window.isLrcMode && typeof window.loadLrcForCurrentTrack === 'function') {
            window.loadLrcForCurrentTrack(audio);
          }
          return;
        }

        const url = '/Vinly Setlist/' + window.playlist[i];
        const probe = new Audio();
        probe.src = url;
        probe.preload = 'metadata';
        probe.addEventListener('loadedmetadata', () => {
          window.trackDurations[i] = probe.duration || 0;
          i++;
          loadNextDuration();
        });
        probe.addEventListener('error', () => {
          window.trackDurations[i] = 0;
          i++;
          loadNextDuration();
        });
      };
      loadNextDuration();
    } else {
      document.getElementById('currentTrack').textContent = 'No track files found in album';
    }
  }

function updateCover(subfolder) {
  const parts = subfolder.split('/');
  const artist = parts[0];
  const album = parts[1];
  const coverPath = `/Vinly Setlist/${encodeURIComponent(artist)}/${encodeURIComponent(album)}/${encodeURIComponent(album)}.jpg`;

  const coverEl = document.getElementById('cover');
  coverEl.onerror = () => {
    coverEl.style.display = 'none';
  };
  coverEl.src = coverPath;
  coverEl.style.display = 'block';
}

  function updateVinylCover(artistFolder) {
    const deckImg = document.getElementById('vinylCover');
    if (!deckImg) return;

    const coverPath = `/Vinly/Vinly Setlist/${encodeURIComponent(artistFolder)}/${encodeURIComponent(artistFolder)}.jpg`;
    deckImg.onerror = () => {
      console.warn("Vinyl cover not found:", coverPath);
    };
    deckImg.src = coverPath;
  }

  document.getElementById('swingLeft').addEventListener('click', () => {
    window.currentMode = "album";
    window.currentSetlistFile = null;
    currentFolderIndex = (currentFolderIndex - 1 + folders.length) % folders.length;
    renderCurrentFolder();
    if (typeof window.updateSetlistUI === 'function') {
      window.updateSetlistUI();
    }
  });

  document.getElementById('swingRight').addEventListener('click', () => {
    window.currentMode = "album";
    window.currentSetlistFile = null;
    currentFolderIndex = (currentFolderIndex + 1) % folders.length;
    renderCurrentFolder();
    if (typeof window.updateSetlistUI === 'function') {
      window.updateSetlistUI();
    }
  });

  if (audio) {
    audio.addEventListener('ended', () => {
      if (window.currentIndex < window.playlist.length - 1) {
        window.currentIndex += 1;
        const relSrc = '/Vinly Setlist/' + window.playlist[window.currentIndex];
        audio.src = relSrc;
        if (typeof updateTitle === 'function') updateTitle();
        if (window.isLrcMode && typeof window.loadLrcForCurrentTrack === 'function') {
          window.loadLrcForCurrentTrack(audio);
        } else if (typeof loadLyrics === 'function') {
          loadLyrics(normalizeSrc(relSrc));
        }
        audio.play().catch(err => console.warn('Auto‑play failed:', err));
        if (typeof window.startDeckPlayback === 'function') {
          window.startDeckPlayback();
        }
      } else {
        if (typeof window.stopDeck === 'function') {
          window.stopDeck();
        }
        window.albumFinished = true;
      }
    });
  }

document.getElementById('startStopBtn').addEventListener('click', () => {
  if (window.albumFinished) {
    window.albumFinished = false;
    window.currentIndex = 0;
    prepareTrack(window.currentIndex);
    audio.play().catch(err => console.warn('Restart play failed:', err));
    if (typeof window.startDeckPlayback === 'function') {
      window.startDeckPlayback();
    }
  }
});

// ---------- Fetch setlist and folders ----------
async function fetchSetlist() {
  try {
    const resFiles = await fetch('/setlist');
    allFiles = await resFiles.json();

    const resFolders = await fetch('/folders');
    folders = (await resFolders.json()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );

    renderCurrentFolder();
  } catch (err) {
    console.error('Failed to fetch setlist or folders:', err);
  }
}

document.addEventListener('DOMContentLoaded', fetchSetlist);

// ---------- Global exposure for shuffle + UI modules ----------
window.loadAlbum = loadAlbum;
window.prepareTrack = prepareTrack;
window.updateCover = updateCover;
window.updateVinylCover = updateVinylCover;
window.loadSubFolders = loadSubFolders;
})();