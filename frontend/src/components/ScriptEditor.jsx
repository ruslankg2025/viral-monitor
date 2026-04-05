import React, { useState, useEffect } from 'react'
import { X, Copy, Download, Save } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.js'
import { copyToClipboard, exportScriptTxt } from '../utils.js'
import { useStore } from '../store.js'

export default function ScriptEditor({ scriptId, onClose }) {
  const addToast = useStore((s) => s.addToast)
  const qc = useQueryClient()
  const [edited, setEdited] = useState(null)

  const { data: script, isLoading } = useQuery({
    queryKey: ['script', scriptId],
    queryFn: () => api.scripts.get(scriptId),
  })

  useEffect(() => {
    if (script && !edited) setEdited(script)
  }, [script])

  const current = edited || script

  const saveMutation = useMutation({
    mutationFn: () =>
      api.scripts.update(scriptId, {
        title: current.title,
        hook: current.hook,
        hook_visual: current.hook_visual,
        full_text: current.full_text,
        hashtags: current.hashtags,
        shooting_tips: current.shooting_tips,
      }),
    onSuccess: () => {
      addToast('Сценарий сохранён', 'success')
      qc.invalidateQueries({ queryKey: ['scripts'] })
      qc.invalidateQueries({ queryKey: ['script', scriptId] })
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  const handleCopyAll = async () => {
    const parts = []
    if (current?.hook) parts.push(`ХУК:\n${current.hook}`)
    if (current?.full_text) parts.push(`\nТЕКСТ:\n${current.full_text}`)
    if (current?.hashtags?.length) parts.push(`\nХЕШТЕГИ:\n${current.hashtags.join(' ')}`)
    const ok = await copyToClipboard(parts.join('\n\n'))
    addToast(ok ? 'Скопировано' : 'Ошибка', ok ? 'success' : 'error')
  }

  const field = (label, key, multiline = false) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
        {label}
      </label>
      {multiline ? (
        <textarea
          value={current?.[key] || ''}
          onChange={(e) => setEdited((s) => ({ ...s, [key]: e.target.value }))}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            fontSize: 13,
            resize: 'vertical',
            minHeight: 80,
            fontFamily: 'var(--font-display)',
            lineHeight: 1.5,
          }}
        />
      ) : (
        <input
          type="text"
          value={current?.[key] || ''}
          onChange={(e) => setEdited((s) => ({ ...s, [key]: e.target.value }))}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            fontSize: 13,
            fontFamily: 'var(--font-display)',
          }}
        />
      )}
    </div>
  )

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(0,0,0,0.8)',
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
          width: 680,
          maxWidth: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Редактор сценария</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleCopyAll}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Copy size={12} /> Копировать всё
            </button>
            <button
              onClick={() => current && exportScriptTxt(current)}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Download size={12} /> TXT
            </button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {isLoading ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Загрузка...</div>
          ) : (
            <>
              {field('Заголовок', 'title')}

              {/* Hook block */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 8,
                  background: 'rgba(229,224,0,0.06)',
                  border: '1px solid rgba(229,224,0,0.15)',
                  marginBottom: 16,
                }}
              >
                {field('ХУК (первые 3-5 секунд)', 'hook', true)}
                {field('Визуальная часть хука', 'hook_visual')}
              </div>

              {/* Scenes */}
              {current?.structure?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>СЦЕНЫ</div>
                  {current.structure.map((scene, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 6,
                        background: 'var(--bg-tertiary)',
                        marginBottom: 8,
                        borderLeft: '2px solid var(--border)',
                      }}
                    >
                      <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                        [{scene.time}] {scene.technique}
                      </div>
                      {scene.text && (
                        <p style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 3 }}>
                          🎤 {scene.text}
                        </p>
                      )}
                      {scene.visual && (
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>🎬 {scene.visual}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {field('Полный текст', 'full_text', true)}
              {field('Советы по съёмке', 'shooting_tips', true)}

              {/* Hashtags */}
              {current?.hashtags?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>ХЕШТЕГИ</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {current.hashtags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: 'var(--bg-tertiary)',
                          color: 'var(--text-secondary)',
                          fontSize: 12,
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            style={{
              padding: '7px 20px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--accent)',
              color: '#000',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Save size={13} />
            {saveMutation.isPending ? 'Сохраняю...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
