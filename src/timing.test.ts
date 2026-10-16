import { describe, expect, it } from 'vitest'
import { liveTiming } from './timing'
import type { Opportunity } from './types'

const item = (overrides: Partial<Opportunity>) => ({
  date_kind: 'exact', recruit_start: '2026-10-01', recruit_end: '2026-10-10', status: 'open', d_day: 99,
  ...overrides,
}) as Opportunity

describe('liveTiming', () => {
  it('recomputes a stale D-day from the recruit end date', () => {
    expect(liveTiming(item({}), '2026-10-06')).toEqual({ status: 'open', d_day: 4 })
    expect(liveTiming(item({}), '2026-10-07')).toEqual({ status: 'urgent', d_day: 3 })
    expect(liveTiming(item({}), '2026-10-10')).toEqual({ status: 'today', d_day: 0 })
  })

  it('marks items closed once the deadline has passed even if the JSON says open', () => {
    expect(liveTiming(item({ status: 'open', d_day: 2 }), '2026-10-11')).toEqual({ status: 'closed', d_day: -1 })
  })

  it('keeps upcoming, ongoing and undated items consistent with the pipeline', () => {
    expect(liveTiming(item({}), '2026-09-30')).toEqual({ status: 'upcoming', d_day: 10 })
    expect(liveTiming(item({ date_kind: 'ongoing' }), '2026-10-06')).toEqual({ status: 'ongoing', d_day: null })
    expect(liveTiming(item({ date_kind: 'unknown', recruit_end: null }), '2026-10-06')).toEqual({ status: 'unknown', d_day: null })
  })

  it('marks a passed deadline closed even when the start date is later', () => {
    expect(liveTiming(item({ recruit_start: '2026-10-06', recruit_end: '2026-06-20' }), '2026-09-07')).toEqual({ status: 'closed', d_day: -79 })
  })

  it('counts calendar days across month and year boundaries', () => {
    expect(liveTiming(item({ recruit_start: null, recruit_end: '2027-01-02' }), '2026-12-30').d_day).toBe(3)
  })
})
