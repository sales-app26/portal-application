// API shapes, verbatim from docs/api-contract.md. Enum values are snake_case; fields camelCase.

export type UserRole = 'super_admin' | 'moderator' | 'sales_person'
export type ProjectType = 'online' | 'door_to_door'
export type ProjectStatus = 'active' | 'closed'
export type TargetPeriod = 'weekly' | 'monthly'
export type LeadStatus = 'new' | 'contacted' | 'interested' | 'follow_up_scheduled' | 'not_interested' | 'converted' | 'lost'
export type EntryType = 'follow_up' | 'status_change'
export type TransferStatus = 'pending' | 'approved' | 'rejected'
export type LeadOwnerTag = 'owner_inactive' | 'owner_removed'
export type LeadSort = 'updated' | 'created' | 'name' | 'next_follow_up' | 'value' | 'activity'
export type LeadSource = 'walk_in' | 'referral' | 'phone' | 'whatsapp' | 'social' | 'event' | 'import' | 'other'
export type LostReason = 'price' | 'has_alternative' | 'not_ready' | 'no_need' | 'owner_unavailable' | 'shop_closed' | 'competitor' | 'other'
export type LeadDue = 'overdue' | 'today' | 'tomorrow' | 'week' | 'none'
export type FunnelStage = 'created' | 'contacted' | 'interested' | 'converted'
export type AttentionKind = 'behind_target' | 'overdue_pile' | 'idle' | 'stale_transfer' | 'help_request'

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

export interface LeaveSpan {
  startsOn: string
  endsOn: string
}

export interface Me {
  id: string
  name: string
  email: string
  phone: string | null
  role: UserRole
  projects: MeProject[]
  notice: string | null
  /** On leave today. */
  onLeave?: LeaveSpan | null
  nextLeave?: LeaveSpan | null
}

export interface Leave extends LeaveSpan {
  id: string
  user: PersonRef
  note: string | null
  createdBy: PersonRef
  createdAt: string
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
  onLeave?: LeaveSpan | null
  /** Reset link, deactivate, reactivate: false when the person also works in projects the caller doesn't run. */
  canManageAccount: boolean
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
  onLeave?: LeaveSpan | null
  /** Who covers this member's follow-ups in this project while they are on leave. */
  backup?: PersonRef | null
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
  /** Why it was lost: only on Not interested and Lost entries. */
  reason: LostReason | null
  /** The owner a backup logged this for, while the owner was on leave. */
  coveringFor?: PersonRef | null
  /** A manager's notes on this entry. */
  feedback?: { id: string; body: string; user: PersonRef; createdAt: string }[]
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
  /** Whole rupees per month. */
  dealValue: number | null
  plan: string | null
  source: LeadSource | null
  lastActivityAt: string
  createdBy: PersonRef | null
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
  /** The caller is the owner's backup and the owner is on leave today. */
  covering?: boolean
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
  /** The owner, when the caller is covering for them. */
  coveringFor?: PersonRef | null
  openHelp?: boolean
  pinnedComment?: { id: string; body: string; user: PersonRef; createdAt: string } | null
  commentCount?: number
}

export type CommentKind = 'comment' | 'help' | 'feedback' | 'handover'

export interface LeadComment {
  id: string
  kind: CommentKind
  body: string
  user: PersonRef
  mentions: PersonRef[]
  pinned: boolean
  entryId: string | null
  resolvedAt: string | null
  resolvedBy: PersonRef | null
  createdAt: string
  editedAt: string | null
  canEdit: boolean
  canDelete: boolean
  canPin: boolean
  canResolve: boolean
}

export type NotificationKind = 'transfer_requested' | 'transfer_decided' | 'lead_assigned' | 'mention' | 'help_requested' | 'help_resolved' | 'comment' | 'feedback' | 'leave_cover'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string | null
  link: string | null
  actor: PersonRef | null
  leadId: string | null
  createdAt: string
  readAt: string | null
}

export interface Covering {
  user: PersonRef
  projectId: string
  projectName: string
  leave: LeaveSpan
  dueToday: number
  overdue: number
}

export interface Leaderboard {
  period: 'week' | 'month'
  from: string
  to: string
  rows: { user: PersonRef; role: UserRole; conversions: number; followUps: number; rank: number; isMe: boolean }[]
}

export interface RosterRow {
  user: PersonRef & { phone: string | null; email: string }
  role: UserRole
  projects: { id: string; name: string }[]
  onLeave: LeaveSpan | null
  nextLeave: LeaveSpan | null
  backup: PersonRef | null
  lastActivityAt: string | null
  followUpsToday: number
  openLeads: number
  dueToday: number
  overdue: number
  target: { count: number; period: TargetPeriod; achieved: number } | null
}

export interface MessageTemplate {
  id: string
  label: string
  body: string
  sort: number
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
  conversionsThisMonth: number
  revenueThisMonth: number
}

/** GET /me/agenda: the rep's lists for planning the day and the week. */
export interface Agenda {
  overdue: number
  today: number
  tomorrow: number
  thisWeek: number
  /** Open leads untouched for 14+ days. */
  cold: number
  /** New leads nobody has contacted yet (imports). */
  untouched: number
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
    revenue: number
  }[]
  conversions: number
  revenue: number
  funnel: { stage: FunnelStage; count: number }[]
  trendBucket: 'day' | 'week'
  trend: { date: string; followUps: number; newLeads: number; conversions: number; revenue: number }[]
  lostReasons: { reason: LostReason | 'unspecified'; count: number }[]
  sources: { source: LeadSource | 'unspecified'; count: number }[]
  needsAttention: { kind: AttentionKind; user: PersonRef | null; projectName: string | null; detail: string; leadCount?: number; leadId?: string }[]
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

// ---------------------------------------------------------------- release notes

/** A release as the Super Admin manages it, drafts included. */
export interface AppVersion {
  id: string
  /** Dotted release number, e.g. "1.2.0". */
  version: string
  title: string | null
  tags: string[]
  /** The release note, markdown. */
  notes: string
  releasedAt: string
  isPublished: boolean
  /** Whether reaching this version raises the What's new dialog. */
  notify: boolean
  /** How many people have read the note. */
  seenCount: number
  createdAt: string
  updatedAt: string
}

/** The newest published release, and whether this user has been shown it. */
export interface LatestVersion {
  id: string
  version: string
  title: string | null
  tags: string[]
  notes: string
  releasedAt: string
  seen: boolean
  notify: boolean
}

export interface VersionHistoryItem {
  id: string
  version: string
  title: string | null
  tags: string[]
  notes: string
  releasedAt: string
  seen: boolean
}

export interface VersionViews {
  seen: { userId: string; name: string; email: string; role: UserRole; seenAt: string }[]
  /** Active people who haven't been shown it yet. */
  pending: number
}
