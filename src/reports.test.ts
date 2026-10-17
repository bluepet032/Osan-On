import { describe, expect, it } from 'vitest'
import { reportDocument, reportFromDocument } from './reports'
import type { Opportunity } from './types'

const item = { id: 'gov24-1', title: '경기청년 사다리', source_url: 'https://www.gov.kr/1' } as Opportunity

describe('error reports', () => {
  it('builds the document the security rules accept', () => {
    const data = reportDocument(item, 'period', '  마감이 11월로 바뀌었어요 ', 'u1')
    expect(data).toEqual({ opportunityId: 'gov24-1', title: '경기청년 사다리', sourceUrl: 'https://www.gov.kr/1', reason: 'period', note: '마감이 11월로 바뀌었어요', uid: 'u1', createdAt: expect.any(String) })
    expect(reportDocument(item, 'other', 'x'.repeat(600), 'u1').note).toHaveLength(500)
  })

  it('reads stored reports and skips malformed ones', () => {
    const stored = { ...reportDocument(item, 'link', '', 'u1') }
    expect(reportFromDocument('r1', stored)).toMatchObject({ id: 'r1', reason: 'link', title: '경기청년 사다리' })
    expect(reportFromDocument('r2', { ...stored, reason: 'spam' })).toBeNull()
  })
})
