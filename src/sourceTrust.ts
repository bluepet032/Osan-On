import type { Opportunity, SourceRecord } from './types'

export type SourceKind = 'official' | 'government' | 'specialist' | 'aggregate'

// `kind` comes from config/sources.yml. Manual YAML items are 'official' only when marked
// `is_official: true`.
export const SOURCE_KINDS: Record<SourceKind, { label: string; description: string }> = {
  official: { label: '공식기관', description: '주최·운영 기관이 직접 올린 공고입니다.' },
  government: { label: '공공 포털', description: '정부·공공기관 공고를 모아 게시하는 공식 포털의 공고입니다.' },
  specialist: { label: '전문 플랫폼', description: '대회·행사 전문 플랫폼에 올라온 공고입니다.' },
  aggregate: { label: '모음 사이트', description: '여러 공고를 모아 다시 올린 사이트의 게시글입니다. 신청 전 주최기관 원문을 확인하세요.' },
}

export const kindOf = (source: Pick<SourceRecord, 'kind'>): SourceKind =>
  source.kind in SOURCE_KINDS ? source.kind as SourceKind : 'aggregate'

/** The source behind the item's main link; duplicates merge into the highest-priority source. */
export function representativeSource(item: Opportunity): SourceRecord | undefined {
  return item.sources.find(source => source.source_url === item.source_url) ?? item.sources[0]
}

export function sourceTrust(item: Opportunity) {
  const source = representativeSource(item)
  const kind = source ? kindOf(source) : 'aggregate'
  return { kind, ...SOURCE_KINDS[kind], sourceCount: new Set(item.sources.map(record => record.source_id)).size }
}

export const isOfficialSource = (item: Opportunity) => ['official', 'government'].includes(sourceTrust(item).kind)
