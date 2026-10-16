import { IconBabyCarriage, IconBriefcase, IconHeartbeat, IconHeartHandshake, IconHome, IconLayoutGrid, IconPalette, IconPlant2, IconSchool, IconShieldCheck, IconWallet } from '@tabler/icons-react'
import type { Domain } from '../types'

const ICONS = {
  all: IconLayoutGrid, living: IconWallet, housing: IconHome, childcare: IconSchool, jobs: IconBriefcase, health: IconHeartbeat,
  pregnancy: IconBabyCarriage, care: IconHeartHandshake, culture: IconPalette, agriculture: IconPlant2, admin: IconShieldCheck,
} satisfies Record<Domain | 'all', unknown>

export function DomainIcon({ domain, size = 16 }: { domain: Domain | 'all'; size?: number }) {
  const Icon = ICONS[domain] ?? IconLayoutGrid
  return <Icon size={size} stroke={1.8} aria-hidden="true" />
}
