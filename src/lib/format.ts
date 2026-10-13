import type { LeadSource, LeadStatus, LostReason, UserRole } from './types'

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  interested: 'Interested',
  follow_up_scheduled: 'Follow-up scheduled',
  not_interested: 'Not interested',
  converted: 'Won',
  lost: 'Lost',
}

export const STATUSES = Object.keys(STATUS_LABEL) as LeadStatus[]

/** One hue per status (dot, bar, pin); the label still carries the meaning for colour-blind users. */
export const STATUS_DOT: Record<LeadStatus, string> = {
  new: 'bg-status-new',
  contacted: 'bg-status-contacted',
  interested: 'bg-status-interested',
  follow_up_scheduled: 'bg-status-scheduled',
  not_interested: 'bg-status-not-interested',
  converted: 'bg-status-converted',
  lost: 'bg-status-lost',
}

/** The same hue as a light tint, for chip backgrounds. */
export const STATUS_TINT: Record<LeadStatus, string> = {
  new: 'bg-status-new/12',
  contacted: 'bg-status-contacted/10',
  interested: 'bg-status-interested/12',
  follow_up_scheduled: 'bg-status-scheduled/10',
  not_interested: 'bg-status-not-interested/10',
  converted: 'bg-status-converted/12',
  lost: 'bg-status-lost/10',
}

export const SOURCE_LABEL: Record<LeadSource, string> = {
  walk_in: 'Walk-in',
  referral: 'Referral',
  phone: 'Phone call',
  whatsapp: 'WhatsApp',
  social: 'Social media',
  event: 'Event',
  import: 'From a sheet',
  other: 'Other',
}
/** What a rep can pick (imports set their own source). */
export const SOURCES = (Object.keys(SOURCE_LABEL) as LeadSource[]).filter((s) => s !== 'import')

export const REASON_LABEL: Record<LostReason, string> = {
  price: 'Price too high',
  has_alternative: 'Already uses another',
  not_ready: 'Not ready yet',
  no_need: "Doesn't need it",
  owner_unavailable: 'Owner not available',
  shop_closed: 'Shop closed',
  competitor: 'Chose a competitor',
  other: 'Other',
}
export const REASONS = Object.keys(REASON_LABEL) as LostReason[]

export const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'Sales head',
  moderator: 'Sales manager',
  sales_person: 'Sales rep',
}

// ---------------------------------------------------------------- India time

const TZ = 'Asia/Kolkata'

/** Today as YYYY-MM-DD in India time, the API's notion of "today". */
export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** "8 Oct" or "8 Oct 2025" for a YYYY-MM-DD date. */
export function formatDate(ymd: string, opts: { withYear?: boolean } = {}): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  const sameYear = ymd.slice(0, 4) === todayIST().slice(0, 4)
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: opts.withYear || !sameYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).format(d)
}

/** "Today", "Tomorrow", "Yesterday" or a short date. */
export function relativeDay(ymd: string): string {
  const today = todayIST()
  if (ymd === today) return 'Today'
  if (ymd === addDays(today, 1)) return 'Tomorrow'
  if (ymd === addDays(today, -1)) return 'Yesterday'
  return formatDate(ymd)
}

/** "3:42 pm" in India time for an ISO timestamp. */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).format(new Date(iso)).toLowerCase()
}

/** "today", "yesterday", "3 days ago", then a short date, in India time. */
export function ago(iso: string): string {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso))
  const days = Math.round((Date.parse(`${todayIST()}T00:00:00Z`) - Date.parse(`${ymd}T00:00:00Z`)) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return formatDate(ymd)
}

export function formatDateTime(iso: string): string {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso))
  return `${relativeDay(ymd)}, ${formatTime(iso)}`
}

// ---------------------------------------------------------------- phone

/** Mirrors the API's normalisation (phone.util.ts). Returns 10 digits or null. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[\s\-().]/g, '')
  if (d.startsWith('+91')) d = d.slice(3)
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d) ? d : null
}

/** "98765 43210" */
export function formatPhone(digits: string): string {
  return digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits
}

/** Indian grouping: ₹1,49,900. */
export const rupees = (n: number) => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`

/** ₹1.2L, ₹45K: for tight spaces like KPI tiles and chart labels. */
export function rupeesShort(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(n >= 10_00_00_000 ? 0 : 1)}Cr`
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(n >= 10_00_000 ? 0 : 1)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`
  // Revenue after a discount can carry paise; a tile shows whole rupees.
  return `₹${Math.round(n)}`
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}
