// vinly-setlist-ui2.js
(() => {
  const qs = (sel) => document.querySelector(sel);

  // --- Overlay for deleting entire setlist files (unchanged) ---
  const overlayDelete = document.createElement('div');
  overlayDelete.id = 'overlaySetlistDelete';
  overlayDelete.className = 'overlaySetlist';
  overlayDelete.style.display = 'none';

  const panelDelete = document.createElement('div');
  panelDelete.className = 'overlayPanel';

  const heading = document.createElement('h3');
  heading.textContent = 'Delete setlist';
  panelDelete.appendChild(heading);

  const deleteListBox = document.createElement('select');
  deleteListBox.className = 'setlistListBox';
  deleteListBox.size = 8;
  panelDelete.appendChild(deleteListBox);

  const deleteOkBtn = document.createElement('button');
  deleteOkBtn.id = 'deleteOkBtn';
  deleteOkBtn.className = 'setlistBtn';
  deleteOkBtn.textContent = 'Ok';
  panelDelete.appendChild(deleteOkBtn);

  const deleteCancelBtn = document.createElement('button');
  deleteCancelBtn.id = 'deleteCancelBtn';
  deleteCancelBtn.className = 'setlistBtn';
  deleteCancelBtn.textContent = 'Cancel';
  panelDelete.appendChild(deleteCancelBtn);

  overlayDelete.appendChild(panelDelete);
  document.body.appendChild(overlayDelete);

  function show(el) { el.style.display = 'block'; }
  function hide(el) { el.style.display = 'none'; }

  deleteCancelBtn.addEventListener('click', () => hide(overlayDelete));

  deleteOkBtn.addEventListener('click', async () => {
    const selected = deleteListBox.value || '';
    if (!selected) return;
    try {
      await fetch(`/api/setlists/delete?file=${encodeURIComponent(selected)}`, {
        method: 'DELETE'
      });
      if (typeof window.refreshSetlistListBox === 'function') {
        await window.refreshSetlistListBox();
      }
      hide(overlayDelete);
    } catch (err) {
      console.error('Delete setlist failed:', err);
      alert('Failed to delete setlist.');
    }
  });

  // Attach Delete setlist button handler (Layer 1 context menu)
  document.addEventListener('DOMContentLoaded', () => {
    const deleteBtn = qs('#deleteSetlistBtn');
    if (!deleteBtn) return;

    deleteBtn.addEventListener('click', async () => {
      const loadMenu = qs('#layer1Ctx');
      if (loadMenu) loadMenu.style.display = 'none';

      deleteListBox.innerHTML = '';
      try {
        const res = await fetch('/api/setlists');
        const sets = await res.json();
        (sets || []).forEach(name => {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = decodeURIComponent(name.replace(/\.txt$/i, ''));
          deleteListBox.appendChild(opt);
        });
      } catch (err) {
        console.warn('Setlists fetch failed:', err);
      }

      show(overlayDelete);
    });
  });

// --- Delete currently playing track binding (index-aware) ---
const deleteTrackBtn = qs('#deleteFromSetlistBtn');
if (deleteTrackBtn) {
  deleteTrackBtn.addEventListener('click', async () => {
    const audio = qs('#audio');
    const currentSrc = audio?.src || '';
    if (!currentSrc) return;

    const url = new URL(currentSrc, window.location.origin);
    const pathName = decodeURIComponent(url.pathname);
    const idx = window.currentIndex;

    try {
      const resp = await fetch('/api/setlists/deleteSetlistTrack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: window.currentSetlistFile || 'Setlist 1.txt',
          track: pathName,
          index: idx
        })
      });

      const data = await resp.json().catch(() => ({}));

      if (data.success) {
        audio.pause();
        audio.src = '';
        if (typeof window.stopDeck === 'function') window.stopDeck();

        if (typeof window.loadSetlistIntoVinly === 'function' && window.currentSetlistFile) {
          await window.loadSetlistIntoVinly(window.currentSetlistFile);
        }
        // No alert, no console log on success
      } else {
        console.error('Delete track failed:', data.error || 'Unknown error');
        alert('Failed to delete track from setlist.');
      }
    } catch (err) {
      console.error('Delete track failed:', err);
      alert('Failed to delete track from setlist.');
    }
  });
}
})();