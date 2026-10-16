export type OpportunityType = 'contest' | 'support' | 'hackathon' | 'event' | 'education' | 'supporters' | 'employment' | 'other'
export type OpportunityStatus = 'upcoming' | 'open' | 'urgent' | 'today' | 'closed' | 'ongoing' | 'unknown'
export type DateKind = 'exact' | 'ongoing' | 'first_come' | 'budget' | 'unknown' | 'inquiry'
export type Domain = 'it' | 'design_media' | 'literature_arts' | 'planning_ideas' | 'business'

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
  d_day?: number | null
  eligibility?: string
  benefits?: string
  location?: string
  mode?: string
  fee?: string
  is_adjacent?: boolean
  /** Field tab; data generated before tabs existed has no value and counts as 'it'. */
  domain?: Domain
  /** Region names from pipeline/facets.py; empty when the source does not say. */
  regions?: string[]
  /** Prize in 10,000 won; 0 = prize mentioned without amount, null = no information. */
  prize_manwon?: number | null
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
  facet_coverage?: Partial<Record<'region' | 'mode' | 'fee' | 'audience' | 'prize', number>> | null
  previous_facet_coverage?: Partial<Record<'region' | 'mode' | 'fee' | 'audience' | 'prize', number>> | null
}

export interface PersonalState {
  version: 1
  favorites: string[]
  read: string[]
  hidden: string[]
}

