import React, { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  RefreshCw,
  Zap,
  Sparkles,
  History,
  UserCircle,
  LogOut,
  ChevronDown,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.js'
import { useStore } from '../store.js'
import { timeAgo } from '../utils.js'

const NAV_ITEMS = [
  { to: '/analyze', icon: Sparkles, label: 'Разбор', highlight: true },
  { to: '/my-videos', icon: History, label: 'Мои разборы' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Тренды' },
  { to: '/bloggers', icon: Users, label: 'Блогеры' },
  { to: '/scripts', icon: FileText, label: 'Сценарии' },
  { to: '/profile', icon: UserCircle, label: 'Профиль' },
  { to: '/settings', icon: Settings, label: 'Настройки' },
]

function AccountSwitcher() {
  const [open, setOpen] = useState(false)
  const { currentAccount, logout } = useStore()
  const navigate = useNavigate()

  const displayName =
    currentAccount?.main_profiles?.[0]?.username ||
    currentAccount?.display_name ||
    'Аккаунт'

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 6,
          color: 'var(--text-secondary)',
          fontSize: 12,
          cursor: 'pointer',
          width: '100%',
        }}
      >
        <UserCircle size={14} />
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
        </span>
        <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            marginBottom: 4,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            zIndex: 100,
          }}
        >
          <button
            onClick={() => {
              setOpen(false)
              navigate('/profile')
            }}
            style={dropdownItemStyle}
          >
            <UserCircle size={13} />
            Настройки профиля
          </button>
          <div style={{ height: 1, background: 'var(--border)' }} />
          <button
            onClick={() => {
              setOpen(false)
              logout()
            }}
            style={{ ...dropdownItemStyle, color: '#ef4444' }}
          >
            <LogOut size={13} />
            Выйти
          </button>
        </div>
      )}

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  )
}

const dropdownItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-secondary)',
  fontSize: 13,
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
}

export default function Layout() {
  const addToast = useStore((s) => s.addToast)
  const qc = useQueryClient()

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: api.stats.get,
    refetchInterval: 60_000,
  })

  const refreshMutation = useMutation({
    mutationFn: api.settings.refreshAll,
    onSuccess: () => {
      addToast('Обновление запущено', 'success')
      qc.invalidateQueries()
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 'var(--sidebar-width)',
          minWidth: 'var(--sidebar-width)',
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 0',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
        }}
      >
        {/* Logo */}
        <div style={{ padding: '0 20px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={20} color="var(--accent)" />
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.3px',
              }}
            >
              Viral Monitor
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0 12px' }}>
          {NAV_ITEMS.map(({ to, icon: Icon, label, highlight }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 6,
                marginBottom: highlight ? 8 : 2,
                color: isActive ? 'var(--accent)' : highlight ? 'var(--accent)' : 'var(--text-secondary)',
                background: isActive ? 'rgba(229,224,0,0.12)' : highlight ? 'rgba(229,224,0,0.06)' : 'transparent',
                textDecoration: 'none',
                fontWeight: isActive || highlight ? 600 : 400,
                fontSize: 14,
                transition: 'all 0.15s',
                border: highlight && !isActive ? '1px solid rgba(229,224,0,0.15)' : '1px solid transparent',
              })}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div style={{ padding: '20px 16px 0', borderTop: '1px solid var(--border)' }}>
          {stats && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                {stats.total_videos} видео · {stats.outlier_videos} аутлайеров
              </div>
              {stats.last_refresh && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Обновлено {timeAgo(stats.last_refresh)}
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 13,
              cursor: refreshMutation.isPending ? 'not-allowed' : 'pointer',
              opacity: refreshMutation.isPending ? 0.6 : 1,
              marginBottom: 12,
            }}
          >
            <RefreshCw
              size={14}
              style={{
                animation: refreshMutation.isPending ? 'spin 1s linear infinite' : 'none',
              }}
            />
            Обновить всё
          </button>

          <AccountSwitcher />
        </div>
      </aside>

      {/* Main */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          padding: '24px',
          maxWidth: 'calc(1400px + 48px)',
        }}
      >
        <Outlet />
      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
