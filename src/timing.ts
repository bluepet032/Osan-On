import { kstDate } from './personalLogic'
import type { Opportunity, OpportunityStatus } from './types'

const DAY_MS = 86_400_000

function dayNumber(value?: string | null): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '')
  if (!match) return null
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(time) ? null : Math.floor(time / DAY_MS)
}

/**
 * Recompute status and D-day for today in KST, matching `pipeline/dates.py:status_for`.
 * The JSON values are a snapshot from collection time and go stale if collection lags.
 */
export function liveTiming(item: Opportunity, today = kstDate()): Pick<Opportunity, 'status' | 'd_day'> {
  if (item.date_kind === 'ongoing') return { status: 'ongoing', d_day: null }
  const end = dayNumber(item.recruit_end)
  const now = dayNumber(today)
  if (end === null || now === null) return { status: 'unknown', d_day: null }
  const dDay = end - now
  const start = dayNumber(item.recruit_start)
  let status: OpportunityStatus
  // A passed deadline wins over a later start date, as in pipeline/dates.py.
  if (dDay < 0) status = 'closed'
  else if (start !== null && now < start) status = 'upcoming'
  else if (dDay === 0) status = 'today'
  else if (dDay <= 3) status = 'urgent'
  else status = 'open'
  return { status, d_day: dDay }
}

export const withLiveTiming = (item: Opportunity, today = kstDate()): Opportunity => ({ ...item, ...liveTiming(item, today) })
