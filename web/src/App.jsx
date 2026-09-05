import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { formatBytes, formatDuration, formatEta, formatPct, formatSpeed, isMediaType, kindMedia } from './utils'

const TABS = [
  { id: 'downloads', label: 'Downloads' },
  { id: 'search', label: 'Search' },
  { id: 'social', label: 'Social' },
  { id: 'settings', label: 'Settings' }
]

function Icon({ name }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (name === 'downloads') {
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M12 4v12M7 12l5 5 5-5" />
        <path d="M5 20h14" />
      </svg>
    )
  }
  if (name === 'search') {
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
    )
  }
  if (name === 'social') {
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <rect x="3" y="6" width="18" height="13" rx="3" />
        <path d="M10 10l6 3.5-6 3.5V10z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.7.9 1.2 1.6 1.3H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

function MagnetMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M6 8a6 6 0 1 1 12 0v3h-3.2V8a2.8 2.8 0 1 0-5.6 0v8A2.8 2.8 0 0 0 12 18.8 2.8 2.8 0 0 0 14.8 16v-3H18v3a6 6 0 1 1-12 0V8z" fill="currentColor" />
    </svg>
  )
}

export default function App() {
  const [tab, setTab] = useState('downloads')
  const [online, setOnline] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const notify = useCallback((msg, err = false) => {
    setToast({ msg, err })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  useEffect(() => {
    let alive = true
    const ping = async () => {
      try {
        await api.health()
        if (alive) setOnline(true)
      } catch {
        if (alive) setOnline(false)
      }
    }
    ping()
    const id = setInterval(ping, 8000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><MagnetMark /></div>
          <div>
            <h1>Magnet</h1>
            <p>Downloader</p>
          </div>
        </div>
        <div className="status-pill">
          <span className={`dot ${online ? 'ok' : 'bad'}`} />
          {online ? 'Server online' : 'Offline'}
        </div>
      </header>

      <main className="screen">
        {tab === 'downloads' && <Downloads notify={notify} />}
        {tab === 'search' && <Search notify={notify} onAdded={() => setTab('downloads')} />}
        {tab === 'social' && <Social notify={notify} />}
        {tab === 'settings' && <Settings notify={notify} online={online} />}
      </main>

      <nav className="nav">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <Icon name={t.id} />
            {t.label}
          </button>
        ))}
      </nav>

      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
    </div>
  )
}

function Downloads({ notify }) {
  const [magnet, setMagnet] = useState('')
  const [torrents, setTorrents] = useState([])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(null)
  const [playing, setPlaying] = useState(null)

  const load = useCallback(async () => {
    try {
      setTorrents(await api.torrents())
    } catch {
      /* keep last */
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 1500)
    return () => clearInterval(id)
  }, [load])

  const add = async () => {
    const value = magnet.trim()
    if (!value) return
    setBusy(true)
    try {
      await api.addTorrent(value)
      setMagnet('')
      notify('Torrent added')
      await load()
    } catch (e) {
      notify(e.message, true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card col">
        <input
          className="field"
          placeholder="Paste magnet:?xt=urn:btih:..."
          value={magnet}
          onChange={(e) => setMagnet(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn btn-gold" disabled={busy || !magnet.trim()} onClick={add}>
          {busy ? <span className="spinner" /> : null}
          Add magnet
        </button>
        <a className="btn btn-ghost" href="/magnet-downloader.zip" download>Download source zip</a>
      </div>

      <div className="section-title">{torrents.length ? `${torrents.length} active` : 'Queue'}</div>
      {torrents.length === 0 && (
        <div className="empty">
          <h3>No torrents yet</h3>
          <p>Paste a magnet link or pick one from Search.</p>
        </div>
      )}
      {torrents.map((t) => (
        <TorrentCard
          key={t.infoHash || t.magnetURI}
          torrent={t}
          expanded={open === t.infoHash}
          onToggle={() => setOpen(open === t.infoHash ? null : t.infoHash)}
          onRefresh={load}
          notify={notify}
          playing={playing}
          setPlaying={setPlaying}
        />
      ))}
    </>
  )
}

function TorrentCard({ torrent: t, expanded, onToggle, onRefresh, notify, playing, setPlaying }) {
  const pct = t.progress || 0
  const hash = t.infoHash

  const remove = async (rm) => {
    try {
      await api.removeTorrent(hash, rm)
      notify(rm ? 'Torrent and files removed' : 'Torrent removed')
      onRefresh()
    } catch (e) {
      notify(e.message, true)
    }
  }

  const toggleFile = async (index, selected) => {
    const current = (t.files || []).filter((f) => f.selected).map((f) => f.index)
    const next = selected ? current.filter((i) => i !== index) : [...current, index]
    try {
      await api.selectFiles(hash, next)
      onRefresh()
    } catch (e) {
      notify(e.message, true)
    }
  }

  return (
    <article className="card torrent">
      <div className="row between" onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div className="grow">
          <div className="torrent-name">{t.name || 'Fetching metadata...'}</div>
          <div className="meta mt8">{formatBytes(t.downloaded)} / {formatBytes(t.length)} · {t.numPeers || 0} peers</div>
        </div>
            <span className={`tag ${t.error ? 'warn' : t.done ? 'ok' : t.ready ? 'blue' : ''}`}>{t.error ? 'Error' : t.done ? 'Done' : t.ready ? formatPct(pct) : 'Meta'}</span>
      </div>
      {t.error && <div className="error-banner mt8">{t.error}</div>}
      <div className={`progress ${t.done ? 'done' : ''}`}><span style={{ width: `${Math.min(100, pct * 100)}%` }} /></div>
      <div className="stats">
        <div className="stat"><b>{formatSpeed(t.downloadSpeed)}</b><span>Down</span></div>
        <div className="stat"><b>{formatSpeed(t.uploadSpeed)}</b><span>Up</span></div>
        <div className="stat"><b>{formatEta(t.timeRemaining)}</b><span>ETA</span></div>
      </div>
      {expanded && (
        <div className="mt12">
          {(t.files || []).map((f) => {
            const media = isMediaType(f.type, f.name)
            const canPlay = media && (t.ready || t.done || (f.progress || 0) > 0)
            return (
              <div className="file-row" key={f.index}>
                <input className="chk" type="checkbox" checked={f.selected !== false} onChange={() => toggleFile(f.index, f.selected !== false)} />
                <div className="grow">
                  <div>{f.name}</div>
                  <div className="meta">{formatBytes(f.length)} · {formatPct(f.progress || 0)}</div>
                </div>
                {canPlay && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setPlaying({ hash, index: f.index, name: f.name, type: media })}>
                    Play
                  </button>
                )}
                {(f.progress >= 1 || t.done) && (
                  <a className="btn btn-ghost btn-sm" href={api.downloadUrl(hash, f.index)}>Save</a>
                )}
              </div>
            )
          })}
          {playing && playing.hash === hash && (
            <video className="player" controls autoPlay src={api.streamUrl(playing.hash, playing.index)} />
          )}
          <div className="row wrap mt12">
            <button className="btn btn-ghost btn-sm" onClick={() => remove(false)}>Remove</button>
            <button className="btn btn-danger btn-sm" onClick={() => remove(true)}>Delete files</button>
          </div>
        </div>
      )}
    </article>
  )
}

function Search({ notify, onAdded }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(null)

  const run = async () => {
    const query = q.trim()
    if (!query) return
    setBusy(true)
    try {
      const data = await api.search(query)
      setResults(data.results || [])
      if (!(data.results || []).length) notify('No results')
    } catch (e) {
      notify(e.message, true)
    } finally {
      setBusy(false)
    }
  }

  const add = async (item) => {
    if (!item.magnet) return
    setAdding(item.id)
    try {
      await api.addTorrent(item.magnet, item.title)
      notify('Added to downloads')
      onAdded?.()
    } catch (e) {
      notify(e.message, true)
    } finally {
      setAdding(null)
    }
  }

  return (
    <>
      <div className="card col">
        <input
          className="field"
          placeholder="Search torrents..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <button className="btn btn-gold" disabled={busy || !q.trim()} onClick={run}>
          {busy ? <span className="spinner" /> : null}
          Search
        </button>
      </div>
      <div className="section-title">{results.length ? `${results.length} results` : 'Discover'}</div>
      {results.map((r) => (
        <article className="card search-item" key={r.id || r.infoHash}>
          <div className="search-title">{r.title}</div>
          <div className="chips">
            {r.size && <span className="chip">{r.size}</span>}
            <span className="chip">S {r.seeders}</span>
            <span className="chip">L {r.leechers}</span>
            {r.category && <span className="chip">{r.category}</span>}
          </div>
          <button className="btn btn-gold mt12" disabled={!r.magnet || adding === r.id} onClick={() => add(r)}>
            {adding === r.id ? <span className="spinner" /> : null}
            {r.magnet ? 'Add magnet' : 'No magnet'}
          </button>
        </article>
      ))}
    </>
  )
}

function Social({ notify }) {
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState(null)
  const [jobs, setJobs] = useState([])
  const [busy, setBusy] = useState(false)
  const [quality, setQuality] = useState('best')
  const [audioOnly, setAudioOnly] = useState(false)
  const [subtitles, setSubtitles] = useState(false)
  const [playlist, setPlaylist] = useState(false)
  const [playing, setPlaying] = useState(null)

  const loadJobs = useCallback(async () => {
    try {
      setJobs(await api.socialJobs())
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    loadJobs()
    const id = setInterval(loadJobs, 2000)
    return () => clearInterval(id)
  }, [loadJobs])

  const lookup = async () => {
    const value = url.trim()
    if (!value) return
    setBusy(true)
    setInfo(null)
    try {
      setInfo(await api.socialInfo(value))
    } catch (e) {
      notify(e.message, true)
    } finally {
      setBusy(false)
    }
  }

  const start = async () => {
    const value = url.trim()
    if (!value) return
    setBusy(true)
    try {
      await api.socialDownload({ url: value, quality, audioOnly, subtitles, playlist })
      notify('Download started')
      await loadJobs()
    } catch (e) {
      notify(e.message, true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card col">
        <input
          className="field"
          placeholder="YouTube, Instagram, TikTok URL..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
        />
        <div className="row">
          <button className="btn btn-ghost grow" disabled={busy || !url.trim()} onClick={lookup}>
            {busy ? <span className="spinner" /> : null}
            Probe
          </button>
          <button className="btn btn-gold grow" disabled={busy || !url.trim()} onClick={start}>
            Download
          </button>
        </div>
        <div className="seg">
          {['best', '1080', '720', '480'].map((q) => (
            <button key={q} className={!audioOnly && quality === q ? 'on' : ''} onClick={() => { setAudioOnly(false); setQuality(q) }}>
              {q === 'best' ? 'Best' : `${q}p`}
            </button>
          ))}
          <button className={audioOnly ? 'on' : ''} onClick={() => setAudioOnly(true)}>MP3</button>
        </div>
        <div className="row wrap">
          <label className="row" style={{ gap: 8, fontSize: 13, color: 'var(--muted)' }}>
            <input className="chk" type="checkbox" checked={subtitles} onChange={(e) => setSubtitles(e.target.checked)} />
            Subtitles
          </label>
          <label className="row" style={{ gap: 8, fontSize: 13, color: 'var(--muted)' }}>
            <input className="chk" type="checkbox" checked={playlist} onChange={(e) => setPlaylist(e.target.checked)} />
            Playlist
          </label>
        </div>
      </div>

      {info && (
        <div className="card mt16 info-card">
          {info.thumbnail ? <img className="thumb" src={info.thumbnail} alt="" /> : <div className="thumb" />}
          <div>
            <div className="search-title">{info.title}</div>
            <div className="chips">
              {info.domain && <span className="chip">{info.domain}</span>}
              {info.duration != null && <span className="chip">{formatDuration(info.duration)}</span>}
              {info.uploader && <span className="chip">{info.uploader}</span>}
              {info.isPlaylist && <span className="chip">playlist {info.playlistCount || ''}</span>}
            </div>
          </div>
        </div>
      )}

      <div className="section-title">Jobs</div>
      {jobs.length === 0 && (
        <div className="empty">
          <h3>No social downloads</h3>
          <p>Paste a YouTube / Instagram / TikTok link, then tap Download.</p>
        </div>
      )}
      {jobs.map((j) => (
        <SocialJob key={j.jobId} job={j} notify={notify} onRefresh={loadJobs} playing={playing} setPlaying={setPlaying} />
      ))}
    </>
  )
}

function SocialJob({ job, notify, onRefresh, playing, setPlaying }) {
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    let alive = true
    const run = async () => {
      try {
        const d = await api.socialJob(job.jobId)
        if (alive) setDetail(d)
      } catch {
        /* ignore */
      }
    }
    run()
    const id = setInterval(run, job.status === 'downloading' ? 1500 : 8000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [job.jobId, job.status])

  const files = detail?.files || []
  const pct = job.progress || 0

  const remove = async () => {
    try {
      await api.removeSocialJob(job.jobId)
      notify('Job removed')
      onRefresh()
    } catch (e) {
      notify(e.message, true)
    }
  }

  return (
    <article className="card torrent">
      <div className="row between">
        <div className="grow">
          <div className="torrent-name">{job.title || job.jobId}</div>
          <div className="meta mt8">{job.options?.quality || 'best'} {job.options?.audioOnly ? 'audio' : ''} · {job.fileCount || files.length} files</div>
        </div>
        <span className={`tag ${job.status === 'done' ? 'ok' : job.status === 'error' ? 'warn' : 'blue'}`}>{job.status}</span>
      </div>
      {job.status === 'downloading' && (
        <div className="progress"><span style={{ width: `${Math.min(100, pct * 100)}%` }} /></div>
      )}
      {job.error && <div className="error-banner mt12">{job.error}</div>}
      {files.map((f, i) => {
        const media = kindMedia(f.kind, f.name)
        return (
          <div className="file-row" key={`${f.name}-${i}`}>
            <div className="grow">
              <div>{f.name}</div>
              <div className="meta">{formatBytes(f.size)} · {f.kind}</div>
            </div>
            {job.status === 'done' && media && (
              <button className="btn btn-ghost btn-sm" onClick={() => setPlaying({ id: job.jobId, index: i, name: f.name })}>
                Play
              </button>
            )}
            {job.status === 'done' && (
              <a className="btn btn-ghost btn-sm" href={api.socialFileUrl(job.jobId, i)}>Save</a>
            )}
          </div>
        )
      })}
      {playing && playing.id === job.jobId && (
        <video className="player" controls autoPlay src={api.socialFileUrl(playing.id, playing.index, true)} />
      )}
      <div className="row mt12">
        <button className="btn btn-danger btn-sm" onClick={remove}>Remove</button>
      </div>
    </article>
  )
}

function Settings({ notify, online }) {
  const [settings, setSettings] = useState({ downloadLimit: null, uploadLimit: null })
  const [storage, setStorage] = useState(null)
  const [dl, setDl] = useState('')
  const [ul, setUl] = useState('')

  const load = useCallback(async () => {
    try {
      const s = await api.settings()
      setSettings(s)
      setDl(s.downloadLimit != null ? String(s.downloadLimit) : '')
      setUl(s.uploadLimit != null ? String(s.uploadLimit) : '')
    } catch {
      /* ignore */
    }
    try {
      setStorage(await api.storage())
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    const parse = (v) => {
      if (v === '' || v == null) return null
      const n = Number(v)
      return Number.isFinite(n) && n >= 0 ? n : null
    }
    try {
      const next = await api.setSpeed(parse(dl), parse(ul))
      setSettings(next)
      notify('Speed limits saved')
    } catch (e) {
      notify(e.message, true)
    }
  }

  const usedPct = storage?.totalBytes
    ? Math.min(100, ((storage.totalBytes - (storage.freeBytes || 0)) / storage.totalBytes) * 100)
    : 0

  return (
    <>
      <div className="card">
        <div className="setting-row">
          <div>
            <div>Backend</div>
            <div className="meta">{online ? 'Connected on /api' : 'Unreachable'}</div>
          </div>
          <span className={`tag ${online ? 'ok' : 'warn'}`}>{online ? 'Live' : 'Down'}</span>
        </div>
        <div className="setting-row">
          <div>
            <div>Download limit</div>
            <div className="meta">Bytes per second, empty = unlimited</div>
          </div>
          <input className="field num" inputMode="numeric" placeholder="∞" value={dl} onChange={(e) => setDl(e.target.value)} />
        </div>
        <div className="setting-row">
          <div>
            <div>Upload limit</div>
            <div className="meta">Bytes per second, empty = unlimited</div>
          </div>
          <input className="field num" inputMode="numeric" placeholder="∞" value={ul} onChange={(e) => setUl(e.target.value)} />
        </div>
        <button className="btn btn-gold mt12" onClick={save} style={{ width: '100%' }}>Save limits</button>
        {settings.downloadLimit != null || settings.uploadLimit != null ? (
          <div className="meta mt12">Current: DL {settings.downloadLimit ?? '∞'} · UL {settings.uploadLimit ?? '∞'}</div>
        ) : null}
      </div>

      <div className="section-title">Source</div>
      <div className="card">
        <div className="setting-row">
          <div>
            <div>Project zip</div>
            <div className="meta">Backend, web UI, and Expo app without node_modules</div>
          </div>
          <a className="btn btn-gold btn-sm" href="/magnet-downloader.zip" download>Download</a>
        </div>
      </div>

      <div className="section-title">Storage</div>
      <div className="card">
        {storage ? (
          <>
            <div className="progress"><span style={{ width: `${usedPct}%` }} /></div>
            <div className="stats">
              <div className="stat"><b>{formatBytes(storage.downloadsSize)}</b><span>Torrents</span></div>
              <div className="stat"><b>{formatBytes(storage.socialSize)}</b><span>Social</span></div>
              <div className="stat"><b>{formatBytes(storage.freeBytes)}</b><span>Free</span></div>
            </div>
            <div className="meta mt12">{storage.downloadsDir}</div>
          </>
        ) : (
          <div className="meta">Storage stats unavailable</div>
        )}
      </div>
    </>
  )
}
