export function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = Number(n)
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  const digits = v >= 10 || i === 0 ? 0 : 1
  return `${v.toFixed(digits)} ${units[i]}`
}

export function formatSpeed(n) {
  if (!n) return '0 B/s'
  return `${formatBytes(n)}/s`
}

export function formatEta(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0 || ms > 8.64e7 * 30) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function formatDuration(s) {
  if (s == null || Number.isNaN(s)) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function formatPct(n) {
  if (n == null || Number.isNaN(n)) return '0%'
  return `${Math.min(100, Math.max(0, n * 100)).toFixed(1)}%`
}

export function isMediaType(type, name = '') {
  const t = (type || '').toLowerCase()
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (t.startsWith('video/') || ['mp4', 'mkv', 'webm', 'avi', 'mov', 'm4v'].includes(ext)) return 'video'
  if (t.startsWith('audio/') || ['mp3', 'm4a', 'aac', 'opus', 'wav', 'ogg', 'flac'].includes(ext)) return 'audio'
  return null
}

export function kindMedia(kind, name) {
  if (kind === 'video' || kind === 'audio') return kind
  return isMediaType('', name)
}
