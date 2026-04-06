import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Eye, Heart, MessageCircle, Clock, Loader2, CheckCircle, AlertCircle, Plus } from 'lucide-react'
import { api } from '../api.js'
import { formatNumber, timeAgo } from '../utils.js'

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'done', label: 'Готовые' },
  { key: 'analyzing', label: 'В обработке' },
]

const PLATFORM_COLORS = {
  instagram: '#E1306C', youtube: '#FF0000', tiktok: '#69C9D0', vk: '#0077FF',
}

export default function MyVideos() {
  const [filter, setFilter] = useState('all')
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['my-videos', filter],
    queryFn: () => api.analyze.myVideos({ status: filter }),
    refetchInterval: 10_000,
  })

  const videos = data?.items || []

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Мои разборы</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>История проанализированных видео</p>
        </div>
        <button
          onClick={() => navigate('/analyze')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: '#000',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Новый разбор
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '6px 14px', borderRadius: 6,
              border: `1px solid ${filter === key ? 'rgba(229,224,0,0.4)' : 'var(--border)'}`,
              background: filter === key ? 'rgba(229,224,0,0.1)' : 'transparent',
              color: filter === key ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: 13, fontWeight: filter === key ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--text-muted)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
          <p>Загрузка...</p>
        </div>
      ) : videos.length === 0 ? (
        <div style={{
          textAlign: 'center', paddingTop: 80,
          background: 'var(--bg-secondary)', borderRadius: 12,
          border: '1px dashed var(--border)', padding: 48,
        }}>
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Разборов пока нет</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            Вставьте ссылку на любое видео чтобы начать
          </p>
          <button
            onClick={() => navigate('/analyze')}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#000',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Новый разбор →
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} onClick={() => navigate(`/analyze/${video.id}`)} />
          ))}
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function VideoCard({ video, onClick }) {
  const platformColor = PLATFORM_COLORS[video.platform] || 'var(--accent)'

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(229,224,0,0.3)'}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {/* Thumbnail */}
      <div style={{ position: 'relative', height: 160, background: 'var(--bg-tertiary)' }}>
        {video.thumbnail_url ? (
          <img src={video.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => e.target.style.display = 'none'} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 24 }}>
            📹
          </div>
        )}
        {/* Status badge */}
        <div style={{
          position: 'absolute', top: 8, right: 8,
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 6,
          background: video.is_analyzed ? 'rgba(34,197,94,0.9)' : 'rgba(0,0,0,0.7)',
          fontSize: 11, fontWeight: 600, color: '#fff',
        }}>
          {video.is_analyzed
            ? <><CheckCircle size={10} /> Готово</>
            : <><Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> Анализирую</>
          }
        </div>
        {/* Platform badge */}
        <div style={{
          position: 'absolute', top: 8, left: 8,
          padding: '2px 7px', borderRadius: 4,
          background: `${platformColor}cc`,
          fontSize: 10, fontWeight: 700, color: '#fff', textTransform: 'uppercase',
        }}>
          {video.platform}
        </div>
      </div>

      <div style={{ padding: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {video.title || 'Без названия'}
        </p>
        {video.hook && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            Хук: «{video.hook}»
          </p>
        )}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {video.views > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
              <Eye size={11} /> {formatNumber(video.views)}
            </span>
          )}
          {video.likes > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
              <Heart size={11} /> {formatNumber(video.likes)}
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {timeAgo(video.fetched_at)}
          </span>
        </div>
      </div>
    </div>
  )
}
