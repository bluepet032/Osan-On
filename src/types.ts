/** Support form (정부24 지원유형). */
export type OpportunityType = 'cash' | 'in_kind' | 'service' | 'voucher' | 'loan' | 'reduction' | 'other'
export type OpportunityStatus = 'upcoming' | 'open' | 'urgent' | 'today' | 'closed' | 'ongoing' | 'unknown'
export type DateKind = 'exact' | 'ongoing' | 'first_come' | 'budget' | 'unknown' | 'inquiry'
/** Benefit field tab (정부24 서비스분야). */
export type Domain = 'living' | 'housing' | 'childcare' | 'jobs' | 'health' | 'admin' | 'pregnancy' | 'care' | 'culture' | 'agriculture'
export type Jurisdiction = 'osan' | 'gyeonggi' | 'national'

/** 정부24 support conditions: JA codes set to Y plus the target age range (만 나이). */
export interface Conditions {
  codes: string[]
  age_min: number | null
  age_max: number | null
  /** 복지로 생애주기 the ages came from; set only for services without listed targets. */
  life?: string[]
  /** 복지로 target categories whose codes are a guess (저소득 has no single income threshold). */
  inferred?: string[]
}

export interface SourceRecord {
  source_id: string
  source_name: string
  source_url: string
  source_post_id?: string | null
  kind: string
  priority: number
  fetched_at?: string | null
}

export interface Relevance {
  score: number
  reasons: string[]
  decision: 'publish' | 'review' | 'exclude'
}

export interface Opportunity {
  id: string
  title: string
  source_name: string
  source_url: string
  organizer: string
  summary: string
  primary_type: OpportunityType
  field_tags: string[]
  audience_tags: string[]
  status: OpportunityStatus
  relevance: Relevance
  first_seen_at: string
  last_seen_at: string
  sources: SourceRecord[]
  application_url?: string | null
  document_url?: string | null
  recruit_start?: string | null
  recruit_end?: string | null
  event_start?: string | null
  event_end?: string | null
  date_kind: DateKind
  /** The source's own words for the application period, such as "예산 소진 시까지". */
  apply_period?: string
  d_day?: number | null
  eligibility?: string
  benefits?: string
  location?: string
  /** Benefit field tab. */
  domain?: Domain
  jurisdiction?: Jurisdiction
  /** null = the source has no condition record, so eligibility needs a manual check. */
  conditions?: Conditions | null
  /** "online", "visit", "none" (no application needed); empty when the source does not say. */
  apply_methods?: string[]
  last_changed_at?: string | null
  change_flags?: string[]
  is_manual_reviewed?: boolean
}

export interface DataPayload<T> {
  schema_version: number
  generated_at: string
  items: T[]
}

export interface CrawlStatus {
  source_id: string
  source_name: string
  status: 'success' | 'failed' | 'skipped'
  started_at: string
  finished_at: string
  collected_count: number
  published_count: number
  review_count: number
  new_count: number
  changed_count: number
  consecutive_failures: number
  last_success_at?: string | null
  error?: string | null
  previous_collected_count?: number | null
  /** Share (0–1) of collected items carrying each advanced-filter fact; absent before it was recorded. */
  facet_coverage?: Partial<Record<'apply', number>> | null
  previous_facet_coverage?: Partial<Record<'apply', number>> | null
}

export interface PersonalState {
  version: 1
  favorites: string[]
  read: string[]
  hidden: string[]
}

