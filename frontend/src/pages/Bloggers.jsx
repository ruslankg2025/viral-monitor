import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Upload, Users } from 'lucide-react'
import { api } from '../api.js'
import BloggerCard from '../components/BloggerCard.jsx'
import ImportModal from '../components/ImportModal.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { BloggerCardSkeleton } from '../components/Skeleton.jsx'
import { useStore } from '../store.js'

export default function Bloggers() {
  const [showForm, setShowForm] = useState(false)
  const [platform, setPlatform] = useState('youtube')
  const [username, setUsername] = useState('')
  const importModalOpen = useStore((s) => s.importModalOpen)
  const setImportModalOpen = useStore((s) => s.setImportModalOpen)
  const addToast = useStore((s) => s.addToast)
  const qc = useQueryClient()

  const { data: bloggers = [], isLoading } = useQuery({
    queryKey: ['bloggers'],
    queryFn: api.bloggers.list,
  })

  const addMutation = useMutation({
    mutationFn: () => api.bloggers.create({ platform, username }),
    onSuccess: (b) => {
      addToast(`@${b.username} добавлен. Идёт загрузка видео...`, 'success')
      qc.invalidateQueries({ queryKey: ['bloggers'] })
      setUsername('')
      setShowForm(false)
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  const PLATFORMS = ['youtube', 'instagram', 'tiktok', 'vk']

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Блогеры</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {bloggers.length} отслеживается
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setImportModalOpen(true)}
            style={{
              padding: '7px 14px',
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
            <Upload size={14} /> Импорт CSV
          </button>
          <button
            onClick={() => setShowForm((s) => !s)}
            style={{
              padding: '7px 14px',
              borderRadius: 7,
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
            <Plus size={14} /> Добавить
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '20px',
            marginBottom: 20,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Новый блогер</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            {/* Platform */}
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>
                Платформа
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Username */}
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>
                Username или URL
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && username.trim() && addMutation.mutate()}
                placeholder="mkbhd или https://youtube.com/@mkbhd"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                }}
              />
            </div>

            {/* Submit */}
            <button
              onClick={() => addMutation.mutate()}
              disabled={!username.trim() || addMutation.isPending}
              style={{
                padding: '8px 20px',
                borderRadius: 6,
                border: 'none',
                background: username.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: username.trim() ? '#000' : 'var(--text-muted)',
                fontSize: 13,
                fontWeight: 600,
                cursor: username.trim() ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
              }}
            >
              {addMutation.isPending ? 'Добавление...' : 'Добавить'}
            </button>
          </div>
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <BloggerCardSkeleton key={i} />
          ))}
        </div>
      ) : bloggers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Блогеры не добавлены"
          description="Добавьте первого блогера, чтобы начать мониторинг вирусных видео"
          action={
            <button
              onClick={() => setShowForm(true)}
              style={{
                padding: '8px 20px',
                borderRadius: 7,
                border: 'none',
                background: 'var(--accent)',
                color: '#000',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Добавить блогера
            </button>
          }
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
          {bloggers.map((b) => (
            <BloggerCard key={b.id} blogger={b} />
          ))}
        </div>
      )}

      {importModalOpen && <ImportModal onClose={() => setImportModalOpen(false)} />}
    </div>
  )
}
