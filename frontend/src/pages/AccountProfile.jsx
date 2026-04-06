import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  User,
  Search,
  Instagram,
  Settings2,
  LogIn,
  Trash2,
  Plus,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Loader,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { api } from '../api.js'
import { useStore } from '../store.js'

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    active: { label: 'Активен', color: '#22c55e', icon: CheckCircle },
    expired: { label: 'Истёк', color: '#f59e0b', icon: AlertTriangle },
    banned: { label: 'Заблокирован', color: '#ef4444', icon: XCircle },
    not_logged_in: { label: 'Не вошёл', color: 'var(--text-muted)', icon: Clock },
  }
  const s = map[status] || map.not_logged_in
  const Icon = s.icon
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 999,
        background: `${s.color}18`,
        border: `1px solid ${s.color}40`,
        color: s.color,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <Icon size={11} />
      {s.label}
    </span>
  )
}

// ── Login modal ───────────────────────────────────────────────────────────────

function LoginModal({ profile, type, onClose, onSuccess }) {
  const [username, setUsername] = useState(profile.username || '')
  const [password, setPassword] = useState('')
  const [useCookie, setUseCookie] = useState(false)
  const [sessionCookie, setSessionCookie] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const addToast = useStore((s) => s.addToast)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username) { setError('Введите логин'); return }
    if (useCookie && !sessionCookie) { setError('Введите session cookie'); return }
    if (!useCookie && !password) { setError('Введите пароль'); return }

    setLoading(true)
    setError('')
    try {
      const payload = useCookie
        ? { username, session_cookie: sessionCookie.trim() }
        : { username, password }
      const fn = type === 'main'
        ? () => api.accounts.loginMainProfile(profile.id, payload)
        : () => api.accounts.loginScraperProfile(profile.id, payload)
      const updated = await fn()
      addToast('Вход выполнен успешно', 'success')
      onSuccess(updated)
      onClose()
    } catch (err) {
      setError(err.message || 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 32, width: 380,
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20 }}>
          Вход в Instagram
        </h3>

        {/* Toggle: Password / Cookie */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, background: 'var(--bg-tertiary)', borderRadius: 8, padding: 4 }}>
          {[{ v: false, l: 'Пароль' }, { v: true, l: 'Session Cookie' }].map(({ v, l }) => (
            <button key={l} type="button" onClick={() => { setUseCookie(v); setError('') }}
              style={{
                flex: 1, padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: useCookie === v ? 'var(--accent)' : 'transparent',
                color: useCookie === v ? '#000' : 'var(--text-muted)',
              }}>{l}</button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Логин (username)</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="username" style={inputStyle} />
          </div>

          {!useCookie ? (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Пароль</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" style={inputStyle} />
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Session Cookie (sessionid)</label>
              <textarea
                value={sessionCookie}
                onChange={(e) => setSessionCookie(e.target.value)}
                placeholder="Скопируй sessionid из Instagram → F12 → Application → Cookies"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 11 }}
              />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Instagram → F12 → Приложение → Файлы cookie → sessionid
              </p>
            </div>
          )}

          {error && <div style={errorStyle}>{error}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={btnSecondaryStyle}>Отмена</button>
            <button type="submit" disabled={loading} style={btnPrimaryStyle}>
              {loading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <LogIn size={14} />}
              {loading ? 'Входим...' : 'Войти'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Section: Main Profile ─────────────────────────────────────────────────────

function MainProfileSection({ account }) {
  const qc = useQueryClient()
  const addToast = useStore((s) => s.addToast)
  const [newPlatform, setNewPlatform] = useState('instagram')
  const [newUsername, setNewUsername] = useState('')
  const [loginProfile, setLoginProfile] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  const profiles = account?.main_profiles || []

  const addMutation = useMutation({
    mutationFn: () =>
      api.accounts.addMainProfile({ platform: newPlatform, username: newUsername }),
    onSuccess: () => {
      qc.invalidateQueries(['accounts-me'])
      setNewUsername('')
      setShowAdd(false)
      addToast('Аккаунт добавлен', 'success')
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.accounts.deleteMainProfile(id),
    onSuccess: () => {
      qc.invalidateQueries(['accounts-me'])
      addToast('Аккаунт удалён', 'success')
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  return (
    <section style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <User size={16} color="var(--accent)" />
        <h2 style={sectionTitleStyle}>Основной аккаунт</h2>
      </div>
      <p style={sectionDescStyle}>
        Ваш основной Instagram/TikTok аккаунт — для генерации персонализированных сценариев.
      </p>

      {profiles.length === 0 && !showAdd && (
        <div style={emptyStyle}>Нет добавленных аккаунтов</div>
      )}

      {profiles.map((p) => (
        <div key={p.id} style={profileCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            {p.avatar_url ? (
              <img
                src={p.avatar_url}
                alt={p.username}
                style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div style={avatarPlaceholderStyle}>
                <User size={18} color="var(--text-muted)" />
              </div>
            )}
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                @{p.username}
              </div>
              {p.followers_count > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {p.followers_count.toLocaleString()} подписчиков
                </div>
              )}
              <div style={{ marginTop: 4 }}>
                <StatusBadge status={p.status} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {p.platform === 'instagram' && (
              <button
                onClick={() => setLoginProfile(p)}
                style={btnSmallStyle}
                title="Войти"
              >
                <LogIn size={13} />
                Войти
              </button>
            )}
            <button
              onClick={() => deleteMutation.mutate(p.id)}
              style={{ ...btnSmallStyle, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
              title="Удалить"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      {showAdd && (
        <div style={addFormStyle}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value)}
              style={{ ...inputStyle, width: 130 }}
            >
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
            </select>
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="username"
              style={{ ...inputStyle, flex: 1 }}
              onKeyDown={(e) => e.key === 'Enter' && addMutation.mutate()}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowAdd(false)} style={btnSecondaryStyle}>
              Отмена
            </button>
            <button
              onClick={() => addMutation.mutate()}
              disabled={!newUsername || addMutation.isPending}
              style={btnPrimaryStyle}
            >
              Добавить
            </button>
          </div>
        </div>
      )}

      {!showAdd && (
        <button onClick={() => setShowAdd(true)} style={btnAddStyle}>
          <Plus size={14} />
          Добавить аккаунт
        </button>
      )}

      {loginProfile && (
        <LoginModal
          profile={loginProfile}
          type="main"
          onClose={() => setLoginProfile(null)}
          onSuccess={() => qc.invalidateQueries(['accounts-me'])}
        />
      )}
    </section>
  )
}

// ── Section: Scraper Profile ──────────────────────────────────────────────────

function ScraperProfileSection({ account }) {
  const qc = useQueryClient()
  const addToast = useStore((s) => s.addToast)
  const [newPlatform, setNewPlatform] = useState('instagram')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [loginProfile, setLoginProfile] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  const profiles = account?.scraper_profiles || []

  const addMutation = useMutation({
    mutationFn: () =>
      api.accounts.addScraperProfile({
        platform: newPlatform,
        username: newUsername,
        password: newPassword,
      }),
    onSuccess: () => {
      qc.invalidateQueries(['accounts-me'])
      setNewUsername('')
      setNewPassword('')
      setShowAdd(false)
      addToast('Аккаунт парсера добавлен', 'success')
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.accounts.deleteScraperProfile(id),
    onSuccess: () => {
      qc.invalidateQueries(['accounts-me'])
      addToast('Аккаунт парсера удалён', 'success')
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  return (
    <section style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <Search size={16} color="var(--accent)" />
        <h2 style={sectionTitleStyle}>Аккаунт для парсинга</h2>
      </div>
      <p style={sectionDescStyle}>
        Отдельный аккаунт, которым будем скрапить данные блогеров. Им рискуем.
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <AlertTriangle size={13} color="#f59e0b" />
        <span style={{ fontSize: 12, color: '#f59e0b' }}>
          Этот аккаунт используется для автоматического парсинга. Используйте запасной аккаунт.
        </span>
      </div>

      {profiles.length === 0 && !showAdd && (
        <div style={emptyStyle}>Нет аккаунтов парсера</div>
      )}

      {profiles.map((p) => (
        <div key={p.id} style={profileCardStyle}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
              @{p.username}
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                }}
              >
                {p.platform}
              </span>
            </div>
            <div style={{ marginTop: 4 }}>
              <StatusBadge status={p.status} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {p.platform === 'instagram' && (
              <button onClick={() => setLoginProfile(p)} style={btnSmallStyle}>
                <LogIn size={13} />
                Войти
              </button>
            )}
            <button
              onClick={() => deleteMutation.mutate(p.id)}
              style={{ ...btnSmallStyle, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      {showAdd && (
        <div style={addFormStyle}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value)}
              style={{ ...inputStyle, width: 130 }}
            >
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
            </select>
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="username"
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Пароль (необязательно)"
            style={{ ...inputStyle, width: '100%', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowAdd(false)} style={btnSecondaryStyle}>
              Отмена
            </button>
            <button
              onClick={() => addMutation.mutate()}
              disabled={!newUsername || addMutation.isPending}
              style={btnPrimaryStyle}
            >
              Добавить
            </button>
          </div>
        </div>
      )}

      {!showAdd && (
        <button onClick={() => setShowAdd(true)} style={btnAddStyle}>
          <Plus size={14} />
          Добавить аккаунт парсера
        </button>
      )}

      {loginProfile && (
        <LoginModal
          profile={loginProfile}
          type="scraper"
          onClose={() => setLoginProfile(null)}
          onSuccess={() => qc.invalidateQueries(['accounts-me'])}
        />
      )}
    </section>
  )
}

// ── Section: Generation Settings ─────────────────────────────────────────────

const TONE_OPTIONS = [
  { value: 'conversational', label: 'Разговорный', desc: 'Как с другом' },
  { value: 'expert', label: 'Экспертный', desc: 'Авторитетно' },
  { value: 'energetic', label: 'Энергичный', desc: 'Заряженно' },
  { value: 'calm', label: 'Спокойный', desc: 'Мягко и взвешенно' },
  { value: 'custom', label: 'Свой', desc: 'Опишите сами' },
]

const FORMAT_OPTIONS = [
  { value: 'head+visual', label: 'Говорящая голова + B-roll', desc: 'Классический формат' },
  { value: 'head_only', label: 'Только говорящая голова', desc: 'Прямо в камеру' },
  { value: 'screencast', label: 'Скринкаст', desc: 'Показ экрана' },
  { value: 'custom', label: 'Свой формат', desc: 'Опишите сами' },
]

function GenerationSettingsSection({ account }) {
  const qc = useQueryClient()
  const addToast = useStore((s) => s.addToast)

  const mainProfile = account?.main_profiles?.[0]

  const [form, setForm] = useState({
    niche: mainProfile?.niche || '',
    tone: mainProfile?.tone || '',
    tone_custom: mainProfile?.tone_custom || '',
    video_format: mainProfile?.video_format || '',
    video_format_custom: mainProfile?.video_format_custom || '',
    audience_desc: mainProfile?.audience_desc || '',
    banned_words: mainProfile?.banned_words || '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!mainProfile) {
      addToast('Сначала добавьте основной аккаунт', 'error')
      return
    }
    setSaving(true)
    try {
      await api.accounts.updateMainProfileSettings(mainProfile.id, form)
      qc.invalidateQueries(['accounts-me'])
      addToast('Настройки сохранены', 'success')
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const setField = (key, val) => setForm((f) => ({ ...f, [key]: val }))

  return (
    <section style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <Settings2 size={16} color="var(--accent)" />
        <h2 style={sectionTitleStyle}>Настройки генерации</h2>
      </div>
      <p style={sectionDescStyle}>
        Эти настройки влияют на стиль генерируемых сценариев.
        {!mainProfile && (
          <span style={{ color: '#f59e0b' }}> Добавьте основной аккаунт, чтобы сохранять настройки.</span>
        )}
      </p>

      {/* Niiche */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Ниша / тема канала</label>
        <input
          value={form.niche}
          onChange={(e) => setField('niche', e.target.value)}
          placeholder="Например: финансовая грамотность, фитнес, технологии..."
          style={inputStyle}
        />
      </div>

      {/* Tone */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Тон и стиль</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
          {TONE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setField('tone', opt.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${form.tone === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                background: form.tone === opt.value ? 'rgba(229,224,0,0.1)' : 'transparent',
                color: form.tone === opt.value ? 'var(--accent)' : 'var(--text-secondary)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13 }}>{opt.label}</div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
        {form.tone === 'custom' && (
          <textarea
            value={form.tone_custom}
            onChange={(e) => setField('tone_custom', e.target.value)}
            placeholder="Опишите желаемый тон и стиль..."
            rows={3}
            style={{ ...inputStyle, marginTop: 8, resize: 'vertical' }}
          />
        )}
      </div>

      {/* Format */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Формат видео</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setField('video_format', opt.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${form.video_format === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                background: form.video_format === opt.value ? 'rgba(229,224,0,0.1)' : 'transparent',
                color: form.video_format === opt.value ? 'var(--accent)' : 'var(--text-secondary)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13 }}>{opt.label}</div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
        {form.video_format === 'custom' && (
          <textarea
            value={form.video_format_custom}
            onChange={(e) => setField('video_format_custom', e.target.value)}
            placeholder="Опишите формат видео..."
            rows={3}
            style={{ ...inputStyle, marginTop: 8, resize: 'vertical' }}
          />
        )}
      </div>

      {/* Audience */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Описание аудитории</label>
        <textarea
          value={form.audience_desc}
          onChange={(e) => setField('audience_desc', e.target.value)}
          placeholder="Кто ваша аудитория? Возраст, интересы, боли..."
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      {/* Banned words */}
      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>Запрещённые слова</label>
        <input
          value={form.banned_words}
          onChange={(e) => setField('banned_words', e.target.value)}
          placeholder="слово1, слово2, фраза..."
          style={inputStyle}
        />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          Через запятую. Не будут использоваться в сценариях.
        </div>
      </div>

      <button onClick={handleSave} disabled={saving || !mainProfile} style={btnPrimaryStyle}>
        {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
        {saving ? 'Сохраняем...' : 'Сохранить настройки'}
      </button>
    </section>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AccountProfile() {
  const { data: account, isLoading, error } = useQuery({
    queryKey: ['accounts-me'],
    queryFn: api.accounts.me,
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} color="var(--accent)" />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ color: '#ef4444', padding: 24 }}>
        Ошибка загрузки: {error.message}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Профиль аккаунта
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Управляйте своими аккаунтами и настройками генерации сценариев
        </p>
      </div>

      <MainProfileSection account={account} />
      <ScraperProfileSection account={account} />
      <GenerationSettingsSection account={account} />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus, textarea:focus, select:focus { border-color: var(--accent) !important; outline: none; }
      `}</style>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const sectionStyle = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 24,
  marginBottom: 16,
}

const sectionHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 6,
}

const sectionTitleStyle = {
  fontSize: 15,
  fontWeight: 600,
  color: 'var(--text-primary)',
  margin: 0,
}

const sectionDescStyle = {
  fontSize: 13,
  color: 'var(--text-muted)',
  marginBottom: 16,
  lineHeight: 1.5,
}

const profileCardStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 16px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  marginBottom: 8,
}

const avatarPlaceholderStyle = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const emptyStyle = {
  fontSize: 13,
  color: 'var(--text-muted)',
  textAlign: 'center',
  padding: '16px 0',
}

const addFormStyle = {
  padding: 16,
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  marginBottom: 8,
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: 6,
  fontWeight: 600,
}

const inputStyle = {
  display: 'block',
  width: '100%',
  padding: '8px 10px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 13,
  boxSizing: 'border-box',
}

const errorStyle = {
  padding: '8px 12px',
  background: 'rgba(239,68,68,0.1)',
  border: '1px solid rgba(239,68,68,0.3)',
  borderRadius: 6,
  color: '#ef4444',
  fontSize: 12,
  marginBottom: 12,
}

const btnPrimaryStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 16px',
  background: 'var(--accent)',
  color: '#000',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  flex: 1,
  justifyContent: 'center',
}

const btnSecondaryStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 16px',
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
  flex: 1,
  justifyContent: 'center',
}

const btnSmallStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 10px',
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
}

const btnAddStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 12px',
  background: 'transparent',
  color: 'var(--text-muted)',
  border: '1px dashed var(--border)',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
  width: '100%',
  justifyContent: 'center',
}
