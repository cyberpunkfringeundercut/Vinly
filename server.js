const fs = require('fs');
const path = require('path');
const express = require('express');
const os = require('os');
const app = express();

app.use(express.json());

// Root folders inside public
const ROOT_SETLIST       = path.join(__dirname, 'public', 'Vinly Setlist');
const BG_SETLIST         = path.join(__dirname, 'public', 'Vinly Setlist Background');
const BG_VINLY           = path.join(__dirname, 'public', 'Vinly Background');
const BG_LYRICS          = path.join(__dirname, 'public', 'Vinly Lyrics Background');
const ROOT_USER_SETLIST  = path.join(__dirname, 'public', 'Setlist');

// Ensure the folders exist
[ROOT_SETLIST, BG_SETLIST, BG_VINLY, BG_LYRICS, ROOT_USER_SETLIST].forEach(folder => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
});

// ---------- Utility helpers ----------
function sanitizeFilename(name) {
  return (name || '').replace(/[<>:"/\\|?*]/g, '_').trim();
}
function stripTrackPrefix(name) {
  return (name || '').replace(/^\s*\d+\s*[-.:]\s*/, '').trim();
}
function normalizeForAzLyrics(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildArtistLyrics(artist) {
  // Normalize artist name
  const base = normalizeForAzLyrics(artist);

  const set = new Set();

  // Always include the full normalized base
  set.add(base);

  // Break into words by spaces, dashes, underscores 
  const rawWords = artist.toLowerCase().split(/[\s\-_]+/).filter(Boolean);
  rawWords.forEach(w => set.add(normalizeForAzLyrics(w)));

  // Also split the normalized base into chunks
  base.split(/[\s\-_]+/).forEach(w => { if (w) set.add(w); });

  // Add variants with "band" suffix
  Array.from(set).forEach(slug => {
    set.add(slug + 'band');
  });

  return Array.from(set);
}

function isErrorPage(html) {
  if (!html) return true;
  const h = html.toLowerCase();
  return h.includes('we are not authorized') || h.includes('azlyrics.com/azlrc.php');
}

function extractLyrics(html) {
  if (!html) return '';

  function decodeEntities(text) {
    return text
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');
  }

  let lyrics = '';

  // Anchor on the <b>"Title"</b> marker
  const titleBlock = html.match(/<b>"[^"]+"<\/b>/i);
  if (titleBlock) {
    const afterTitle = html.slice(titleBlock.index + titleBlock[0].length);

    // Grab the first <div> after the title
    const divMatch = afterTitle.match(/<div[^>]*>([\s\S]*?)<\/div>/i);
    if (divMatch) {
      lyrics = divMatch[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\r/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
  }

  return decodeEntities(lyrics.trim());
}

function getAudioFiles(dir) {
  const exts = ['.mp3', '.wav', '.wma', '.aac', '.flac', '.ogg', '.m4a', '.mid', '.midi', '.aiff', '.au'];
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getAudioFiles(fullPath));
      } else if (exts.includes(path.extname(file).toLowerCase())) {
        results.push(path.relative(ROOT_SETLIST, fullPath).replace(/\\/g, '/'));
      }
    });
  } catch (err) {
    console.error('getAudioFiles failed:', err);
  }
  return results;
}

function getImageFiles(dir) {
  const exts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tif', '.tiff', '.webp', '.ico', '.svg', '.heic'];
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isFile() && exts.includes(path.extname(file).toLowerCase())) {
        results.push(path.relative(path.join(__dirname, 'public'), fullPath).replace(/\\/g, '/'));
      }
    });
  } catch (err) {
    console.error('getImageFiles failed:', err);
  }
  return results;
}

function getLyricsFiles(dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getLyricsFiles(fullPath));
      } else if (path.extname(file).toLowerCase() === '.txt') {
        results.push(path.relative(ROOT_SETLIST, fullPath).replace(/\\/g, '/').replace(/\.txt$/i, ''));
      }
    });
  } catch (err) {
    console.error('getLyricsFiles failed:', err);
  }
  return results;
}
function getFolders() {
  try {
    return fs.readdirSync(ROOT_SETLIST).filter(name => {
      const fullPath = path.join(ROOT_SETLIST, name);
      return fs.statSync(fullPath).isDirectory();
    });
  } catch {
    return [];
  }
}

function getSubFolders(folder) {
  const folderPath = path.join(ROOT_SETLIST, folder);
  if (!fs.existsSync(folderPath)) return [];
  try {
    return fs.readdirSync(folderPath).filter(name => {
      const fullPath = path.join(folderPath, name);
      return fs.statSync(fullPath).isDirectory();
    });
  } catch {
    return [];
  }
}

// ---------- API routes ----------
app.get('/setlist', (req, res) => { res.json(getAudioFiles(ROOT_SETLIST)); });
app.get('/background/setlist', (req, res) => { res.json(getImageFiles(BG_SETLIST)); });
app.get('/background/vinly', (req, res) => { res.json(getImageFiles(BG_VINLY)); });
app.get('/background/lyrics', (req, res) => { res.json(getImageFiles(BG_LYRICS)); });
app.get('/lyrics-index', (req, res) => { res.json(getLyricsFiles(ROOT_SETLIST)); });
app.get('/folders', (req, res) => { res.json(getFolders()); });
app.get('/subfolders/:folder', (req, res) => { res.json(getSubFolders(req.params.folder)); });

// ---------- Cover helpers ----------
function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function downloadImage(url, destPath) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Vinly Deck)' } });
  if (!res.ok) throw new Error(`Image download failed: ${res.status} ${res.statusText}`);
  const buffer = await res.arrayBuffer();
  ensureDirFor(destPath);
  fs.writeFileSync(destPath, Buffer.from(buffer));
  return destPath;
}

async function getITunesArtwork(term, artist, album, entity = 'album') {
  const endpoint = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=10&country=US`;
  const resp = await fetch(endpoint, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Vinly Deck)', 'Accept': 'application/json' }
  });
  if (!resp.ok) return null;

  const data = await resp.json();
  const results = Array.isArray(data.results) ? data.results : [];
  if (!results.length) return null;

  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  // Prefer exact artist + album match
  let chosen = results.find(r =>
    norm(r.artistName).includes(norm(artist)) &&
    (!album || norm(r.collectionName).includes(norm(album)))
  );

  if (!chosen) {
    // fallback: any result with artist match
    chosen = results.find(r => norm(r.artistName).includes(norm(artist))) || results[0];
  }

  const base = chosen?.artworkUrl100 || chosen?.artworkUrl60 || chosen?.artworkUrl30 || null;
  if (!base) return null;

  return base.replace(/\/\d+x\d+bb\./, '/425x425bb.');
}

async function ensureCover(type, folder, subfolder = null) {
  let coverPath;
  let searchTerm;

  if (type === 'artist') {
    coverPath = path.join(ROOT_SETLIST, folder, `${folder}.jpg`);
    searchTerm = folder;
  } else {
    coverPath = path.join(ROOT_SETLIST, folder, subfolder, `${subfolder}.jpg`);
    searchTerm = `${folder} ${subfolder}`;
  }

  if (fs.existsSync(coverPath)) return coverPath;

  try {
    const artworkUrl = await getITunesArtwork(searchTerm, folder, subfolder, 'album');
    if (artworkUrl) {
      await downloadImage(artworkUrl, coverPath);
      return coverPath;
    }
  } catch (err) {
    console.error('Cover fetch failed:', err);
  }
  return null;
}

app.get('/cover/folder/:folder', async (req, res) => {
  const folder = req.params.folder;
  const coverPath = await ensureCover('artist', folder);
  if (coverPath && fs.existsSync(coverPath)) res.sendFile(coverPath);
  else res.status(404).json({ error: 'Cover not found' });
});

app.get('/cover/subfolder/:folder/:subfolder', async (req, res) => {
  const { folder, subfolder } = req.params;
  const coverPath = await ensureCover('album', folder, subfolder);
  if (coverPath && fs.existsSync(coverPath)) res.sendFile(coverPath);
  else res.status(404).json({ error: 'Cover not found' });
});

// ---------- Utility: delay helpers ----------
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function randomDelay(min = 2000, max = 5000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return sleep(ms);
}
// ---------- Global lyrics request queue ----------
let lyricsQueue = Promise.resolve();
function enqueueLyricsTask(taskFn) {
  lyricsQueue = lyricsQueue.then(async () => {
    await randomDelay(); // 2–5s delay before each task
    return taskFn();
  }).catch(err => {
    console.error('Lyrics queue task failed:', err);
  });
  return lyricsQueue;
}

// ---------- Slug + title helpers ----------
function cleanTitle(name) {
  return (name || '').replace(/\([^)]*\)/g, '').trim(); // strip parentheses
}

// strip leading track numbers like "01 - ", "01.", "1.", "1 -"
function stripTrackPrefix(name) {
  return (name || '').replace(/^\s*\d+\s*[-.]?\s*/, '');
}

// strip artist prefix if filename starts with artist name (normalized)
function stripArtistPrefix(name, artistFolder) {
  if (!name || !artistFolder) return name;
  const artistNorm = artistFolder.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nameNorm   = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (nameNorm.startsWith(artistNorm)) {
    return name.substring(artistFolder.length).trim();
  }
  return name;
}

// remove any leading dashes, dots, or spaces left over
function stripLeadingSeparators(name) {
  return (name || '').replace(/^[-.\s]+/, '');
}

function normalizeForAzLyrics(name, artistFolder = '') {
  let stripped = stripTrackPrefix(name);
  stripped = stripArtistPrefix(stripped, artistFolder);
  stripped = stripLeadingSeparators(stripped);
  stripped = cleanTitle(stripped);

   return stripped
    .toLowerCase()
    .normalize('NFD')                
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// ---------- Lyrics workflow (download + rename, then scrape) ----------
function parseTrackFile(trackFile) {
  const rel = trackFile.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = rel.split('/');
  const artistFolder = parts[1] || '';
  const albumFolder  = parts[2] || '';
  let trackName = path.basename(parts[3] || '', path.extname(parts[3] || ''));
  trackName = stripTrackPrefix(trackName);
  trackName = stripArtistPrefix(trackName, artistFolder);
  trackName = stripLeadingSeparators(trackName);
  return { artistFolder, albumFolder, trackName };
}

async function downloadLyricsHtml(mp3Path) {
  const ROOT_SETLIST = path.join('C:\\Users\\krisk\\Downloads\\Vinly\\public', 'Vinly Setlist');
  const { artistFolder, albumFolder, trackName } = parseTrackFile(mp3Path);

  const albumDir = path.join(ROOT_SETLIST, artistFolder, albumFolder);
  fs.mkdirSync(albumDir, { recursive: true });

  const safeTrackName = stripLeadingSeparators(trackName);
  const canonicalHtml = path.join(albumDir, `${safeTrackName}.html`);
  const canonicalTxt  = path.join(albumDir, `${path.basename(mp3Path, path.extname(mp3Path))}.txt`);

  // ✅ If the .txt already exists, skip downloading/scraping entirely
  if (fs.existsSync(canonicalTxt)) {
    return { htmlFile: canonicalHtml, downloaded: false, source: null, txtExists: true };
  }

  const trackKey = normalizeForAzLyrics(trackName, artistFolder);
  const artistSlugs = buildArtistLyrics(artistFolder);

  let acceptedSource = null;
  const attemptFiles = [];

  for (const slug of artistSlugs) {
    await randomDelay(); // delay between slug attempts

    const url = `https://www.azlyrics.com/lyrics/${slug}/${trackKey}.html`;

    // ✅ Always log the attempt first
    console.log('Tried URL:', url);

    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Vinly Deck)' } });
      const html = await res.text();
      const attemptFile = path.join(albumDir, `${cleanTitle(safeTrackName)}__${slug}.html`);
      fs.writeFileSync(attemptFile, html, 'utf8');
      attemptFiles.push(attemptFile);

      if (res.ok && !isErrorPage(html) && html.length > 2000 && !acceptedSource) {
        fs.writeFileSync(canonicalHtml, html, 'utf8');
        acceptedSource = url;
      }
    } catch (err) {
      console.warn('Download failed for', url, err.message);
    }
  }

  attemptFiles.forEach(f => { try { fs.unlinkSync(f); } catch {} });

  // ✅ If no source found, create a .txt with placeholder
  if (!acceptedSource) {
    fs.writeFileSync(canonicalTxt, 'Instrumental track – no lyrics available', 'utf8');
    return { htmlFile: null, downloaded: false, source: null, txtExists: true };
  }

  return { htmlFile: canonicalHtml, downloaded: true, source: acceptedSource, txtExists: false };
}

function scrapeLyricsTxt(htmlFile, mp3Path) {
  const mp3Base = path.basename(mp3Path, path.extname(mp3Path));
  const albumDir = path.dirname(htmlFile || path.join(mp3Path, '..'));
  const targetFile = path.join(albumDir, `${mp3Base}.txt`);

  if (fs.existsSync(targetFile)) {
    return { txtFile: targetFile, scraped: false };
  }

  if (!fs.existsSync(htmlFile)) {
    fs.writeFileSync(targetFile, 'Instrumental track – no lyrics available', 'utf8');
    return { txtFile: targetFile, scraped: true };
  }

  const html = fs.readFileSync(htmlFile, 'utf8');
  const lyricsText = extractLyrics(html) || 'Instrumental track – no lyrics available';

  fs.writeFileSync(targetFile, lyricsText, 'utf8');

  try { fs.unlinkSync(htmlFile); } catch {}
  return { txtFile: targetFile, scraped: true };
}

// ---------- Lyrics API ----------
app.get('/lyrics', async (req, res) => {
  try {
    let { trackFile } = req.query;
    if (!trackFile) return res.status(400).json({ error: 'Missing ?trackFile=' });

    trackFile = decodeURIComponent(trackFile);
    const mp3Path = trackFile.startsWith('http') ? new URL(trackFile).pathname : trackFile;

    enqueueLyricsTask(async () => {
      const resultDownload = await downloadLyricsHtml(mp3Path);

      let resultScrape;
      if (resultDownload.txtExists) {
        const mp3Base = path.basename(mp3Path, path.extname(mp3Path));
        const albumDir = path.dirname(resultDownload.htmlFile || path.join(mp3Path, '..'));
        resultScrape = { txtFile: path.join(albumDir, `${mp3Base}.txt`), scraped: false, error: null };
      } else {
        resultScrape = scrapeLyricsTxt(resultDownload.htmlFile, mp3Path);
      }

      res.json({
        message: 'Lyrics processed',
        htmlFile: resultDownload.htmlFile,
        htmlDownloaded: resultDownload.downloaded,
        source: resultDownload.source || null,
        txtFile: resultScrape.txtFile,
        txtScraped: resultScrape.scraped,
        error: resultScrape.error || null
      });
    });
  } catch (err) {
    console.error('Lyrics route failed:', err.message);
    res.status(500).json({ error: 'Lyrics route failed', detail: err.message });
  }
});

app.post('/save-lrc', express.json(), (req, res) => {
  let { filepath, lineIndex, text, time } = req.body;

  // Decode URL-encoded characters (%20 → space, etc.)
  filepath = decodeURIComponent(filepath);

  const filePath = path.join(__dirname, 'public', filepath);

  try {
    let lines = [];
    if (fs.existsSync(filePath)) {
      lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    }

    const t = parseFloat(time);
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(Math.floor(t % 60)).padStart(2, '0');
    const xx = String(Math.floor((t % 1) * 100)).padStart(2, '0');
    const lrcLine = `[${mm}:${ss}.${xx}] ${text}`;

    lines[lineIndex] = lrcLine;

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

    res.json({ success: true, file: filePath, savedLine: lrcLine });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save LRC', detail: err.message });
  }
});

// ---------- Setlist API routes----------

app.get('/api/setlists', (req, res) => {
  try {
    const files = fs.readdirSync(ROOT_USER_SETLIST)
      .filter(f => f.toLowerCase().endsWith('.txt'));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list setlists', detail: err.message });
  }
});

// Create new setlist
app.post('/api/setlists/create', express.json(), async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Missing title' });

  const safeTitle = sanitizeFilename(title);
  const txtPath = path.join(ROOT_USER_SETLIST, `${safeTitle}.txt`);
  const coverPath = path.join(ROOT_USER_SETLIST, `${safeTitle}.jpg`);

  try {
    if (!fs.existsSync(txtPath)) {
      fs.writeFileSync(txtPath, '', 'utf8');
    }
    try {
      const artworkUrl = await getITunesArtwork(safeTitle, safeTitle, null, 'album');
      if (artworkUrl) await downloadImage(artworkUrl, coverPath);
    } catch (err) {
      console.warn('Cover fetch failed:', err.message);
    }
    res.json({ success: true, file: txtPath, cover: coverPath });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create setlist', detail: err.message });
  }
});

app.post('/api/setlists/append', express.json(), (req, res) => {
  const { list, trackPath } = req.body;
  if (!list || !trackPath) {
    return res.status(400).json({ error: 'Missing list or trackPath' });
  }

  const safeList = sanitizeFilename(list);
  const filePath = path.join(ROOT_USER_SETLIST, safeList);

  try {
    // Normalize to relative under Vinly Setlist/
    let relPath = trackPath.replace(/\\/g, '/'); // normalize slashes
    const key = 'Vinly Setlist/';
    const idx = relPath.toLowerCase().lastIndexOf(key.toLowerCase());
    if (idx >= 0) {
      relPath = relPath.substring(idx); // keep "Vinly Setlist/Artist/Album/Track.mp3"
    } else {
      // fallback: prepend if missing
      relPath = 'Vinly Setlist/' + relPath.replace(/^\/+/, '');
    }

    fs.appendFileSync(filePath, relPath + '\n', 'utf8');
    res.json({ success: true, file: filePath, appended: relPath });
  } catch (err) {
    res.status(500).json({ error: 'Failed to append track', detail: err.message });
  }
});

// Load setlist
app.get('/api/setlists/load', (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ error: 'Missing ?file=' });

  const safeFile = sanitizeFilename(file);
  const filePath = path.join(ROOT_USER_SETLIST, safeFile);

  try {
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Setlist not found' });
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
    const items = lines.map(pathPart => ({
      path: pathPart,
      name: path.basename(pathPart)
    }));
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load setlist', detail: err.message });
  }
});

// --- Delete Setlist API routes ---

const setlistDir = path.join(process.cwd(), 'public', 'Setlist');

app.get('/api/setlists', (req, res) => {
  fs.readdir(setlistDir, (err, files) => {
    if (err) {
      console.error('Failed to read setlist directory:', err);
      return res.status(500).json({ error: 'Failed to read setlists' });
    }
    const txtFiles = files.filter(f => f.toLowerCase().endsWith('.txt'));
    res.json(txtFiles);
  });
});

// Delete a setlist file (and optional cover image)
app.delete('/api/setlists/delete', (req, res) => {
  const file = req.query.file;
  if (!file) {
    return res.status(400).json({ error: 'Missing file' });
  }

  const targetTxt = path.join(setlistDir, file);
  const baseName = file.replace(/\.txt$/i, '');
  const targetJpg = path.join(setlistDir, `${baseName}.jpg`);

  // Delete .txt file
  fs.unlink(targetTxt, (err) => {
    if (err) {
      console.error('Failed to delete setlist file:', err);
      return res.status(500).json({ error: 'Failed to delete setlist file' });
    }

    fs.unlink(targetJpg, (jpgErr) => {
      if (jpgErr && jpgErr.code !== 'ENOENT') {
        console.warn('Failed to delete cover image:', jpgErr);
      }
      return res.json({ success: true });
    });
  });
});

// Delete Setlist Track
app.post('/api/setlists/deleteSetlistTrack', express.json(), async (req, res) => {
  try {
    const { file, track, index } = req.body;
    if (!file) {
      return res.status(400).json({ error: 'Missing file' });
    }

    const targetTxt = path.join(setlistDir, file);
    if (!fs.existsSync(targetTxt)) {
      return res.status(404).json({ error: `Setlist file not found: ${file}` });
    }

    const raw = await fs.promises.readFile(targetTxt, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);

    // Normalize paths for comparison
    const norm = (s) => s.replace(/\\/g, '/')
                         .replace(/^Vinly Setlist\/+/i, '') // strip prefix
                         .trim();

    let updated = [...lines];

    if (typeof index === 'number' && index >= 0 && index < lines.length) {
      updated.splice(index, 1);
    } else if (track) {
      const pos = lines.findIndex(line => norm(line) === norm(track));
      if (pos === -1) {
        return res.status(404).json({ error: `Track not found in setlist: ${track}` });
      }
      updated.splice(pos, 1);
    } else {
      return res.status(400).json({ error: 'Missing track or index' });
    }

    await fs.promises.writeFile(targetTxt, updated.join('\n') + '\n', 'utf8');
    // Success response returned to client
    return res.json({ success: true, items: updated });
  } catch (err) {
    console.error('Failed to delete track from setlist:', err);
    return res.status(500).json({ error: 'Failed to delete track from setlist', details: err.message });
  }
});

app.post('/api/setlists/reorder', express.json(), async (req, res) => {
  const { file, tracks } = req.body;
  if (!file || !Array.isArray(tracks)) {
    return res.status(400).json({ error: 'Invalid data' });
  }

  const filePath = path.join(ROOT_USER_SETLIST, file);

  try {
    const content = tracks.join('\n') + '\n';
    await fs.promises.writeFile(filePath, content, 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reorder setlist', detail: err.message });
  }
});

// ---------- Setlist Shuffle ----------

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root folder for your setlists/music (include "public")
const ROOT = path.join(__dirname, 'public', 'Vinly Setlist');

// Supported audio extensions
const audioExtensions = [
  '.mp3', '.wav', '.wma', '.aac', '.flac', '.ogg',
  '.m4a', '.mid', '.midi', '.aiff', '.au'
];

// Utility: list subfolders (albums)
function listSubfolders(folderPath) {
  if (!fs.existsSync(folderPath)) return [];
  return fs.readdirSync(folderPath).filter(f => {
    const full = path.join(folderPath, f);
    return fs.existsSync(full) && fs.statSync(full).isDirectory();
  });
}

// Utility: list audio files
function listAudioFiles(folderPath) {
  if (!fs.existsSync(folderPath)) return [];
  return fs.readdirSync(folderPath).filter(f => {
    const full = path.join(folderPath, f);
    return fs.existsSync(full) &&
           fs.statSync(full).isFile() &&
           audioExtensions.includes(path.extname(f).toLowerCase());
  });
}

// ---------- API: List albums for an artist ----------
app.get('/api/artists/:id/albums', (req, res) => {
  const artistId = req.params.id;
  const artistPath = path.join(ROOT, artistId);

  try {
    if (!fs.existsSync(artistPath)) {
      return res.status(404).json({ error: `Artist folder not found: ${artistId}` });
    }

    const albums = listSubfolders(artistPath);
    res.json(albums.map(name => ({
      id: `${artistId}/${name}`,
      name
    })));
  } catch (err) {
    console.error('Error listing albums:', err);
    res.status(500).json({ error: 'Failed to fetch albums' });
  }
});

// ---------- API: List tracks for an album ----------
app.get(/^\/api\/albums\/(.+)\/tracks$/, (req, res) => {
  const albumId = req.params[0];
  const albumPath = path.join(ROOT, albumId);

  try {
    if (!fs.existsSync(albumPath)) {
      return res.status(404).json({ error: `Album folder not found: ${albumId}` });
    }

    const files = listAudioFiles(albumPath);
    const tracks = files.map(f => ({
      title: path.basename(f, path.extname(f)),
      filePath: path.join(albumId, f),
      albumName: path.basename(albumPath)
    }));

    res.json(tracks);
  } catch (err) {
    console.error('Error listing tracks:', err);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// ---------- API: Save shuffled setlist ----------
app.post('/api/artists/:id/setlist-shuffle', (req, res) => {
  const artistId = req.params.id;
  const { text } = req.body;

  if (!text) return res.status(400).json({ error: 'Missing setlist text' });

  const artistPath = path.join(ROOT, artistId);
  if (!fs.existsSync(artistPath)) {
    return res.status(404).json({ error: `Artist folder not found: ${artistId}` });
  }

  const cleaned = text.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .join('\n');

  const filePath = path.join(artistPath, 'setlist-shuffle.txt');
  try {
    fs.writeFileSync(filePath, cleaned, 'utf8');
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving shuffle setlist:', err);
    res.status(500).json({ error: 'Failed to save shuffle setlist' });
  }
});

// ---------- API: Delete shuffled setlist ----------
app.delete('/api/artists/:id/setlist-shuffle.txt', (req, res) => {
  const artistId = req.params.id;
  const filePath = path.join(ROOT, artistId, 'setlist-shuffle.txt');

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Setlist shuffle file not found' });
    }

    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting shuffle setlist:', err);
    res.status(500).json({ error: 'Failed to delete shuffle setlist' });
  }
});

// ---------- Static + server start ----------
app.use(express.static(path.join(__dirname, 'public')));

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});