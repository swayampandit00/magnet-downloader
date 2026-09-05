const SEARCH_URL = 'https://torrentz2.nz/search?q='
const DETAIL_URL = 'https://torrentz2.nz/torrent/'
const REQUEST_TIMEOUT = 25000
const MAX_DETAILS = 6

const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce'
]

const cache = new Map()

function unescapeHtml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x3D;/g, '=')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

async function fetchText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

function buildMagnet(infoHash, name) {
  const dn = encodeURIComponent(name)
  const tr = TRACKERS.map((t) => `tr=${encodeURIComponent(t)}`).join('&')
  return `magnet:?xt=urn:btih:${infoHash}&dn=${dn}&${tr}`
}

function parseResults(html) {
  const results = []
  const blocks = html.match(/<dl>[\s\S]*?<\/dl>/g) || []
  for (const block of blocks) {
    const m = block.match(/<a href="\/torrent\/([0-9a-f]{8,})"[^>]*>([\s\S]*?)<\/a>/)
    if (!m) continue
    const id = m[1]
    const title = unescapeHtml(m[2].replace(/<[^>]+>/g, '')).trim()
    if (!title) continue
    const size = (block.match(/<span class="s">([\s\S]*?)<\/span>/) || [])[1]
    const seeders = parseInt((block.match(/<span class="u">([\s\S]*?)<\/span>/) || [])[1] || '0', 10)
    const leechers = parseInt((block.match(/<span class="d">([\s\S]*?)<\/span>/) || [])[1] || '0', 10)
    const catMatch = block.match(/&raquo;\s*([^<&\n]+)/)
    results.push({
      id,
      title,
      size: size ? size.trim() : null,
      seeders: isNaN(seeders) ? 0 : seeders,
      leechers: isNaN(leechers) ? 0 : leechers,
      category: catMatch ? catMatch[1].trim() : null
    })
  }
  return results
}

export { TRACKERS }

export async function searchTorrents(query) {
  const q = (query || '').trim()
  if (!q) return []
  const cacheKey = q.toLowerCase()
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.t < 60000) return cached.results

  const html = await fetchText(SEARCH_URL + encodeURIComponent(q))
  const parsed = parseResults(html)
  if (parsed.length === 0) {
    cache.set(cacheKey, { t: Date.now(), results: [] })
    return []
  }

  const top = parsed.sort((a, b) => b.seeders - a.seeders).slice(0, MAX_DETAILS)

  const withMagnet = await Promise.all(
    top.map(async (r) => {
      try {
        const detail = await fetchText(DETAIL_URL + r.id)
        const plain = unescapeHtml(detail)
        const hash = (plain.match(/xt=urn:btih:([0-9a-fA-F]{40})/i) || [])[1]
        if (hash) {
          const infoHash = hash.toLowerCase()
          return { ...r, infoHash, magnet: buildMagnet(infoHash, r.title) }
        }
      } catch {
        // ignore individual failures
      }
      return null
    })
  )

  const results = withMagnet.filter(Boolean)
  cache.set(cacheKey, { t: Date.now(), results })
  return results
}
