import { isOfficialSource } from './sourceTrust'
import type { Opportunity } from './types'

const HOUR = 60 * 60 * 1000

// Browsers that block site data throw on any localStorage access; the site must work without saving.
export function readStorage(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
export function writeStorage(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* not saved in this browser */ }
}

export const isNew = (item: Opportunity, now = Date.now()) => now - new Date(item.first_seen_at).getTime() <= 72 * HOUR
export const isUpdated = (item: Opportunity, now = Date.now()) => Boolean(item.last_changed_at) && now - new Date(item.last_changed_at!).getTime() <= 48 * HOUR
export const isDeadlineSoon = (item: Opportunity) => item.d_day != null && item.d_day >= 0 && item.d_day <= 7

export function dDayLabel(item: Opportunity) {
  if (item.status === 'ongoing') return '상시'
  if (item.status === 'unknown') return '미정'
  if (item.status === 'today') return 'D-DAY'
  if (item.d_day == null) return '—'
  return item.d_day < 0 ? `D+${Math.abs(item.d_day)}` : `D-${item.d_day}`
}

export function formatDate(value?: string | null) {
  if (!value) return '미정'
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(`${value.slice(0, 10)}T00:00:00+09:00`))
}

export function matchesQuickTag(item: Opportunity, tag: string) {
  if (tag === 'NEW') return isNew(item)
  if (tag === 'UPDATED') return isUpdated(item)
  if (tag === '마감임박') return isDeadlineSoon(item)
  if (tag === '공식 출처') return isOfficialSource(item)
  return item.field_tags.includes(tag) || item.audience_tags.includes(tag)
}

