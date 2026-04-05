import React, { useState, useRef } from 'react'
import { X, Upload, FileText } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.js'
import { useStore } from '../store.js'

export default function ImportModal({ onClose }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)
  const addToast = useStore((s) => s.addToast)
  const qc = useQueryClient()

  const importMutation = useMutation({
    mutationFn: () => api.bloggers.import(file),
    onSuccess: (data) => {
      addToast(
        `Импортировано: ${data.imported}, пропущено: ${data.skipped}${
          data.errors.length ? `, ошибок: ${data.errors.length}` : ''
        }`,
        data.errors.length ? 'warning' : 'success'
      )
      qc.invalidateQueries({ queryKey: ['bloggers'] })
      onClose()
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  const handleFile = (f) => {
    setFile(f)
    const reader = new FileReader()
    reader.onload = (e) => {
      const lines = e.target.result.split('\n').filter(Boolean).slice(0, 5)
      setPreview(lines)
    }
    reader.readAsText(f)
  }

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
          width: 440,
          maxWidth: '90%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Импорт блогеров</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          CSV или TXT файл. Каждая строка: <code style={{ color: 'var(--accent)' }}>platform,username</code>
          <br />
          Например: <code>youtube,mkbhd</code> или <code>instagram,natgeo</code>
        </p>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files[0]
            if (f) handleFile(f)
          }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 8,
            padding: '24px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? 'rgba(229,224,0,0.04)' : 'transparent',
            transition: 'all 0.15s',
            marginBottom: 16,
          }}
        >
          <Upload size={24} color="var(--text-muted)" style={{ margin: '0 auto 8px' }} />
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {file ? file.name : 'Перетащите файл или нажмите для выбора'}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files[0]; if (f) handleFile(f) }}
          />
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div
            style={{
              background: 'var(--bg-tertiary)',
              borderRadius: 6,
              padding: '10px 12px',
              marginBottom: 16,
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ marginBottom: 4, color: 'var(--text-muted)', fontSize: 11 }}>
              <FileText size={11} style={{ display: 'inline', marginRight: 4 }} />
              Первые {preview.length} строк:
            </div>
            {preview.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Отмена
          </button>
          <button
            onClick={() => importMutation.mutate()}
            disabled={!file || importMutation.isPending}
            style={{
              padding: '7px 20px',
              borderRadius: 6,
              border: 'none',
              background: file ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: file ? '#000' : 'var(--text-muted)',
              fontSize: 13,
              fontWeight: 600,
              cursor: file ? 'pointer' : 'not-allowed',
            }}
          >
            {importMutation.isPending ? 'Импорт...' : 'Импортировать'}
          </button>
        </div>
      </div>
    </div>
  )
}
