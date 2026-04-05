import React from 'react'
import { Trash2, Copy, ExternalLink } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.js'
import { formatDate, copyToClipboard } from '../utils.js'
import { useStore } from '../store.js'
import PlatformIcon from './PlatformIcon.jsx'

export default function ScriptCard({ script }) {
  const qc = useQueryClient()
  const addToast = useStore((s) => s.addToast)
  const openConfirm = useStore((s) => s.openConfirm)
  const openScriptEditor = useStore((s) => s.openScriptEditor)

  const deleteMutation = useMutation({
    mutationFn: () => api.scripts.delete(script.id),
    onSuccess: () => {
      addToast('Сценарий удалён', 'success')
      qc.invalidateQueries({ queryKey: ['scripts'] })
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  const handleCopy = async (e) => {
    e.stopPropagation()
    const text = [script.hook, script.full_text].filter(Boolean).join('\n\n')
    const ok = await copyToClipboard(text)
    addToast(ok ? 'Скопировано' : 'Ошибка копирования', ok ? 'success' : 'error')
  }

  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        borderRadius: 10,
        border: '1px solid var(--border)',
        padding: '16px',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(229,224,0,0.3)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
      onClick={() => openScriptEditor(script.id)}
    >
      {/* Header */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {script.platform_target && <PlatformIcon platform={script.platform_target} />}
        {script.niche && (
          <span
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 4,
              background: 'rgba(229,224,0,0.08)',
              color: 'var(--accent)',
            }}
          >
            {script.niche}
          </span>
        )}
        {script.duration_target && (
          <span
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 4,
              background: 'var(--bg-tertiary)',
              color: 'var(--text-muted)',
              marginLeft: 'auto',
            }}
          >
            {script.duration_target}
          </span>
        )}
      </div>

      {/* Title */}
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 8,
          lineHeight: 1.3,
        }}
      >
        {script.title}
      </h3>

      {/* Hook preview */}
      {script.hook && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            marginBottom: 12,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {script.hook}
        </p>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
          {formatDate(script.created_at)}
        </span>
        <button
          onClick={handleCopy}
          style={{
            padding: '5px 8px',
            borderRadius: 5,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Copy size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            openConfirm(`Удалить сценарий "${script.title}"?`, () => deleteMutation.mutate())
          }}
          style={{
            padding: '5px 8px',
            borderRadius: 5,
            border: '1px solid rgba(239,68,68,0.3)',
            background: 'transparent',
            color: '#f87171',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}
