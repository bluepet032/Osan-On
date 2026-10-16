import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { OpportunityRow } from '../components/OpportunityRow'
import { DEFAULT_DOMAIN, DOMAIN_LABELS, DOMAINS } from '../constants'
import { loadOpportunities } from '../data'
import { currentHashParams } from '../urlState'
import { usePersonalState } from '../personal'
import type { Domain, Opportunity } from '../types'
import { weeklyDigest, type WeekRange } from '../weekly'

const NEW_ITEMS_LIMIT = 30

const formatRange = (range: WeekRange) => {
  const format = (value: string) => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T00:00:00+09:00`))
  return `${format(range.start)} ~ ${format(range.end)}`
}

export function WeeklyPage() {
  const [items, setItems] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [params, setParams] = useSearchParams()
  const { state: personal, toggle } = usePersonalState()
  const domain = (params.get('domain') || DEFAULT_DOMAIN) as Domain | 'all'

  useEffect(() => {
    let active = true
    Promise.all([loadOpportunities('active'), loadOpportunities('undated')])
      .then(payloads => { if (active) setItems(payloads.flatMap(payload => payload.items)) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '데이터를 불러오지 못했습니다') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const hidden = new Set(personal.hidden)
  const digest = weeklyDigest(items.filter(item => !hidden.has(item.id)), domain)
  const selectDomain = (next: string) => {
    const copy = currentHashParams()
    copy.set('domain', next)
    setParams(copy, { replace: true })
  }
  const listLink = (extra: Record<string, string>) => `/?${new URLSearchParams({ domain, ...extra })}`
  const section = (id: string, title: string, subtitle: string, list: Opportunity[], more?: { to: string; label: string }) => (
    <section className="weekly-section" aria-labelledby={id}>
      <div className="section-heading">
        <div><h2 id={id}>{title}</h2><p>{subtitle}</p></div>
        <strong>{list.length}건</strong>
      </div>
      {list.length === 0
        ? <div className="message compact">해당하는 공고가 없습니다.</div>
        : <div className="opportunity-list">{list.map(item => <OpportunityRow key={item.id} item={item} personal={personal} onToggle={toggle} />)}</div>}
      {more && <Link className="weekly-more" to={more.to}>{more.label} →</Link>}
    </section>
  )

  return (
    <main id="main-content" className="container weekly-page">
      <div className="page-heading">
        <div><p className="eyebrow">WEEKLY DIGEST</p><h1>주간 요약</h1><p>이번 주와 다음 주에 마감되는 공고, 최근 7일 동안 새로 올라온 공고를 한 번에 확인하세요.</p></div>
        <div className="summary-cards" aria-label="주간 요약 건수"><span><strong>{digest.closingThisWeek.length}</strong> 이번 주 마감</span><span><strong>{digest.closingNextWeek.length}</strong> 다음 주 마감</span><span><strong>{digest.newThisWeek.length}</strong> 새 공고</span></div>
      </div>
      <div className="domain-tabs" role="group" aria-label="분야">
        {DOMAINS.map(value => <button key={value} className={domain === value ? 'active' : ''} aria-pressed={domain === value} onClick={() => selectDomain(value)}>{DOMAIN_LABELS[value]}</button>)}
        <button className={domain === 'all' ? 'active' : ''} aria-pressed={domain === 'all'} onClick={() => selectDomain('all')}>모든 분야</button>
      </div>
      {loading && <div className="message" role="status">공고 데이터를 불러오는 중입니다…</div>}
      {error && <div className="message error" role="alert">{error}</div>}
      {!loading && !error && <>
        {section('closing-this-week', '이번 주 마감', formatRange(digest.thisWeek), digest.closingThisWeek)}
        {section('closing-next-week', '다음 주 마감', formatRange(digest.nextWeek), digest.closingNextWeek)}
        {section('new-this-week', '최근 7일 새 공고', '처음 수집된 지 7일 이내인 공고입니다.', digest.newThisWeek.slice(0, NEW_ITEMS_LIMIT),
          digest.newThisWeek.length > NEW_ITEMS_LIMIT ? { to: listLink({ sort: 'newest' }), label: `새 공고 ${digest.newThisWeek.length}건 전체 보기` } : undefined)}
      </>}
    </main>
  )
}
