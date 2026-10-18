import { describe, expect, it } from 'vitest'
import { askAssistant, questionTerms, type AssistantContext } from './assistant'
import { matchesOpportunity } from './filtering'
import type { Opportunity } from './types'

const benefit = (id: string, title: string, jurisdiction: 'osan' | 'gyeonggi' | 'national', extra: Partial<Opportunity> = {}) => ({
  id, title, organizer: '기관', summary: '', source_name: '정부24', source_url: `https://www.gov.kr/${id}`,
  field_tags: [], audience_tags: [], jurisdiction, status: 'ongoing', date_kind: 'ongoing', ...extra,
}) as unknown as Opportunity

const items = [
  benefit('national-rent', '청년월세 특별지원', 'national'),
  benefit('osan-rent', '오산시 청년 주택임차 보증금 대출이자 지원', 'osan', { summary: '청년 월세·임차 부담을 덜어 드립니다' }),
  benefit('osan-birth', '오산시 출산지원금', 'osan'),
  benefit('senior', '노인 일자리 지원', 'gyeonggi'),
]
const context = (verdicts: Record<string, 'eligible' | 'check' | 'ineligible'> = {}, profile = {}): AssistantContext =>
  ({ items, profile, verdictOf: item => verdicts[item.id] })

describe('questionTerms', () => {
  it('keeps the subject words and drops request words and particles', () => {
    expect(questionTerms('청년 월세 지원 알려줘')).toEqual(['청년', '월세'])
    expect(questionTerms('출산하면 받을 수 있는 혜택이 뭐예요?')).toEqual(['출산'])
  })
})

describe('askAssistant', () => {
  it('finds benefits for the question, Osan and likely ones first', async () => {
    const reply = await askAssistant('청년 월세 지원 알려줘', context({ 'national-rent': 'eligible' }))
    expect(reply.items.map(item => item.id)).toEqual(['osan-rent', 'national-rent'])
    expect(reply.text).toContain('2개')
    expect(reply.query).toBe('청년 월세')
  })

  it('ranks a title match above a passing mention in the summary', async () => {
    const withMention = [...items, benefit('savings', '경기도 청년 노동자 통장', 'gyeonggi', { summary: '청년의 주거 안정과 자산 형성' })]
    const reply = await askAssistant('청년 월세', { ...context(), items: withMention })
    expect(reply.items.map(item => item.id)).toEqual(['osan-rent', 'national-rent'])
  })

  it('hands the list a search it understands, so "더 찾아보기" is never empty', async () => {
    const reply = await askAssistant('아기 낳으면 받는 돈', context())
    expect(reply.query).toBe('출산')
    expect(items.filter(item => matchesOpportunity(item, { domain: 'all', type: 'all', quick: '', status: '', search: reply.query! })).map(item => item.id)).toEqual(['osan-birth'])
    expect((await askAssistant('어르신 혜택', context())).query).toBe('노인')
  })

  it('understands everyday words for the same thing', async () => {
    expect((await askAssistant('어르신 혜택', context())).items.map(item => item.id)).toEqual(['senior'])
    expect((await askAssistant('아기 낳으면 받는 돈', context())).items.map(item => item.id)).toEqual(['osan-birth'])
  })

  it('keeps benefits the profile rules out but shows them last, as people ask for family too', async () => {
    const reply = await askAssistant('청년 월세', context({ 'osan-rent': 'ineligible' }))
    expect(reply.items.map(item => item.id)).toEqual(['national-rent', 'osan-rent'])
  })

  it('does not match on the department name alone', async () => {
    const withDepartment = [...items, benefit('child', '아동 재활치료비', 'osan', { organizer: '오산시 노인장애인과' })]
    expect((await askAssistant('어르신 혜택', { ...context(), items: withDepartment })).items.map(item => item.id)).toEqual(['senior'])
  })

  it('answers common questions without searching', async () => {
    const reply = await askAssistant('중위소득이 뭐예요?', context())
    expect(reply.text).toContain('중위소득')
    expect(reply.items).toEqual([])
  })

  it('recommends likely benefits from the saved answers', async () => {
    const reply = await askAssistant('나에게 맞는 혜택 추천해줘', context({ 'osan-birth': 'eligible', senior: 'eligible' }, { gender: 'female', age: 30 }))
    expect(reply.items.map(item => item.id)).toEqual(['osan-birth', 'senior'])
    const noProfile = await askAssistant('나에게 맞는 혜택 추천해줘', context())
    expect(noProfile.text).toContain('성별과 나이')
  })

  it('says so and suggests other words when nothing matches', async () => {
    const reply = await askAssistant('우주여행', context())
    expect(reply.items).toEqual([])
    expect(reply.text).toContain('찾지 못했어요')
  })
})
