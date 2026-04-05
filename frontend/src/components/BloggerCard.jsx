import React from 'react'
import { RefreshCw, Trash2, User } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.js'
import { formatNumber, timeAgo } from '../utils.js'
import PlatformIcon from './PlatformIcon.jsx'
import { useStore } from '../store.js'

export default function BloggerCard({ blogger }) {
  const qc = useQueryClient()
  const addToast = useStore((s) => s.addToast)
  const openConfirm = useStore((s) => s.openConfirm)

  const refreshMutation = useMutation({
    mutationFn: () => api.bloggers.refresh(blogger.id),
    onSuccess: () => {
      addToast(`Обновление @${blogger.username} запущено`, 'success')
      setTimeout(() => qc.invalidateQueries({ queryKey: ['bloggers'] }), 3000)
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.bloggers.delete(blogger.id),
    onSuccess: () => {
      addToast(`@${blogger.username} удалён`, 'success')
      qc.invalidateQueries({ queryKey: ['bloggers'] })
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        borderRadius: 10,
        border: '1px solid var(--border)',
        padding: '14px 16px',
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
      }}
    >
      {/* Avatar */}
      <div style={{ flexShrink: 0 }}>
        {blogger.avatar_url ? (
          <img
            src={blogger.avatar_url}
            alt=""
            style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'var(--bg-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <User size={20} color="var(--text-muted)" />
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <PlatformIcon platform={blogger.platform} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {blogger.display_name || `@${blogger.username}`}
          </span>
          {/* Active indicator */}
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: blogger.is_active ? '#22c55e' : '#555',
              marginLeft: 2,
            }}
          />
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          @{blogger.username}
        </div>

        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
          <span>{formatNumber(blogger.followers_count)} подп.</span>
          <span>{formatNumber(Math.round(blogger.avg_views))} ср. просм.</span>
          <span>{blogger.total_videos_tracked} видео</span>
        </div>

        {blogger.niche && (
          <span
            style={{
              display: 'inline-block',
              marginTop: 8,
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(229,224,0,0.08)',
              color: 'var(--accent)',
              border: '1px solid rgba(229,224,0,0.2)',
            }}
          >
            {blogger.niche}
          </span>
        )}

        {blogger.last_checked_at && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
            Обновлён {timeAgo(blogger.last_checked_at)}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          title="Обновить"
          style={{
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            opacity: refreshMutation.isPending ? 0.5 : 1,
          }}
        >
          <RefreshCw
            size={13}
            style={{ animation: refreshMutation.isPending ? 'spin 1s linear infinite' : 'none' }}
          />
        </button>
        <button
          onClick={() =>
            openConfirm(`Удалить @${blogger.username} и все его видео?`, () =>
              deleteMutation.mutate()
            )
          }
          title="Удалить"
          style={{
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid rgba(239,68,68,0.3)',
            background: 'transparent',
            color: '#f87171',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
