import { describe, expect, it } from 'vitest'
import { favoritesCalendar } from './calendar'
import type { SavedOpportunity } from './personal'
import type { Opportunity } from './types'

const saved = (item: Partial<Opportunity>, resultDate = ''): SavedOpportunity => ({
  id: item.id ?? 'notice-1', remindersEnabled: true, resultDate, note: '',
  item: { id: 'notice-1', title: '게임 공모전', organizer: '게임재단', source_url: 'https://example.com/1', date_kind: 'exact', ...item } as Opportunity,
})
const NOW = new Date('2026-10-15T01:02:03Z')
// Unfolded content lines, so assertions do not depend on where long lines wrap.
const lines = (text: string) => text.replace(/\r\n /g, '').split('\r\n')

describe('favoritesCalendar', () => {
  it('turns deadlines, event periods and result dates into all-day events', () => {
    const text = favoritesCalendar([saved({ recruit_end: '2026-10-30', event_start: '2026-11-03', event_end: '2026-11-04' }, '2026-11-20')], NOW)
    const content = lines(text)
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(content).toContain('SUMMARY:[마감] 게임 공모전')
    expect(content).toContain('DTSTART;VALUE=DATE:20261030')
    expect(content).toContain('DTEND;VALUE=DATE:20261031')
    expect(content).toContain('DTSTART;VALUE=DATE:20261103')
    expect(content).toContain('DTEND;VALUE=DATE:20261105')
    expect(content).toContain('SUMMARY:[발표] 게임 공모전')
    expect(content).toContain('DTSTAMP:20261015T010203Z')
    expect(content.filter(line => line === 'BEGIN:VEVENT')).toHaveLength(3)
    expect(new Set(content.filter(line => line.startsWith('UID:'))).size).toBe(3)
  })

  it('escapes text and folds long lines without splitting characters', () => {
    const title = String.raw`제1회 AI, 게임; 콘텐츠\공모전 `.repeat(4)
    const escaped = String.raw`제1회 AI\, 게임\; 콘텐츠\\공모전 `.repeat(4)
    const text = favoritesCalendar([saved({ title, recruit_end: '2026-10-30' })], NOW)
    expect(lines(text)).toContain(`SUMMARY:[마감] ${escaped}`)
    for (const line of text.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
  })

  it('leaves out dates that are not fixed', () => {
    const text = favoritesCalendar([saved({ date_kind: 'ongoing', recruit_end: '2026-10-30' }), saved({ id: 'n2', recruit_end: '미정' })], NOW)
    expect(text).not.toContain('BEGIN:VEVENT')
  })
})
