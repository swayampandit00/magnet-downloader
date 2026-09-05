import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import mime from 'mime-types'
import ffmpegStatic from 'ffmpeg-static'
import { loadJson, saveJson } from './store.js'

const router = Router()
const SOCIAL_DIR = path.resolve(process.env.SOCIAL_DIR || './social-downloads')
const DATA_DIR = path.resolve(process.env.DATA_DIR || './data')
const HISTORY_FILE = path.join(DATA_DIR, 'social-jobs.json')
fs.mkdirSync(SOCIAL_DIR, { recursive: true })

function findYtDlp() {
  const candidates = [
    process.env.YT_DLP_PATH,
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    'yt-dlp'
  ].filter(Boolean)
  for (const bin of candidates) {
    try {
      if (bin.includes('/') && !fs.existsSync(bin)) continue
      const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 8000 })
      if (r.status === 0) return bin
    } catch {
      /* try next */
    }
  }
  return null
}

const YT_DLP = findYtDlp()
const FFMPEG = (ffmpegStatic && fs.existsSync(ffmpegStatic)) ? ffmpegStatic : null

export function socialTools() {
  return { ytDlp: YT_DLP, ffmpeg: FFMPEG }
}

function extractorArgsFor(url) {
  if (/youtu\.?be/i.test(url || '')) {
    return ['--extractor-args', 'youtube:player_client=android,ios,tv_embedded,mweb,web']
  }
  return []
}

function ytDlpArgs(extra, url) {
  const args = ['--no-warnings', '--newline']
  if (FFMPEG) args.push('--ffmpeg-location', FFMPEG)
  args.push(
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  )
  args.push(...extractorArgsFor(url))
  args.push(...extra)
  return args
}

const jobs = new Map() // in-flight jobs
const history = new Map() // finished jobs (also persisted)

for (const rec of loadJson(HISTORY_FILE, [])) {
  history.set(rec.id, rec)
}

function persistHistory() {
  const arr = [...history.values()]
    .sort((a, b) => (b.completedAt || 0) - (a.createdAt || 0))
    .slice(0, 100)
    .map((j) => ({
      id: j.id,
      url: j.url,
      status: j.status,
      progress: j.progress,
      title: j.title,
      error: j.error,
      dir: j.dir,
      quality: j.quality,
      audioOnly: j.audioOnly,
      subtitles: j.subtitles,
      playlist: j.playlist,
      files: j.files,
      mediaFile: j.mediaFile,
      createdAt: j.createdAt,
      completedAt: j.completedAt
    }))
  saveJson(HISTORY_FILE, arr)
}

const QUALITIES = ['best', '2160', '1440', '1080', '720', '480', '360', '240', '144']

function runYtDlp(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    if (!YT_DLP) {
      reject(new Error('yt-dlp is not installed on the server'))
      return
    }
    const url = [...args].reverse().find((a) => /^https?:\/\//i.test(a))
    const proc = spawn(YT_DLP, ytDlpArgs(args, url), { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      reject(new Error('yt-dlp timed out'))
    }, timeoutMs)
    proc.stdout.on('data', (d) => { stdout += d })
    proc.stderr.on('data', (d) => { stderr += d })
    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`))
    })
  })
}

function qualityFormatArgs(quality, audioOnly) {
  if (audioOnly) {
    return FFMPEG
      ? ['-x', '--audio-format', 'mp3', '-f', 'bestaudio/best']
      : ['-f', 'bestaudio/best']
  }
  const maxH = QUALITIES.includes(quality) && quality !== 'best' ? parseInt(quality, 10) : null
  if (!FFMPEG) {
    if (maxH) return ['-f', `b[height<=${maxH}]/b/best`]
    return ['-f', 'b/best']
  }
  if (maxH) {
    return [
      '-f',
      `bv*[height<=${maxH}]+ba/b[height<=${maxH}]/b`,
      '--merge-output-format',
      'mp4'
    ]
  }
  return ['-f', 'bv*+ba/b', '--merge-output-format', 'mp4']
}

function classifyFile(name) {
  const ext = path.extname(name).toLowerCase()
  if (['.srt', '.vtt', '.ass', '.ssa'].includes(ext)) return 'subs'
  if (['.mp3', '.m4a', '.aac', '.opus', '.wav', '.ogg', '.flac', '.wma'].includes(ext)) return 'audio'
  if (['.mp4', '.mkv', '.webm', '.avi', '.mov', '.mpg', '.mpeg', '.ts', '.3gp', '.flv', '.m4v'].includes(ext)) return 'video'
  return 'other'
}

function buildFiles(job) {
  const entries = fs.readdirSync(job.dir, { withFileTypes: true })
  const files = []
  for (const e of entries) {
    if (!e.isFile()) continue
    const p = path.join(job.dir, e.name)
    try {
      const stat = fs.statSync(p)
      files.push({ name: e.name, path: p, size: stat.size, kind: classifyFile(e.name) })
    } catch { /* ignore */ }
  }
  const rank = { video: 0, audio: 1, subs: 2, other: 3 }
  files.sort((a, b) => rank[a.kind] - rank[b.kind] || b.size - a.size)
  return files
}

router.post('/info', async (req, res) => {
  const { url } = req.body || {}
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url required' })
  }
  try {
    const { stdout } = await runYtDlp([
      '--dump-single-json', '--flat-playlist', '--playlist-end', '2', url
    ], 90000)
    const info = JSON.parse(stdout)
    const isPlaylist = info._type === 'playlist'
    let entry = info
    let playlistCount = null
    if (isPlaylist) {
      playlistCount = info.playlist_count || (info.entries && info.entries.length) || null
      entry = (info.entries && info.entries[0]) || {}
    }
    let full = entry
    if (isPlaylist && entry && entry.url && entry.url !== url) {
      try {
        const { stdout: s2 } = await runYtDlp([
          '--dump-single-json', '--no-playlist', entry.url
        ], 90000)
        full = JSON.parse(s2)
      } catch { /* keep flat info */ }
    }
    const formats = Array.isArray(full.formats) ? full.formats : []
    const heights = [...new Set(formats.map((f) => f.height).filter(Boolean))].sort((a, b) => b - a)
    const hasAudio = formats.some((f) => f.acodec && f.acodec !== 'none')
    const hasVideo = formats.some((f) => f.vcodec && f.vcodec !== 'none')
    res.json({
      id: full.id || null,
      title: full.title || info.title || 'Untitled',
      thumbnail: full.thumbnail || null,
      duration: full.duration || null,
      domain: full.webpage_url_domain || info.webpage_url_domain || full.extractor_key || 'unknown',
      ext: full.ext || null,
      filesize: full.filesize || full.filesize_approx || null,
      uploader: full.uploader || null,
      isLive: !!full.is_live,
      isPlaylist,
      playlistCount,
      formats: { heights, hasAudio, hasVideo }
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/download', (req, res) => {
  const { url, quality, audioOnly, subtitles, playlist } = req.body || {}
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url required' })
  }
  const id = crypto.randomBytes(6).toString('hex')
  const dir = path.join(SOCIAL_DIR, id)
  fs.mkdirSync(dir, { recursive: true })
  const job = {
    id,
    url,
    status: 'queued',
    progress: 0,
    title: null,
    error: null,
    dir,
    quality: audioOnly ? 'audio' : (QUALITIES.includes(quality) ? quality : 'best'),
    audioOnly: !!audioOnly,
    subtitles: !!subtitles,
    playlist: !!playlist,
    files: [],
    mediaFile: null,
    createdAt: Date.now(),
    completedAt: null
  }
  jobs.set(id, job)
  startJob(job)
  res.status(202).json({ jobId: id })
})

function parseProgressLine(line, job) {
  const pct = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/)
  if (pct) job.progress = Math.min(1, parseFloat(pct[1]) / 100)
  const dest = line.match(/\[download\]\s+Destination:\s+(.+)$/i)
  if (dest) {
    const name = path.basename(dest[1].trim())
    if (!job.title) job.title = name
  }
}

function fetchSubtitles(job) {
  return new Promise((resolve) => {
    const args = [
      '--skip-download', '--write-subs',
      '--sub-langs', 'en,hi,es,fr,de,pt,ja,ar',
      '--sub-format', 'srt/best', '--convert-subs', 'srt',
      '-o', path.join(job.dir, '%(title).120B [%(id)s].%(ext)s')
    ]
    if (job.playlist) args.push('--yes-playlist', '--playlist-end', '50')
    else args.push('--no-playlist')
    args.push(job.url)
    if (!YT_DLP) {
      resolve()
      return
    }
    const proc = spawn(YT_DLP, ytDlpArgs(args, job.url), { stdio: ['ignore', 'ignore', 'pipe'] })
    proc.on('error', () => resolve())
    proc.on('close', () => {
      try { job.files = buildFiles(job) } catch { /* ignore */ }
      resolve()
    })
  })
}

function finalizeJob(job, code) {
  job.proc = null
  job.completedAt = Date.now()
  try {
    job.files = buildFiles(job)
  } catch {
    job.files = []
  }
  const media = job.files.find((f) => f.kind === 'video' || f.kind === 'audio')
  if (code === 0 && media) {
    job.status = 'done'
    job.progress = 1
    job.mediaFile = media.path
    if (!job.title) job.title = media.name
  } else {
    job.status = 'error'
    if (!job.error) {
      const errLine = (job.errBuf || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(-2)
        .join(' ')
      job.error = errLine || `yt-dlp exited with code ${code}`
    }
  }
  history.set(job.id, job)
  persistHistory()
}

function startJob(job) {
  if (!YT_DLP) {
    job.status = 'error'
    job.error = 'yt-dlp is not installed on the server'
    job.completedAt = Date.now()
    history.set(job.id, job)
    persistHistory()
    return
  }
  job.status = 'downloading'
  const args = [
    '-o',
    path.join(job.dir, '%(title).120B [%(id)s].%(ext)s')
  ]
  if (job.playlist) args.push('--yes-playlist', '--playlist-end', '50')
  else args.push('--no-playlist')
  args.push(...qualityFormatArgs(job.quality, job.audioOnly))
  args.push(job.url)

  const proc = spawn(YT_DLP, ytDlpArgs(args, job.url), { stdio: ['ignore', 'pipe', 'pipe'] })
  job.proc = proc
  job.errBuf = ''
  let buf = ''
  const onData = (d) => {
    buf += d
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) parseProgressLine(line, job)
  }
  proc.stdout.on('data', onData)
  proc.stderr.on('data', (d) => {
    job.errBuf += d
    if (job.errBuf.length > 4000) job.errBuf = job.errBuf.slice(-4000)
    onData(d)
  })
  proc.on('error', (err) => {
    job.error = err.code === 'ENOENT' ? 'yt-dlp is not installed on the server' : err.message
    finalizeJob(job, 1)
  })
  proc.on('close', (code) => {
    if (job.status === 'error' && job.completedAt) return
    if (code === 0 && job.subtitles) {
      fetchSubtitles(job).then(() => finalizeJob(job, code))
    } else {
      finalizeJob(job, code)
    }
  })
}

router.get('/jobs', (req, res) => {
  const list = [...history.values(), ...jobs.values()]
    .filter((j, i, arr) => arr.findIndex((x) => x.id === j.id) === i)
    .map((j) => ({
      jobId: j.id,
      status: j.status,
      title: j.title,
      progress: j.progress,
      createdAt: j.createdAt,
      options: { quality: j.quality, audioOnly: j.audioOnly, subtitles: j.subtitles, playlist: j.playlist },
      fileCount: (j.files || []).length,
      error: j.error
    }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  res.json(list)
})

router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id) || history.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'job not found' })
  const mediaName = job.mediaFile ? path.basename(job.mediaFile) : null
  const mediaSize =
    job.mediaFile && fs.existsSync(job.mediaFile) ? fs.statSync(job.mediaFile).size : null
  res.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    title: job.title,
    options: { quality: job.quality, audioOnly: job.audioOnly, subtitles: job.subtitles, playlist: job.playlist },
    files: (job.files || []).map((f) => ({ name: f.name, size: f.size, kind: f.kind })),
    mediaFile: mediaName ? { name: mediaName, size: mediaSize } : null,
    error: job.error,
    createdAt: job.createdAt
  })
})

router.get('/jobs/:id/file', (req, res) => {
  const job = jobs.get(req.params.id) || history.get(req.params.id)
  if (!job || job.status !== 'done') return res.status(404).json({ error: 'file not ready' })
  const index = req.query.index != null ? parseInt(req.query.index, 10) : 0
  const file = job.files[index]
  if (!file) return res.status(404).json({ error: 'file not found' })
  const resolved = path.resolve(file.path)
  if (!resolved.startsWith(path.resolve(job.dir))) {
    return res.status(403).json({ error: 'invalid file' })
  }
  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'file not found' })
  const stat = fs.statSync(resolved)
  const mimeType = mime.lookup(file.name) || 'application/octet-stream'
  const filename = encodeURIComponent(file.name || 'video')
  const range = req.headers.range
  const inline = req.query.inline === '1' || String(req.query.disposition || '') === 'inline'
  const disposition = `${inline ? 'inline' : 'attachment'}; filename="${filename}"`

  if (range) {
    const [start, end] = range.replace(/bytes=/, '').split('-')
    const startByte = parseInt(start, 10)
    const endByte = end ? parseInt(end, 10) : stat.size - 1
    if (startByte >= stat.size) {
      res.status(416).set('Content-Range', `bytes */${stat.size}`).end()
      return
    }
    res.status(206)
    res.set({
      'Content-Type': mimeType,
      'Content-Range': `bytes ${startByte}-${endByte}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': endByte - startByte + 1,
      'Content-Disposition': disposition
    })
    fs.createReadStream(resolved, { start: startByte, end: endByte }).pipe(res)
  } else {
    res.set({
      'Content-Type': mimeType,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': disposition
    })
    fs.createReadStream(resolved).pipe(res)
  }
})

router.delete('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id) || history.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'job not found' })
  if (job.proc) {
    try { job.proc.kill() } catch { /* ignore */ }
  }
  jobs.delete(job.id)
  history.delete(job.id)
  persistHistory()
  fs.rm(job.dir, { recursive: true, force: true }, () => {
    res.json({ ok: true })
  })
})

export default router
