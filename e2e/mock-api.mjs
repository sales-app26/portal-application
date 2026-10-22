// In-memory fake of the Sales Tracker API for browser tests. Shapes follow docs/api-contract.md.

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const iso = () => new Date().toISOString()

export const ids = {
  me: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  priya: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  modOther: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  online: '11111111-1111-4111-8111-111111111111',
  d2d: '44444444-4444-4444-8444-444444444444',
  other: '66666666-6666-4666-8666-666666666666',
  lead: '22222220-2222-4222-8222-222222222222',
  /** A lead in the door-to-door campaign: its follow-ups need a visit photo. */
  d2dLead: '22222225-2222-4222-8222-222222222222',
  transfer: '77777777-7777-4777-8777-777777777777',
}

// 1x1 PNG, so photos render without any network.
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

/** role: 'sales_person' | 'moderator' | 'super_admin' */
/** `unreadRelease` leaves the live release note unread, so the What's new dialog shows. Off by default: it would sit over every other screen's tests. */
export function createMockApi({ role = 'sales_person', unreadRelease = false } = {}) {
  const projects = [
    { id: ids.online, name: 'Pune Retail Drive', type: 'online', status: 'active', targetCount: 20, targetPeriod: 'weekly' },
    { id: ids.d2d, name: 'Kondhwa Door-to-door', type: 'door_to_door', status: 'active', targetCount: null, targetPeriod: null },
  ]
  const me = {
    id: ids.me,
    name: role === 'sales_person' ? 'Ravi Kumar' : role === 'moderator' ? 'Meera Nair' : 'Adeeb Shah',
    email: 'user@example.test',
    phone: '9876543210',
    role,
    projects: role === 'super_admin' ? [] : projects,
    notice: null,
  }
  const names = ['Asha Patil', 'Imran Shaikh', 'Neha Joshi', 'Suresh Rao']
  const lead = (i, projectId = ids.online) => ({
    id: `2222222${i}-2222-4222-8222-222222222222`,
    projectId,
    name: names[i % 4],
    businessName: ['Patil General Store', null, 'Joshi Medicals', 'Rao Hardware'][i % 4],
    phone: `98100000${String(i).padStart(2, '0')}`,
    status: ['contacted', 'interested', 'follow_up_scheduled', 'new'][i % 4],
    nextFollowUpDate: today,
    overdueDays: i === 1 ? 2 : null,
    location: { id: 'loc', name: 'Wanowrie' },
    owner: { id: i === 3 ? ids.priya : me.id, name: i === 3 ? 'Priya Desai' : me.name, isActive: true },
    ownerTag: null,
    convertedAt: null,
    hasPendingTransfer: false,
    createdAt: iso(),
    updatedAt: iso(),
    dealValue: i === 0 ? 2499 : null,
    plan: null,
    planCode: i === 0 ? 'growth' : null,
    dealTenureMonths: null,
    discountType: null,
    discountValue: null,
    couponCode: null,
    offer: null,
    dealTotal: i === 0 ? 2499 : null,
    effectiveMonthlyValue: i === 0 ? 2499 : null,
    source: ['walk_in', 'referral', null, 'import'][i % 4],
    lastActivityAt: iso(),
    createdBy: { id: me.id, name: me.name },
  })
  const entry = (i, extra = {}) => ({
    id: `3333333${i}-3333-4333-8333-333333333333`,
    leadId: ids.lead,
    projectId: ids.online,
    entryType: 'follow_up',
    status: 'contacted',
    note: 'Met the owner, interested in the monthly plan.',
    nextFollowUpDate: today,
    location: { id: 'loc', name: 'Wanowrie' },
    hasPhoto: false,
    photoUrl: null,
    latitude: null,
    longitude: null,
    gpsAccuracyM: null,
    lowAccuracy: false,
    user: { id: me.id, name: me.name },
    createdAt: iso(),
    updatedAt: iso(),
    edited: false,
    editable: true,
    reason: null,
    ...extra,
  })
  const projectRef = (i) => ({ id: projects[i].id, name: projects[i].name, type: projects[i].type, status: 'active' })
  const day = () => [
    { ...entry(1, { note: 'Phone call, asked for a quote.' }), lead: { id: ids.lead, name: 'Asha Patil', businessName: 'Patil General Store' }, project: projectRef(0) },
    {
      ...entry(2, {
        note: 'Visited the shop, owner present.',
        hasPhoto: true,
        photoUrl: PIXEL,
        latitude: 18.4966,
        longitude: 73.8993,
        gpsAccuracyM: 12,
        placeName: 'Wanowrie Road, Wanowrie, Pune 411040',
        projectId: ids.d2d,
      }),
      lead: { id: '22222221-2222-4222-8222-222222222222', name: 'Imran Shaikh', businessName: null },
      project: projectRef(1),
    },
    {
      ...entry(3, {
        note: 'Second visit, low signal here.',
        hasPhoto: true,
        photoUrl: PIXEL,
        latitude: 18.5,
        longitude: 73.9,
        gpsAccuracyM: 160,
        lowAccuracy: true,
        projectId: ids.d2d,
      }),
      lead: { id: '22222222-2222-4222-8222-222222222222', name: 'Neha Joshi', businessName: 'Joshi Medicals' },
      project: projectRef(1),
    },
    {
      ...entry(4, { entryType: 'status_change', editable: false, note: 'Customer confirmed by phone.' }),
      lead: { id: ids.lead, name: 'Asha Patil', businessName: 'Patil General Store' },
      project: projectRef(0),
    },
  ]
  const detail = (base) => {
    const p = projects.find((x) => x.id === base.projectId) ?? projects[0]
    return {
      ...base,
      notes: 'Prefers calls after 4 pm.',
      openHelp: false,
      coveringFor: null,
      commentCount: 1,
      pinnedComment: { id: 'c-1', body: 'Owner prefers calls after 4 pm. Sent pricing last week.', user: { id: ids.priya, name: 'Priya Desai' }, createdAt: iso() },
      project: { id: p.id, name: p.name, type: p.type, status: p.status },
      convertedBy: null,
      recentEntries: [entry(0)],
      entryCount: 1,
      pendingTransfer: null,
      lastDecidedTransfer: null,
      permissions:
        role === 'sales_person'
          ? { canLogFollowUp: true, canChangeStatus: true, canLeaveConverted: false, canEdit: true, canRequestTransfer: true, canReassign: false, canDelete: false }
          : {
              canLogFollowUp: false,
              canChangeStatus: true,
              canLeaveConverted: true,
              canEdit: false,
              canRequestTransfer: false,
              canReassign: true,
              canDelete: role === 'super_admin',
            },
    }
  }

  // ---- admin state
  const users = [
    {
      id: ids.priya,
      name: 'Priya Desai',
      email: 'priya@example.test',
      phone: '9811111111',
      role: 'sales_person',
      isActive: true,
      createdBy: ids.me,
      createdAt: iso(),
      canManage: true,
      canManageAccount: true,
    },
    {
      id: '99999999-9999-4999-8999-999999999999',
      name: 'Karan Mehta',
      email: 'karan@example.test',
      phone: null,
      role: 'sales_person',
      isActive: true,
      createdBy: ids.me,
      createdAt: iso(),
      canManage: true,
      canManageAccount: true,
    },
    {
      id: ids.modOther,
      name: 'Farah Khan',
      email: 'farah@example.test',
      phone: null,
      role: 'moderator',
      isActive: true,
      createdBy: null,
      createdAt: iso(),
      canManage: role === 'super_admin',
      canManageAccount: role === 'super_admin',
    },
  ]
  const members = [
    {
      userId: ids.priya,
      name: 'Priya Desai',
      role: 'sales_person',
      userIsActive: true,
      isActive: true,
      joinedAt: iso(),
      email: 'priya@example.test',
      phone: '9811111111',
      targetCount: 10,
      targetPeriod: 'weekly',
      removedAt: null,
    },
    {
      userId: ids.modOther,
      name: 'Farah Khan',
      role: 'moderator',
      userIsActive: true,
      isActive: true,
      joinedAt: iso(),
      email: 'farah@example.test',
      phone: null,
      targetCount: null,
      targetPeriod: null,
      removedAt: null,
    },
    ...(role === 'sales_person'
      ? []
      : [
          {
            userId: ids.me,
            name: me.name,
            role,
            userIsActive: true,
            isActive: true,
            joinedAt: iso(),
            email: me.email,
            phone: null,
            targetCount: null,
            targetPeriod: null,
            removedAt: null,
          },
        ]),
  ]
  const projectDto = (p, extra = {}) => ({
    id: p.id,
    name: p.name,
    description: p.id === ids.online ? 'Retail outreach across Pune.' : null,
    imageUrl: null,
    type: p.type,
    status: p.status,
    startDate: '2026-09-01',
    endDate: null,
    closedAt: null,
    createdAt: iso(),
    pastEndDate: false,
    typeLocked: true,
    memberCount: members.length,
    leadCount: 42,
    ...extra,
  })
  const transfers = [
    {
      id: ids.transfer,
      lead: { id: ids.lead, name: 'Asha Patil', businessName: 'Patil General Store', projectId: ids.online, projectName: 'Pune Retail Drive' },
      fromUser: { id: ids.priya, name: 'Priya Desai' },
      toUser: { id: '99999999-9999-4999-8999-999999999999', name: 'Karan Mehta' },
      requestedBy: { id: ids.priya, name: 'Priya Desai' },
      reason: 'Karan lives next to the shop.',
      status: 'pending',
      createdAt: iso(),
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      canDecide: true,
    },
  ]
  const dashboard = () => ({
    from: today,
    to: today,
    targets: [
      {
        projectId: ids.online,
        projectName: 'Pune Retail Drive',
        user: { id: ids.priya, name: 'Priya Desai' },
        role: 'sales_person',
        targetCount: 10,
        targetPeriod: 'weekly',
        achieved: 6,
        progressPercent: 60,
        periodStart: iso(),
        periodEnd: iso(),
        conversionsThisWeek: 6,
        conversionsThisMonth: 14,
      },
      {
        projectId: ids.online,
        projectName: 'Pune Retail Drive',
        user: { id: '99999999-9999-4999-8999-999999999999', name: 'Karan Mehta' },
        role: 'sales_person',
        targetCount: null,
        targetPeriod: null,
        achieved: 2,
        progressPercent: null,
        periodStart: iso(),
        periodEnd: iso(),
        conversionsThisWeek: 2,
        conversionsThisMonth: 5,
      },
    ],
    newLeads: 6,
    followUps: 14,
    followUpsToday: 5,
    people: [
      { user: { id: ids.priya, name: 'Priya Desai' }, role: 'sales_person', newLeads: 4, followUps: 9, conversions: 2, followUpsToday: 3, revenue: 4998 },
      { user: { id: '99999999-9999-4999-8999-999999999999', name: 'Karan Mehta' }, role: 'sales_person', newLeads: 2, followUps: 5, conversions: 0, followUpsToday: 2, revenue: 0 },
    ],
    conversions: 2,
    revenue: 4998,
    funnel: [
      { stage: 'created', count: 6 },
      { stage: 'contacted', count: 5 },
      { stage: 'interested', count: 3 },
      { stage: 'converted', count: 2 },
    ],
    trendBucket: 'day',
    trend: Array.from({ length: 7 }, (_, i) => ({
      date: new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10),
      followUps: [3, 5, 2, 6, 4, 8, 7][i],
      newLeads: [1, 0, 2, 1, 0, 1, 1][i],
      conversions: [0, 1, 0, 0, 1, 0, 0][i],
      revenue: [0, 2499, 0, 0, 2499, 0, 0][i],
    })),
    lostReasons: [
      { reason: 'price', count: 3 },
      { reason: 'has_alternative', count: 2 },
      { reason: 'unspecified', count: 1 },
    ],
    sources: [
      { source: 'walk_in', count: 3 },
      { source: 'referral', count: 2 },
      { source: 'unspecified', count: 1 },
    ],
    needsAttention: [
      { kind: 'overdue_pile', user: { id: ids.priya, name: 'Priya Desai' }, projectName: 'Pune Retail Drive', detail: '6 leads overdue', leadCount: 6 },
      { kind: 'idle', user: { id: '99999999-9999-4999-8999-999999999999', name: 'Karan Mehta' }, projectName: null, detail: 'No entries for 3 days', leadCount: 12 },
    ],
    loggedNothingToday: [{ user: { id: '99999999-9999-4999-8999-999999999999', name: 'Karan Mehta' }, role: 'sales_person', projects: ['Pune Retail Drive'] }],
    leadsByStatus: ['new', 'contacted', 'interested', 'follow_up_scheduled', 'not_interested', 'converted', 'lost'].map((status, i) => ({ status, count: 20 - i * 3 })),
    conversionsThisWeek: [
      {
        leadId: ids.lead,
        leadName: 'Asha Patil',
        businessName: 'Patil General Store',
        phone: '9810000000',
        projectName: 'Pune Retail Drive',
        convertedBy: { id: ids.priya, name: 'Priya Desai' },
        currentOwner: { id: ids.priya, name: 'Priya Desai' },
        convertedAt: iso(),
        via: 'follow_up',
      },
    ],
    pendingTransfers: transfers.filter((t) => t.status === 'pending').length,
    message: null,
  })

  /** Three reps with different strengths, so each sort order differs. */
  const scorecardRows = (projectId) => {
    const base = { workingDays: 13, leaveDays: 0, handoversAsked: 0, handoversReceived: 0, lostLeads: 2, topLostReason: 'price', isActive: true, campaigns: ['Pune Retail Drive'] }
    const rows = [
      {
        ...base,
        user: { id: ids.priya, name: 'Priya Desai' },
        leadsAdded: 12,
        followUps: 40,
        visits: 14,
        activeDays: 12,
        dealsWon: 6,
        wonRevenue: 14994,
        conversionPercent: 75,
        avgDaysToWin: 8,
        target: 10,
        achieved: 6,
        targetPercent: 60,
        overdueNow: 1,
        openNow: 18,
      },
      {
        ...base,
        user: { id: '99999999-9999-4999-8999-999999999999', name: 'Karan Mehta' },
        leadsAdded: 9,
        followUps: 55,
        visits: 20,
        activeDays: 11,
        leaveDays: 2,
        workingDays: 11,
        dealsWon: 2,
        wonRevenue: 4998,
        conversionPercent: 33,
        avgDaysToWin: 12.5,
        target: null,
        achieved: 2,
        targetPercent: null,
        overdueNow: 4,
        openNow: 9,
        topLostReason: 'competitor',
        lostLeads: 4,
      },
      {
        ...base,
        user: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Sunil Patil' },
        leadsAdded: 5,
        followUps: 45,
        visits: 2,
        activeDays: 9,
        dealsWon: 4,
        wonRevenue: 9996,
        conversionPercent: 67,
        avgDaysToWin: 9,
        target: 10,
        achieved: 4,
        targetPercent: 40,
        overdueNow: 0,
        openNow: 6,
        campaigns: ['Kondhwa Door-to-door'],
        topLostReason: null,
        lostLeads: 0,
      },
    ]
    return projectId ? rows.filter((r) => r.campaigns.some((c) => projects.find((x) => x.id === projectId)?.name === c)) : rows
  }

  // ---- plan prices and offers (api-contract §3b)
  const planPrices = [
    { plan: 'free', monthlyPrice: 0 },
    { plan: 'growth', monthlyPrice: 2499 },
    { plan: 'growth_plus', monthlyPrice: 3499 },
    { plan: 'pro', monthlyPrice: null },
  ]
  const offers = [
    {
      id: 'eeeeeee1-eeee-4eee-8eee-eeeeeeeeeeee',
      name: 'Diwali offer',
      couponCode: 'DIWALI10',
      discountType: 'percent',
      discountValue: 10,
      startsOn: null,
      endsOn: null,
      active: true,
    },
    { id: 'eeeeeee2-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Monsoon', couponCode: null, discountType: 'amount', discountValue: 500, startsOn: null, endsOn: null, active: false },
  ]
  const offerLive = (o) => o.active && (!o.startsOn || o.startsOn <= today) && (!o.endsOn || o.endsOn >= today)

  const page = (items) => ({ items, meta: { page: 1, limit: 20, total: items.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false } })
  // Open leads (unassigned, for reps to take). The second one a teammate takes first.
  const openLeads = [
    { id: ids.lead, businessName: 'Patil Store', name: 'Asha Patil', location: { id: 'loc-w', name: 'Wanowrie' }, notes: 'Wants a demo on Saturday', hasPhone: true, source: 'import', addedBy: { id: 'u-head', name: 'Adeeb Shah' }, createdAt: new Date().toISOString() },
    { id: '33333330-3333-4333-8333-333333333333', businessName: 'Joshi Medicals', name: null, location: { id: 'loc-k', name: 'Kondhwa' }, notes: null, hasPhone: false, source: 'import', addedBy: { id: 'u-head', name: 'Adeeb Shah' }, createdAt: new Date().toISOString() },
  ]
  const ok = (data, message = 'Done.', status = 200) => ({ status, body: { success: true, statusCode: status, message, data } })
  const fail = (status, errorCode, message, details) => ({ status, body: { success: false, statusCode: status, errorCode, message, ...(details ? { details } : {}) } })

  /** Release notes: a live 1.1.0 (read, unless `unreadRelease`), over the quiet 1.0.0 everyone starts on. */
  const seenVersions = new Set(unreadRelease ? [] : ['aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'])
  const versions = [
    {
      id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      version: '1.1.0',
      title: 'Faster lead import',
      tags: ['Leads', 'Transfers'],
      notes: '## Added\n\n- Import a CSV of leads in one go',
      releasedAt: iso(),
      isPublished: true,
      notify: true,
      seenCount: 0,
      createdAt: iso(),
      updatedAt: iso(),
    },
    {
      id: 'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa',
      version: '1.0.0',
      title: 'First release',
      tags: [],
      notes: 'The first release of Sales Tracker.',
      releasedAt: iso(),
      isPublished: true,
      notify: false,
      seenCount: 0,
      createdAt: iso(),
      updatedAt: iso(),
    },
  ]

  // ---- team state
  const notifications = [
    {
      id: 'n1',
      kind: 'mention',
      title: 'Farah Khan mentioned you on Asha Patil',
      body: 'Can you push for the demo this week?',
      link: `/leads/${ids.lead}`,
      actor: { id: ids.modOther, name: 'Farah Khan' },
      leadId: ids.lead,
      createdAt: iso(),
      readAt: null,
    },
    {
      id: 'n2',
      kind: 'transfer_decided',
      title: 'Farah Khan approved the handover of Neha Joshi to Ravi Kumar',
      body: null,
      link: '/transfers',
      actor: { id: ids.modOther, name: 'Farah Khan' },
      leadId: null,
      createdAt: iso(),
      readAt: iso(),
    },
  ]
  const leaves = []
  const comments = [
    {
      id: 'c-1',
      kind: 'handover',
      body: 'Owner prefers calls after 4 pm. Sent pricing last week.',
      user: { id: ids.priya, name: 'Priya Desai' },
      mentions: [],
      pinned: true,
      entryId: null,
      resolvedAt: null,
      resolvedBy: null,
      createdAt: iso(),
      editedAt: null,
      canEdit: false,
      canDelete: false,
      canPin: true,
      canResolve: false,
    },
  ]
  const templates = []
  // Training: one course with a field card, a video with a check, a 2-question quiz and a practice pitch.
  const training = {
    course: { id: 'course-1', title: 'Frostique: core sales training', description: 'How to sell Frostique.', published: true, lessonCount: 4, campaignCount: 1, updatedAt: iso() },
    lessons: [
      {
        id: 'les-card',
        courseId: 'course-1',
        kind: 'card',
        step: 'field',
        title: 'The 25-minute visit',
        summary: 'Five steps, every visit.',
        minutes: 2,
        required: true,
        content: { markdown: '## The visit\n\n1. **Hook**\n2. **Discovery**' },
      },
      {
        id: 'les-video',
        courseId: 'course-1',
        kind: 'video',
        step: 'watch',
        title: 'Frostique in 90 seconds',
        summary: null,
        minutes: 2,
        required: true,
        content: {
          youtubeId: 'aqz-KE-bpKQ',
          thumbnailUrl: '',
          startSeconds: null,
          endSeconds: null,
          checks: [{ id: 'c1', text: 'What does Frostique take as commission?', options: ['Nothing', '25%'] }],
        },
      },
      {
        id: 'les-quiz',
        courseId: 'course-1',
        kind: 'quiz',
        step: 'prove',
        title: 'The rep quiz',
        summary: null,
        minutes: 5,
        required: true,
        content: {
          passPercent: 50,
          questions: [
            { id: 'q1', text: 'A shop has 3 branches. Which plan?', options: ['Growth', 'Pro'] },
            { id: 'q2', text: 'Where does the demo start?', options: ['On their phone', 'On your laptop'] },
          ],
        },
      },
      {
        id: 'les-pitch',
        courseId: 'course-1',
        kind: 'roleplay',
        step: 'practise',
        title: 'Pitch Ravi: single bakery',
        summary: null,
        minutes: 8,
        required: true,
        content: {
          persona: { name: 'Ravi Shinde', shop: 'Shinde Cake House', city: 'Pune', about: 'On Zomato.' },
          brief: 'Get Ravi to start a free trial.',
          language: 'hinglish',
          rubric: ['Asked how orders come in'],
          passScore: 70,
        },
      },
      {
        id: 'les-tutorial',
        courseId: 'course-1',
        kind: 'playlist',
        step: 'tutorial',
        title: 'Frostique app tutorial',
        summary: 'The app, module by module.',
        minutes: 25,
        required: false,
        content: {
          playlistId: 'PLfrostiqueAppTutorial',
          items: ['The big picture', 'Getting started', 'Your storefront'].map((t, i) => ({
            youtubeId: `tutorial00${i + 1}`,
            title: `${i + 1} · ${t}`,
            thumbnailUrl: `https://i.ytimg.com/vi/tutorial00${i + 1}/hqdefault.jpg`,
          })),
        },
      },
      {
        id: 'les-doc',
        courseId: 'course-1',
        kind: 'document',
        step: 'library',
        title: 'Frostique sales playbook',
        summary: null,
        minutes: null,
        required: false,
        content: {
          link: null,
          note: 'Look things up. No need to read it all.',
          fileName: 'Frostique Sales Playbook.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1200,
          hasFile: true,
        },
      },
      {
        id: 'les-link',
        courseId: 'course-1',
        kind: 'document',
        step: 'library',
        title: 'Plans and prices',
        summary: null,
        minutes: null,
        required: false,
        content: { link: 'https://docs.google.com/document/d/1AbCdEfGh/edit?usp=sharing', note: null, fileName: null, contentType: null, sizeBytes: null, hasFile: false },
      },
    ],
    answers: { 'les-video': [0], 'les-quiz': [1, 0] },
    explanations: { q1: 'More than one branch means Pro.', q2: 'Phone first.', c1: 'No commission.' },
    done: {},
    best: {},
    watched: {},
    pitch: null,
  }
  const lessonProgress = (id) => {
    const modules = training.lessons.find((l) => l.id === id)?.content.items ?? []
    const watched = training.watched[id] ?? {}
    const partial = modules.length ? Math.round((modules.filter((x) => (watched[x.youtubeId] ?? 0) >= 90).length / modules.length) * 100) : 0
    return { percent: training.done[id] ? 100 : partial, positionSeconds: null, bestScore: training.best[id] ?? null, attempts: 0, completedAt: training.done[id] ?? null, watched }
  }
  const campaignTraining = (projectId) => {
    const lessons = training.lessons.map((l) => ({ ...l, progress: lessonProgress(l.id) }))
    const required = lessons.filter((l) => l.required)
    const done = required.filter((l) => l.progress.completedAt).length
    return {
      projectId,
      projectName: 'Pune Retail Drive',
      canManage: role !== 'sales_person',
      certifiedAt: done === required.length ? iso() : null,
      requiredCount: required.length,
      doneCount: done,
      percent: Math.round((done / required.length) * 100),
      roleplayEnabled: true,
      roleplayLeftToday: 3,
      courses: [{ id: 'course-1', title: training.course.title, description: training.course.description, lessons }],
      campaignLessons: [],
    }
  }
  const roster = () => [
    {
      user: { id: ids.priya, name: 'Priya Desai', phone: '9811111111', email: 'priya@example.test' },
      role: 'sales_person',
      projects: [{ id: ids.online, name: 'Pune Retail Drive' }],
      onLeave: null,
      nextLeave: null,
      backup: { id: '99999999-9999-4999-8999-999999999999', name: 'Karan Mehta' },
      lastActivityAt: iso(),
      followUpsToday: 4,
      openLeads: 18,
      dueToday: 3,
      overdue: 1,
      target: { count: 10, period: 'weekly', achieved: 6 },
    },
    {
      user: { id: '99999999-9999-4999-8999-999999999999', name: 'Karan Mehta', phone: null, email: 'karan@example.test' },
      role: 'sales_person',
      projects: [{ id: ids.online, name: 'Pune Retail Drive' }],
      onLeave: { startsOn: today, endsOn: today },
      nextLeave: null,
      backup: { id: ids.priya, name: 'Priya Desai' },
      lastActivityAt: null,
      followUpsToday: 0,
      openLeads: 9,
      dueToday: 2,
      overdue: 0,
      target: null,
    },
  ]

  /** Every request, and the non-GET ones separately, for assertions. */
  const writes = []
  const calls = []

  function handle({ method, path, contentType, body }) {
    const [p, qs = ''] = path.split('?')
    const query = new URLSearchParams(qs)
    calls.push({ method, path: p, query: Object.fromEntries(query) })
    if (method !== 'GET') writes.push({ method, path: p, contentType, body })
    const json = () => JSON.parse(body ?? '{}')

    if (p === '/auth/me') return ok(me)
    if (p === '/auth/logout') return ok(null, 'Signed out.')
    if (p === '/me/home')
      return ok({
        targets: [
          {
            projectId: ids.online,
            projectName: projects[0].name,
            user: { id: me.id, name: me.name },
            role: 'sales_person',
            targetCount: 20,
            targetPeriod: 'weekly',
            achieved: 12,
            progressPercent: 60,
            periodStart: iso(),
            periodEnd: iso(),
            conversionsThisWeek: 12,
            conversionsThisMonth: 30,
          },
        ],
        dueToday: 4,
        overdue: 1,
        followUpsToday: 7,
        myLeads: 42,
        notice: null,
        conversionsThisMonth: 30,
        revenueThisMonth: 74970,
      })
    if (p === '/settings/plan-prices' && method === 'GET') return ok(planPrices)
    if (p === '/settings/plan-prices' && method === 'PUT') {
      if (role !== 'super_admin') return fail(403, 'FORBIDDEN', 'You don’t have access to this. Ask your sales manager if you need it.')
      for (const x of json().prices) planPrices.find((y) => y.plan === x.plan).monthlyPrice = x.monthlyPrice
      return ok(planPrices, 'Plan prices saved.')
    }
    if (p === '/offers' && method === 'GET') return ok(offers.filter((o) => (query.get('active') === 'true' || role !== 'super_admin' ? offerLive(o) : true)))
    if (p === '/offers' && method === 'POST') {
      const o = { id: `eeeeeee${offers.length + 1}-eeee-4eee-8eee-eeeeeeeeeeee`, couponCode: null, startsOn: null, endsOn: null, active: true, ...json() }
      offers.unshift(o)
      return ok(o, 'Offer saved.', 201)
    }
    {
      const om = p.match(/^\/offers\/([^/]+)$/)
      const o = om && offers.find((x) => x.id === om[1])
      if (om && !o) return fail(404, 'NOT_FOUND', 'We couldn’t find this offer.')
      if (o && method === 'PATCH') return ok(Object.assign(o, json()), 'Offer saved.')
      if (o && method === 'DELETE') return (offers.splice(offers.indexOf(o), 1), ok(null, 'Offer removed.'))
    }
    if (p === '/me/agenda') return ok({ overdue: 1, today: 3, tomorrow: 2, thisWeek: 5, cold: 3, untouched: 4 })
    if (p === '/me/due-today') return ok(page([0, 1, 2, 3].map((i) => lead(i))))
    // The area a position is in (the API asks OpenStreetMap). Out at sea: no name known.
    if (p === '/geo/reverse') {
      const lat = Number(query.get('lat'))
      const lng = Number(query.get('lng'))
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { status: 400, body: { success: false, errorCode: 'VALIDATION_FAILED', message: 'Some details need a fix.' } }
      if (Math.abs(lat) < 1 && Math.abs(lng) < 1) return ok(null)
      return ok({ area: 'Wanowrie', label: 'Wanowrie Road, Wanowrie, Pune 411040' })
    }
    if (p === '/visits/capture-token') return ok({ captureToken: 'v1.test.sig', issuedAt: iso(), expiresAt: new Date(Date.now() + 600_000).toISOString() }, 'Saved.')
    if (p === '/timeline') return ok({ date: today, user: { id: me.id, name: me.name }, entries: day(), followUps: 3, visits: 2, statusChanges: 1, message: null })
    if (p === '/dashboard') return ok(dashboard())
    if (p === '/timeline/summary') {
      // Deterministic days so a test can predict totals: busier midweek, quiet weekends.
      const days = []
      for (let d = query.get('from'); d <= query.get('to'); d = new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
        const wd = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7
        const busy = d > today || query.get('userId') === ids.modOther ? 0 : wd >= 5 ? 0 : wd + 1
        days.push({ date: d, followUps: busy, visits: busy > 2 ? 1 : 0, statusChanges: busy === 4 ? 1 : 0, newLeads: busy > 1 ? 1 : 0, conversions: busy === 3 ? 1 : 0 })
      }
      const sum = (k) => days.reduce((n, x) => n + x[k], 0)
      const who = users.find((u) => u.id === query.get('userId'))
      return ok({
        from: query.get('from'),
        to: query.get('to'),
        user: { id: query.get('userId'), name: who?.name ?? 'Priya Desai' },
        totals: {
          followUps: sum('followUps'),
          visits: sum('visits'),
          statusChanges: sum('statusChanges'),
          newLeads: sum('newLeads'),
          conversions: sum('conversions'),
          activeDays: days.filter((x) => x.followUps + x.statusChanges > 0).length,
        },
        days,
      })
    }
    if (p === '/exports/leads' || p === '/exports/follow-ups')
      return {
        status: 200,
        raw: '﻿Lead ID,Name\r\n1,Asha\r\n',
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${p.slice(9)}_${query.get('from')}_${query.get('to')}.csv"`,
          'access-control-expose-headers': 'Content-Disposition',
        },
      }

    // ---- users
    if (p === '/users' && method === 'GET') {
      let list = users.filter((u) => (!query.get('role') || u.role === query.get('role')) && (query.get('isActive') === null || String(u.isActive) === query.get('isActive')))
      if (role === 'moderator') list = list.filter((u) => u.role === 'sales_person')
      return ok(page(list))
    }
    if (p === '/users' && method === 'POST') {
      const b = json()
      if (b.email === 'old@example.test')
        return fail(409, 'USER_DEACTIVATED_EXISTS', 'This email belongs to someone who left the team. Bring them back to the team instead of adding them again.', {
          userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          name: 'Old Timer',
          role: 'sales_person',
        })
      const u = {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        name: b.name,
        email: b.email,
        phone: b.phone ?? null,
        role: b.role,
        isActive: true,
        createdBy: me.id,
        createdAt: iso(),
        canManage: true,
        canManageAccount: true,
      }
      users.push(u)
      return ok(u, 'Added to the team. We’ve emailed them an invite to set a password.', 201)
    }
    let m
    // ---- team scorecard and rep review
    if (p === '/reports/scorecard') {
      const rows = scorecardRows(query.get('projectId'))
      const total = (k) => rows.reduce((n, r) => n + r[k], 0)
      const mean = (k) => Math.round((total(k) / rows.length) * 10) / 10
      const keys = Object.keys(rows[0]).filter((k) => typeof rows[0][k] === 'number')
      const totals = Object.fromEntries(keys.map((k) => [k, total(k)]))
      const averages = Object.fromEntries(keys.map((k) => [k, mean(k)]))
      return ok({
        from: query.get('from'),
        to: query.get('to'),
        daysSoFar: 13,
        rows,
        totals: { ...totals, conversionPercent: 60, avgDaysToWin: 9.5, target: 20, targetPercent: 60 },
        averages: { ...averages, conversionPercent: 58, avgDaysToWin: 9.8 },
      })
    }
    if ((m = p.match(/^\/reports\/people\/([^/]+)\/review$/))) {
      const all = scorecardRows()
      const row = all.find((r) => r.user.id === m[1])
      if (!row) return fail(404, 'NOT_FOUND', 'We couldn’t find this person on your team.')
      const from = query.get('from')
      const to = query.get('to')
      const trend = []
      for (let d = from, i = 0; d <= to; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10), i++)
        trend.push({ date: d, followUps: d > today ? 0 : (i % 5) + 1, visits: d > today ? 0 : i % 3 === 0 ? 1 : 0, newLeads: i % 4 === 0 ? 1 : 0, wins: i % 6 === 0 ? 1 : 0 })
      return ok({
        from,
        to,
        person: { id: row.user.id, name: row.user.name, role: 'sales_person', isActive: row.isActive, campaigns: row.campaigns },
        numbers: row,
        teamAverage: { ...row, dealsWon: 4, wonRevenue: 9996, followUps: 46.7, visits: 12, conversionPercent: 58, targetPercent: 60, overdueNow: 2, avgDaysToWin: 9.8, target: 10 },
        teamSize: all.length,
        trendBucket: 'day',
        trend,
        funnel: [
          { stage: 'created', count: 12 },
          { stage: 'contacted', count: 10 },
          { stage: 'interested', count: 7 },
          { stage: 'converted', count: row.dealsWon },
        ],
        lostReasons: [
          { reason: 'price', count: 3 },
          { reason: 'competitor', count: 1 },
        ],
        sources: [
          { source: 'walk_in', count: 7 },
          { source: 'referral', count: 3 },
          { source: 'unspecified', count: 2 },
        ],
        planMix: [
          { plan: 'growth', count: 4, revenue: 9996 },
          { plan: 'pro', count: 2, revenue: 4998 },
        ],
        // A full month: the 10 latest wins and 5 notes, as the API sends at most.
        recentWins: [
          { leadId: ids.lead, leadName: 'Asha Patil', businessName: 'Patil Sweets', projectName: 'Pune Retail Drive', plan: 'growth', dealValue: 2499, wonAt: iso() },
          {
            leadId: '22222222-2222-4222-8222-222222222222',
            leadName: 'Neha Joshi',
            businessName: null,
            projectName: 'Pune Retail Drive',
            plan: 'pro',
            dealValue: 4999,
            wonAt: iso(),
          },
          ...Array.from({ length: 8 }, (_, i) => ({
            leadId: `w${i}`,
            leadName: `Bakery ${i + 1}`,
            businessName: `Sweet Spot ${i + 1}`,
            projectName: 'Pune Retail Drive',
            plan: 'growth',
            dealValue: 1999,
            wonAt: iso(),
          })),
        ],
        weekdays: [8, 9, 7, 10, 6, 3, 0].map((followUps, weekday) => ({ weekday, followUps, visits: Math.floor(followUps / 3) })),
        feedback: {
          count: 5,
          recent: [
            {
              id: 'f1',
              body: 'Great visit notes, keep the photos clear.',
              author: { id: ids.modOther, name: 'Farah Khan' },
              leadId: ids.lead,
              leadName: 'Asha Patil',
              entryId: 'e1',
              createdAt: iso(),
            },
            {
              id: 'f2',
              body: 'Call back within two days after a demo.',
              author: { id: ids.modOther, name: 'Farah Khan' },
              leadId: ids.lead,
              leadName: 'Asha Patil',
              entryId: 'e2',
              createdAt: iso(),
            },
            ...[3, 4, 5].map((i) => ({
              id: `f${i}`,
              body: 'Good follow-up. Next time, show the billing screen and the daily sales report before talking price, and leave the brochure with the owner so the family can see it too.',
              author: { id: ids.modOther, name: 'Farah Khan' },
              leadId: ids.lead,
              leadName: 'Asha Patil',
              entryId: `e${i}`,
              createdAt: iso(),
            })),
          ],
        },
      })
    }
    if (p === '/exports/scorecard')
      return {
        status: 200,
        raw: '﻿Sales rep,Campaign(s),Leads added\r\nPriya Desai,Pune Retail Drive,12\r\n',
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="scorecard_${query.get('from')}_${query.get('to')}.csv"`,
          'access-control-expose-headers': 'Content-Disposition',
        },
      }
    // ---- team collaboration
    if (p === '/notifications/unread-count') return ok({ count: notifications.filter((n) => !n.readAt).length })
    if (p === '/notifications' && method === 'GET') return ok(page(notifications))
    if (p === '/notifications/read') {
      const b = json()
      notifications.forEach((n) => (b.all || b.ids?.includes(n.id)) && (n.readAt = iso()))
      return ok(null, 'Marked as read.')
    }
    if (p === '/me/covering')
      return ok(
        role === 'super_admin'
          ? []
          : [
              {
                user: { id: ids.priya, name: 'Priya Desai' },
                projectId: ids.online,
                projectName: 'Pune Retail Drive',
                leave: { startsOn: today, endsOn: today },
                dueToday: 2,
                overdue: 1,
              },
            ],
      )
    if (p === '/leaves' && method === 'GET') return ok(leaves)
    if (p === '/leaves' && method === 'POST') {
      const b = json()
      const l = {
        id: `leave-${leaves.length + 1}`,
        user: { id: b.userId ?? me.id, name: b.userId ? 'Priya Desai' : me.name },
        startsOn: b.startsOn,
        endsOn: b.endsOn,
        note: b.note ?? null,
        createdBy: { id: me.id, name: me.name },
        createdAt: iso(),
      }
      leaves.push(l)
      return ok(l, 'Leave saved.', 201)
    }
    if ((m = p.match(/^\/leaves\/([^/]+)$/)) && method === 'DELETE') return ok(null, 'Leave cancelled.')
    if ((m = p.match(/^\/leads\/([^/]+)\/comments$/)) && method === 'GET') return ok(comments)
    if ((m = p.match(/^\/leads\/([^/]+)\/(comments|help)$/)) && method === 'POST') {
      const b = json()
      const c = {
        id: `c-${comments.length + 1}`,
        kind: m[2] === 'help' ? 'help' : (b.kind ?? 'comment'),
        body: b.body,
        user: { id: me.id, name: me.name },
        mentions: [],
        pinned: false,
        entryId: b.entryId ?? null,
        resolvedAt: null,
        resolvedBy: null,
        createdAt: iso(),
        editedAt: null,
        canEdit: true,
        canDelete: true,
        canPin: true,
        canResolve: true,
      }
      comments.push(c)
      return ok(c, 'Note saved.', 201)
    }
    if ((m = p.match(/^\/leads\/([^/]+)\/mentionable$/)))
      return ok([
        { id: ids.modOther, name: 'Farah Khan' },
        { id: ids.priya, name: 'Priya Desai' },
      ])
    if ((m = p.match(/^\/comments\/([^/]+)(\/resolve)?$/))) return ok(null, m[2] ? 'Help request resolved.' : method === 'DELETE' ? 'Note deleted.' : 'Note saved.')
    if ((m = p.match(/^\/projects\/([^/]+)\/leaderboard$/)))
      return ok({
        period: query.get('period') ?? 'week',
        from: today,
        to: today,
        rows: [
          { user: { id: ids.priya, name: 'Priya Desai' }, role: 'sales_person', conversions: 6, followUps: 21, rank: 1, isMe: false },
          { user: { id: me.id, name: me.name }, role: 'sales_person', conversions: 4, followUps: 18, rank: 2, isMe: true },
        ],
      })
    if (p === '/team/roster') return ok(roster())
    if ((m = p.match(/^\/projects\/([^/]+)\/templates$/)) && method === 'GET') return ok(templates)
    if ((m = p.match(/^\/projects\/([^/]+)\/templates$/)) && method === 'POST') {
      const t = { id: `t-${templates.length + 1}`, sort: templates.length, ...json() }
      templates.push(t)
      return ok(t, 'Ready message saved.', 201)
    }
    if ((m = p.match(/^\/templates\/([^/]+)$/))) return ok(templates[0] ?? null, 'Ready message saved.')
    if ((m = p.match(/^\/projects\/([^/]+)\/training$/))) return ok(campaignTraining(m[1]))
    if ((m = p.match(/^\/projects\/([^/]+)\/training\/board$/)))
      return ok({
        lessons: training.lessons.map(({ id, title, kind, required }) => ({ id, title, kind, required })),
        members: [
          {
            userId: ids.me,
            name: 'Ravi Kumar',
            role: 'sales_person',
            doneCount: 4,
            requiredCount: 4,
            percent: 100,
            certifiedAt: iso(),
            quizBest: 100,
            practiceBest: 82,
            practiceCount: 2,
            lastActivityAt: iso(),
            completedLessonIds: [],
          },
          {
            userId: ids.priya,
            name: 'Priya Desai',
            role: 'sales_person',
            doneCount: 1,
            requiredCount: 4,
            percent: 25,
            certifiedAt: null,
            quizBest: null,
            practiceBest: null,
            practiceCount: 0,
            lastActivityAt: iso(),
            completedLessonIds: [],
          },
        ],
        recentPitches: [{ id: 'pitch-1', userId: ids.me, userName: 'Ravi Kumar', lessonTitle: 'Pitch Ravi: single bakery', score: 82, startedAt: iso(), finishedAt: iso() }],
      })
    if ((m = p.match(/^\/projects\/([^/]+)\/training\/courses$/)))
      return ok(method === 'PUT' ? [training.course] : [training.course], method === 'PUT' ? 'Campaign training updated.' : undefined)
    if ((m = p.match(/^\/projects\/([^/]+)\/training\/items$/))) return method === 'POST' ? ok({ id: 'les-local', ...json() }, 'Lesson saved.', 201) : ok([])
    if (p === '/training/courses')
      return method === 'POST'
        ? ok({ ...training.course, id: 'course-2', ...json(), published: false, lessonCount: 0, campaignCount: 0 }, 'Course saved.', 201)
        : ok([training.course])
    if ((m = p.match(/^\/training\/courses\/([^/]+)\/items$/)))
      return ok({ id: 'les-new', courseId: m[1], projectId: null, sort: 0, hasFile: false, summary: null, ...json() }, 'Lesson saved.', 201)
    if ((m = p.match(/^\/training\/courses\/([^/]+)$/)))
      return ok({ course: training.course, lessons: training.lessons.map((l) => ({ ...l, projectId: null, sort: 0, payload: l.content, hasFile: false })) })
    if ((m = p.match(/^\/training\/items\/([^/]+)$/)) && method === 'PATCH') {
      const l = training.lessons.find((x) => x.id === m[1])
      return ok(
        {
          ...l,
          projectId: null,
          sort: 0,
          hasFile: false,
          payload: { ...l?.content, ...json().payload },
          ...json(),
          ...(json().payload ? { payload: { ...l?.content, ...json().payload } } : {}),
        },
        'Lesson saved.',
      )
    }
    if ((m = p.match(/^\/training\/items\/([^/]+)\/file$/))) return ok({ url: '/api/v1/__files/playbook.pdf', fileName: 'Frostique Sales Playbook.pdf' })
    if (p === '/__files/playbook.pdf') return { status: 200, raw: tinyPdf(['Frostique sales playbook', 'Objections and answers']), headers: { 'content-type': 'application/pdf' } }
    if ((m = p.match(/^\/training\/items\/([^/]+)\/progress$/))) {
      const { moduleId, percent, done } = json()
      const modules = training.lessons.find((l) => l.id === m[1])?.content.items ?? []
      if (moduleId) {
        const w = (training.watched[m[1]] ??= {})
        w[moduleId] = Math.max(w[moduleId] ?? 0, done ? 100 : (percent ?? 0))
        if (modules.every((x) => (w[x.youtubeId] ?? 0) >= 90)) training.done[m[1]] = iso()
        return ok({ progress: lessonProgress(m[1]), certifiedNow: false })
      }
      training.done[m[1]] = iso()
      return ok({ progress: lessonProgress(m[1]), certifiedNow: false })
    }
    if ((m = p.match(/^\/training\/items\/([^/]+)\/attempts$/))) {
      const lesson = training.lessons.find((l) => l.id === m[1])
      const qs = lesson.kind === 'quiz' ? lesson.content.questions : lesson.content.checks
      const key = training.answers[m[1]]
      const given = json().answers
      const results = qs.map((q, i) => ({ questionId: q.id, correct: given[i] === key[i], answer: key[i], explanation: training.explanations[q.id] ?? null }))
      const score = Math.round((results.filter((r) => r.correct).length / qs.length) * 100)
      const passed = score >= (lesson.kind === 'quiz' ? lesson.content.passPercent : 100)
      if (passed) training.done[m[1]] = iso()
      training.best[m[1]] = Math.max(training.best[m[1]] ?? 0, score)
      return ok({ score, passed, results, progress: lessonProgress(m[1]), attemptsLeftToday: lesson.kind === 'quiz' ? 2 : null, certifiedNow: false })
    }
    if ((m = p.match(/^\/training\/items\/([^/]+)\/roleplay$/))) {
      if (method === 'GET') return ok([])
      training.pitch = {
        id: 'pitch-2',
        itemId: m[1],
        projectId: ids.online,
        userId: ids.me,
        userName: 'Ravi Kumar',
        lessonTitle: 'Pitch Ravi: single bakery',
        persona: { name: 'Ravi Shinde', shop: 'Shinde Cake House', city: 'Pune', about: 'On Zomato.' },
        turns: [{ role: 'owner', text: 'Haan bolo, kya bechne aaye ho?', at: iso() }],
        repTurns: 0,
        maxTurns: 16,
        finished: false,
        score: null,
        passScore: 70,
        passed: null,
        feedback: null,
        startedAt: iso(),
        finishedAt: null,
        certifiedNow: false,
      }
      return ok(training.pitch, undefined, 201)
    }
    if ((m = p.match(/^\/roleplay\/([^/]+)\/turns$/))) {
      const pitch = training.pitch
      pitch.turns = [...pitch.turns, { role: 'rep', text: json().message, at: iso() }, { role: 'owner', text: 'Zomato pe toh customer already hain. Phir yeh kyun?', at: iso() }]
      pitch.repTurns += 1
      return ok({ ...pitch })
    }
    if ((m = p.match(/^\/roleplay\/([^/]+)\/finish$/))) {
      const pitch = training.pitch
      Object.assign(pitch, {
        finished: true,
        score: 82,
        passed: true,
        finishedAt: iso(),
        feedback: {
          summary: 'You asked about his orders first. Good.',
          strengths: [],
          improvements: ['Ask for the trial earlier.'],
          criteria: [{ criterion: 'Asked how orders come in', met: true, note: 'Asked about Zomato orders.' }],
        },
      })
      training.done[pitch.itemId] = iso()
      return ok({ ...pitch })
    }
    if ((m = p.match(/^\/roleplay\/([^/]+)$/))) return ok(training.pitch ?? { ...training.lessons[3], id: m[1] })
    if ((m = p.match(/^\/projects\/([^/]+)\/members\/([^/]+)\/backup$/))) return ok(null, 'Backup updated.')
    if ((m = p.match(/^\/projects\/([^/]+)\/leads\/request-by-phone$/))) return ok(transfers[0], 'Request sent. The lead moves to you once a manager approves it.', 201)

    if ((m = p.match(/^\/users\/([^/]+)\/(deactivate|reactivate)$/))) {
      const u = users.find((x) => x.id === m[1]) ?? users[0]
      u.isActive = m[2] === 'reactivate'
      return ok(u, m[2] === 'reactivate' ? 'Back on the team.' : 'Removed from the team.')
    }

    // ---- projects
    if (p === '/projects' && method === 'GET') return ok(page(projects.map((x) => projectDto(x))))
    if (p === '/projects' && method === 'POST')
      return ok(projectDto({ id: ids.other, name: 'New Drive', type: 'online', status: 'active' }, { typeLocked: false, memberCount: 0, leadCount: 0 }), 'Saved.', 201)
    if ((m = p.match(/^\/projects\/([^/]+)\/join$/))) return ok(members[0], 'Added to the campaign team.', 201)
    if ((m = p.match(/^\/projects\/([^/]+)\/delete$/)) && method === 'POST') {
      const target = projects.find((x) => x.id === m[1])
      const same = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
      if (!target || same(json().confirmName) !== same(target.name))
        return fail(400, 'VALIDATION_FAILED', 'Type the campaign’s name exactly as it is to delete it.')
      return ok({ leads: 3, followUps: 5, files: 2 }, 'Campaign deleted, with all its leads, visits and photos.')
    }
    if ((m = p.match(/^\/projects\/([^/]+)\/(close|reopen)$/)))
      return ok(
        projectDto(projects[0], { status: m[2] === 'close' ? 'closed' : 'active' }),
        m[2] === 'close' ? 'Campaign closed. It can still be viewed, but not changed.' : 'Campaign reopened.',
      )
    if ((m = p.match(/^\/projects\/([^/]+)\/members\/([^/]+)\/target$/))) return ok(members.find((x) => x.userId === m[2]) ?? members[0], 'Target updated.')
    if ((m = p.match(/^\/projects\/([^/]+)\/members\/([^/]+)$/)) && method === 'DELETE')
      return ok({ ...(members.find((x) => x.userId === m[2]) ?? members[0]), isActive: false }, 'Removed from the campaign team.')
    if ((m = p.match(/^\/projects\/([^/]+)\/members$/))) {
      if (method === 'POST') return ok(members[0], 'Added to the campaign team.', 201)
      return ok(members)
    }
    if ((m = p.match(/^\/projects\/([^/]+)\/leads\/import$/))) {
      const field = (name) => new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`).exec(body ?? '')?.[1]
      if (/filename="wrong\.csv"/.test(body ?? '')) return fail(400, 'VALIDATION_FAILED', 'The top line of the sheet needs headings, including name and phone.')
      const dryRun = field('dryRun') === 'true'
      const owners = (field('ownerIds') ?? '').split(',').filter(Boolean)
      const names = owners.map((id) => users.find((u) => u.id === id)?.name ?? 'Meera Nair')
      const picked = names.length ? names : ['Priya Desai']
      const result = {
        dryRun,
        total: 6,
        importable: 4,
        imported: dryRun ? 0 : 4,
        duplicates: 1,
        invalid: 1,
        unassigned: 0,
        byOwner: picked.map((name, i) => ({
          user: { id: users.find((u) => u.name === name)?.id ?? ids.priya, name },
          count: i === 0 ? Math.ceil(4 / picked.length) : Math.floor(4 / picked.length),
        })),
        problems: [
          { row: 5, kind: 'invalid', name: 'Bad Phone', phone: '12345', reason: 'Phone must be a 10-digit Indian mobile number, or left empty.' },
          { row: 6, kind: 'duplicate', name: 'Asha Patil', phone: '9876543210', reason: 'Already a lead in this campaign, owned by Ravi Kumar.' },
        ],
        problemsTruncated: false,
        sample: [
          { row: 2, name: 'Imran Shaikh', phone: '9123456780', businessName: null, location: field('defaultLocation') ?? 'Kondhwa', owner: { id: ids.priya, name: picked[0] } },
        ],
      }
      // A review lists every row, unassigned, for picking on screen.
      result.rows =
        field('review') === 'true'
          ? [2, 3, 4, 7].map((row, i) => ({ row, name: `Lead ${i + 1}`, phone: `912345678${i}`, businessName: null, location: 'Kondhwa', owner: null }))
          : result.sample
      return ok(result, 'Leads added.')
    }
    if ((m = p.match(/^\/projects\/([^/]+)\/leads\/open$/))) {
      const term = (query.get('search') ?? '').toLowerCase()
      const hits = openLeads.filter((l) => !term || [l.businessName, l.name, l.location.name].some((v) => v?.toLowerCase().includes(term)))
      return ok(page(hits))
    }
    if ((m = p.match(/^\/leads\/([^/]+)\/claim$/))) {
      const at = openLeads.findIndex((l) => l.id === m[1])
      if (m[1] === openLeads[1]?.id) {
        openLeads.splice(at, 1)
        return fail(409, 'CONFLICT', 'Priya Desai has just taken this lead.')
      }
      if (at >= 0) openLeads.splice(at, 1)
      return ok({ leadId: m[1] }, 'The lead is yours now. It’s in My leads.')
    }
    if ((m = p.match(/^\/projects\/([^/]+)\/leads\/delete$/))) return ok({ deleted: json().leadIds.length }, 'Leads deleted.')
    if ((m = p.match(/^\/projects\/([^/]+)\/leads\/reassign$/))) return ok({ reassigned: json().leadIds.length, skipped: 0 }, 'Leads assigned.')
    if ((m = p.match(/^\/projects\/([^/]+)\/leads$/))) {
      // A teammate already has this number: the rep may ask for it.
      if (method === 'POST' && (body ?? '').includes('9811100000'))
        return fail(409, 'DUPLICATE_LEAD_OTHER', 'This number is already a lead in this campaign, owned by Priya Desai.', { canRequest: true })
      if (method === 'POST') return ok(detail({ ...lead(9, m[1]), id: '55555555-5555-4555-8555-555555555555', name: 'New Client' }), 'Lead saved.', 201)
      return ok(page([0, 1, 2, 3].map((i) => lead(i, m[1]))))
    }
    if ((m = p.match(/^\/projects\/([^/]+)\/locations$/)))
      return ok([
        { id: 'l1', name: 'Wanowrie', usageCount: 9 },
        { id: 'l2', name: 'Kondhwa', usageCount: 4 },
      ])
    if ((m = p.match(/^\/projects\/([^/]+)$/))) return ok(projectDto(projects.find((x) => x.id === m[1]) ?? projects[0]))

    // ---- transfers
    if (p === '/transfers/pending-count') return ok({ pending: transfers.filter((t) => t.status === 'pending').length })
    if (p === '/transfers') return ok(page(transfers.filter((t) => !query.get('status') || t.status === query.get('status'))))
    if ((m = p.match(/^\/transfers\/([^/]+)\/(approve|reject)$/))) {
      const t = transfers.find((x) => x.id === m[1])
      if (t.status !== 'pending') return fail(409, 'TRANSFER_ALREADY_DECIDED', 'Already decided by Farah Khan.', { status: t.status })
      Object.assign(t, {
        status: m[2] === 'approve' ? 'approved' : 'rejected',
        decidedBy: { id: me.id, name: me.name },
        decidedAt: iso(),
        decisionNote: json().note ?? null,
        canDecide: false,
      })
      return ok(t, m[2] === 'approve' ? 'Handover approved.' : 'Handover rejected.')
    }

    // ---- leads and entries
    if ((m = p.match(/^\/entries\/([^/]+)\/photo$/))) return ok({ url: PIXEL, expiresInSeconds: 600 })
    if ((m = p.match(/^\/entries\/([^/]+)$/)) && method === 'DELETE') return ok(null, 'Removed.')
    if ((m = p.match(/^\/entries\/([^/]+)$/))) {
      const found = day().find((e) => e.id === m[1]) ?? day()[1]
      if (method === 'PATCH') return ok({ entry: { ...found, edited: true }, lead: lead(0) }, 'Changes saved.')
      return ok(found)
    }
    if ((m = p.match(/^\/leads\/([^/]+)\/reassign$/))) return ok({ reassigned: 1, skipped: 0 }, 'Leads assigned.')
    if ((m = p.match(/^\/leads\/([^/]+)$/)) && method === 'DELETE') return ok(null, 'Removed.')
    if ((m = p.match(/^\/entries\/([^/]+)$/)) && method === 'DELETE') return ok(null, 'Removed.')
    if ((m = p.match(/^\/leads\/([^/]+)\/follow-ups$/))) {
      // The saved lead takes the status that was sent (multipart bodies keep the default).
      let status
      try {
        status = JSON.parse(body ?? '{}').status
      } catch {
        status = undefined
      }
      return ok({ entry: entry(8), lead: { ...lead(0), ...(status ? { status } : {}) } }, 'Follow-up saved.', 201)
    }
    if ((m = p.match(/^\/leads\/([^/]+)$/))) return ok(detail({ ...lead(Number(m[1][7]), m[1] === ids.d2dLead ? ids.d2d : ids.online), id: m[1] }))
    // ---- release notes
    if (p === '/versions/latest') {
      const live = versions.find((v) => v.isPublished)
      return ok(live ? { ...live, seen: seenVersions.has(live.id) } : null)
    }
    if (p === '/versions/admin') return ok(versions.map((v) => ({ ...v, seenCount: seenVersions.has(v.id) ? 1 : 0 })))
    if (p === '/versions' && method === 'GET') return ok(versions.filter((v) => v.isPublished).map((v) => ({ ...v, seen: seenVersions.has(v.id) })))
    if (p === '/versions' && method === 'POST') return ok({ ...versions[0], id: 'new', version: '9.9.9' }, 'Saved.', 201)
    if ((m = p.match(/^\/versions\/([^/]+)\/seen$/))) {
      seenVersions.add(m[1])
      return { status: 204, raw: '' }
    }
    if ((m = p.match(/^\/versions\/([^/]+)\/views$/))) return ok({ seen: [{ userId: me.id, name: me.name, email: me.email, role: 'sales_person', seenAt: iso() }], pending: 3 })
    if ((m = p.match(/^\/versions\/([^/]+)$/)) && method === 'PATCH') return ok(versions.find((v) => v.id === m[1]) ?? versions[0], 'Changes saved.')
    if ((m = p.match(/^\/versions\/([^/]+)$/)) && method === 'DELETE') return { status: 204, raw: '' }

    return fail(404, 'NOT_FOUND', `mock: no route for ${method} ${p}`)
  }

  return { handle, writes, calls, me }
}

/** A real, minimal PDF with one line of text per page, so the in-app reader can be tested. */
function tinyPdf(lines) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const kids = []
  for (const line of lines) {
    const stream = `BT /F1 24 Tf 72 720 Td (${line}) Tj ET`
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length} 0 R >>`)
    kids.push(`${objects.length} 0 R`)
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`
  let out = '%PDF-1.4\n'
  const offsets = objects.map((o, i) => {
    const at = out.length
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
    return at
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return out
}
