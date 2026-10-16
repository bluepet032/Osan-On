import { useEffect, useRef, useState } from 'react'
import { advancedCoverage, EMPTY_ADVANCED, type AdvancedFilters, type AdvancedKey } from '../advancedFilters'
import { DOMAIN_LABELS, DOMAINS, JURISDICTION_LABELS, QUICK_TAGS, TYPE_LABELS, TYPES } from '../constants'
import { matchesOpportunity, type OpportunityFilters } from '../filtering'
import type { Domain, Opportunity, OpportunityType } from '../types'
import { AdvancedFilterPanel } from './AdvancedFilterPanel'

interface Props extends OpportunityFilters {
  items: Opportunity[]
  domain: string
  type: string
  quick: string
  search: string
  field: string
  status: string
  place?: string
  advanced?: AdvancedFilters
  onChange: (key: string, value: string) => void
  onChangeMany?: (changes: Record<string, string>) => void
}

export function Filters(props: Props) {
  const [draftSearch, setDraftSearch] = useState(props.search)
  const composing = useRef(false)

  useEffect(() => {
    if (!composing.current) setDraftSearch(props.search)
  }, [props.search])

  const filterValues: OpportunityFilters = {
    domain: props.domain, type: props.type, quick: props.quick, search: props.search, field: props.field, status: props.status,
    place: props.place, advanced: props.advanced,
  }
  const advanced = props.advanced ?? EMPTY_ADVANCED
  const countWith = (key: AdvancedKey, value: string) =>
    props.items.filter(item => matchesOpportunity(item, { ...filterValues, advanced: { ...advanced, [key]: value } })).length
  // Coverage is measured on what the other (non-detail) filters leave, so it describes the current view.
  const coverage = advancedCoverage(props.items.filter(item => matchesOpportunity(item, { ...filterValues, advanced: undefined })))
  const placeCount = (place: string) => props.items.filter(item => matchesOpportunity(item, { ...filterValues, place })).length
  const place = props.place || 'all'
  const domainCount = (domain: Domain | 'all') => props.items.filter(item => matchesOpportunity(item, { ...filterValues, domain })).length
  const counts = (type: OpportunityType | 'all') => props.items.filter(item => matchesOpportunity(item, { ...filterValues, type })).length
  const tagCount = (quick: string) => props.items.filter(item => matchesOpportunity(item, { ...filterValues, quick })).length
  // Detail tags differ by field tab, so only offer the ones present in the selected tab.
  const fields = [...new Set(props.items.filter(item => matchesOpportunity(item, { ...filterValues, type: 'all', quick: '', search: '', field: '', status: '', advanced: undefined })).flatMap(item => item.field_tags))].sort()
  return (
    <section className="filter-panel" aria-label="혜택 검색과 필터">
      <div className="place-tabs" role="group" aria-label="소관">
        {(['all', ...Object.keys(JURISDICTION_LABELS)]).map(value => <button key={value} className={place === value ? 'active' : ''} aria-pressed={place === value} onClick={() => props.onChange('place', value === 'all' ? '' : value)}>{value === 'all' ? '전체 소관' : JURISDICTION_LABELS[value as keyof typeof JURISDICTION_LABELS]} <span>{placeCount(value)}</span></button>)}
      </div>
      <div className="domain-tabs" role="group" aria-label="분야">
        <button className={props.domain === 'all' ? 'active' : ''} aria-pressed={props.domain === 'all'} onClick={() => props.onChange('domain', 'all')}>모든 분야 <span>{domainCount('all')}</span></button>
        {DOMAINS.map(domain => <button key={domain} className={props.domain === domain ? 'active' : ''} aria-pressed={props.domain === domain} onClick={() => props.onChange('domain', domain)}>{DOMAIN_LABELS[domain]} <span>{domainCount(domain)}</span></button>)}
      </div>
      <div className="type-tabs" role="group" aria-label="지원 형태">
        <button className={props.type === 'all' ? 'active' : ''} onClick={() => props.onChange('type', 'all')}>전체 <span>{counts('all')}</span></button>
        {TYPES.map(type => <button key={type} className={props.type === type ? `active type-${type}` : ''} onClick={() => props.onChange('type', type)}>{TYPE_LABELS[type]} <span>{counts(type)}</span></button>)}
      </div>
      <div className="quick-tags" role="group" aria-label="빠른 필터">
        {QUICK_TAGS.map(tag => <button key={tag} className={props.quick === tag ? 'active' : ''} onClick={() => props.onChange('quick', props.quick === tag ? '' : tag)}>{tag} <span>{tagCount(tag)}</span></button>)}
      </div>
      <div className="search-row">
        <label className="search-box"><span className="sr-only">통합 검색</span><input
          value={draftSearch}
          onCompositionStart={() => { composing.current = true }}
          onCompositionEnd={event => {
            composing.current = false
            setDraftSearch(event.currentTarget.value)
            props.onChange('q', event.currentTarget.value)
          }}
          onChange={event => {
            setDraftSearch(event.target.value)
            if (!composing.current) props.onChange('q', event.target.value)
          }}
          placeholder="혜택명, 기관, 분야 검색 (초성 가능)"
        /></label>
        <select value={props.field} onChange={event => props.onChange('field', event.target.value)} aria-label="세부 분야"><option value="">모든 세부 분야</option>{fields.map(field => <option key={field}>{field}</option>)}</select>
        <select value={props.status} onChange={event => props.onChange('status', event.target.value)} aria-label="접수 상태"><option value="">모든 상태</option><option value="upcoming">접수예정</option><option value="open">접수중</option><option value="urgent">긴급</option><option value="today">오늘마감</option><option value="ongoing">상시</option><option value="closed">마감</option><option value="unknown">기간 미정</option></select>
      </div>
      <AdvancedFilterPanel advanced={advanced} countWith={countWith} coverage={coverage} onChange={props.onChange}
        onChangeMany={props.onChangeMany ?? (changes => Object.entries(changes).forEach(([key, value]) => props.onChange(key, value)))} />
    </section>
  )
}
