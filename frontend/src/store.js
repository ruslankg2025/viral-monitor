import { create } from 'zustand'

/**
 * Global UI state (filters, toasts, modals).
 * Server data lives in React Query — not here.
 */
export const useStore = create((set, get) => ({
  // ── Feed filters ───────────────────────────────────────────────────────────
  filters: {
    tab: 'all',       // 'all' | 'outliers' | 'favorited'
    platform: '',     // '' | 'youtube' | 'instagram' | 'tiktok' | 'vk'
    period: '',       // '' | 'today' | 'week' | 'month'
    sort: 'x_factor', // 'x_factor' | 'published_at' | 'views' | 'comment_rate'
    page: 1,
  },
  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value, page: 1 } })),
  nextPage: () =>
    set((s) => ({ filters: { ...s.filters, page: s.filters.page + 1 } })),
  resetFilters: () =>
    set({
      filters: { tab: 'all', platform: '', period: '', sort: 'x_factor', page: 1 },
    }),

  // ── Toast system ──────────────────────────────────────────────────────────
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = Date.now()
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // ── Modal state ───────────────────────────────────────────────────────────
  importModalOpen: false,
  setImportModalOpen: (open) => set({ importModalOpen: open }),

  generateFormOpen: false,
  generateFormVideoId: null,
  openGenerateForm: (videoId = null) =>
    set({ generateFormOpen: true, generateFormVideoId: videoId }),
  closeGenerateForm: () =>
    set({ generateFormOpen: false, generateFormVideoId: null }),

  scriptEditorId: null,
  openScriptEditor: (id) => set({ scriptEditorId: id }),
  closeScriptEditor: () => set({ scriptEditorId: null }),

  confirmDialog: null,
  openConfirm: (message, onConfirm) =>
    set({ confirmDialog: { message, onConfirm } }),
  closeConfirm: () => set({ confirmDialog: null }),
}))
