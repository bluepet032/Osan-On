import { describe, expect, it } from 'vitest'
import { buildIndex, matchesSearch, searchTerms, toChoseong, toJamo, withinOneEdit } from './search'

const index = buildIndex(['2026 인디 게임잼 참가자 모집', '게임재단', 'AI 해커톤과 웹툰 제작 지원', '대학생'])
const find = (query: string, fuzzy = false) => matchesSearch(index, searchTerms(query), fuzzy)

describe('search', () => {
  it('decomposes Hangul for initial-consonant and typo matching', () => {
    expect(toChoseong('게임 Jam')).toBe('ㄱㅇ Jam')
    expect(toJamo('게임')).toBe('ㄱㅔㅇㅣㅁ')
  })

  it('finds items by 초성', () => {
    expect(find('ㄱㅇㅈ')).toBe(true)
    expect(find('ㅎㅋㅌ')).toBe(true)
    expect(find('ㅂㄹㄱ')).toBe(false)
  })

  it('treats synonyms as the same word', () => {
    expect(find('game jam')).toBe(true)
    expect(find('hackathon')).toBe(true)
    expect(find('인공지능')).toBe(true)
    expect(find('webtoon')).toBe(true)
  })

  it('matches short English synonyms only as whole words', () => {
    const other = buildIndex(['Startup Award 2026 아트 공모'])
    expect(matchesSearch(other, searchTerms('증강현실'))).toBe(false)
  })

  it('tolerates one typo only in fuzzy mode and only for longer words', () => {
    expect(find('개임잼')).toBe(false)
    expect(find('개임잼', true)).toBe(true)
    expect(find('해카톤', true)).toBe(true)
    expect(find('개임', true)).toBe(true)
    expect(find('가구', true)).toBe(false)
  })

  it('requires every term to match', () => {
    expect(find('게임 대학생')).toBe(true)
    expect(find('게임 의료')).toBe(false)
  })

  it('checks a single edit in linear time', () => {
    expect(withinOneEdit('abc', 'abd')).toBe(true)
    expect(withinOneEdit('abc', 'ab')).toBe(true)
    expect(withinOneEdit('abc', 'axd')).toBe(false)
  })
})
