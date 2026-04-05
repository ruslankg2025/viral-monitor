import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, RefreshCw, RotateCcw, Trash2, Save } from 'lucide-react'
import { api } from '../api.js'
import CostDashboard from '../components/CostDashboard.jsx'
import { useStore } from '../store.js'

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function ApiKeyField({ label, description, settingKey, values, onChange }) {
  const [show, setShow] = useState(false)
  const val = values[settingKey] || ''
  const isSet = val.length > 0

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</label>
        <span
          style={{
            fontSize: 11,
            padding: '1px 7px',
            borderRadius: 4,
            background: isSet ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: isSet ? '#22c55e' : '#f87171',
          }}
        >
          {isSet ? '✓ Задан' : '⚠ Не задан'}
        </span>
      </div>
      {description && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>{description}</p>
      )}
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={val}
          onChange={(e) => onChange(settingKey, e.target.value)}
          placeholder={`Введите ${label}...`}
          style={{
            width: '100%',
            padding: '8px 36px 8px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            fontSize: 13,
            fontFamily: val ? 'var(--font-mono)' : 'var(--font-display)',
          }}
        />
        <button
          onClick={() => setShow((s) => !s)}
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
          }}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
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
          padding: '7px 10px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          fontSize: 13,
          cursor: 'pointer',
          minWidth: 200,
        }}
      >
        {options.map(({ value, label }) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
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
    onSuccess: () => {
      addToast('Логи расходов очищены', 'success')
      qc.invalidateQueries({ queryKey: ['costs'] })
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  if (isLoading) {
    return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Загрузка...</div>
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 28 }}>Настройки</h1>

      {/* API Keys */}
      <Section title="API Ключи">
        <ApiKeyField
          label="Anthropic API Key"
          description="Для глубокого анализа и генерации сценариев (рекомендуется)"
          settingKey="anthropic_api_key"
          values={values}
          onChange={onChange}
        />
        <ApiKeyField
          label="OpenAI API Key"
          description="Для суммаризации и аналитических задач"
          settingKey="openai_api_key"
          values={values}
          onChange={onChange}
        />
        <ApiKeyField
          label="Groq API Key"
          description="Бесплатная категоризация через Llama 3.3 70B"
          settingKey="groq_api_key"
          values={values}
          onChange={onChange}
        />
        <ApiKeyField
          label="AssemblyAI API Key"
          description="Транскрипция видео всех платформ (~$0.006 за 60 сек)"
          settingKey="assemblyai_api_key"
          values={values}
          onChange={onChange}
        />
        <ApiKeyField
          label="Apify API Key"
          description="Парсинг Instagram и TikTok (managed scrapers)"
          settingKey="apify_api_key"
          values={values}
          onChange={onChange}
        />
        <ApiKeyField
          label="VK Access Token"
          description="Для парсинга VK видео"
          settingKey="vk_access_token"
          values={values}
          onChange={onChange}
        />
        <ApiKeyField
          label="Instagram Session ID"
          description="Для instaloader (fallback парсер)"
          settingKey="instagram_session_id"
          values={values}
          onChange={onChange}
        />
      </Section>

      {/* Providers */}
      <Section title="AI Провайдеры">
        <SelectField
          label="Анализ видео"
          settingKey="ai_analyze"
          options={[
            { value: 'claude', label: 'Claude Sonnet (рекомендуется)' },
            { value: 'openai', label: 'GPT-4o' },
          ]}
          values={values}
          onChange={onChange}
        />
        <SelectField
          label="Генерация сценариев"
          settingKey="ai_scripts"
          options={[
            { value: 'claude', label: 'Claude Sonnet (рекомендуется)' },
            { value: 'openai', label: 'GPT-4o' },
          ]}
          values={values}
          onChange={onChange}
        />
        <SelectField
          label="Категоризация"
          settingKey="ai_categorize"
          options={[
            { value: 'groq', label: 'Groq / Llama (бесплатно)' },
            { value: 'openai', label: 'GPT-4o-mini' },
            { value: 'claude', label: 'Claude' },
          ]}
          values={values}
          onChange={onChange}
        />
        <SelectField
          label="Суммаризация транскрипций"
          settingKey="ai_summarize"
          options={[
            { value: 'openai', label: 'GPT-4o-mini' },
            { value: 'claude', label: 'Claude' },
          ]}
          values={values}
          onChange={onChange}
        />
        <SelectField
          label="Транскрипция"
          settingKey="transcription_provider"
          options={[
            { value: 'assemblyai', label: 'AssemblyAI (все платформы)' },
            { value: 'youtube_only', label: 'Только YouTube субтитры (бесплатно)' },
          ]}
          values={values}
          onChange={onChange}
        />
        <SelectField
          label="Парсинг Instagram"
          settingKey="parser_instagram"
          options={[
            { value: 'apify', label: 'Apify (надёжный)' },
            { value: 'instaloader', label: 'Instaloader (fallback)' },
          ]}
          values={values}
          onChange={onChange}
        />
        <SelectField
          label="Парсинг TikTok"
          settingKey="parser_tiktok"
          options={[
            { value: 'apify', label: 'Apify (надёжный)' },
            { value: 'playwright', label: 'Playwright (fallback)' },
          ]}
          values={values}
          onChange={onChange}
        />
      </Section>

      {/* Parameters */}
      <Section title="Параметры">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            { key: 'outlier_threshold', label: 'Порог аутлайера (X-factor)', type: 'number', step: '0.5', min: '1.5', max: '20' },
            { key: 'refresh_interval_hours', label: 'Интервал обновления (часы)', type: 'number', step: '1', min: '1', max: '48' },
            { key: 'max_videos_per_blogger', label: 'Макс. видео на блогера', type: 'number', step: '10', min: '10', max: '200' },
            { key: 'max_transcript_length', label: 'Макс. длина транскрипции (символов)', type: 'number', step: '500', min: '1000' },
          ].map(({ key, label, type, step, min, max }) => (
            <div key={key}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 5 }}>
                {label}
              </label>
              <input
                type={type}
                step={step}
                min={min}
                max={max}
                value={values[key] || ''}
                onChange={(e) => onChange(key, e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                }}
              />
            </div>
          ))}
        </div>

        {/* Auto-transcribe toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <input
            type="checkbox"
            id="auto_transcribe"
            checked={values.auto_transcribe_outliers === 'true'}
            onChange={(e) => onChange('auto_transcribe_outliers', e.target.checked ? 'true' : 'false')}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <label htmlFor="auto_transcribe" style={{ fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
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
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            style={{
              padding: '8px 16px',
              borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <RefreshCw size={13} /> Обновить всех блогеров
          </button>
          <button
            onClick={() => recalcMutation.mutate()}
            disabled={recalcMutation.isPending}
            style={{
              padding: '8px 16px',
              borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <RotateCcw size={13} /> Пересчитать X-factors
          </button>
          <button
            onClick={() =>
              openConfirm('Очистить все логи расходов?', () => clearCostsMutation.mutate())
            }
            style={{
              padding: '8px 16px',
              borderRadius: 7,
              border: '1px solid rgba(239,68,68,0.3)',
              background: 'transparent',
              color: '#f87171',
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Trash2 size={13} /> Очистить логи расходов
          </button>
        </div>
      </Section>

      {/* Save button — sticky */}
      <div
        style={{
          position: 'sticky',
          bottom: 20,
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <button
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending}
          style={{
            padding: '10px 28px',
            borderRadius: 8,
            border: 'none',
            background: dirty ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: dirty ? '#000' : 'var(--text-muted)',
            fontSize: 14,
            fontWeight: 700,
            cursor: dirty ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            boxShadow: dirty ? '0 4px 20px rgba(229,224,0,0.2)' : 'none',
          }}
        >
          <Save size={15} />
          {saveMutation.isPending ? 'Сохраняю...' : 'Сохранить настройки'}
        </button>
      </div>
    </div>
  )
}
