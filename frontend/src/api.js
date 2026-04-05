/**
 * Typed fetch wrapper for the Viral Monitor API.
 * Base URL: /api (proxied by Vite to localhost:8000)
 */

const BASE = '/api'

async function request(method, path, body, isFormData = false) {
  const options = {
    method,
    headers: isFormData ? {} : { 'Content-Type': 'application/json' },
  }
  if (body) {
    options.body = isFormData ? body : JSON.stringify(body)
  }

  const res = await fetch(`${BASE}${path}`, options)

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const err = await res.json()
      detail = err.detail || detail
    } catch {}
    throw new Error(detail)
  }

  if (res.status === 204) return null
  return res.json()
}

const get = (path) => request('GET', path)
const post = (path, body) => request('POST', path, body)
const put = (path, body) => request('PUT', path, body)
const del = (path) => request('DELETE', path)

// ── Bloggers ──────────────────────────────────────────────────────────────────
export const api = {
  bloggers: {
    list: () => get('/bloggers'),
    create: (data) => post('/bloggers', data),
    delete: (id) => del(`/bloggers/${id}`),
    refresh: (id) => post(`/bloggers/${id}/refresh`),
    import: (file) => {
      const fd = new FormData()
      fd.append('file', file)
      return request('POST', '/bloggers/import', fd, true)
    },
  },

  // ── Videos ────────────────────────────────────────────────────────────────
  videos: {
    list: (params = {}) => {
      const q = new URLSearchParams()
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '' && v !== false) {
          q.set(k, String(v))
        }
      })
      return get(`/videos?${q}`)
    },
    get: (id) => get(`/videos/${id}`),
    toggleFavorite: (id) => post(`/videos/${id}/favorite`),
  },

  // ── Analysis ──────────────────────────────────────────────────────────────
  analysis: {
    trigger: (videoId) => post(`/videos/${videoId}/analyze`),
    status: (videoId) => get(`/videos/${videoId}/analysis-status`),
  },

  // ── Scripts ───────────────────────────────────────────────────────────────
  scripts: {
    list: (params = {}) => {
      const q = new URLSearchParams()
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
      })
      return get(`/scripts?${q}`)
    },
    get: (id) => get(`/scripts/${id}`),
    generate: (data) => post('/scripts/generate', data),
    update: (id, data) => put(`/scripts/${id}`, data),
    delete: (id) => del(`/scripts/${id}`),
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  settings: {
    get: () => get('/settings'),
    update: (updates) => put('/settings', { updates }),
    refreshAll: () => post('/refresh/all'),
    recalculate: () => post('/recalculate'),
    clearCosts: () => del('/costs/clear'),
  },

  // ── Stats & Costs ─────────────────────────────────────────────────────────
  stats: {
    get: () => get('/stats'),
    costs: (period = 'month') => get(`/costs?period=${period}`),
  },
}
