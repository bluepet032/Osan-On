import type { Opportunity } from './types'

export interface Reminder {
  milestone: '모집 마감' | '행사 시작' | '행사 종료' | '합격 발표'
  date: string
  daysBefore: number
}

function dateOrdinal(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return Math.floor(date.getTime() / 86_400_000)
}

function addReminders(reminders: Reminder[], milestone: Reminder['milestone'], date: string | null | undefined, today: string, thresholds: number[]) {
  if (!date) return
  const targetDay = dateOrdinal(date)
  const todayDay = dateOrdinal(today)
  if (targetDay === null || todayDay === null) return
  const daysLeft = targetDay - todayDay
  if (daysLeft < 0) return
  for (const daysBefore of thresholds) {
    if (daysLeft <= daysBefore) reminders.push({ milestone, date, daysBefore })
  }
}

export function dueReminders(item: Opportunity, today: string, resultDate?: string | null): Reminder[] {
  const reminders: Reminder[] = []
  if (item.date_kind === 'exact') addReminders(reminders, '모집 마감', item.recruit_end, today, [7, 3, 1, 0])
  addReminders(reminders, '행사 시작', item.event_start, today, [1, 0])
  addReminders(reminders, '행사 종료', item.event_end, today, [1, 0])
  addReminders(reminders, '합격 발표', resultDate, today, [1, 0])
  return reminders
}

export function kstDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find(value => value.type === type)?.value || ''
  return part('year') + '-' + part('month') + '-' + part('day')
}

export function matchesPersonalKeyword(item: Opportunity, keyword: string): boolean {
  const term = keyword.trim().toLocaleLowerCase('ko-KR')
  if (!term) return false
  const haystack = [item.title, item.organizer, item.summary, item.source_name, ...item.field_tags, ...item.audience_tags]
    .join(' ')
    .toLocaleLowerCase('ko-KR')
  return haystack.includes(term)
}

export function isNewKeywordMatch(item: Opportunity, keyword: string, savedAt: string): boolean {
  const firstSeen = Date.parse(item.first_seen_at)
  const saved = Date.parse(savedAt)
  return Number.isFinite(firstSeen) && Number.isFinite(saved) && firstSeen > saved && matchesPersonalKeyword(item, keyword)
}
