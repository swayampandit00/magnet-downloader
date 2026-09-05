const API = '/api'

async function req(path, opts = {}) {
  const { body, headers, ...rest } = opts
  const res = await fetch(API + path, {
    ...rest,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    body: body != null ? JSON.stringify(body) : undefined
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed')
  return data
}

export const api = {
  health: () => req('/health'),
  torrents: () => req('/torrents'),
  torrent: (hash) => req(`/torrents/${hash}`),
  addTorrent: (magnet, name) => req('/torrents', { method: 'POST', body: { magnet, name } }),
  selectFiles: (hash, fileIndices) =>
    req(`/torrents/${hash}/select`, { method: 'POST', body: { fileIndices } }),
  removeTorrent: (hash, rm) =>
    req(`/torrents/${hash}?rm=${rm ? 'true' : 'false'}`, { method: 'DELETE' }),
  files: (hash) => req(`/torrents/${hash}/files`),
  streamUrl: (hash, index) => `${API}/torrents/${hash}/stream/${index}`,
  downloadUrl: (hash, index) => `${API}/torrents/${hash}/download/${index}`,
  search: (q) => req(`/search?q=${encodeURIComponent(q)}`),
  settings: () => req('/settings'),
  setSpeed: (downloadLimit, uploadLimit) =>
    req('/settings/speed', { method: 'POST', body: { downloadLimit, uploadLimit } }),
  storage: () => req('/storage'),
  socialInfo: (url) => req('/social/info', { method: 'POST', body: { url } }),
  socialDownload: (payload) => req('/social/download', { method: 'POST', body: payload }),
  socialJobs: () => req('/social/jobs'),
  socialJob: (id) => req(`/social/jobs/${id}`),
  socialFileUrl: (id, index, inline = false) =>
    `${API}/social/jobs/${id}/file?index=${index}${inline ? '&inline=1' : ''}`,
  removeSocialJob: (id) => req(`/social/jobs/${id}`, { method: 'DELETE' })
}
