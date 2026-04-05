import React from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'
import { useStore } from '../store.js'

const ICONS = {
  success: <CheckCircle size={16} color="#22c55e" />,
  error: <XCircle size={16} color="#ef4444" />,
  warning: <AlertCircle size={16} color="#f59e0b" />,
  info: <Info size={16} color="#60a5fa" />,
}

const COLORS = {
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#60a5fa',
}

export default function Toast() {
  const toasts = useStore((s) => s.toasts)
  const removeToast = useStore((s) => s.removeToast)

  if (!toasts.length) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 360,
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast-enter"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 8,
            background: 'var(--bg-tertiary)',
            border: `1px solid ${COLORS[toast.type]}33`,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}
        >
          <span style={{ flexShrink: 0, marginTop: 1 }}>{ICONS[toast.type] || ICONS.info}</span>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>
            {toast.message}
          </span>
          <button
            onClick={() => removeToast(toast.id)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 0,
              flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
