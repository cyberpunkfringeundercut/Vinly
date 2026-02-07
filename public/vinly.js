(() => {
  const canvas = document.getElementById('recordCanvas');
  const ctx = canvas.getContext('2d');
  const audio = document.getElementById('audio');
  const powerBtn = document.getElementById('powerBtn');
  const startStopBtn = document.getElementById('startStopBtn');
  const pitchSlider = document.getElementById('pitchSlider');

  const deck = document.getElementById('deck');
  const recordWrapper = document.getElementById('recordWrapper');
  const overlay = document.getElementById('overlay');
  const headshell = document.querySelector('.headshell');
  const needle = document.getElementById('needle');
  const coverImg = document.getElementById('cover');
  const currentTrackEl = document.getElementById('currentTrack');

  // Floating title element near headshell
  const floatingTitle = document.createElement('div');
  floatingTitle.id = 'floatingTitle';
  Object.assign(floatingTitle.style, {
    position: 'absolute',
    fontSize: '14px',
    color: '#00ffe0',
    textShadow: '0 0 6px rgba(0,255,224,0.6)',
    pointerEvents: 'none',
    zIndex: '7'
  });
  deck.appendChild(floatingTitle);

  // Geometry constants
  const SIZE = 600;
  const CENTER = { x: SIZE / 2, y: SIZE / 2 };
  const R_OUTER = 290;
  const R_INNER = 90;
  const RPM_BASE = 33.333;

  // Visual constants
  const HEAD_W = 40;
  const HEAD_H = 20;
  const NEEDLE_R = 6;

  // Spiral settings
  const THETA_START_DEG = -25;
  const SPIRAL_TURNS = 1.15;
  const THETA_START = (Math.PI / 180) * THETA_START_DEG;
  const THETA_END = THETA_START + 2 * Math.PI * SPIRAL_TURNS;
  const R_START = R_OUTER - 10;
  const R_END = R_INNER + 12;

  let poweredOn = false;
  let spinning = false;
  let holding = false;

  // Playlist state
  window.playlist = [];
  window.currentIndex = 0;
  window.trackDurations = [];
  window.albumDuration = 0;

  // Global title updater
  window.updateTitle = function updateTitle() {
    const list = window.playlist || [];
    const idx = typeof window.currentIndex === 'number' ? window.currentIndex : 0;

    if (!list.length || !list[idx]) {
      currentTrackEl.textContent = 'No track playing';
      return;
    }

    const filename = list[idx].split(/[/\\]/).pop();
    const title = filename.replace(/\.(mp3|wav|wma|aac|flac|ogg|m4a|mid|midi|aiff|au)$/i, '');

    currentTrackEl.textContent = title;
  };

  // Stop everything when album changes
  window.stopDeck = function stopDeck() {
    audio.pause();
    spinning = false;
    recordWrapper.classList.remove('playing');
    deck.classList.add('paused');
  };

  // Draw vinyl grooves
  function drawVinyl() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    const gradient = ctx.createRadialGradient(CENTER.x, CENTER.y, 40, CENTER.x, CENTER.y, R_OUTER + 10);
    gradient.addColorStop(0, '#202020');
    gradient.addColorStop(1, '#0c0c0c');
    ctx.beginPath();
    ctx.arc(CENTER.x, CENTER.y, R_OUTER, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = 0.4;
    for (let r = R_INNER; r <= R_OUTER; r += 1.2) {
      const alpha = 0.05 + 0.05 * Math.sin(r * 0.15);
      ctx.strokeStyle = `rgba(180,180,180,${alpha})`;
      ctx.beginPath();
      ctx.arc(CENTER.x, CENTER.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    const sheen = ctx.createLinearGradient(CENTER.x - R_OUTER, CENTER.y - R_OUTER, CENTER.x + R_OUTER, CENTER.y + R_OUTER);
    sheen.addColorStop(0.2, 'rgba(255,255,255,0.05)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    sheen.addColorStop(0.8, 'rgba(255,255,255,0.05)');
    ctx.beginPath();
    ctx.arc(CENTER.x, CENTER.y, R_OUTER, 0, Math.PI * 2);
    ctx.fillStyle = sheen;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(CENTER.x, CENTER.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#cfcfcf';
    ctx.fill();
  }
  drawVinyl();

  // Spin speed
  function currentRPM() {
    const pitch = parseFloat(pitchSlider.value);
    return RPM_BASE * (1 + pitch / 100);
  }

  function applySpinSpeed() {
    const rpm = currentRPM();
    const secondsPerRev = 60 / rpm;
    recordWrapper.style.animationDuration = `${secondsPerRev}s`;
    audio.playbackRate = rpm / RPM_BASE;
  }

  // Helpers
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const radToDeg = (rad) => rad * 180 / Math.PI;

  function spiralRadius(theta) {
    const tNorm = (theta - THETA_START) / (THETA_END - THETA_START);
    return R_START - (R_START - R_END) * clamp(tNorm, 0, 1);
  }

  function tangentDeg(theta) {
    return radToDeg(theta) + 90;
  }

  function placeTip(x, y, angleDeg) {
    headshell.style.left = `${x - HEAD_W / 2}px`;
    headshell.style.top = `${y - HEAD_H / 2}px`;
    headshell.style.transform = `rotate(${angleDeg}deg)`;
    headshell.style.transformOrigin = 'center center';
    needle.style.left = `${x - NEEDLE_R}px`;
    needle.style.top = `${y - NEEDLE_R}px`;
    floatingTitle.style.left = `${x + 20}px`;
    floatingTitle.style.top = `${y - 20}px`;
  }

  function tipAtTheta(theta) {
    const r = spiralRadius(theta);
    return {
      x: CENTER.x + r * Math.cos(theta),
      y: CENTER.y + r * Math.sin(theta),
      r
    };
  }

  function albumCurrentTime() {
    const prev = window.trackDurations.slice(0, window.currentIndex).reduce((a, b) => a + b, 0);
    return prev + (audio.currentTime || 0);
  }

  function thetaFromAlbumTime() {
    const t = albumCurrentTime();
    const frac = window.albumDuration > 0 ? clamp(t / window.albumDuration, 0, 1) : 0;
    return THETA_START + frac * (THETA_END - THETA_START);
  }

  function syncToAudio() {
    if (!spinning) return;
    const theta = thetaFromAlbumTime();
    const { x, y } = tipAtTheta(theta);
    placeTip(x, y, tangentDeg(theta));
  }

  function loop() {
    if (spinning) syncToAudio();
    requestAnimationFrame(loop);
  }
  loop();

  // Power button toggle
  powerBtn.addEventListener('click', () => {
    poweredOn = !poweredOn;
    if (poweredOn) {
      powerBtn.classList.add('on');
      if (!spinning) deck.classList.add('paused');
    } else {
      powerBtn.classList.remove('on');
      audio.pause();
      recordWrapper.classList.remove('playing');
      spinning = false;
      deck.classList.add('paused');
    }
  });

  // Start/Stop button
  startStopBtn.addEventListener('click', () => {
    if (!poweredOn) return;
    spinning = !spinning;
    if (spinning) {
      recordWrapper.classList.add('playing');
      deck.classList.remove('paused');
      audio.play().catch(() => {});
      applySpinSpeed();
      const theta = thetaFromAlbumTime();
      const { x, y } = tipAtTheta(theta);
      placeTip(x, y, tangentDeg(theta));
      window.updateTitle?.();
    } else {
      recordWrapper.classList.remove('playing');
      deck.classList.add('paused');
      audio.pause();
    }
  });

  // Pitch control
  pitchSlider.addEventListener('input', applySpinSpeed);

  // Cursor hold
  function startHold(e) {
    if (!spinning && e.button === 0) {
      overlay.requestPointerLock();
      holding = true;
      headshell.style.cursor = 'grabbing';
      needle.style.cursor = 'grabbing';
      e.preventDefault();
    }
  }
  needle.addEventListener('mousedown', startHold);
  headshell.addEventListener('mousedown', startHold);

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== overlay) {
      holding = false;
      headshell.style.cursor = 'grab';
      needle.style.cursor = 'grab';
      floatingTitle.textContent = '';
    }
  });

  // Release auto-resume
  document.addEventListener('mouseup', () => {
    if (holding) {
      document.exitPointerLock();
      holding = false;
      headshell.style.cursor = 'grab';
      needle.style.cursor = 'grab';
      floatingTitle.textContent = '';
      if (poweredOn && !spinning) {
        spinning = true;
        recordWrapper.classList.add('playing');
        deck.classList.remove('paused');
        audio.play().catch(() => {});
        window.updateTitle?.();
      }
    }
  });

  // ✅ Drag maps to album timeline + LRC-aware track switching
  document.addEventListener('mousemove', (e) => {
    if (!holding) return;
    const dx = e.movementX;
    const currentFrac = window.albumDuration > 0 ? albumCurrentTime() / window.albumDuration : 0;
    let frac = currentFrac + dx / 600;
    frac = clamp(frac, 0, 1);

    const theta = THETA_START + frac * (THETA_END - THETA_START);
    const r = spiralRadius(theta);
    const xTip = CENTER.x + r * Math.cos(theta);
    const yTip = CENTER.y + r * Math.sin(theta);
    placeTip(xTip, yTip, tangentDeg(theta));

    const newAlbumTime = frac * window.albumDuration;
    let acc = 0;
    for (let i = 0; i < window.trackDurations.length; i++) {
      const end = acc + window.trackDurations[i];
      if (newAlbumTime < end) {
        const filename = window.playlist[i] ? window.playlist[i].split('/').pop() : '';
        const title = filename.replace(/\.(mp3|wav|wma|aac|flac|ogg|m4a|mid|midi|aiff|au)$/i, '');
        floatingTitle.textContent = window.currentSetlistShuffle?.artistId
          ? `${title} (Shuffle)`
          : title;

        if (window.currentIndex !== i) {
          window.currentIndex = i;
          audio.src = '/Vinly Setlist/' + window.playlist[window.currentIndex];
          audio.play().catch(() => {});
          window.updateTitle?.();

          if (window.isLrcMode && typeof window.loadLrcForCurrentTrack === 'function') {
            window.loadLrcForCurrentTrack(audio);
          } else if (typeof window.loadLyrics === 'function') {
            window.loadLyrics(audio.src);
          }
        }

        audio.currentTime = newAlbumTime - acc;
        break;
      }
      acc = end;
    }
  });

  // Initial placement of tonearm
  const { x, y } = tipAtTheta(THETA_START);
  placeTip(x, y, tangentDeg(THETA_START));

  // Keep title in sync on audio events
  audio.addEventListener('play', () => {
    window.updateTitle?.();

    if (window.isLrcMode && typeof window.loadLrcForCurrentTrack === 'function') {
      window.loadLrcForCurrentTrack(audio);
    }
  });

  audio.addEventListener('loadedmetadata', () => window.updateTitle?.());

  // Optional: expose handlers for external modules
  window.vinlyHandlePlay = () => {
    applySpinSpeed();
    const theta = thetaFromAlbumTime();
    const { x, y } = tipAtTheta(theta);
    placeTip(x, y, tangentDeg(theta));
    window.updateTitle?.();
  };

  window.vinlyHandleEnded = () => {
    if (!Array.isArray(window.playlist) || window.playlist.length === 0) return;

    const next = window.currentIndex + 1;
    if (next < window.playlist.length) {
      window.currentIndex = next;
      audio.src = '/Vinly Setlist/' + window.playlist[window.currentIndex];
      audio.load();
      audio.play().catch(err => console.warn('Autoplay blocked on advance:', err));
      window.updateTitle?.();
    } else {
      window.currentIndex = 0;
      audio.src = '/Vinly Setlist/' + window.playlist[0];
      audio.load();
      if (powerBtn.classList.contains('on')) {
        audio.play().catch(err => console.warn('Autoplay blocked on restart:', err));
      }
      window.updateTitle?.();
    }
  };
})();