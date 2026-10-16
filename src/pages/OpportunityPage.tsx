import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Filters } from '../components/Filters'
import { OpportunityRow } from '../components/OpportunityRow'
import { ProfileCard } from '../components/ProfileCard'
import { AUTO_REFRESH_LABEL, DEFAULT_DOMAIN, DOMAIN_LABELS, PAGE_SIZE, domainOf } from '../constants'
import { advancedVerdict, EMPTY_ADVANCED, readAdvanced } from '../advancedFilters'
import { clearDataCache, loadOpportunities } from '../data'
import { hasBasics, judge, type Profile, type Verdict } from '../eligibility'
import { useProfile } from '../profileContext'
import { currentHashParams } from '../urlState'
import { compareOpportunities, matchesOpportunity, type Sort } from '../filtering'
import { usePersonalState } from '../personal'
import type { Domain, Opportunity } from '../types'
import { isDeadlineSoon } from '../utils'

// 'benefits' is the open list: dated (active) and 상시·기간 미정 (undated) benefits together.
type Dataset = 'benefits' | 'closed'
type Match = Verdict | 'all'

interface Props { dataset: Dataset; title: string; description: string }

const MATCH_TABS: [Match, string][] = [['eligible', '가능성 높음'], ['check', '확인 필요'], ['all', '전체']]

export function OpportunityPage({ dataset, title, description }: Props) {
  const [payload, setPayload] = useState<{ generated: string; items: Opportunity[] }>({ generated: '', items: [] })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const { profile, setProfile, synced, error: profileError } = useProfile()
  const [params, setParams] = useSearchParams()
  const { state: personal, toggle, restoreHidden } = usePersonalState()

  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setPayload({ generated: '', items: [] })
    const names = dataset === 'benefits' ? ['active', 'undated'] as const : ['closed'] as const
    Promise.all(names.map(name => loadOpportunities(name)))
      .then(results => {
        // Deadlines that passed since the last collection belong to the closed list, not the open one.
        const items = results.flatMap(data => data.items).filter(item => dataset === 'closed' || item.status !== 'closed')
        if (active) setPayload({ generated: results[0].generated_at, items })
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
    }
    setParams(copy, { replace: true })
  }
  const update = (key: string, next: string) => updateMany({ [key]: next })
  const filters = {
    place: value('place', 'all'), domain: value('domain', DEFAULT_DOMAIN), type: value('type', 'all'), advanced: readAdvanced(params), quick: value('quick'), search: value('q'), status: value('status'),
    sort: value('sort', 'local') as Sort, page: Math.max(1, Number(value('page', '1')) || 1),
    match: value('match', hasBasics(profile) ? 'eligible' : 'all') as Match,
  }
  const changeProfile = (next: Profile) => {
    setProfile(next)
    update('match', '')
  }

  const judgements = useMemo(() => new Map(payload.items.map(item => [item.id, judge(item, profile)])), [payload.items, profile])
  const hidden = new Set(personal.hidden)
  const exact = payload.items.filter(item => !hidden.has(item.id) && matchesOpportunity(item, filters))
  // Fall back to typo-tolerant search only when an exact search finds nothing at all.
  const fuzzy = exact.length === 0 && filters.search.trim() !== ''
  const matched = fuzzy ? payload.items.filter(item => !hidden.has(item.id) && matchesOpportunity(item, filters, { fuzzy: true })) : exact
  const verdictCount = (match: Match) => match === 'all' ? matched.length : matched.filter(item => judgements.get(item.id)?.verdict === match).length
  const visible = matched
    .filter(item => filters.match === 'all' || judgements.get(item.id)?.verdict === filters.match)
    .sort(compareOpportunities(filters.sort))

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
  // Right after a full collection nearly everything is new, so the cards count local benefits instead.
  const summaryCount = (test: (item: Opportunity) => boolean) => domainItems.filter(test).length

  return (
    <main id="main-content" className="container">
      <div className="page-heading">
        <div><p className="eyebrow">{filters.domain === 'all' ? '모든 분야' : DOMAIN_LABELS[filters.domain as Domain] ?? '모든 분야'} · BENEFITS</p><h1>{title}</h1><p>{description}</p></div>
        <div className="summary-cards" aria-label="혜택 요약"><span><strong>{summaryCount(item => item.jurisdiction === 'osan')}</strong> 오산시</span><span><strong>{summaryCount(item => item.jurisdiction === 'gyeonggi')}</strong> 경기도</span><span><strong>{summaryCount(isDeadlineSoon)}</strong> 마감임박</span></div>
      </div>
      {/* Remounts when the account copy arrives, so the card shows what was saved there. */}
      {dataset === 'benefits' && <ProfileCard key={JSON.stringify(profile)} profile={profile} onChange={changeProfile} synced={synced} error={profileError} />}
      <div className="match-tabs" role="group" aria-label="맞춤 판정">
        {MATCH_TABS.map(([match, label]) => <button key={match} className={`match-${match} ${filters.match === match ? 'active' : ''}`} aria-pressed={filters.match === match} onClick={() => update('match', match)}>{label} <span>{verdictCount(match)}</span></button>)}
      </div>
      <Filters items={filterItems} {...filters} onChange={update} onChangeMany={updateMany} />
      {unknownHidden > 0 && <p className="search-hint" role="status">선택한 상세 조건의 정보가 없는 혜택 {unknownHidden}건은 목록에서 빠져 있습니다. <button type="button" className="text-button" onClick={() => update('unknown', '1')}>함께 보기</button></p>}
      <div className="result-toolbar">
        <p><strong>{visible.length}개</strong> 혜택 · {payload.generated ? `${new Date(payload.generated).toLocaleString('ko-KR')} 갱신` : '갱신 정보 없음'} · 자동 갱신 {AUTO_REFRESH_LABEL}<button type="button" className="text-button" onClick={reload} disabled={loading}>다시 불러오기</button> · <a href={`${import.meta.env.BASE_URL}data/${filters.domain === 'all' ? 'feed' : `feed-${filters.domain}`}.xml`} title="이 분야의 새 혜택을 RSS로 구독">RSS</a></p>
        <label>정렬 <select aria-label="정렬" value={filters.sort} onChange={event => update('sort', event.target.value)}><option value="local">오산 우선</option><option value="deadline">마감임박순</option><option value="newest">신규등록순</option><option value="updated">최근갱신순</option></select></label>
      </div>
      <p className="legend" aria-label="판정 안내"><span><b className="badge verdict verdict-eligible">가능성 높음</b> 입력한 조건이 정부24 지원조건을 모두 충족</span><span><b className="badge verdict verdict-check">확인 필요</b> 입력하지 않은 조건이 있거나 조건 정보 없음</span><span>최종 자격은 반드시 원문에서 확인하세요.</span></p>
      {fuzzy && visible.length > 0 && <p className="search-hint" role="status">‘{filters.search}’와 정확히 일치하는 혜택이 없어 철자가 비슷한 혜택을 보여 드립니다.</p>}
      {loading && <div className="message" role="status">혜택 데이터를 불러오는 중입니다…</div>}
      {error && <div className="message error" role="alert"><strong>데이터 로드 실패</strong><span>{error}</span><small>먼저 <code>python -m pipeline.cli</code>를 실행해 데이터를 생성하세요.</small></div>}
      {!loading && !error && pageItems.length === 0 && <div className="message"><strong>조건에 맞는 혜택이 없습니다.</strong><span>{filters.match === 'eligible' ? "'확인 필요' 탭에서 조건을 더 입력하면 해당할 수 있는 혜택이 보입니다." : '필터를 줄이거나 수집 파이프라인을 실행해 보세요.'}</span></div>}
      <section className="opportunity-list" aria-label="혜택 목록">{pageItems.map(item => <OpportunityRow key={item.id} item={item} personal={personal} onToggle={toggle} judgement={judgements.get(item.id)} />)}</section>
      {totalPages > 1 && <nav className="pagination" aria-label="페이지 이동"><button disabled={page <= 1} onClick={() => update('page', String(page - 1))}>이전</button><span>{page} / {totalPages}</span><button disabled={page >= totalPages} onClick={() => update('page', String(page + 1))}>다음</button></nav>}
      {personal.hidden.length > 0 && <button className="restore-hidden" onClick={restoreHidden}>숨긴 혜택 {personal.hidden.length}개 모두 복원</button>}
    </main>
  )
}
