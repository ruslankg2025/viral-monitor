/**
 * Typed fetch wrapper for the Viral Monitor API.
 * Base URL: /api (proxied by Vite to localhost:8001)
 */
import { useStore } from './store.js'

const BASE = '/api'

function getAuthHeaders() {
  const token = useStore.getState().currentToken
  return token ? { 'X-Account-Token': token } : {}
}

async function request(method, path, body, isFormData = false, extraHeaders = {}) {
  const options = {
    method,
    headers: {
      ...getAuthHeaders(),
      ...extraHeaders,
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    },
  }
  if (body) {
    options.body = isFormData ? body : JSON.stringify(body)
  }

  const res = await fetch(`${BASE}${path}`, options)

  if (res.status === 401) {
    // Token expired or missing — clear it
    useStore.getState().logout()
    throw new Error('Сессия истекла. Войдите снова.')
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const err = await res.json()
      if (typeof err.detail === 'string') {
        detail = err.detail
      } else if (Array.isArray(err.detail)) {
        // Pydantic validation errors: [{loc, msg, type}, ...]
        detail = err.detail.map((e) => e.msg || JSON.stringify(e)).join('; ')
      } else if (err.detail) {
        detail = JSON.stringify(err.detail)
      }
    } catch {}
    throw new Error(detail)
  }

  if (res.status === 204) return null
  return res.json()
}

const get = (path, extraHeaders) => request('GET', path, undefined, false, extraHeaders)
const post = (path, body, extraHeaders) => request('POST', path, body, false, extraHeaders)
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
    validateKey: (provider, api_key) => post('/settings/validate', { provider, api_key }),
    providersStatus: () => get('/settings/providers-status'),
  },

  // ── Stats & Costs ─────────────────────────────────────────────────────────
  stats: {
    get: () => get('/stats'),
    costs: (period = 'month') => get(`/costs?period=${period}`),
  },

  // ── Analyze URL (Piratex-like) ────────────────────────────────────────────
  analyze: {
    byUrl: (url) => post('/analyze-url', { url }),
    getVideoFull: (id) => get(`/videos/${id}/full`),
    generateHooks: (id) => post(`/videos/${id}/generate-hooks`),
    improve: (id, action, current_text, custom_prompt) =>
      post(`/videos/${id}/improve`, { action, current_text, custom_prompt }),
    myVideos: (params = {}) => {
      const q = new URLSearchParams()
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
      })
      return get(`/my-videos?${q}`)
    },
  },

  // ── Accounts ──────────────────────────────────────────────────────────────
  accounts: {
    me: () => get('/accounts/me'),
    mainProfiles: () => get('/accounts/me/main-profiles'),
    addMainProfile: (data) => post('/accounts/me/main-profiles', data),
    loginMainProfile: (id, creds) =>
      post(`/accounts/me/main-profiles/${id}/login`, creds),
    updateMainProfileSettings: (id, settings) =>
      post(`/accounts/me/main-profiles/${id}/settings`, settings),
    deleteMainProfile: (id) => del(`/accounts/me/main-profiles/${id}`),
    scraperProfiles: () => get('/accounts/me/scraper-profiles'),
    addScraperProfile: (data) => post('/accounts/me/scraper-profiles', data),
    loginScraperProfile: (id, creds) =>
      post(`/accounts/me/scraper-profiles/${id}/login`, creds),
    deleteScraperProfile: (id) => del(`/accounts/me/scraper-profiles/${id}`),
  },

  // ── Admin ─────────────────────────────────────────────────────────────────
  admin: {
    listAccounts: (adminKey) =>
      get('/accounts', { 'X-Admin-Key': adminKey }),
    createAccount: (data, adminKey) =>
      post('/accounts', data, { 'X-Admin-Key': adminKey }),
    deleteAccount: (id, adminKey) =>
      request('DELETE', `/accounts/${id}`, undefined, false, { 'X-Admin-Key': adminKey }),
  },
}
