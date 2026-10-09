import type { IconName } from '@/icons'
import type { UserRole } from '@/lib/types'

export interface NavItem {
  to: string
  label: string
  icon: IconName
  /** Shows the pending-transfer count. */
  badge?: 'transfers'
}

const home: NavItem = { to: '/home', label: 'Home', icon: 'home' }
const leads: NavItem = { to: '/leads', label: 'Leads', icon: 'contacts' }
const day: NavItem = { to: '/day', label: 'My day', icon: 'timeline' }
const dashboard: NavItem = { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' }
const transfers: NavItem = { to: '/transfers', label: 'Transfers', icon: 'swap', badge: 'transfers' }
const team: NavItem = { to: '/people', label: 'Team', icon: 'conference-call' }
const people: NavItem = { to: '/people', label: 'People', icon: 'conference-call' }
const projects: NavItem = { to: '/projects', label: 'Projects', icon: 'briefcase' }
const profile: NavItem = { to: '/profile', label: 'Profile', icon: 'user-male-circle' }
export const moreItem: NavItem = { to: '/more', label: 'More', icon: 'menu-2' }

/**
 * Per-role destinations (UX-COMPONENTS.md §5.1). `bar` is the compact bottom bar
 * (max 5, "More" last when needed); `more` is what sits behind it. The rail and
 * drawer show bar + more flat, so nothing is nested on a laptop.
 */
export const NAV: Record<UserRole, { bar: NavItem[]; more: NavItem[] }> = {
  sales_person: { bar: [home, leads, day, profile], more: [] },
  moderator: { bar: [home, leads, dashboard, transfers, moreItem], more: [day, team, projects, profile] },
  super_admin: { bar: [dashboard, projects, people, transfers, moreItem], more: [profile] },
}

export function flatNav(role: UserRole): NavItem[] {
  const { bar, more } = NAV[role]
  return [...bar.filter((i) => i !== moreItem), ...more]
}

export const homePath = (role: UserRole) => (role === 'super_admin' ? '/dashboard' : '/home')
