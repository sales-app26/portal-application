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
  /** Where a visit photo was taken, from OpenStreetMap, e.g. "Wanowrie Road, Wanowrie, Pune 411040". */
  placeName?: string | null
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

/** GET /geo/reverse: the area a position is in (OpenStreetMap). */
export interface PlaceName {
  area: string | null
  label: string
}

export interface TimelineEntry extends Entry {
  lead: { id: string; name: string | null; businessName: string | null }
  project: { id: string; name: string; type: ProjectType; status: ProjectStatus }
}

export interface LeadSummary {
  id: string
  projectId: string
  /** The owner or manager, when known. */
  name: string | null
  /** Required on new leads; null only on older ones saved before that. */
  businessName: string | null
  phone: string | null
  status: LeadStatus
  nextFollowUpDate: string | null
  overdueDays: number | null
  location: PersonRef
  /** Null: not assigned yet (a bulk upload left it for an admin to hand out). */
  owner: (PersonRef & { isActive: boolean }) | null
  ownerTag: LeadOwnerTag | null
  convertedAt: string | null
  hasPendingTransfer: boolean
  createdAt: string
  updatedAt: string
  /** List price per month in whole rupees, before any discount. */
  dealValue: number | null
  /** Old free-text plan, kept for history; shown only when `planCode` is null. */
  plan: string | null
  planCode: PlanCode | null
  /** Null reads as 1 month. */
  dealTenureMonths: number | null
  discountType: DiscountType | null
  discountValue: number | null
  couponCode: string | null
  offer: PersonRef | null
  /** What the client pays for the whole tenure (price × tenure − discount). */
  dealTotal: number | null
  /** Deal total ÷ tenure: what the deal adds to monthly revenue. */
  effectiveMonthlyValue: number | null
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

export type NotificationKind =
  'transfer_requested' | 'transfer_decided' | 'lead_assigned' | 'mention' | 'help_requested' | 'help_resolved' | 'comment' | 'feedback' | 'leave_cover' | 'training'

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
  lead: { id: string; name: string | null; businessName: string | null; projectId: string; projectName: string }
  /** Null: the lead was assigned from Not assigned. */
  fromUser: PersonRef | null
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
    leadName: string | null
    businessName: string | null
    phone: string | null
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
  /** Leads no one gets yet: added unassigned, to hand out later. */
  unassigned: number
  byOwner: { user: PersonRef; count: number }[]
  problems: ImportProblem[]
  problemsTruncated: boolean
  sample: ImportRow[]
  /** Every importable row, in file order. */
  rows: ImportRow[]
}

export interface ImportRow {
  row: number
  /** The owner or manager, if the sheet gave one. */
  name: string | null
  phone: string | null
  businessName: string
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

// ---------------------------------------------------------------- team scorecard and rep review

/** The numbers on a scorecard row, the team total and the average rep (docs/api-contract.md, "Scorecard"). */
export interface ScorecardNumbers {
  leadsAdded: number
  followUps: number
  visits: number
  /** Working days (not on leave, up to today) with any follow-up, visit or stage change. */
  activeDays: number
  /** Days of the period up to today, minus days on leave. */
  workingDays: number
  leaveDays: number
  dealsWon: number
  /** ₹/month, as the dashboard counts it. */
  wonRevenue: number
  lostLeads: number
  /** Deals won ÷ (deals won + lost leads). Null when nothing was closed. */
  conversionPercent: number | null
  avgDaysToWin: number | null
  target: number | null
  achieved: number
  targetPercent: number | null
  overdueNow: number
  openNow: number
  handoversAsked: number
  handoversReceived: number
}

export interface ScorecardRow extends ScorecardNumbers {
  user: PersonRef
  isActive: boolean
  campaigns: string[]
  topLostReason: LostReason | 'unspecified' | null
}

export interface Scorecard {
  from: string
  to: string
  daysSoFar: number
  rows: ScorecardRow[]
  totals: ScorecardNumbers
  averages: ScorecardNumbers | null
}

export interface RepReview {
  from: string
  to: string
  person: PersonRef & { role: UserRole; isActive: boolean; campaigns: string[] }
  numbers: ScorecardRow
  teamAverage: ScorecardNumbers | null
  teamSize: number
  trendBucket: 'day' | 'week'
  trend: { date: string; followUps: number; visits: number; newLeads: number; wins: number }[]
  funnel: { stage: FunnelStage; count: number }[]
  lostReasons: { reason: LostReason | 'unspecified'; count: number }[]
  sources: { source: LeadSource | 'unspecified'; count: number }[]
  planMix: { plan: string; count: number; revenue: number }[]
  recentWins: { leadId: string; leadName: string | null; businessName: string | null; projectName: string; plan: string | null; dealValue: number | null; wonAt: string }[]
  /** Monday = 0 … Sunday = 6. */
  weekdays: { weekday: number; followUps: number; visits: number }[]
  feedback: {
    count: number
    recent: { id: string; body: string; author: PersonRef; leadId: string; leadName: string; entryId: string | null; createdAt: string }[]
  }
}

// ---------------------------------------------------------------- deals, plan prices and offers

export type PlanCode = 'free' | 'growth' | 'growth_plus' | 'pro'
export type DiscountType = 'percent' | 'amount'

export interface PlanPrice {
  plan: PlanCode
  /** Whole rupees a month; null until the sales head sets it. Free is 0. */
  monthlyPrice: number | null
}

export interface Offer {
  id: string
  name: string
  couponCode: string | null
  discountType: DiscountType
  discountValue: number
  startsOn: string | null
  endsOn: string | null
  /** False once the sales head ends it. */
  active: boolean
}

// ---------------------------------------------------------------- training

export type TrainingKind = 'video' | 'playlist' | 'document' | 'card' | 'quiz' | 'roleplay'
export type TrainingStep = 'watch' | 'tutorial' | 'practise' | 'prove' | 'field' | 'library'

export interface Course {
  id: string
  title: string
  description: string | null
  published: boolean
  lessonCount: number
  campaignCount: number
  updatedAt: string
}

export interface QuizQuestion {
  id: string
  text: string
  options: string[]
  /** Only in the admin's full lesson, never in a rep's. */
  answer?: number
  explanation?: string | null
}

export interface RoleplayPersona {
  name: string
  shop: string
  city: string
  about: string
}

/** A lesson in full, for admins to edit (answers and hidden instructions included). */
export interface Lesson {
  id: string
  courseId: string | null
  projectId: string | null
  step: TrainingStep
  kind: TrainingKind
  title: string
  summary: string | null
  sort: number
  required: boolean
  minutes: number | null
  payload: Record<string, unknown>
  hasFile: boolean
}

export interface CourseDetail {
  course: Course
  lessons: Lesson[]
}

export interface LessonProgress {
  percent: number
  positionSeconds: number | null
  bestScore: number | null
  attempts: number
  completedAt: string | null
  /** A playlist's modules watched, by YouTube id → percent. */
  watched: Record<string, number>
}

export interface VideoContent {
  youtubeId: string
  thumbnailUrl: string
  startSeconds: number | null
  endSeconds: number | null
  checks: QuizQuestion[]
}
/** A YouTube playlist, its modules listed by the API (empty when YouTube didn't list them). */
export interface PlaylistContent {
  playlistId: string
  items: { youtubeId: string; title: string; thumbnailUrl: string }[]
}
export interface DocumentContent {
  link: string | null
  note: string | null
  fileName: string | null
  contentType: string | null
  sizeBytes: number | null
  hasFile: boolean
}
export interface CardContent {
  markdown: string
}
export interface QuizContent {
  passPercent: number
  questions: QuizQuestion[]
}
export interface RoleplayContent {
  persona: RoleplayPersona
  brief: string
  language: 'en' | 'hinglish'
  rubric: string[]
  passScore: number
}

/** A lesson as a rep sees it: no answers. `content` follows `kind`. */
export interface LearnerLesson {
  id: string
  courseId: string | null
  kind: TrainingKind
  step: TrainingStep
  title: string
  summary: string | null
  minutes: number | null
  required: boolean
  content: Record<string, unknown>
  progress: LessonProgress
}

export interface CampaignTraining {
  projectId: string
  projectName: string
  canManage: boolean
  certifiedAt: string | null
  requiredCount: number
  doneCount: number
  percent: number
  roleplayEnabled: boolean
  roleplayLeftToday: number
  courses: { id: string; title: string; description: string | null; lessons: LearnerLesson[] }[]
  campaignLessons: LearnerLesson[]
}

export interface GradedAnswer {
  questionId: string
  correct: boolean
  answer: number
  explanation: string | null
}

export interface AttemptResult {
  score: number
  passed: boolean
  results: GradedAnswer[]
  progress: LessonProgress
  attemptsLeftToday: number | null
  certifiedNow: boolean
}

export interface LessonDone {
  progress: LessonProgress
  certifiedNow: boolean
}

export interface RoleplayTurn {
  role: 'rep' | 'owner'
  text: string
  at: string
}

export interface RoleplayFeedback {
  summary: string
  strengths: string[]
  improvements: string[]
  criteria: { criterion: string; met: boolean; note: string }[]
}

export interface RoleplaySession {
  id: string
  itemId: string
  projectId: string
  userId: string
  userName: string
  lessonTitle: string
  persona: RoleplayPersona
  turns: RoleplayTurn[]
  repTurns: number
  maxTurns: number
  finished: boolean
  score: number | null
  passScore: number
  passed: boolean | null
  feedback: RoleplayFeedback | null
  startedAt: string
  finishedAt: string | null
  certifiedNow: boolean
}

export interface TrainingBoard {
  lessons: { id: string; title: string; kind: TrainingKind; required: boolean }[]
  members: {
    userId: string
    name: string
    role: UserRole
    doneCount: number
    requiredCount: number
    percent: number
    certifiedAt: string | null
    quizBest: number | null
    practiceBest: number | null
    practiceCount: number
    lastActivityAt: string | null
    completedLessonIds: string[]
  }[]
  recentPitches: { id: string; userId: string; userName: string; lessonTitle: string; score: number | null; startedAt: string; finishedAt: string | null }[]
}

/** An unassigned lead in a campaign's Open leads, as a rep sees it before taking it. */
export interface OpenLead {
  id: string
  businessName: string | null
  /** The owner or manager, if known. */
  name: string | null
  location: { id: string; name: string }
  notes: string | null
  /** The number itself shows once the lead is taken. */
  hasPhone: boolean
  source: LeadSource | null
  addedBy: { id: string; name: string } | null
  createdAt: string
}
