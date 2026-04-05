import React from 'react'
import { useStore } from '../store.js'
import PlatformIcon from './PlatformIcon.jsx'

const PLATFORMS = [
  { value: '', label: 'Все' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'vk', label: 'VK' },
]

const PERIODS = [
  { value: '', label: 'Всё время' },
  { value: 'today', label: '24ч' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
]

const SORTS = [
  { value: 'x_factor', label: 'X-factor ↓' },
  { value: 'published_at', label: 'Свежие' },
  { value: 'views', label: 'Просмотры' },
  { value: 'comment_rate', label: 'CR%' },
]

const tabStyle = (active) => ({
  padding: '5px 14px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: active ? 600 : 400,
  background: active ? 'var(--accent)' : 'transparent',
  color: active ? '#000' : 'var(--text-secondary)',
  border: active ? 'none' : '1px solid var(--border)',
  cursor: 'pointer',
  transition: 'all 0.15s',
})

const chipStyle = (active) => ({
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: active ? 600 : 400,
  background: active ? 'rgba(229,224,0,0.12)' : 'transparent',
  color: active ? 'var(--accent)' : 'var(--text-secondary)',
  border: active ? '1px solid rgba(229,224,0,0.3)' : '1px solid var(--border)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  transition: 'all 0.15s',
})

export default function FilterBar() {
  const filters = useStore((s) => s.filters)
  const setFilter = useStore((s) => s.setFilter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Tabs row */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { value: 'all', label: 'Все' },
          { value: 'outliers', label: '🔥 Аутлайеры' },
          { value: 'favorited', label: '♥ Избранное' },
        ].map(({ value, label }) => (
          <button
            key={value}
            style={tabStyle(filters.tab === value)}
            onClick={() => setFilter('tab', value)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Platform + Period + Sort row */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Platform */}
        <div style={{ display: 'flex', gap: 4 }}>
          {PLATFORMS.map(({ value, label }) => (
            <button
              key={value}
              style={chipStyle(filters.platform === value)}
              onClick={() => setFilter('platform', value)}
            >
              {value && <PlatformIcon platform={value} />}
              {label}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        {/* Period */}
        <div style={{ display: 'flex', gap: 4 }}>
          {PERIODS.map(({ value, label }) => (
            <button
              key={value}
              style={chipStyle(filters.period === value)}
              onClick={() => setFilter('period', value)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        {/* Sort */}
        <div style={{ display: 'flex', gap: 4 }}>
          {SORTS.map(({ value, label }) => (
            <button
              key={value}
              style={chipStyle(filters.sort === value)}
              onClick={() => setFilter('sort', value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
