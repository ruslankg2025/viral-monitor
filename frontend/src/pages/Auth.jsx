import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, LogIn, AlertCircle, Loader } from 'lucide-react'
import { api } from '../api.js'
import { useStore } from '../store.js'

export default function Auth() {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { setToken: storeSetToken, setAccount } = useStore()

  const handleLogin = async (e) => {
    e.preventDefault()
    const trimmed = token.trim()
    if (!trimmed) {
      setError('Введите токен')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Temporarily set the token so the API call uses it
      storeSetToken(trimmed)
      const account = await api.accounts.me()
      setAccount(account)
      navigate('/analyze', { replace: true })
    } catch (err) {
      // Clear the invalid token
      useStore.getState().logout()
      setError(err.message || 'Неверный токен')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 40,
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 32,
            justifyContent: 'center',
          }}
        >
          <Zap size={24} color="var(--accent)" />
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.3px',
            }}
          >
            Viral Monitor
          </span>
        </div>

        <h1
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 8,
            textAlign: 'center',
          }}
        >
          Вход в аккаунт
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-muted)',
            marginBottom: 28,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Введите токен доступа вашего аккаунта
        </p>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--text-muted)',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Токен доступа
            </label>
            <input
              type="text"
              value={token}
              onChange={(e) => {
                setToken(e.target.value)
                setError('')
              }}
              placeholder="Вставьте токен здесь..."
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--bg-primary)',
                border: `1px solid ${error ? 'var(--error, #ef4444)' : 'var(--border)'}`,
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize: 14,
                fontFamily: 'monospace',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 6,
                marginBottom: 16,
              }}
            >
              <AlertCircle size={14} color="#ef4444" />
              <span style={{ fontSize: 13, color: '#ef4444' }}>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '11px 16px',
              background: 'var(--accent)',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {loading ? (
              <>
                <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Проверяем...
              </>
            ) : (
              <>
                <LogIn size={14} />
                Войти
              </>
            )}
          </button>
        </form>

        <p
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            textAlign: 'center',
            marginTop: 24,
            lineHeight: 1.6,
          }}
        >
          Токен выдаётся при первом запуске сервера.
          <br />
          Он выводится в логах бэкенда.
        </p>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus { border-color: var(--accent) !important; }
      `}</style>
    </div>
  )
}
