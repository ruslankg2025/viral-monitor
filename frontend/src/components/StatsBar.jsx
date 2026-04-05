import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api.js'
import { formatNumber } from '../utils.js'

export default function StatsBar() {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: api.stats.get,
    refetchInterval: 60_000,
  })

  if (!stats) return null

  const items = [
    { label: 'Видео', value: formatNumber(stats.total_videos) },
    { label: 'Аутлайеры', value: formatNumber(stats.outlier_videos), accent: true },
    { label: 'Блогеры', value: formatNumber(stats.active_bloggers) },
    { label: 'Сценарии', value: formatNumber(stats.total_scripts) },
  ]

  return (
    <div style={{ display: 'flex', gap: 20 }}>
      {items.map(({ label, value, accent }) => (
        <div key={label} style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: accent ? 'var(--accent)' : 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {value}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
        </div>
      ))}
    </div>
  )
}
