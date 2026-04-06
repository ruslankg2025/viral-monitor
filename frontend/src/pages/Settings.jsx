import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Eye, EyeOff, RefreshCw, RotateCcw, Trash2, Save,
  CheckCircle, XCircle, Loader2, ExternalLink,
} from 'lucide-react'
import { api } from '../api.js'
import CostDashboard from '../components/CostDashboard.jsx'
import { useStore } from '../store.js'

const KEY_META = {
  anthropic_api_key:  { provider: 'claude',      label: 'Anthropic API Key',    link: 'https://console.anthropic.com/settings/keys' },
  openai_api_key:     { provider: 'openai',       label: 'OpenAI API Key',       link: 'https://platform.openai.com/api-keys' },
  groq_api_key:       { provider: 'groq',         label: 'Groq API Key',         link: 'https://console.groq.com/keys' },
  assemblyai_api_key: { provider: 'assemblyai',   label: 'AssemblyAI API Key',   link: 'https://www.assemblyai.com/dashboard' },
  apify_api_key:      { provider: 'apify',        label: 'Apify API Key',        link: 'https://console.apify.com/account/integrations' },
  vk_access_token:    { provider: 'vk',           label: 'VK Access Token',      link: 'https://vkhost.github.io/' },
  instagram_session_id: { provider: null,         label: 'Instagram Session ID', link: null },
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{
        fontSize: 15, fontWeight: 700, marginBottom: 16,
        paddingBottom: 10, borderBottom: '1px solid var(--border)',
      }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function ApiKeyField({ settingKey, description, values, onChange }) {
  const [show, setShow] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validResult, setValidResult] = useState(null) // {ok, message}
  const meta = KEY_META[settingKey] || {}
  const val = values[settingKey] || ''
  const isSet = val.length > 0

  const handleValidate = async () => {
    if (!val.trim() || !meta.provider) return
    setValidating(true)
    setValidResult(null)
    try {
      const result = await api.settings.validateKey(meta.provider, val.trim())
      setValidResult(result)
    } catch (e) {
      setValidResult({ ok: false, message: e.message })
    } finally {
      setValidating(false)
    }
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
            {meta.label || settingKey}
          </label>
          {meta.link && (
            <a href={meta.link} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              <ExternalLink size={11} />
            </a>
          )}
        </div>
        <span style={{
          fontSize: 11, padding: '1px 7px', borderRadius: 4,
          background: isSet ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)',
          color: isSet ? '#22c55e' : '#f87171',
        }}>
          {isSet ? '✓ Задан' : '— Не задан'}
        </span>
      </div>

      {description && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>{description}</p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            type={show ? 'text' : 'password'}
            value={val}
            onChange={(e) => {
              onChange(settingKey, e.target.value)
              setValidResult(null)
            }}
            placeholder={`Введите ${meta.label || settingKey}...`}
            style={{
              width: '100%',
              padding: '8px 36px 8px 10px',
              borderRadius: 6,
              border: `1px solid ${validResult?.ok === false ? 'rgba(239,68,68,0.4)' : validResult?.ok ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`,
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontFamily: val ? 'var(--font-mono)' : 'var(--font-display)',
            }}
          />
          <button onClick={() => setShow(s => !s)} style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
          }}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        {meta.provider && (
          <button
            onClick={handleValidate}
            disabled={!val.trim() || validating}
            style={{
              padding: '8px 14px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'transparent',
              color: val.trim() ? 'var(--text-secondary)' : 'var(--text-muted)',
              fontSize: 12, cursor: val.trim() ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            {validating
              ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
              : validResult?.ok === true
              ? <CheckCircle size={12} color="#22c55e" />
              : validResult?.ok === false
              ? <XCircle size={12} color="#f87171" />
              : null}
            {validating ? 'Проверяю...' : 'Проверить'}
          </button>
        )}
      </div>

      {validResult && (
        <div style={{
          marginTop: 5, fontSize: 11,
          color: validResult.ok ? '#22c55e' : '#f87171',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          {validResult.ok ? <CheckCircle size={11} /> : <XCircle size={11} />}
          {validResult.message}
        </div>
      )}
    </div>
  )
}

function SelectField({ label, settingKey, options, values, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 5 }}>
        {label}
      </label>
      <select
        value={values[settingKey] || ''}
        onChange={(e) => onChange(settingKey, e.target.value)}
        style={{
          padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)',
          background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
          fontSize: 13, cursor: 'pointer', minWidth: 220,
        }}
      >
        {options.map(({ value, label }) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </div>
  )
}

function ProvidersStatus() {
  const { data } = useQuery({
    queryKey: ['providers-status'],
    queryFn: api.settings.providersStatus,
    refetchOnWindowFocus: true,
  })

  if (!data) return null

  return (
    <div style={{
      display: 'flex', gap: 8, flexWrap: 'wrap',
      padding: '12px 14px',
      background: 'var(--bg-tertiary)',
      borderRadius: 8,
      border: '1px solid var(--border)',
      marginBottom: 24,
    }}>
      {data.providers.map((p) => (
        <div key={p.provider} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 20,
          background: p.configured ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${p.configured ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: p.configured ? '#22c55e' : '#444',
          }} />
          <span style={{ fontSize: 11, color: p.configured ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
            {p.label}
          </span>
        </div>
      ))}
      {!data.any_ai_ready && (
        <span style={{ fontSize: 11, color: '#f59e0b', marginLeft: 4 }}>
          ⚠ Добавьте хотя бы один AI ключ
        </span>
      )}
    </div>
  )
}

export default function Settings() {
  const [values, setValues] = useState({})
  const [dirty, setDirty] = useState(false)
  const addToast = useStore((s) => s.addToast)
  const openConfirm = useStore((s) => s.openConfirm)
  const qc = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
  })

  useEffect(() => {
    if (settings) setValues(settings)
  }, [settings])

  const onChange = (key, val) => {
    setValues((s) => ({ ...s, [key]: val }))
    setDirty(true)
  }

  const saveMutation = useMutation({
    mutationFn: () => api.settings.update(values),
    onSuccess: () => {
      addToast('Настройки сохранены', 'success')
      setDirty(false)
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['providers-status'] })
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  const refreshMutation = useMutation({
    mutationFn: api.settings.refreshAll,
    onSuccess: (d) => addToast(d.message || 'Запущено', 'success'),
    onError: (err) => addToast(err.message, 'error'),
  })

  const recalcMutation = useMutation({
    mutationFn: api.settings.recalculate,
    onSuccess: (d) => addToast(`Пересчитано: ${d.updated} видео`, 'success'),
    onError: (err) => addToast(err.message, 'error'),
  })

  const clearCostsMutation = useMutation({
    mutationFn: api.settings.clearCosts,
    onSuccess: () => { addToast('Логи расходов очищены', 'success'); qc.invalidateQueries({ queryKey: ['costs'] }) },
    onError: (err) => addToast(err.message, 'error'),
  })

  if (isLoading) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Загрузка...</div>

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Настройки</h1>

      {/* Provider status bar */}
      <ProvidersStatus />

      {/* API Keys */}
      <Section title="API Ключи">
        <ApiKeyField settingKey="anthropic_api_key"
          description="Для анализа видео и генерации сценариев (рекомендуется)"
          values={values} onChange={onChange} />
        <ApiKeyField settingKey="openai_api_key"
          description="Суммаризация транскрипций и аналитика паттернов"
          values={values} onChange={onChange} />
        <ApiKeyField settingKey="groq_api_key"
          description="Бесплатная категоризация через Llama 3.3 70B"
          values={values} onChange={onChange} />
        <ApiKeyField settingKey="assemblyai_api_key"
          description="Транскрипция видео всех платформ (~$0.006 за 60 сек)"
          values={values} onChange={onChange} />
        <ApiKeyField settingKey="apify_api_key"
          description="Парсинг Instagram и TikTok (25 runs/мес бесплатно)"
          values={values} onChange={onChange} />
        <ApiKeyField settingKey="vk_access_token"
          description="Для парсинга VK видео"
          values={values} onChange={onChange} />
        <ApiKeyField settingKey="instagram_session_id"
          description="Для instaloader (fallback парсер Instagram)"
          values={values} onChange={onChange} />
      </Section>

      {/* Providers */}
      <Section title="AI Провайдеры">
        <SelectField label="Анализ видео" settingKey="ai_analyze"
          options={[{ value: 'claude', label: 'Claude Sonnet (рекомендуется)' }, { value: 'openai', label: 'GPT-4o' }]}
          values={values} onChange={onChange} />
        <SelectField label="Генерация сценариев" settingKey="ai_scripts"
          options={[{ value: 'claude', label: 'Claude Sonnet (рекомендуется)' }, { value: 'openai', label: 'GPT-4o' }]}
          values={values} onChange={onChange} />
        <SelectField label="Категоризация" settingKey="ai_categorize"
          options={[{ value: 'groq', label: 'Groq / Llama (бесплатно)' }, { value: 'openai', label: 'GPT-4o-mini' }, { value: 'claude', label: 'Claude' }]}
          values={values} onChange={onChange} />
        <SelectField label="Суммаризация транскрипций" settingKey="ai_summarize"
          options={[{ value: 'openai', label: 'GPT-4o-mini' }, { value: 'claude', label: 'Claude' }]}
          values={values} onChange={onChange} />
        <SelectField label="Транскрипция" settingKey="transcription_provider"
          options={[{ value: 'assemblyai', label: 'AssemblyAI (все платформы)' }, { value: 'youtube_only', label: 'Только YouTube субтитры (бесплатно)' }]}
          values={values} onChange={onChange} />
        <SelectField label="Парсинг Instagram" settingKey="parser_instagram"
          options={[{ value: 'apify', label: 'Apify (надёжный)' }, { value: 'instaloader', label: 'Instaloader (fallback)' }]}
          values={values} onChange={onChange} />
        <SelectField label="Парсинг TikTok" settingKey="parser_tiktok"
          options={[{ value: 'apify', label: 'Apify (надёжный)' }, { value: 'playwright', label: 'Playwright (fallback)' }]}
          values={values} onChange={onChange} />
      </Section>

      {/* Parameters */}
      <Section title="Параметры">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            { key: 'outlier_threshold', label: 'Порог аутлайера (X-factor)', step: '0.5', min: '1.5', max: '20' },
            { key: 'refresh_interval_hours', label: 'Интервал обновления (часы)', step: '1', min: '1', max: '48' },
            { key: 'max_videos_per_blogger', label: 'Макс. видео на блогера', step: '10', min: '10', max: '200' },
            { key: 'max_transcript_length', label: 'Макс. длина транскрипции', step: '500', min: '1000' },
          ].map(({ key, label, step, min, max }) => (
            <div key={key}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 5 }}>
                {label}
              </label>
              <input type="number" step={step} min={min} max={max}
                value={values[key] || ''} onChange={(e) => onChange(key, e.target.value)}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)', fontSize: 13,
                }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <input type="checkbox" id="auto_transcribe"
            checked={values.auto_transcribe_outliers === 'true'}
            onChange={(e) => onChange('auto_transcribe_outliers', e.target.checked ? 'true' : 'false')}
            style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="auto_transcribe" style={{ fontSize: 13, cursor: 'pointer' }}>
            Авто-транскрипция новых аутлайеров
          </label>
        </div>
      </Section>

      {/* Costs */}
      <Section title="Расходы на API">
        <CostDashboard />
      </Section>

      {/* Actions */}
      <Section title="Действия">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Обновить всех блогеров', icon: RefreshCw, mutation: refreshMutation },
            { label: 'Пересчитать X-factors', icon: RotateCcw, mutation: recalcMutation },
          ].map(({ label, icon: Icon, mutation }) => (
            <button key={label} onClick={() => mutation.mutate()} disabled={mutation.isPending}
              style={{
                padding: '8px 16px', borderRadius: 7, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-secondary)', fontSize: 13,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <Icon size={13} /> {label}
            </button>
          ))}
          <button
            onClick={() => openConfirm('Очистить все логи расходов?', () => clearCostsMutation.mutate())}
            style={{
              padding: '8px 16px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)',
              background: 'transparent', color: '#f87171', fontSize: 13,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <Trash2 size={13} /> Очистить логи расходов
          </button>
        </div>
      </Section>

      {/* Sticky save */}
      <div style={{ position: 'sticky', bottom: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending}
          style={{
            padding: '10px 28px', borderRadius: 8, border: 'none',
            background: dirty ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: dirty ? '#000' : 'var(--text-muted)',
            fontSize: 14, fontWeight: 700,
            cursor: dirty ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 7,
            boxShadow: dirty ? '0 4px 20px rgba(229,224,0,0.2)' : 'none',
          }}>
          {saveMutation.isPending
            ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
            : <Save size={15} />}
          {saveMutation.isPending ? 'Сохраняю...' : 'Сохранить настройки'}
        </button>
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
