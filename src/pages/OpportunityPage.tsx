import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Filters } from '../components/Filters'
import { OpportunityRow } from '../components/OpportunityRow'
import { AUTO_REFRESH_LABEL, DEFAULT_DOMAIN, DOMAIN_LABELS, PAGE_SIZE, domainOf } from '../constants'
import { advancedVerdict, EMPTY_ADVANCED, readAdvanced } from '../advancedFilters'
import { clearDataCache, loadOpportunities } from '../data'
import { currentHashParams } from '../urlState'
import { compareOpportunities, matchesOpportunity, type Sort } from '../filtering'
import { usePersonalState } from '../personal'
import type { Domain, Opportunity } from '../types'
import { isDeadlineSoon, isNew, isUpdated } from '../utils'

type Dataset = 'active' | 'undated' | 'closed'

interface Props { dataset: Dataset; title: string; description: string }

export function OpportunityPage({ dataset, title, description }: Props) {
  const [payload, setPayload] = useState<{ generated: string; items: Opportunity[] }>({ generated: '', items: [] })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [params, setParams] = useSearchParams()
  const { state: personal, toggle, restoreHidden } = usePersonalState()

  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setPayload({ generated: '', items: [] })
    loadOpportunities(dataset)
      .then(data => {
        // Deadlines that passed since the last collection belong to the closed list, not the active one.
        const items = dataset === 'active' ? data.items.filter(item => item.status !== 'closed') : data.items
        if (active) setPayload({ generated: data.generated_at, items })
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '데이터를 불러오지 못했습니다') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [dataset, reloadKey])
  const reload = () => { clearDataCache(); setReloadKey(key => key + 1) }

  const value = (key: string, fallback = '') => params.get(key) || fallback
  const updateMany = (changes: Record<string, string>) => {
    // Start from the live URL, not this render's params (see urlState.ts).
    const copy = currentHashParams()
    for (const [key, next] of Object.entries(changes)) {
      if (next) copy.set(key, next); else copy.delete(key)
      if (key !== 'page') copy.delete('page')
      // Detail tags belong to one field tab, so a tag picked in another tab would hide everything.
      if (key === 'domain') copy.delete('field')
    }
    setParams(copy, { replace: true })
  }
  const update = (key: string, next: string) => updateMany({ [key]: next })
  const filters = {
    domain: value('domain', DEFAULT_DOMAIN), type: value('type', 'all'), advanced: readAdvanced(params), quick: value('quick'), search: value('q'), field: value('field'), status: value('status'),
    sort: value('sort', 'deadline') as Sort, page: Math.max(1, Number(value('page', '1')) || 1),
  }

  const hidden = new Set(personal.hidden)
  const exact = payload.items.filter(item => !hidden.has(item.id) && matchesOpportunity(item, filters))
  // Fall back to typo-tolerant search only when an exact search finds nothing at all.
  const fuzzy = exact.length === 0 && filters.search.trim() !== ''
  const visible = (() => {
    const matched = fuzzy ? payload.items.filter(item => !hidden.has(item.id) && matchesOpportunity(item, filters, { fuzzy: true })) : exact
    return matched.sort(compareOpportunities(filters.sort))
  })()

  // Items that pass every other condition but lack the information a detail filter asks for.
  const unknownHidden = filters.advanced.includeUnknown ? 0 : payload.items.filter(item =>
    !hidden.has(item.id)
    && matchesOpportunity(item, { ...filters, advanced: EMPTY_ADVANCED }, { fuzzy })
    && advancedVerdict(item, filters.advanced) === 'unknown').length
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const page = Math.min(filters.page, totalPages)
  const pageItems = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const filterItems = payload.items.filter(item => !personal.hidden.includes(item.id))
  const domainItems = filters.domain === 'all' ? payload.items : payload.items.filter(item => domainOf(item) === filters.domain)
  const freshness = domainItems.reduce((counts, item) => ({
    new: counts.new + Number(isNew(item)), updated: counts.updated + Number(isUpdated(item)), urgent: counts.urgent + Number(isDeadlineSoon(item)),
  }), { new: 0, updated: 0, urgent: 0 })

  return (
    <main id="main-content" className="container">
      <div className="page-heading">
        <div><p className="eyebrow">{filters.domain === 'all' ? '모든 분야' : DOMAIN_LABELS[filters.domain as Domain] ?? DOMAIN_LABELS.it} · OPPORTUNITIES</p><h1>{title}</h1><p>{description}</p></div>
        <div className="summary-cards" aria-label="공고 요약"><span><strong>{freshness.new}</strong> 신규</span><span><strong>{freshness.updated}</strong> 변경</span><span><strong>{freshness.urgent}</strong> 마감임박</span></div>
      </div>
      <Filters items={filterItems} {...filters} onChange={update} onChangeMany={updateMany} />
      {unknownHidden > 0 && <p className="search-hint" role="status">선택한 상세 조건의 정보가 없는 공고 {unknownHidden}건은 목록에서 빠져 있습니다. <button type="button" className="text-button" onClick={() => update('unknown', '1')}>함께 보기</button></p>}
      <div className="result-toolbar">
        <p><strong>{visible.length}개</strong> 공고 · {payload.generated ? `${new Date(payload.generated).toLocaleString('ko-KR')} 갱신` : '갱신 정보 없음'} · 자동 갱신 {AUTO_REFRESH_LABEL}<button type="button" className="text-button" onClick={reload} disabled={loading}>다시 불러오기</button> · <a href={`${import.meta.env.BASE_URL}data/${filters.domain === 'all' ? 'feed' : `feed-${filters.domain}`}.xml`} title="이 분야의 새 공고를 RSS로 구독">RSS</a></p>
        <label>정렬 <select aria-label="정렬" value={filters.sort} onChange={event => update('sort', event.target.value)}><option value="deadline">마감임박순</option><option value="newest">신규등록순</option><option value="updated">최근갱신순</option><option value="relevance">관련도순</option><option value="prize">상금순</option></select></label>
      </div>
      <div className="legend" aria-label="분류 색상 안내"><span><i className="type-support" /> 지원사업</span><span><i className="type-contest" /> 공모전</span><span><i className="type-hackathon" /> 해커톤·게임잼</span><span><i className="type-indie" /> 인디</span><span><b className="badge badge-new">NEW</b> 최초 수집 72시간</span><span><b className="badge badge-updated">UPDATED</b> 중요 변경 48시간</span><span title="공식기관·공공 포털은 원문, 모음 사이트는 재게시">출처: <b className="badge trust trust-official">공식기관</b> <b className="badge trust trust-government">공공 포털</b> <b className="badge trust trust-specialist">전문 플랫폼</b> <b className="badge trust trust-aggregate">모음 사이트</b></span></div>
      {fuzzy && visible.length > 0 && <p className="search-hint" role="status">‘{filters.search}’와 정확히 일치하는 공고가 없어 철자가 비슷한 공고를 보여 드립니다.</p>}
      {loading && <div className="message" role="status">공고 데이터를 불러오는 중입니다…</div>}
      {error && <div className="message error" role="alert"><strong>데이터 로드 실패</strong><span>{error}</span><small>먼저 <code>python -m pipeline.cli</code>를 실행해 데이터를 생성하세요.</small></div>}
      {!loading && !error && pageItems.length === 0 && <div className="message"><strong>조건에 맞는 공고가 없습니다.</strong><span>필터를 줄이거나 수집 파이프라인을 실행해보세요.</span></div>}
      <section className="opportunity-list" aria-label="공고 목록">{pageItems.map(item => <OpportunityRow key={item.id} item={item} personal={personal} onToggle={toggle} />)}</section>
      {totalPages > 1 && <nav className="pagination" aria-label="페이지 이동"><button disabled={page <= 1} onClick={() => update('page', String(page - 1))}>이전</button><span>{page} / {totalPages}</span><button disabled={page >= totalPages} onClick={() => update('page', String(page + 1))}>다음</button></nav>}
      {personal.hidden.length > 0 && <button className="restore-hidden" onClick={restoreHidden}>숨긴 공고 {personal.hidden.length}개 모두 복원</button>}
    </main>
  )
}
