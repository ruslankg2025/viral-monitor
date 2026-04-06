import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, RefreshCw, Copy, Check, Loader2, Zap,
  Eye, Heart, MessageCircle, Clock, ExternalLink,
  Sparkles, ChevronRight, RotateCcw,
} from 'lucide-react'
import { api } from '../api.js'
import { useStore } from '../store.js'
import { formatNumber, timeAgo } from '../utils.js'

const PLATFORM_COLORS = {
  instagram: '#E1306C',
  youtube: '#FF0000',
  tiktok: '#69C9D0',
  vk: '#0077FF',
}

const IMPROVE_ACTIONS = [
  { key: 'усилить_зацепку', label: 'Усилить зацепку' },
  { key: 'сократить', label: 'Сократить' },
  { key: 'добавить_конкретики', label: '+ Конкретики' },
  { key: 'переписать_начало', label: 'Переписать начало' },
  { key: 'упростить', label: 'Упростить' },
]

const RATING_COLORS = {
  'Лучший выбор': { bg: 'rgba(229,224,0,0.15)', color: 'var(--accent)' },
  'Сильный': { bg: 'rgba(34,197,94,0.1)', color: '#22c55e' },
  'Альтернатива': { bg: 'rgba(148,163,184,0.1)', color: 'var(--text-muted)' },
}

function CopyButton({ text, style }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '6px 12px', borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'var(--bg-tertiary)',
        color: copied ? '#22c55e' : 'var(--text-secondary)',
        fontSize: 12, cursor: 'pointer',
        ...style,
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Скопировано' : 'Копировать'}
    </button>
  )
}

function AnalysisStep({ label, value }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}:{' '}
      </span>
      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

export default function AnalyzeResult() {
  const { id } = useParams()
  const navigate = useNavigate()
  const addToast = useStore((s) => s.addToast)
  const qc = useQueryClient()

  const [scriptText, setScriptText] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [selectedHook, setSelectedHook] = useState(null)
  const [activeTab, setActiveTab] = useState('script') // script | hooks | description

  const { data: video, isLoading, error } = useQuery({
    queryKey: ['video-full', id],
    queryFn: () => api.analyze.getVideoFull(id),
    refetchInterval: (data) => (!data?.is_analyzed ? 3000 : false),
  })

  useEffect(() => {
    if (video?.ai_analysis?.structure) {
      // Build teleprompter text from structure
      const scenes = video.ai_analysis.structure || []
      const text = scenes.map((s) => s.text || s.element || '').filter(Boolean).join('\n\n')
      if (text && !scriptText) setScriptText(text)
    }
  }, [video?.ai_analysis])

  const hooksQuery = useQuery({
    queryKey: ['hooks', id],
    queryFn: () => api.analyze.generateHooks(id),
    enabled: !!video?.is_analyzed && !video?.hooks,
    staleTime: Infinity,
  })

  const hooks = video?.hooks || hooksQuery.data?.hooks || []

  const improveMutation = useMutation({
    mutationFn: ({ action, custom_prompt }) =>
      api.analyze.improve(id, action, scriptText, custom_prompt),
    onSuccess: (data) => {
      setScriptText(data.improved_text)
      addToast('Сценарий улучшен', 'success')
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  const handleImprove = (action) => {
    if (!scriptText) return
    improveMutation.mutate({ action, custom_prompt: null })
  }

  const handleChat = (e) => {
    e.preventDefault()
    if (!chatInput.trim()) return
    improveMutation.mutate({ action: 'custom', custom_prompt: chatInput })
    setChatInput('')
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
        <p style={{ color: 'var(--text-muted)' }}>Загружаем видео...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 80 }}>
        <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Видео не найдено</p>
        <button onClick={() => navigate('/analyze')} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← Новый разбор
        </button>
      </div>
    )
  }

  const isAnalyzing = !video?.is_analyzed
  const analysis = video?.ai_analysis || {}
  const platformColor = PLATFORM_COLORS[video?.platform] || 'var(--accent)'

  // Build teleprompter script from structure if empty
  const displayScript = scriptText || (analysis.structure || []).map((s) => s.text || s.element || '').filter(Boolean).join('\n\n') || ''

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <button
          onClick={() => navigate('/analyze')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}
        >
          <ArrowLeft size={14} /> Новый разбор
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={video?.url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: 12, textDecoration: 'none' }}>
            <ExternalLink size={12} /> Открыть видео
          </a>
        </div>
      </div>

      {/* Video header card */}
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 20, marginBottom: 20, display: 'flex', gap: 16,
      }}>
        {video?.thumbnail_url && (
          <img
            src={video.thumbnail_url}
            alt=""
            style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
            onError={(e) => e.target.style.display = 'none'}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              background: `${platformColor}20`, color: platformColor, textTransform: 'uppercase',
            }}>
              {video?.platform}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{video?.blogger_username}</span>
            {isAnalyzing && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent)' }}>
                <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Анализирую...
              </span>
            )}
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, lineHeight: 1.4 }}>
            {video?.title || 'Без названия'}
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {video?.views > 0 && <Metric icon={Eye} value={formatNumber(video.views)} label="просмотров" />}
            {video?.likes > 0 && <Metric icon={Heart} value={formatNumber(video.likes)} label="лайков" />}
            {video?.comments > 0 && <Metric icon={MessageCircle} value={formatNumber(video.comments)} label="комментариев" />}
            {video?.duration > 0 && <Metric icon={Clock} value={`${video.duration}с`} label="длина" />}
          </div>
        </div>
      </div>

      {/* Analyzing placeholder */}
      {isAnalyzing && (
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid rgba(229,224,0,0.2)',
          borderRadius: 12, padding: 40, textAlign: 'center', marginBottom: 20,
        }}>
          <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)', marginBottom: 16 }} />
          <p style={{ fontWeight: 600, marginBottom: 6 }}>Анализирую видео...</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Транскрипция → AI-анализ структуры → генерация хуков → описание к рилсу
          </p>
        </div>
      )}

      {/* Content (shown after analysis) */}
      {!isAnalyzing && (
        <>
          {/* Key insights row */}
          {analysis.hook && (
            <div style={{
              background: 'rgba(229,224,0,0.06)', border: '1px solid rgba(229,224,0,0.2)',
              borderRadius: 10, padding: '12px 16px', marginBottom: 20,
            }}>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Почему вирусное
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{analysis.hook}</p>
              {analysis.key_insight && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{analysis.key_insight}</p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {(analysis.why_viral || []).slice(0, 3).map((r, i) => (
                  <span key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: 'var(--bg-secondary)', borderRadius: 8, padding: 3, border: '1px solid var(--border)', width: 'fit-content' }}>
            {[
              { key: 'script', label: 'Сценарий' },
              { key: 'hooks', label: `Хуки (${hooks.length || 5})` },
              { key: 'description', label: 'Описание к рилсу' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{
                  padding: '6px 16px', borderRadius: 6, border: 'none',
                  background: activeTab === key ? 'var(--bg-primary)' : 'transparent',
                  color: activeTab === key ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: 13, fontWeight: activeTab === key ? 600 : 400,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab: Script */}
          {activeTab === 'script' && (
            <div>
              {/* Structure timeline */}
              {analysis.structure?.length > 0 && (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Структура видео
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {analysis.structure.map((step, i) => (
                      <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, minWidth: 36, fontFamily: 'var(--font-mono)' }}>
                          {step.second !== undefined ? `${step.second}с` : `${i + 1}.`}
                        </span>
                        <div>
                          <span style={{ fontSize: 13 }}>{step.element || step.text}</span>
                          {step.technique && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>— {step.technique}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Teleprompter */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Сценарий для телесуфлёра</span>
                  <CopyButton text={displayScript} />
                </div>
                <textarea
                  value={displayScript}
                  onChange={(e) => setScriptText(e.target.value)}
                  style={{
                    width: '100%', minHeight: 240, padding: 16,
                    background: 'transparent', border: 'none', outline: 'none',
                    color: 'var(--text-primary)', fontSize: 15, lineHeight: 1.8,
                    resize: 'vertical', fontFamily: 'var(--font-display)',
                    boxSizing: 'border-box',
                  }}
                  placeholder="Сценарий появится после анализа..."
                />
              </div>

              {/* Improvement bar */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Улучшить сценарий
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {IMPROVE_ACTIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => handleImprove(key)}
                      disabled={improveMutation.isPending || !displayScript}
                      style={{
                        padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)',
                        background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
                        fontSize: 12, cursor: 'pointer', opacity: improveMutation.isPending ? 0.5 : 1,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <form onSubmit={handleChat} style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Напишите, что изменить..."
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)', fontSize: 13,
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || improveMutation.isPending}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: chatInput.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
                      color: chatInput.trim() ? '#000' : 'var(--text-muted)',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {improveMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ChevronRight size={13} />}
                    Изменить
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Tab: Hooks */}
          {activeTab === 'hooks' && (
            <div>
              {hooks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
                  <p>Генерирую хуки...</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {hooks.map((hook, i) => {
                    const ratingStyle = RATING_COLORS[hook.rating] || RATING_COLORS['Альтернатива']
                    const isSelected = selectedHook === i
                    return (
                      <div
                        key={i}
                        onClick={() => setSelectedHook(isSelected ? null : i)}
                        style={{
                          background: 'var(--bg-secondary)',
                          border: `1px solid ${isSelected ? 'rgba(229,224,0,0.4)' : 'var(--border)'}`,
                          borderRadius: 12, padding: 18, cursor: 'pointer',
                          transition: 'border-color 0.2s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>#{hook.number || i + 1}</span>
                            <span style={{
                              fontSize: 11, padding: '2px 8px', borderRadius: 4,
                              fontWeight: 700, ...ratingStyle,
                            }}>
                              {hook.rating}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4 }}>
                              {hook.technique}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hook.timing}</span>
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
                          «{hook.text}»
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>
                          {hook.mechanism}
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setScriptText(hook.text + '\n\n' + displayScript); setActiveTab('script') }}
                            style={{
                              padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)',
                              background: isSelected ? 'var(--accent)' : 'var(--bg-tertiary)',
                              color: isSelected ? '#000' : 'var(--text-secondary)',
                              fontSize: 12, cursor: 'pointer', fontWeight: isSelected ? 700 : 400,
                            }}
                          >
                            {isSelected ? '✓ Используется' : 'Использовать'}
                          </button>
                          <CopyButton text={hook.text} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab: Reel description */}
          {activeTab === 'description' && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Описание к рилсу</span>
                {video?.reel_description && <CopyButton text={video.reel_description + '\n\n' + (analysis.reel_hashtags || []).join(' ')} />}
              </div>
              {video?.reel_description ? (
                <div style={{ padding: 16 }}>
                  <p style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 16 }}>{video.reel_description}</p>
                  {analysis.reel_hashtags && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {analysis.reel_hashtags.map((tag, i) => (
                        <span key={i} style={{ fontSize: 12, color: 'var(--accent)', background: 'rgba(229,224,0,0.08)', padding: '3px 8px', borderRadius: 4 }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
                  <p>Описание генерируется...</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function Metric({ icon: Icon, value, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <Icon size={13} color="var(--text-muted)" />
      <span style={{ fontSize: 13, fontWeight: 600 }}>{value}</span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}
