import { formatDistanceToNow, format } from 'date-fns'
import { ru } from 'date-fns/locale'

/**
 * Format large numbers: 1234567 → "1.2M", 12345 → "12.3K"
 */
export function formatNumber(n) {
  if (n === null || n === undefined) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/**
 * Format seconds → "1:23" or "12:34"
 */
export function formatDuration(seconds) {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Relative time: "2 дня назад"
 */
export function timeAgo(dateStr) {
  if (!dateStr) return ''
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ru })
  } catch {
    return ''
  }
}

/**
 * Absolute date: "12 апр 2024"
 */
export function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    return format(new Date(dateStr), 'd MMM yyyy', { locale: ru })
  } catch {
    return ''
  }
}

/**
 * X-factor colour class
 */
export function xfactorColor(xf) {
  if (xf >= 10) return 'text-red-400'
  if (xf >= 5) return 'text-amber-400'
  return 'text-gray-500'
}

export function xfactorBg(xf) {
  if (xf >= 10) return 'bg-red-500/20 text-red-400 border-red-500/30'
  if (xf >= 5) return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
  return 'bg-white/5 text-gray-500 border-white/10'
}

/**
 * Platform display info
 */
const PLATFORM_META = {
  youtube: { label: 'YouTube', color: '#ff0000' },
  instagram: { label: 'Instagram', color: '#e1306c' },
  tiktok: { label: 'TikTok', color: '#69c9d0' },
  vk: { label: 'VK', color: '#0077ff' },
}

export function getPlatformMeta(platform) {
  return PLATFORM_META[platform?.toLowerCase()] || { label: platform, color: '#888' }
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Export script as .txt file
 */
export function exportScriptTxt(script) {
  const parts = []
  if (script.title) parts.push(`# ${script.title}\n`)
  if (script.hook) parts.push(`ХУКK:\n${script.hook}\n`)
  if (script.hook_visual) parts.push(`Визуал хука: ${script.hook_visual}\n`)

  if (script.structure?.length) {
    parts.push('\nСЦЕНЫ:')
    script.structure.forEach((scene, i) => {
      parts.push(`\n[${scene.time || i + 1}]`)
      if (scene.text) parts.push(`Текст: ${scene.text}`)
      if (scene.visual) parts.push(`Визуал: ${scene.visual}`)
      if (scene.technique) parts.push(`Техника: ${scene.technique}`)
    })
  }

  if (script.full_text) parts.push(`\nПОЛНЫЙ ТЕКСТ:\n${script.full_text}`)
  if (script.shooting_tips) parts.push(`\nСОВЕТЫ ПО СЪЁМКЕ:\n${script.shooting_tips}`)
  if (script.hashtags?.length) parts.push(`\nХЕШТЕГИ:\n${script.hashtags.join(' ')}`)

  const blob = new Blob([parts.join('\n')], { type: 'text/plain; charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${script.title || 'script'}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
