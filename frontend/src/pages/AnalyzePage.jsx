import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Link2, Zap, FileText, Sparkles, Loader2, ArrowRight, History } from 'lucide-react'
import { api } from '../api.js'
import { useStore } from '../store.js'

const EXAMPLES = [
  'https://www.youtube.com/shorts/...',
  'https://www.instagram.com/reel/...',
  'https://www.tiktok.com/@user/video/...',
]

const STEPS = [
  { icon: Link2, label: 'Вставьте ссылку', desc: 'YouTube, Instagram, TikTok, VK' },
  { icon: Sparkles, label: 'ИИ анализирует', desc: 'Структура, хуки, психология' },
  { icon: FileText, label: 'Готовый сценарий', desc: '5 хуков + описание к рилсу' },
]

export default function AnalyzePage() {
  const [url, setUrl] = useState('')
  const navigate = useNavigate()
  const addToast = useStore((s) => s.addToast)

  const analyzeMutation = useMutation({
    mutationFn: () => api.analyze.byUrl(url.trim()),
    onSuccess: (data) => {
      navigate(`/analyze/${data.video_id}`)
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!url.trim()) return
    analyzeMutation.mutate()
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', paddingTop: 60 }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(229,224,0,0.1)', border: '1px solid rgba(229,224,0,0.2)',
          borderRadius: 20, padding: '4px 14px', marginBottom: 20,
        }}>
          <Zap size={13} color="var(--accent)" />
          <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>AI Разбор видео</span>
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 12 }}>
          Разбери любое вирусное видео
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Вставь ссылку — получи структуру, 5 хуков с психологическим анализом<br />
          и готовый сценарий для телесуфлёра
        </p>
      </div>

      {/* URL Input */}
      <form onSubmit={handleSubmit}>
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 6,
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          transition: 'border-color 0.2s',
        }}
          onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(229,224,0,0.4)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
            <Link2 size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.instagram.com/reel/... или YouTube Shorts / TikTok"
              autoFocus
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 15,
                fontFamily: url ? 'var(--font-mono)' : 'var(--font-display)',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!url.trim() || analyzeMutation.isPending}
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              border: 'none',
              background: url.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: url.trim() ? '#000' : 'var(--text-muted)',
              fontSize: 14,
              fontWeight: 700,
              cursor: url.trim() ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'all 0.2s',
            }}
          >
            {analyzeMutation.isPending ? (
              <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <ArrowRight size={15} />
            )}
            {analyzeMutation.isPending ? 'Запускаю...' : 'Разобрать'}
          </button>
        </div>
      </form>

      {/* Steps */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 48 }}>
        {STEPS.map(({ icon: Icon, label, desc }, i) => (
          <div key={i} style={{
            flex: 1,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '14px 16px',
            textAlign: 'center',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(229,224,0,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 8px',
            }}>
              <Icon size={15} color="var(--accent)" />
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* Link to history */}
      <div style={{ textAlign: 'center' }}>
        <a
          href="/my-videos"
          onClick={(e) => { e.preventDefault(); navigate('/my-videos') }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none',
          }}
        >
          <History size={13} />
          Мои разборы
        </a>
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
