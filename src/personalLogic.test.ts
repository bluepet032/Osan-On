import { describe, expect, it } from 'vitest'
import { dueReminders, isNewKeywordMatch, kstDate, matchesPersonalKeyword } from './personalLogic'
import type { Opportunity } from './types'

const item = {
  id: 'sample',
  title: 'AI 인디게임 공모전',
  source_name: '테스트 출처',
  source_url: 'https://example.com',
  organizer: '게임재단',
  summary: '대학생 개발자를 위한 공모전',
  primary_type: 'contest',
  field_tags: ['AI', '인디'],
  audience_tags: ['대학생'],
  status: 'open',
  relevance: { score: 80, reasons: [], decision: 'publish' },
  first_seen_at: '2026-10-01T00:00:00+09:00',
  last_seen_at: '2026-10-01T00:00:00+09:00',
  sources: [],
  date_kind: 'exact',
  recruit_end: '2026-10-10',
} satisfies Opportunity

describe('personal opportunity rules', () => {
  it('creates deadline reminders at D-7, D-3, D-1 and D-day', () => {
    const days = ['2026-10-03', '2026-10-07', '2026-10-09', '2026-10-10']
    const expected = [[7], [7, 3], [7, 3, 1], [7, 3, 1, 0]]
    days.forEach((today, index) => {
      expect(dueReminders(item, today).map(reminder => reminder.daysBefore)).toEqual(expected[index])
    })
  })

  it('catches missed thresholds while the milestone is still upcoming', () => {
    expect(dueReminders(item, '2026-10-08').map(reminder => reminder.daysBefore)).toEqual([7, 3])
    expect(dueReminders(item, '2026-10-11')).toEqual([])
  })

  it('alerts event and result milestones on D-1 and D-day', () => {
    const withOtherDates = { ...item, event_start: '2026-10-12', event_end: null }
    expect(dueReminders(withOtherDates, '2026-10-11', '2026-10-12').map(reminder => [reminder.milestone, reminder.daysBefore]))
      .toEqual([['행사 시작', 1], ['합격 발표', 1]])
  })

  it('ignores an uncertain recruitment deadline but accepts exact event dates', () => {
    const uncertain = { ...item, date_kind: 'unknown', event_start: '2026-10-12' } satisfies Opportunity
    expect(dueReminders(uncertain, '2026-10-11').map(reminder => reminder.milestone)).toEqual(['행사 시작'])
  })

  it('uses Korea calendar dates when the browser clock crosses midnight', () => {
    expect(kstDate(new Date('2026-10-02T14:59:59.999Z'))).toBe('2026-10-02')
    expect(kstDate(new Date('2026-10-02T15:00:00.000Z'))).toBe('2026-10-03')
  })

  it('matches a keyword against any supported field without case sensitivity', () => {
    expect(matchesPersonalKeyword(item, '게임')).toBe(true)
    expect(matchesPersonalKeyword(item, '대학생')).toBe(true)
    expect(matchesPersonalKeyword(item, '미디어')).toBe(false)
  })

  it('alerts only when the opportunity was first collected after the keyword was saved', () => {
    const savedAt = '2026-10-01T00:00:00+09:00'
    expect(isNewKeywordMatch(item, '게임', savedAt)).toBe(false)
    expect(isNewKeywordMatch({ ...item, first_seen_at: '2026-10-02T00:00:00+09:00' }, '게임', savedAt)).toBe(true)
  })
})
