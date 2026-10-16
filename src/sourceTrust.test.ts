import { describe, expect, it } from 'vitest'
import { isOfficialSource, sourceTrust } from './sourceTrust'
import type { Opportunity } from './types'

const source = (source_id: string, kind: string, url: string) => ({ source_id, source_name: source_id, source_url: url, kind, priority: 40 })
const item = (sources: ReturnType<typeof source>[], source_url = sources[0].source_url) => ({ sources, source_url }) as Opportunity

describe('sourceTrust', () => {
  it('labels the source behind the main link', () => {
    const merged = item([source('nipa', 'official', 'https://nipa.kr/1'), source('wevity', 'aggregate', 'https://wevity.com/1')])
    expect(sourceTrust(merged)).toMatchObject({ kind: 'official', label: '공식기관', sourceCount: 2 })
    expect(isOfficialSource(merged)).toBe(true)
  })

  it('treats unknown kinds as a re-posting site', () => {
    const odd = item([source('x', 'mystery', 'https://x.example/1')])
    expect(sourceTrust(odd)).toMatchObject({ kind: 'aggregate', label: '모음 사이트', sourceCount: 1 })
    expect(isOfficialSource(odd)).toBe(false)
  })
})
