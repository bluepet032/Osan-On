import { domainOf } from './constants'
import { kstDate } from './personalLogic'
import type { Domain, Opportunity } from './types'

const DAY_MS = 86_400_000

const dayNumber = (value: string) => Math.floor(Date.parse(`${value.slice(0, 10)}T00:00:00Z`) / DAY_MS)
const isoDay = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10)

export interface WeekRange { start: string; end: string }

/** Monday-to-Sunday weeks in KST, as used by the weekly digest. */
export function weekRanges(today = kstDate()): { thisWeek: WeekRange; nextWeek: WeekRange } {
  const day = dayNumber(today)
  // 1970-01-01 was a Thursday, so (day + 3) % 7 is 0 on Mondays.
  const monday = day - ((day + 3) % 7)
  return {
    thisWeek: { start: isoDay(monday), end: isoDay(monday + 6) },
    nextWeek: { start: isoDay(monday + 7), end: isoDay(monday + 13) },
  }
}

const endsWithin = (item: Opportunity, range: WeekRange, from: string) =>
  item.date_kind === 'exact' && !!item.recruit_end && item.recruit_end >= from && item.recruit_end >= range.start && item.recruit_end <= range.end

const byDeadline = (left: Opportunity, right: Opportunity) => (left.recruit_end ?? '').localeCompare(right.recruit_end ?? '') || left.title.localeCompare(right.title)

export interface WeeklyDigest {
  thisWeek: WeekRange
  nextWeek: WeekRange
  closingThisWeek: Opportunity[]
  closingNextWeek: Opportunity[]
  newThisWeek: Opportunity[]
}

/** Group open items for the digest. ``domain`` 'all' keeps every field tab. */
export function weeklyDigest(items: Opportunity[], domain: Domain | 'all', now = new Date()): WeeklyDigest {
  const today = kstDate(now)
  const { thisWeek, nextWeek } = weekRanges(today)
  const pool = items.filter(item => !item.is_adjacent && (domain === 'all' || domainOf(item) === domain))
  const since = now.getTime() - 7 * DAY_MS
  return {
    thisWeek,
    nextWeek,
    closingThisWeek: pool.filter(item => endsWithin(item, thisWeek, today)).sort(byDeadline),
    closingNextWeek: pool.filter(item => endsWithin(item, nextWeek, today)).sort(byDeadline),
    newThisWeek: pool.filter(item => Date.parse(item.first_seen_at) >= since)
      .sort((left, right) => Date.parse(right.first_seen_at) - Date.parse(left.first_seen_at)),
  }
}
