import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { useStore } from '../store.js'

export default function ConfirmDialog() {
  const dialog = useStore((s) => s.confirmDialog)
  const closeConfirm = useStore((s) => s.closeConfirm)

  if (!dialog) return null

  const handleConfirm = () => {
    dialog.onConfirm()
    closeConfirm()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={closeConfirm}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '24px',
          maxWidth: 380,
          width: '90%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <AlertTriangle size={20} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5 }}>
            {dialog.message}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={closeConfirm}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Отмена
          </button>
          <button
            onClick={handleConfirm}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: 'none',
              background: '#ef4444',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  )
}
