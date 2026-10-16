import { useId, useState } from 'react'
import {
  activeAdvancedCount, ADVANCED_LABELS, ADVANCED_PARAMS, AUDIENCE_OPTIONS, coverageLabel, FEE_OPTIONS, MODE_OPTIONS, NATIONWIDE, PRIZE_OPTIONS, REGION_OPTIONS,
  SPARSE_COVERAGE, type AdvancedFilters, type AdvancedKey,
} from '../advancedFilters'

interface Props {
  advanced: AdvancedFilters
  /** Number of items that would remain with ``key`` set to ``value`` and every other filter unchanged. */
  countWith: (key: AdvancedKey, value: string) => number
  /** Share of items in the current view that carry each filter's fact; null without items. */
  coverage: Record<AdvancedKey, number> | null
  onChange: (param: string, value: string) => void
  /** Apply several URL changes at once; sequential single updates would each start from stale params. */
  onChangeMany: (changes: Record<string, string>) => void
}

type Field = { key: AdvancedKey; label: string; empty: string; options: [string, string][]; hint?: string }

const FIELDS: Field[] = [
  { key: 'audience', label: ADVANCED_LABELS.audience, empty: '모든 대상', options: AUDIENCE_OPTIONS.map(value => [value, value]), hint: '대상 제한이 없는 공고도 함께 보여 줍니다.' },
  { key: 'region', label: ADVANCED_LABELS.region, empty: '모든 지역', options: [[NATIONWIDE, '전국 공고만'], ...REGION_OPTIONS.map((value): [string, string] => [value, value])], hint: '지역을 고르면 전국 공고도 함께 보여 줍니다.' },
  { key: 'mode', label: ADVANCED_LABELS.mode, empty: '모든 방식', options: Object.entries(MODE_OPTIONS), hint: '온·오프라인 병행은 양쪽 모두에 나옵니다.' },
  { key: 'fee', label: ADVANCED_LABELS.fee, empty: '모든 참가비', options: Object.entries(FEE_OPTIONS) },
  { key: 'prize', label: ADVANCED_LABELS.prize, empty: '상금 조건 없음', options: Object.entries(PRIZE_OPTIONS) },
]

export function AdvancedFilterPanel({ advanced, countWith, coverage, onChange, onChangeMany }: Props) {
  const active = activeAdvancedCount(advanced)
  const [open, setOpen] = useState(active > 0)
  const panelId = useId()
  const reset = () => onChangeMany(Object.fromEntries([...Object.values(ADVANCED_PARAMS), 'unknown'].map(param => [param, ''])))
  // Most sources never state some of these facts, so picking one would hide nearly everything.
  // Those filters stay reachable but folded away, unless one is already in use.
  const sparse = (field: Field) => coverage !== null && coverage[field.key] < SPARSE_COVERAGE && !advanced[field.key]
  const main = FIELDS.filter(field => !sparse(field))
  const folded = FIELDS.filter(sparse)

  const renderField = (field: Field) => (
    <label key={field.key} className="advanced-field">
      <span>{field.label}{coverage && <em className="advanced-coverage">{coverageLabel(coverage[field.key])}</em>}</span>
      <select aria-label={field.label} value={advanced[field.key]} onChange={event => onChange(ADVANCED_PARAMS[field.key], event.target.value)}>
        <option value="">{field.empty}</option>
        {field.options.map(([value, text]) => <option key={value} value={value}>{`${text} (${countWith(field.key, value)})`}</option>)}
      </select>
      {field.hint && <small>{field.hint}</small>}
    </label>
  )

  return (
    <div className="advanced-filters">
      <div className="advanced-toggle-row">
        <button type="button" className={`advanced-toggle ${active ? 'has-active' : ''}`} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
          상세 조건{active > 0 && <span className="advanced-count">{active}</span>}
          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
        {active > 0 && <button type="button" className="text-button" onClick={reset}>상세 조건 초기화</button>}
      </div>
      {open && (
        <div className="advanced-panel" id={panelId}>
          {main.map(renderField)}
          {folded.length > 0 && (
            <details className="advanced-sparse">
              <summary>정보가 적은 조건 {folded.length}개 ({folded.map(field => field.label).join(', ')})</summary>
              <p>대부분의 출처가 이 정보를 알려 주지 않아, 고르면 결과가 크게 줄어듭니다.</p>
              <div className="advanced-sparse-fields">{folded.map(renderField)}</div>
            </details>
          )}
          <label className="advanced-unknown">
            <input type="checkbox" checked={advanced.includeUnknown} onChange={event => onChange('unknown', event.target.checked ? '1' : '')} />
            <span>정보가 없는 공고도 함께 보기</span>
          </label>
        </div>
      )}
    </div>
  )
}
