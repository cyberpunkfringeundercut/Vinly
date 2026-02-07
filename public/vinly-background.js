function pickRandom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInterval() {
  return Math.random() * 10 * 60 * 1000; // 0–10 minutes
}

function setBackground(layerId, imagePath) {
  const el = document.getElementById(layerId);
  if (el && imagePath) {
    el.style.backgroundImage = `url("${imagePath}")`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
  }
}

async function cycleBackground(endpoint, layerId) {
  try {
    const res = await fetch(endpoint);
    const files = await res.json();
    if (!Array.isArray(files) || files.length === 0) return;

    const applyNext = () => {
      const chosen = pickRandom(files);
      setBackground(layerId, chosen);
      setTimeout(applyNext, randomInterval());
    };

    applyNext();
  } catch (err) {
    console.error('Error fetching backgrounds for', layerId, err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  cycleBackground('/background/setlist', 'layerTop');    // Layer 1
  cycleBackground('/background/vinly', 'layerVinly');    // Layer 2
  cycleBackground('/background/lyrics', 'layerLyrics');  // Layer 3
});
