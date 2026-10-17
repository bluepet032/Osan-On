import { describe, expect, it } from 'vitest'
import { reportDocument, reportFromDocument } from './reports'
import type { Opportunity } from './types'

const item = { id: 'gov24-1', title: '경기청년 사다리', source_url: 'https://www.gov.kr/1' } as Opportunity

describe('error reports', () => {
  it('builds the document the security rules accept', () => {
    // createdAt is the server timestamp sentinel, so a client cannot pick its place in the admin's list.
    const data = reportDocument(item, 'period', '  마감이 11월로 바뀌었어요 ', 'u1', 'SERVER_TIME')
    expect(data).toEqual({ opportunityId: 'gov24-1', title: '경기청년 사다리', sourceUrl: 'https://www.gov.kr/1', reason: 'period', note: '마감이 11월로 바뀌었어요', uid: 'u1', createdAt: 'SERVER_TIME' })
    expect(reportDocument(item, 'other', 'x'.repeat(600), 'u1', 'SERVER_TIME').note).toHaveLength(500)
  })

  it('reads stored reports and skips malformed ones', () => {
    const stored = { ...reportDocument(item, 'link', '', 'u1', { toDate: () => new Date('2026-10-17T01:00:00Z') }) }
    expect(reportFromDocument('r1', stored)).toMatchObject({ id: 'r1', reason: 'link', title: '경기청년 사다리', createdAt: '2026-10-17T01:00:00.000Z' })
    expect(reportFromDocument('r2', { ...stored, reason: 'spam' })).toBeNull()
  })
})
