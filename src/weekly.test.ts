import { describe, expect, it } from 'vitest'
import type { Opportunity } from './types'
import { weekRanges, weeklyDigest } from './weekly'

const item = (id: string, overrides: Partial<Opportunity>) => ({
  id, title: id, date_kind: 'exact', recruit_end: null, first_seen_at: '2026-09-01T09:00:00+09:00', is_adjacent: false, ...overrides,
}) as Opportunity

describe('weekly digest', () => {
  it('uses Monday-to-Sunday weeks in KST', () => {
    expect(weekRanges('2026-10-07')).toEqual({
      thisWeek: { start: '2026-10-05', end: '2026-10-11' },
      nextWeek: { start: '2026-10-12', end: '2026-10-18' },
    })
    expect(weekRanges('2026-10-11').thisWeek.start).toBe('2026-10-05')
    expect(weekRanges('2026-10-12').thisWeek.start).toBe('2026-10-12')
  })

  it('groups deadlines by week, skips past days and filters by field tab', () => {
    const now = new Date('2026-10-07T12:00:00+09:00')
    const digest = weeklyDigest([
      item('yesterday', { recruit_end: '2026-10-06' }),
      item('friday', { recruit_end: '2026-10-09' }),
      item('today', { recruit_end: '2026-10-07' }),
      item('next-week', { recruit_end: '2026-10-15' }),
      item('later', { recruit_end: '2026-10-30' }),
      item('video', { recruit_end: '2026-10-08', domain: 'design_media' }),
      item('rolling', { date_kind: 'ongoing', recruit_end: '2026-10-08' }),
      item('job', { recruit_end: '2026-10-08', is_adjacent: true }),
      item('fresh', { first_seen_at: '2026-10-05T03:00:00+09:00' }),
    ], 'it', now)

    expect(digest.closingThisWeek.map(entry => entry.id)).toEqual(['today', 'friday'])
    expect(digest.closingNextWeek.map(entry => entry.id)).toEqual(['next-week'])
    expect(digest.newThisWeek.map(entry => entry.id)).toEqual(['fresh'])
    expect(weeklyDigest([item('video', { recruit_end: '2026-10-08', domain: 'design_media' })], 'all', now).closingThisWeek).toHaveLength(1)
  })
})
