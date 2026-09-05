import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import mime from 'mime-types'
import WebTorrent from 'webtorrent'
import socialRouter from './social.js'
import { socialTools } from './social.js'
import { loadJson, saveJson } from './store.js'
import { searchTorrents, TRACKERS } from './search.js'

const PORT = process.env.PORT || 4000
const DOWNLOAD_DIR = path.resolve(process.env.DOWNLOAD_DIR || './downloads')
const DATA_DIR = path.resolve(process.env.DATA_DIR || './data')
const TORRENTS_FILE = path.join(DATA_DIR, 'torrents.json')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })

const client = new WebTorrent({ path: DOWNLOAD_DIR })
client.on('error', (err) => {
  console.error('[webtorrent]', err.message)
})

let settings = loadJson(SETTINGS_FILE, { downloadLimit: null, uploadLimit: null })
const torrentRecords = loadJson(TORRENTS_FILE, [])
const selections = new Map() // infoHash -> Set(fileIndex)

const app = express()
app.use(cors())
app.use(express.json())

function magnetToInfoHash(magnet) {
  const hexMatch = magnet.match(/xt=urn:btih:([a-fA-F0-9]{40})/)
  if (hexMatch) return hexMatch[1].toLowerCase()
  const b32Match = magnet.match(/xt=urn:btih:([a-z2-7]{32})/i)
  if (b32Match) return b32Match[1].toLowerCase()
  return null
}

function enrichMagnet(magnet, name) {
  let out = magnet.trim()
  if (name && !/[?&]dn=/.test(out)) {
    out += `&dn=${encodeURIComponent(name)}`
  }
  if (!/[?&]tr=/.test(out)) {
    out += '&' + TRACKERS.map((t) => `tr=${encodeURIComponent(t)}`).join('&')
  }
  return out
}

function persistTorrents() {
  saveJson(TORRENTS_FILE, torrentRecords)
}

function upsertTorrentRecord(rec) {
  const idx = torrentRecords.findIndex((r) => r.infoHash === rec.infoHash)
  if (idx >= 0) {
    const existing = torrentRecords[idx]
    if (rec.selected === null) rec.selected = existing.selected
    torrentRecords[idx] = { ...existing, ...rec }
  } else {
    torrentRecords.push(rec)
  }
  persistTorrents()
}

function isSelected(infoHash, fileIndex) {
  const s = selections.get(infoHash)
  return s ? s.has(fileIndex) : true
}

function applySelection(torrent, indices) {
  const set = new Set(indices)
  for (const [i, file] of (torrent.files || []).entries()) {
    if (set.has(i)) file.select()
    else file.deselect()
  }
}

function torrentFromRecord(rec) {
  return {
    infoHash: rec.infoHash,
    name: rec.name || 'Fetching metadata...',
    magnetURI: rec.magnet,
    length: rec.length || 0,
    downloaded: rec.downloaded || 0,
    uploadSpeed: 0,
    downloadSpeed: 0,
    numPeers: 0,
    progress: rec.progress || 0,
    ratio: 0,
    timeRemaining: null,
    done: !!rec.done,
    paused: false,
    ready: false,
    files: rec.files || [],
    status: rec.error ? 'error' : 'pending',
    error: rec.error || null
  }
}

function torrentPublic(torrent) {
  try {
    const infoHash = torrent.infoHash
    return {
      infoHash,
      name: torrent.name,
      magnetURI: torrent.magnetURI,
      length: torrent.length || 0,
      downloaded: torrent.downloaded || 0,
      uploadSpeed: torrent.uploadSpeed || 0,
      downloadSpeed: torrent.downloadSpeed || 0,
      numPeers: torrent.numPeers || 0,
      progress: torrent.progress || 0,
      ratio: torrent.ratio || 0,
      timeRemaining: torrent.timeRemaining,
      done: !!torrent.done,
      paused: !!torrent.paused,
      ready: !!torrent.ready,
      files: Array.isArray(torrent.files)
        ? torrent.files.map((f, i) => ({
            index: i,
            name: f.name,
            path: f.path,
            length: f.length,
            downloaded: f.downloaded,
            progress: f.progress,
            type: mime.lookup(f.name) || 'application/octet-stream',
            selected: isSelected(infoHash, i)
          }))
        : [],
      status: torrent.ready ? (torrent.done ? 'done' : 'downloading') : 'metadata',
      error: null
    }
  } catch (e) {
    return torrentFromRecord({
      infoHash: torrent.infoHash,
      magnet: torrent.magnetURI,
      name: torrent.name,
      error: e.message
    })
  }
}

function attachTorrentEvents(torrent) {
  torrent.on('infoHash', () => {
    console.log(`[torrent] infoHash: ${torrent.infoHash}`)
  })
  torrent.on('ready', () => {
    console.log(`[torrent] ready: ${torrent.name}`)
    const rec = torrentRecords.find((r) => r.infoHash === torrent.infoHash)
    if (rec) {
      if (rec.selected && rec.selected.length) {
        selections.set(torrent.infoHash, new Set(rec.selected))
        applySelection(torrent, rec.selected)
      }
      if (!rec.name && torrent.name) {
        rec.name = torrent.name
        persistTorrents()
      }
    }
  })
  torrent.on('error', (err) => {
    console.error(`[torrent] error: ${err.message}`)
    const rec = torrentRecords.find((r) => r.infoHash === torrent.infoHash || r.magnet === torrent.magnetURI)
    if (rec) {
      rec.error = err.message
      persistTorrents()
    }
  })
  torrent.on('done', () => {
    console.log(`[torrent] done: ${torrent.name}`)
  })
}

app.get('/api/health', (req, res) => {
  const tools = socialTools()
  res.json({
    ok: true,
    version: 'webtorrent',
    downloads: client.torrents.length,
    ytDlp: Boolean(tools.ytDlp),
    ffmpeg: Boolean(tools.ffmpeg)
  })
})

app.get('/api/torrents', (req, res) => {
  const live = client.torrents.map(torrentPublic)
  const liveHashes = new Set(live.map((t) => t.infoHash).filter(Boolean))
  const pending = torrentRecords
    .filter((r) => r.infoHash && !liveHashes.has(r.infoHash))
    .map(torrentFromRecord)
  res.json([...live, ...pending])
})

app.post('/api/torrents', async (req, res) => {
  const { magnet, name } = req.body || {}
  if (!magnet || typeof magnet !== 'string') {
    return res.status(400).json({ error: 'magnet link required' })
  }
  const infoHash = magnetToInfoHash(magnet)
  if (!infoHash) {
    return res.status(400).json({ error: 'invalid magnet link' })
  }
  const magnetURI = enrichMagnet(magnet, name)
  const existing = await client.get(infoHash)
  if (existing) {
    return res.json(torrentPublic(existing))
  }
  upsertTorrentRecord({ infoHash, magnet: magnetURI, name: name || null, selected: null, error: null })
  let torrent
  try {
    torrent = client.add(magnetURI, { path: DOWNLOAD_DIR })
  } catch (e) {
    upsertTorrentRecord({ infoHash, magnet: magnetURI, name: name || null, error: e.message })
    return res.status(500).json({ error: e.message })
  }
  attachTorrentEvents(torrent)
  console.log(`[torrent] add requested, client.torrents=${client.torrents.length}`)
  const pub = torrentPublic(torrent)
  if (!pub.infoHash) pub.infoHash = infoHash
  res.status(202).json(pub)
})

app.get('/api/torrents/:infoHash', async (req, res) => {
  const torrent = await client.get(req.params.infoHash)
  if (!torrent) return res.status(404).json({ error: 'torrent not found' })
  res.json(torrentPublic(torrent))
})

app.post('/api/torrents/:infoHash/select', async (req, res) => {
  const torrent = await client.get(req.params.infoHash)
  if (!torrent) return res.status(404).json({ error: 'torrent not found' })
  const { fileIndices } = req.body || {}
  if (!Array.isArray(fileIndices)) {
    return res.status(400).json({ error: 'fileIndices array required' })
  }
  const valid = fileIndices.filter((i) => Number.isInteger(i) && i >= 0)
  selections.set(req.params.infoHash, new Set(valid))
  applySelection(torrent, valid)
  const rec = torrentRecords.find((r) => r.infoHash === req.params.infoHash)
  if (rec) {
    rec.selected = valid
    persistTorrents()
  }
  res.json(torrentPublic(torrent))
})

app.delete('/api/torrents/:infoHash', async (req, res) => {
  const infoHash = req.params.infoHash
  const torrent = await client.get(infoHash)
  const rm = req.query.rm === 'true'
  const finish = (err) => {
    if (err) return res.status(500).json({ error: err.message })
    const idx = torrentRecords.findIndex((r) => r.infoHash === infoHash)
    if (idx >= 0) {
      torrentRecords.splice(idx, 1)
      persistTorrents()
    }
    selections.delete(infoHash)
    res.json({ ok: true, removedFiles: rm })
  }
  if (!torrent) {
    if (!torrentRecords.some((r) => r.infoHash === infoHash)) {
      return res.status(404).json({ error: 'torrent not found' })
    }
    return finish()
  }
  client.remove(infoHash, { rm }, finish)
})

app.get('/api/torrents/:infoHash/files', async (req, res) => {
  const torrent = await client.get(req.params.infoHash)
  if (!torrent) return res.status(404).json({ error: 'torrent not found' })
  res.json(torrentPublic(torrent).files)
})

function safeFilePath(torrent, fileIndex) {
  const file = torrent.files[fileIndex]
  if (!file) return null
  const resolved = path.resolve(DOWNLOAD_DIR, file.path)
  if (!resolved.startsWith(path.resolve(DOWNLOAD_DIR))) return null
  return resolved
}

app.get('/api/torrents/:infoHash/stream/:fileIndex', async (req, res) => {
  const torrent = await client.get(req.params.infoHash)
  if (!torrent) return res.status(404).json({ error: 'torrent not found' })

  const fileIndex = Number(req.params.fileIndex)
  const file = torrent.files[fileIndex]
  if (!file) return res.status(404).json({ error: 'file not found' })

  const mimeType = mime.lookup(file.name) || 'application/octet-stream'
  const size = file.length || 0
  const range = req.headers.range
  let startByte = 0
  let endByte = size ? size - 1 : 0

  if (range) {
    const [start, end] = range.replace(/bytes=/, '').split('-')
    startByte = parseInt(start, 10) || 0
    endByte = end ? parseInt(end, 10) : (size ? size - 1 : 0)
    if (size && startByte >= size) {
      res.status(416).set('Content-Range', `bytes */${size}`).end()
      return
    }
    res.status(206)
    res.set({
      'Content-Type': mimeType,
      'Content-Range': `bytes ${startByte}-${endByte}/${size || '*'}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': endByte - startByte + 1
    })
  } else {
    res.set({
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      ...(size ? { 'Content-Length': size } : {})
    })
  }

  const filePath = safeFilePath(torrent, fileIndex)
  if (filePath && fs.existsSync(filePath) && (file.progress >= 1 || torrent.done)) {
    fs.createReadStream(filePath, size ? { start: startByte, end: endByte } : undefined).pipe(res)
    return
  }

  try {
    const stream = file.createReadStream(size ? { start: startByte, end: endByte } : undefined)
    stream.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ error: err.message })
      else res.end()
    })
    stream.pipe(res)
  } catch (e) {
    if (!res.headersSent) res.status(409).json({ error: e.message || 'file not ready' })
  }
})

app.get('/api/torrents/:infoHash/download/:fileIndex', async (req, res) => {
  const torrent = await client.get(req.params.infoHash)
  if (!torrent) return res.status(404).json({ error: 'torrent not found' })

  const fileIndex = Number(req.params.fileIndex)
  const file = torrent.files[fileIndex]
  if (!file) return res.status(404).json({ error: 'file not found' })

  const filePath = safeFilePath(torrent, fileIndex)
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(409).json({ error: 'file not downloaded yet' })
  }

  res.download(filePath, file.name)
})

app.get('/api/search', async (req, res) => {
  const q = ((req.query.q || '').toString()).trim()
  if (!q) return res.status(400).json({ error: 'q query param required' })
  try {
    const results = await searchTorrents(q)
    res.json({ query: q, results })
  } catch (e) {
    res.status(502).json({ error: `Search failed: ${e.message}` })
  }
})

app.get('/api/settings', (req, res) => {
  res.json(settings)
})

app.post('/api/settings/speed', (req, res) => {
  const { downloadLimit, uploadLimit } = req.body || {}
  const dl = typeof downloadLimit === 'number' && downloadLimit >= 0 ? Math.floor(downloadLimit) : null
  const ul = typeof uploadLimit === 'number' && uploadLimit >= 0 ? Math.floor(uploadLimit) : null
  settings.downloadLimit = dl
  settings.uploadLimit = ul
  try {
    client.throttleDownload(dl == null ? -1 : dl)
    client.throttleUpload(ul == null ? -1 : ul)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
  saveJson(SETTINGS_FILE, settings)
  res.json(settings)
})

function dirSize(dir) {
  let total = 0
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) total += dirSize(p)
      else if (e.isFile()) total += fs.statSync(p).size
    }
  } catch { /* ignore */ }
  return total
}

app.get('/api/storage', (req, res) => {
  const socialDir = path.resolve(process.env.SOCIAL_DIR || './social-downloads')
  let stat = null
  try {
    stat = fs.statfsSync(DOWNLOAD_DIR)
  } catch { /* ignore */ }
  res.json({
    downloadsDir: DOWNLOAD_DIR,
    socialDir,
    downloadsSize: dirSize(DOWNLOAD_DIR),
    socialSize: dirSize(socialDir),
    freeBytes: stat ? stat.bavail * stat.bsize : null,
    totalBytes: stat ? stat.blocks * stat.bsize : null
  })
})

app.use('/api/social', socialRouter)

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' })
  }
  console.error('[server] unhandled error:', err.message)
  res.status(500).json({ error: err.message })
})

if (settings.downloadLimit) {
  try { client.throttleDownload(settings.downloadLimit) } catch { /* ignore */ }
}
if (settings.uploadLimit) {
  try { client.throttleUpload(settings.uploadLimit) } catch { /* ignore */ }
}

for (const rec of torrentRecords) {
  if (!rec.magnet) continue
  try {
    const torrent = client.add(rec.magnet, { path: DOWNLOAD_DIR })
    attachTorrentEvents(torrent)
  } catch (e) {
    console.error(`[torrent] resume failed for ${rec.infoHash}: ${e.message}`)
  }
}

app.listen(PORT, () => {
  console.log(`Magnet download server v3 pid=${process.pid} listening on http://localhost:${PORT}`)
  console.log(`Download directory: ${DOWNLOAD_DIR}`)
  console.log(`Resuming ${torrentRecords.length} saved torrent(s)`)
})
