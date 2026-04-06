import React, { useState } from 'react'
import { Zap, Key, CheckCircle, ExternalLink, ChevronRight, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.js'
import { useStore } from '../store.js'

const PROVIDERS = [
  {
    id: 'claude',
    label: 'Anthropic Claude',
    settingKey: 'anthropic_api_key',
    description: 'Анализ видео и генерация сценариев. Главный AI.',
    required: true,
    placeholder: 'sk-ant-api03-...',
    link: 'https://console.anthropic.com/settings/keys',
    linkLabel: 'console.anthropic.com',
    cost: '$3 / 1M токенов',
  },
  {
    id: 'groq',
    label: 'Groq (Llama 3.3)',
    settingKey: 'groq_api_key',
    description: 'Категоризация видео. Полностью бесплатно.',
    required: false,
    placeholder: 'gsk_...',
    link: 'https://console.groq.com/keys',
    linkLabel: 'console.groq.com',
    cost: 'Бесплатно',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    settingKey: 'openai_api_key',
    description: 'Суммаризация транскрипций и трендовые отчёты.',
    required: false,
    placeholder: 'sk-proj-...',
    link: 'https://platform.openai.com/api-keys',
    linkLabel: 'platform.openai.com',
    cost: '$0.15 / 1M токенов',
  },
  {
    id: 'assemblyai',
    label: 'AssemblyAI',
    settingKey: 'assemblyai_api_key',
    description: 'Транскрипция видео всех платформ.',
    required: false,
    placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    link: 'https://www.assemblyai.com/dashboard/signup',
    linkLabel: 'assemblyai.com',
    cost: '~$0.006 за 60 сек',
  },
  {
    id: 'apify',
    label: 'Apify',
    settingKey: 'apify_api_key',
    description: 'Парсинг Instagram и TikTok. 25 запусков/мес бесплатно.',
    required: false,
    placeholder: 'apify_api_...',
    link: 'https://console.apify.com/account/integrations',
    linkLabel: 'console.apify.com',
    cost: '25 runs/мес бесплатно',
  },
]

export default function Onboarding({ onComplete }) {
  const [keys, setKeys] = useState({})
  const [validated, setValidated] = useState({})  // id → {ok, message}
  const [validating, setValidating] = useState({}) // id → bool
  const addToast = useStore((s) => s.addToast)
  const qc = useQueryClient()

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = {}
      PROVIDERS.forEach(({ id, settingKey }) => {
        if (keys[id]) updates[settingKey] = keys[id].trim()
      })
      return api.settings.update(updates)
    },
    onSuccess: () => {
      addToast('Настройки сохранены!', 'success')
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['providers-status'] })
      onComplete()
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  const handleValidate = async (provider) => {
    const key = keys[provider.id]?.trim()
    if (!key) return
    setValidating((s) => ({ ...s, [provider.id]: true }))
    try {
      const result = await api.settings.validateKey(provider.id, key)
      setValidated((s) => ({ ...s, [provider.id]: result }))
    } catch (e) {
      setValidated((s) => ({ ...s, [provider.id]: { ok: false, message: e.message } }))
    } finally {
      setValidating((s) => ({ ...s, [provider.id]: false }))
    }
  }

  const hasAnyKey = PROVIDERS.some(({ id }) => keys[id]?.trim())
  const hasRequiredKey = keys['claude']?.trim()

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        overflowY: 'auto',
        padding: '24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 600 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 16,
            }}
          >
            <Zap size={28} color="var(--accent)" />
            <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px' }}>
              Viral Monitor
            </span>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Добро пожаловать! Настройте API ключи
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 440, margin: '0 auto' }}>
            Для работы приложения нужен хотя бы один AI ключ.
            Claude — главный, остальные расширяют возможности.
          </p>
        </div>

        {/* Provider cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          {PROVIDERS.map((provider) => {
            const val = validated[provider.id]
            const isValidating = validating[provider.id]
            const key = keys[provider.id] || ''

            return (
              <div
                key={provider.id}
                style={{
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${val?.ok ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
                  borderRadius: 10,
                  padding: '16px',
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Top row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Key size={14} color={val?.ok ? '#22c55e' : 'var(--text-muted)'} />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{provider.label}</span>
                    {provider.required && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: 'rgba(229,224,0,0.15)',
                          color: 'var(--accent)',
                          fontWeight: 700,
                        }}
                      >
                        НУЖЕН
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: '#22c55e' }}>{provider.cost}</span>
                  </div>
                  <a
                    href={provider.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      textDecoration: 'none',
                    }}
                  >
                    {provider.linkLabel} <ExternalLink size={10} />
                  </a>
                </div>

                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                  {provider.description}
                </p>

                {/* Input + validate */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="password"
                    value={key}
                    onChange={(e) => {
                      setKeys((s) => ({ ...s, [provider.id]: e.target.value }))
                      // Reset validation if key changed
                      if (validated[provider.id]) {
                        setValidated((s) => { const n = {...s}; delete n[provider.id]; return n })
                      }
                    }}
                    placeholder={provider.placeholder}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: `1px solid ${val?.ok === false ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      fontSize: 12,
                      fontFamily: key ? 'var(--font-mono)' : 'var(--font-display)',
                    }}
                  />
                  <button
                    onClick={() => handleValidate(provider)}
                    disabled={!key.trim() || isValidating}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 6,
                      border: 'none',
                      background: key.trim() ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      color: key.trim() ? 'var(--text-secondary)' : 'var(--text-muted)',
                      fontSize: 12,
                      cursor: key.trim() ? 'pointer' : 'not-allowed',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    {isValidating ? (
                      <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : val?.ok ? (
                      <CheckCircle size={12} color="#22c55e" />
                    ) : null}
                    {isValidating ? 'Проверяю...' : 'Проверить'}
                  </button>
                </div>

                {/* Validation result */}
                {val && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 11,
                      color: val.ok ? '#22c55e' : '#f87171',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    {val.ok ? <CheckCircle size={11} /> : '✗'} {val.message}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Skip / Save */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={onComplete}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Пропустить, настрою позже →
          </button>

          <button
            onClick={() => saveMutation.mutate()}
            disabled={!hasAnyKey || saveMutation.isPending}
            style={{
              padding: '10px 28px',
              borderRadius: 8,
              border: 'none',
              background: hasAnyKey ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: hasAnyKey ? '#000' : 'var(--text-muted)',
              fontSize: 14,
              fontWeight: 700,
              cursor: hasAnyKey ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            {saveMutation.isPending ? (
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <ChevronRight size={16} />
            )}
            {saveMutation.isPending ? 'Сохраняю...' : 'Сохранить и начать'}
          </button>
        </div>

        {!hasRequiredKey && hasAnyKey && (
          <p style={{ fontSize: 11, color: 'var(--warning)', textAlign: 'right', marginTop: 6 }}>
            ⚠ Без Claude ключа анализ и генерация сценариев недоступны
          </p>
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
