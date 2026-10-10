// API shapes, verbatim from docs/api-contract.md. Enum values are snake_case; fields camelCase.

export type UserRole = 'super_admin' | 'moderator' | 'sales_person'
export type ProjectType = 'online' | 'door_to_door'
export type ProjectStatus = 'active' | 'closed'
export type TargetPeriod = 'weekly' | 'monthly'
export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'interested'
  | 'follow_up_scheduled'
  | 'not_interested'
  | 'converted'
  | 'lost'
export type EntryType = 'follow_up' | 'status_change'
export type TransferStatus = 'pending' | 'approved' | 'rejected'
export type LeadOwnerTag = 'owner_inactive' | 'owner_removed'
export type LeadSort = 'updated' | 'created' | 'name' | 'next_follow_up'

export interface Paginated<T> {
  items: T[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}

export interface PersonRef {
  id: string
  name: string
}

export interface MeProject {
  id: string
  name: string
  type: ProjectType
  status: ProjectStatus
  targetCount: number | null
  targetPeriod: TargetPeriod | null
}

export interface Me {
  id: string
  name: string
  email: string
  phone: string | null
  role: UserRole
  projects: MeProject[]
  notice: string | null
}

export interface Session {
  accessToken: string
  refreshToken: string
  expiresIn: number
  expiresAt?: number
  user: Me
}

export interface User {
  id: string
  name: string
  email: string
  phone: string | null
  role: UserRole
  isActive: boolean
  createdBy: string | null
  createdAt: string
  canManage: boolean
}

export interface Project {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  type: ProjectType
  status: ProjectStatus
  startDate: string
  endDate: string | null
  closedAt: string | null
  createdAt: string
  pastEndDate: boolean
  typeLocked: boolean
  memberCount: number
  leadCount: number
  myTargetCount?: number | null
  myTargetPeriod?: TargetPeriod | null
  warnings?: string[]
}

export interface Member {
  userId: string
  name: string
  role: UserRole
  userIsActive: boolean
  isActive: boolean
  joinedAt: string
  email?: string
  phone?: string | null
  targetCount?: number | null
  targetPeriod?: TargetPeriod | null
  removedAt?: string | null
}

export interface LocationSuggestion {
  id: string
  name: string
  usageCount: number
}

export interface Entry {
  id: string
  leadId: string
  projectId: string
  entryType: EntryType
  status: LeadStatus
  note: string | null
  nextFollowUpDate: string | null
  location: PersonRef | null
  hasPhoto: boolean
  photoUrl: string | null
  latitude: number | null
  longitude: number | null
  gpsAccuracyM: number | null
  lowAccuracy: boolean
  user: PersonRef
  createdAt: string
  updatedAt: string
  edited: boolean
  editable: boolean
}

export interface TimelineEntry extends Entry {
  lead: { id: string; name: string; businessName: string | null }
  project: { id: string; name: string; type: ProjectType; status: ProjectStatus }
}

export interface LeadSummary {
  id: string
  projectId: string
  name: string
  businessName: string | null
  phone: string
  status: LeadStatus
  nextFollowUpDate: string | null
  overdueDays: number | null
  location: PersonRef
  owner: PersonRef & { isActive: boolean }
  ownerTag: LeadOwnerTag | null
  convertedAt: string | null
  hasPendingTransfer: boolean
  createdAt: string
  updatedAt: string
}

export interface LeadTransferRef {
  id: string
  status: TransferStatus
  toUser: PersonRef
  reason: string
  createdAt: string
  decidedBy: PersonRef | null
  decidedAt: string | null
  decisionNote: string | null
}

export interface LeadPermissions {
  canLogFollowUp: boolean
  canChangeStatus: boolean
  canLeaveConverted: boolean
  canEdit: boolean
  canRequestTransfer: boolean
  canReassign: boolean
  canDelete: boolean
}

export interface LeadDetail extends LeadSummary {
  notes: string | null
  project: { id: string; name: string; type: ProjectType; status: ProjectStatus }
  convertedBy: PersonRef | null
  recentEntries: Entry[]
  entryCount: number
  pendingTransfer: LeadTransferRef | null
  lastDecidedTransfer: LeadTransferRef | null
  permissions: LeadPermissions
}

export interface EntrySaveResult {
  entry: Entry
  lead: LeadSummary
}

export interface Transfer {
  id: string
  lead: { id: string; name: string; businessName: string | null; projectId: string; projectName: string }
  fromUser: PersonRef
  toUser: PersonRef
  requestedBy: PersonRef
  reason: string
  status: TransferStatus
  createdAt: string
  decidedBy: PersonRef | null
  decidedAt: string | null
  decisionNote: string | null
  canDecide: boolean
}

export interface TargetProgress {
  projectId: string
  projectName: string
  user: PersonRef
  role: UserRole
  targetCount: number | null
  targetPeriod: TargetPeriod | null
  achieved: number
  progressPercent: number | null
  periodStart: string
  periodEnd: string
  conversionsThisWeek: number
  conversionsThisMonth: number
}

export interface MeHome {
  targets: TargetProgress[]
  dueToday: number
  overdue: number
  followUpsToday: number
  myLeads: number
  notice: string | null
}

export interface Timeline {
  date: string
  user: PersonRef
  entries: TimelineEntry[]
  followUps: number
  visits: number
  statusChanges: number
  message: string | null
}

export interface Dashboard {
  from: string
  to: string
  targets: TargetProgress[]
  newLeads: number
  followUps: number
  followUpsToday: number
  people: {
    user: PersonRef
    role: UserRole
    newLeads: number
    followUps: number
    conversions: number
    followUpsToday: number
  }[]
  loggedNothingToday: { user: PersonRef; role: UserRole; projects: string[] }[]
  leadsByStatus: { status: LeadStatus; count: number }[]
  conversionsThisWeek: {
    leadId: string
    leadName: string
    businessName: string | null
    phone: string
    projectName: string
    convertedBy: PersonRef
    currentOwner: PersonRef
    convertedAt: string
    via: EntryType
  }[]
  pendingTransfers: number
  message: string | null
}

export interface CaptureToken {
  captureToken: string
  issuedAt: string
  expiresAt: string
}

export interface DaySummary {
  date: string
  followUps: number
  visits: number
  statusChanges: number
  newLeads: number
  conversions: number
}

export interface Summary {
  from: string
  to: string
  user: PersonRef
  totals: Omit<DaySummary, 'date'> & { activeDays: number }
  days: DaySummary[]
}

export interface ImportProblem {
  row: number
  kind: 'invalid' | 'duplicate'
  name: string
  phone: string
  reason: string
}

export interface ImportResult {
  dryRun: boolean
  total: number
  importable: number
  imported: number
  duplicates: number
  invalid: number
  byOwner: { user: PersonRef; count: number }[]
  problems: ImportProblem[]
  problemsTruncated: boolean
  sample: ImportRow[]
  /** Every importable row, in file order. */
  rows: ImportRow[]
}

export interface ImportRow {
  row: number
  name: string
  phone: string
  businessName: string | null
  location: string
  /** Null in a review until someone is picked. */
  owner: PersonRef | null
}
