import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Sparkles } from 'lucide-react'
import { api } from '../api.js'
import ScriptCard from '../components/ScriptCard.jsx'
import ScriptEditor from '../components/ScriptEditor.jsx'
import GenerateForm from '../components/GenerateForm.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { useStore } from '../store.js'

export default function Scripts() {
  const scriptEditorId = useStore((s) => s.scriptEditorId)
  const closeScriptEditor = useStore((s) => s.closeScriptEditor)
  const [showGenerate, setShowGenerate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['scripts'],
    queryFn: () => api.scripts.list({ per_page: 50 }),
  })

  const scripts = data?.items ?? []

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Сценарии</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {scripts.length} сценариев
          </p>
        </div>
        <button
          onClick={() => setShowGenerate(true)}
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
          <Sparkles size={14} /> Создать сценарий
        </button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>
          Загрузка...
        </div>
      ) : scripts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Сценариев пока нет"
          description="Откройте любое вирусное видео, запустите анализ и создайте сценарий на его основе"
          action={
            <button
              onClick={() => setShowGenerate(true)}
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
              Создать первый сценарий
            </button>
          }
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 14,
          }}
        >
          {scripts.map((s) => (
            <ScriptCard key={s.id} script={s} />
          ))}
        </div>
      )}

      {scriptEditorId && <ScriptEditor scriptId={scriptEditorId} onClose={closeScriptEditor} />}
      {showGenerate && <GenerateForm videoId={null} onClose={() => setShowGenerate(false)} />}
    </div>
  )
}
