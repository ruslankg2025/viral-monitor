import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, ExternalLink, Play } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.js'
import { formatNumber, formatDuration, timeAgo } from '../utils.js'
import XFactorBadge from './XFactorBadge.jsx'
import PlatformIcon from './PlatformIcon.jsx'
import { useStore } from '../store.js'

export default function VideoCard({ video }) {
  const navigate = useNavigate()
  const addToast = useStore((s) => s.addToast)
  const qc = useQueryClient()

  const favMutation = useMutation({
    mutationFn: () => api.videos.toggleFavorite(video.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['videos'] }),
    onError: (err) => addToast(err.message, 'error'),
  })

  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        borderRadius: 10,
        border: '1px solid var(--border)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        transition: 'border-color 0.15s, transform 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(229,224,0,0.3)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
      onClick={() => navigate(`/video/${video.id}`)}
    >
      {/* Thumbnail */}
      <div style={{ position: 'relative', paddingTop: '133%', background: '#0f0f0f' }}>
        {video.thumbnail_url ? (
          <img
            src={
              video.platform === 'instagram'
                ? `/api/proxy/image?url=${encodeURIComponent(video.thumbnail_url)}`
                : video.thumbnail_url
            }
            alt={video.title}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            loading="lazy"
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Play size={32} color="var(--text-muted)" />
          </div>
        )}

        {/* Platform icon — top left */}
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            background: 'rgba(0,0,0,0.7)',
            borderRadius: 5,
            padding: '3px 5px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <PlatformIcon platform={video.platform} />
        </div>

        {/* X-Factor badge — top right */}
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          <XFactorBadge xFactor={video.x_factor} isOutlier={video.is_outlier} />
        </div>

        {/* Duration — bottom right */}
        {video.duration && (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              background: 'rgba(0,0,0,0.8)',
              borderRadius: 4,
              padding: '2px 5px',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: '#fff',
            }}
          >
            {formatDuration(video.duration)}
          </div>
        )}

        {/* Analyzed badge — bottom left */}
        {video.is_analyzed && (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              background: 'rgba(229,224,0,0.2)',
              borderRadius: 4,
              padding: '2px 5px',
              fontSize: 10,
              color: 'var(--accent)',
              fontWeight: 600,
            }}
          >
            ✓ Разобрано
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Author row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 6,
          }}
        >
          {video.blogger_avatar_url && (
            <img
              src={video.blogger_avatar_url}
              alt=""
              style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }}
            />
          )}
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            @{video.blogger_username}
          </span>
          {video.niche && (
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
              {video.niche}
            </span>
          )}
        </div>

        {/* Title */}
        <h3
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text-primary)',
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            marginBottom: 10,
            flex: 1,
          }}
        >
          {video.title || '(без названия)'}
        </h3>

        {/* Metrics */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            fontSize: 11,
            color: 'var(--text-muted)',
            marginBottom: 10,
          }}
        >
          <span>👁 {formatNumber(video.views)}</span>
          <span>❤ {formatNumber(video.likes)}</span>
          <span>💬 {formatNumber(video.comments)}</span>
          {video.comment_rate > 0 && (
            <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }}>
              CR {video.comment_rate}%
            </span>
          )}
        </div>

        {/* Date */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
          {timeAgo(video.published_at)}
        </div>

        {/* Footer buttons */}
        <div
          style={{ display: 'flex', gap: 6 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => navigate(`/video/${video.id}`)}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--accent)',
              color: '#000',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Разобрать
          </button>
          <button
            onClick={() => favMutation.mutate()}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: video.is_favorited ? '#ef4444' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Heart size={13} fill={video.is_favorited ? '#ef4444' : 'none'} />
          </button>
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ExternalLink size={13} />
          </a>
        </div>
      </div>
    </div>
  )
}
