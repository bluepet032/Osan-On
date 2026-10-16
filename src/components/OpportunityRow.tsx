import { useState } from 'react'
import { JURISDICTION_LABELS, STATUS_LABELS, TYPE_LABELS } from '../constants'
import type { Reason, Verdict } from '../eligibility'
import type { Opportunity, PersonalState } from '../types'
import { kindOf, SOURCE_KINDS, sourceTrust } from '../sourceTrust'
import { dDayLabel, formatDate, isNew, isUpdated } from '../utils'

interface Props {
  item: Opportunity
  personal: PersonalState
  onToggle: (bucket: 'favorites' | 'read' | 'hidden', id: string, item?: Opportunity) => void
  defaultExpanded?: boolean
  judgement?: { verdict: Verdict; reasons: Reason[] }
}

const VERDICT_LABELS: Record<Verdict, string> = { eligible: '가능성 높음', check: '확인 필요', ineligible: '해당 없음' }
const MARK = (ok: boolean | null) => ok === true ? '✓' : ok === false ? '✗' : '?'

export function OpportunityRow({ item, personal, onToggle, defaultExpanded = false, judgement }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const favorite = personal.favorites.includes(item.id)
  const read = personal.read.includes(item.id)
  const trust = sourceTrust(item)
  return (
    <article className={`opportunity type-${item.primary_type} ${read ? 'is-read' : ''}`}>
      <div className="date-cell">
        <strong>{dDayLabel(item)}</strong>
        <span>{formatDate(item.recruit_start)}</span>
        <span>~ {formatDate(item.recruit_end)}</span>
      </div>
      <div className="opportunity-main">
        <div className="title-line">
          <a href={item.source_url} target="_blank" rel="noopener noreferrer" onClick={() => onToggle('read', item.id)}>{item.title}</a>
          {judgement && <span className={`badge verdict verdict-${judgement.verdict}`}>{VERDICT_LABELS[judgement.verdict]}</span>}
          {item.jurisdiction && <span className={`badge jurisdiction jurisdiction-${item.jurisdiction}`}>{JURISDICTION_LABELS[item.jurisdiction]}</span>}
          {isNew(item) && <span className="badge badge-new">NEW</span>}
          {isUpdated(item) && <span className="badge badge-updated">UPDATED</span>}
          <span className={`badge trust trust-${trust.kind}`} title={trust.description}>{trust.label}{trust.sourceCount > 1 && ` · 출처 ${trust.sourceCount}곳`}</span>
        </div>
        <p>{item.summary}</p>
        <div className="mobile-meta">{item.organizer} · {STATUS_LABELS[item.status]}</div>
        <div className="tags" aria-label="공고 분류">
          <span className={`badge type-badge type-${item.primary_type}`}>{TYPE_LABELS[item.primary_type]}</span>
          {[...item.field_tags, ...item.audience_tags].slice(0, 5).map(tag => <span className="badge tag" key={tag}>{tag}</span>)}
        </div>
        {expanded && (
          <div className="details">
            {judgement && (
              <ul className="verdict-reasons" aria-label="판정 근거">
                {judgement.reasons.length === 0 && <li className="reason-ok">✓ 성별·나이·소득 등 별도 조건 없음</li>}
                {judgement.reasons.map(reason => <li key={reason.label} className={`reason-${reason.ok === true ? 'ok' : reason.ok === false ? 'fail' : 'unknown'}`}>{MARK(reason.ok)} {reason.label}{reason.ok === null && ' (입력 필요)'}</li>)}
              </ul>
            )}
            <dl>
              <div><dt>지원 대상</dt><dd className="pre-line">{item.eligibility || '원문 확인 필요'}</dd></div>
              <div><dt>지원 내용</dt><dd className="pre-line">{item.benefits || '원문 확인 필요'}</dd></div>
              <div><dt>신청·문의</dt><dd>{item.location || '원문 확인 필요'}</dd></div>
              <div><dt>소관 기관</dt><dd>{item.organizer}{item.jurisdiction && ` (${JURISDICTION_LABELS[item.jurisdiction]})`}</dd></div>
              <div><dt>출처</dt><dd>{item.sources.map(source => `${source.source_name}(${SOURCE_KINDS[kindOf(source)].label})`).join(', ')}</dd></div>
            </dl>
            {trust.kind === 'aggregate' && <p className="trust-note">{trust.description}</p>}
            <div className="detail-links">
              <a className="button-link" href={item.source_url} target="_blank" rel="noopener noreferrer">원문 보기</a>
              {item.application_url && item.application_url !== item.source_url && <a href={item.application_url} target="_blank" rel="noopener noreferrer">신청하기</a>}
              {item.document_url && <a href={item.document_url} target="_blank" rel="noopener noreferrer">첨부파일</a>}
              <a href={`#/notice/${item.id}`}>공유용 링크</a>
            </div>
          </div>
        )}
      </div>
      <div className="type-cell"><span className={`badge type-badge type-${item.primary_type}`}>{TYPE_LABELS[item.primary_type]}</span></div>
      <div className="organizer-cell">{item.organizer}</div>
      <div className="state-cell">
        <span className={`status status-${item.status}`}>{STATUS_LABELS[item.status]}</span>
        <div className="row-actions">
          <button type="button" className="icon-button" aria-label={favorite ? '관심 해제' : '관심 등록'} aria-pressed={favorite} onClick={() => onToggle('favorites', item.id, item)}>{favorite ? '★' : '☆'}</button>
          <button type="button" className="text-button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? '접기' : '펼치기'}</button>
          <button type="button" className="text-button muted" onClick={() => onToggle('hidden', item.id)}>숨김</button>
        </div>
      </div>
    </article>
  )
}

