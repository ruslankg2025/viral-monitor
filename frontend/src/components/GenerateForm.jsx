import React, { useState } from 'react'
import { X, Sparkles } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.js'
import { useStore } from '../store.js'

const DURATIONS = [
  { value: '15s', label: '15 сек' },
  { value: '30s', label: '30 сек' },
  { value: '60s', label: '60 сек' },
  { value: '3min', label: '3 мин' },
]

const STYLES = [
  { value: 'adapt_hook', label: 'Адаптировать хук' },
  { value: 'copy_structure', label: 'Скопировать структуру' },
  { value: 'technique_only', label: 'Только техника' },
  { value: 'original', label: 'Полностью свой' },
]

const COUNTS = [1, 3, 5]

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube Shorts' },
  { value: 'vk', label: 'VK Clips' },
]

const radioStyle = (active) => ({
  padding: '5px 12px',
  borderRadius: 6,
  border: active ? 'none' : '1px solid var(--border)',
  background: active ? 'var(--accent)' : 'transparent',
  color: active ? '#000' : 'var(--text-secondary)',
  fontSize: 12,
  fontWeight: active ? 600 : 400,
  cursor: 'pointer',
})

export default function GenerateForm({ videoId, onClose }) {
  const [topic, setTopic] = useState('')
  const [platform, setPlatform] = useState('instagram')
  const [duration, setDuration] = useState('60s')
  const [style, setStyle] = useState('adapt_hook')
  const [count, setCount] = useState(1)
  const addToast = useStore((s) => s.addToast)
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () =>
      api.scripts.generate({ video_id: videoId, topic, platform, duration, style, count }),
    onSuccess: (scripts) => {
      addToast(`Создано ${scripts.length} сценарий(ев)`, 'success')
      qc.invalidateQueries({ queryKey: ['scripts'] })
      onClose()
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 28,
          width: 500,
          maxWidth: '90%',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} color="var(--accent)" />
            Создать сценарий
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Topic */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Ваша тема / продукт *
          </label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Опишите вашу тему или продукт для адаптации сценария..."
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              fontSize: 13,
              resize: 'vertical',
              minHeight: 80,
              fontFamily: 'var(--font-display)',
            }}
          />
        </div>

        {/* Platform */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Платформа
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PLATFORMS.map(({ value, label }) => (
              <button key={value} style={radioStyle(platform === value)} onClick={() => setPlatform(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Длина
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            {DURATIONS.map(({ value, label }) => (
              <button key={value} style={radioStyle(duration === value)} onClick={() => setDuration(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Style */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Стиль адаптации
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STYLES.map(({ value, label }) => (
              <button key={value} style={radioStyle(style === value)} onClick={() => setStyle(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <div style={{ marginBottom: 28 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Количество вариантов
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            {COUNTS.map((n) => (
              <button key={n} style={radioStyle(count === n)} onClick={() => setCount(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={() => mutation.mutate()}
          disabled={!topic.trim() || mutation.isPending}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: 8,
            border: 'none',
            background: topic.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: topic.trim() ? '#000' : 'var(--text-muted)',
            fontSize: 14,
            fontWeight: 700,
            cursor: topic.trim() && !mutation.isPending ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {mutation.isPending ? (
            <>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
              Генерирую...
            </>
          ) : (
            <>
              <Sparkles size={15} />
              Сгенерировать {count > 1 ? `${count} варианта` : 'сценарий'}
            </>
          )}
        </button>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
          Стоимость: ~$0.03–0.10 за запрос (Claude Sonnet)
        </p>
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  )
}
