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
  transfer: '77777777-7777-4777-8777-777777777777',
}

// 1x1 PNG, so photos render without any network.
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

/** role: 'sales_person' | 'moderator' | 'super_admin' */
export function createMockApi({ role = 'sales_person' } = {}) {
  const projects = [
    { id: ids.online, name: 'Pune Retail Drive', type: 'online', status: 'active', targetCount: 20, targetPeriod: 'weekly' },
    { id: ids.d2d, name: 'Kondhwa Door-to-door', type: 'door_to_door', status: 'active', targetCount: null, targetPeriod: null },
  ]
  const me = { id: ids.me, name: role === 'sales_person' ? 'Ravi Kumar' : role === 'moderator' ? 'Meera Nair' : 'Adeeb Shah', email: 'user@example.test', phone: '9876543210', role, projects: role === 'super_admin' ? [] : projects, notice: null }
  const names = ['Asha Patil', 'Imran Shaikh', 'Neha Joshi', 'Suresh Rao']
  const lead = (i, projectId = ids.online) => ({
    id: `2222222${i}-2222-4222-8222-222222222222`, projectId, name: names[i % 4], businessName: ['Patil General Store', null, 'Joshi Medicals', 'Rao Hardware'][i % 4],
    phone: `98100000${String(i).padStart(2, '0')}`, status: ['contacted', 'interested', 'follow_up_scheduled', 'new'][i % 4], nextFollowUpDate: today, overdueDays: i === 1 ? 2 : null,
    location: { id: 'loc', name: 'Wanowrie' }, owner: { id: i === 3 ? ids.priya : me.id, name: i === 3 ? 'Priya Desai' : me.name, isActive: true }, ownerTag: null, convertedAt: null,
    hasPendingTransfer: false, createdAt: iso(), updatedAt: iso(),
  })
  const entry = (i, extra = {}) => ({
    id: `3333333${i}-3333-4333-8333-333333333333`, leadId: ids.lead, projectId: ids.online, entryType: 'follow_up', status: 'contacted', note: 'Met the owner, interested in the monthly plan.', nextFollowUpDate: today,
    location: { id: 'loc', name: 'Wanowrie' }, hasPhoto: false, photoUrl: null, latitude: null, longitude: null, gpsAccuracyM: null, lowAccuracy: false,
    user: { id: me.id, name: me.name }, createdAt: iso(), updatedAt: iso(), edited: false, editable: true, ...extra,
  })
  const projectRef = (i) => ({ id: projects[i].id, name: projects[i].name, type: projects[i].type, status: 'active' })
  const day = () => [
    { ...entry(1, { note: 'Phone call, asked for a quote.' }), lead: { id: ids.lead, name: 'Asha Patil', businessName: 'Patil General Store' }, project: projectRef(0) },
    { ...entry(2, { note: 'Visited the shop, owner present.', hasPhoto: true, photoUrl: PIXEL, latitude: 18.4966, longitude: 73.8993, gpsAccuracyM: 12, projectId: ids.d2d }), lead: { id: '22222221-2222-4222-8222-222222222222', name: 'Imran Shaikh', businessName: null }, project: projectRef(1) },
    { ...entry(3, { note: 'Second visit, low signal here.', hasPhoto: true, photoUrl: PIXEL, latitude: 18.5, longitude: 73.9, gpsAccuracyM: 160, lowAccuracy: true, projectId: ids.d2d }), lead: { id: '22222222-2222-4222-8222-222222222222', name: 'Neha Joshi', businessName: 'Joshi Medicals' }, project: projectRef(1) },
    { ...entry(4, { entryType: 'status_change', editable: false, note: 'Customer confirmed by phone.' }), lead: { id: ids.lead, name: 'Asha Patil', businessName: 'Patil General Store' }, project: projectRef(0) },
  ]
  const detail = (base) => {
    const p = projects.find((x) => x.id === base.projectId) ?? projects[0]
    return {
      ...base, notes: 'Prefers calls after 4 pm.', project: { id: p.id, name: p.name, type: p.type, status: p.status }, convertedBy: null, recentEntries: [entry(0)], entryCount: 1, pendingTransfer: null, lastDecidedTransfer: null,
      permissions:
        role === 'sales_person'
          ? { canLogFollowUp: true, canChangeStatus: true, canLeaveConverted: false, canEdit: true, canRequestTransfer: true, canReassign: false, canDelete: false }
          : { canLogFollowUp: false, canChangeStatus: true, canLeaveConverted: true, canEdit: false, canRequestTransfer: false, canReassign: true, canDelete: role === 'super_admin' },
    }
  }

  // ---- admin state
  const users = [
    { id: ids.priya, name: 'Priya Desai', email: 'priya@example.test', phone: '9811111111', role: 'sales_person', isActive: true, createdBy: ids.me, createdAt: iso(), canManage: true },
    { id: '99999999-9999-4999-8999-999999999999', name: 'Karan Mehta', email: 'karan@example.test', phone: null, role: 'sales_person', isActive: true, createdBy: ids.me, createdAt: iso(), canManage: true },
    { id: ids.modOther, name: 'Farah Khan', email: 'farah@example.test', phone: null, role: 'moderator', isActive: true, createdBy: null, createdAt: iso(), canManage: role === 'super_admin' },
  ]
  const members = [
    { userId: ids.priya, name: 'Priya Desai', role: 'sales_person', userIsActive: true, isActive: true, joinedAt: iso(), email: 'priya@example.test', phone: '9811111111', targetCount: 10, targetPeriod: 'weekly', removedAt: null },
    { userId: ids.modOther, name: 'Farah Khan', role: 'moderator', userIsActive: true, isActive: true, joinedAt: iso(), email: 'farah@example.test', phone: null, targetCount: null, targetPeriod: null, removedAt: null },
    ...(role === 'sales_person' ? [] : [{ userId: ids.me, name: me.name, role, userIsActive: true, isActive: true, joinedAt: iso(), email: me.email, phone: null, targetCount: null, targetPeriod: null, removedAt: null }]),
  ]
  const projectDto = (p, extra = {}) => ({
    id: p.id, name: p.name, description: p.id === ids.online ? 'Retail outreach across Pune.' : null, imageUrl: null, type: p.type, status: p.status, startDate: '2026-09-01', endDate: null, closedAt: null, createdAt: iso(),
    pastEndDate: false, typeLocked: true, memberCount: members.length, leadCount: 42, ...extra,
  })
  const transfers = [
    { id: ids.transfer, lead: { id: ids.lead, name: 'Asha Patil', businessName: 'Patil General Store', projectId: ids.online, projectName: 'Pune Retail Drive' }, fromUser: { id: ids.priya, name: 'Priya Desai' }, toUser: { id: '99999999-9999-4999-8999-999999999999', name: 'Karan Mehta' }, requestedBy: { id: ids.priya, name: 'Priya Desai' }, reason: 'Karan lives next to the shop.', status: 'pending', createdAt: iso(), decidedBy: null, decidedAt: null, decisionNote: null, canDecide: true },
  ]
  const dashboard = () => ({
    from: today, to: today,
    targets: [
      { projectId: ids.online, projectName: 'Pune Retail Drive', user: { id: ids.priya, name: 'Priya Desai' }, role: 'sales_person', targetCount: 10, targetPeriod: 'weekly', achieved: 6, progressPercent: 60, periodStart: iso(), periodEnd: iso(), conversionsThisWeek: 6, conversionsThisMonth: 14 },
      { projectId: ids.online, projectName: 'Pune Retail Drive', user: { id: '99999999-9999-4999-8999-999999999999', name: 'Karan Mehta' }, role: 'sales_person', targetCount: null, targetPeriod: null, achieved: 2, progressPercent: null, periodStart: iso(), periodEnd: iso(), conversionsThisWeek: 2, conversionsThisMonth: 5 },
    ],
    newLeads: 6, followUps: 14, followUpsToday: 5,
    people: [{ user: { id: ids.priya, name: 'Priya Desai' }, role: 'sales_person', newLeads: 4, followUps: 9, conversions: 2, followUpsToday: 3 }],
    loggedNothingToday: [{ user: { id: '99999999-9999-4999-8999-999999999999', name: 'Karan Mehta' }, role: 'sales_person', projects: ['Pune Retail Drive'] }],
    leadsByStatus: ['new', 'contacted', 'interested', 'follow_up_scheduled', 'not_interested', 'converted', 'lost'].map((status, i) => ({ status, count: 20 - i * 3 })),
    conversionsThisWeek: [{ leadId: ids.lead, leadName: 'Asha Patil', businessName: 'Patil General Store', phone: '9810000000', projectName: 'Pune Retail Drive', convertedBy: { id: ids.priya, name: 'Priya Desai' }, currentOwner: { id: ids.priya, name: 'Priya Desai' }, convertedAt: iso(), via: 'follow_up' }],
    pendingTransfers: transfers.filter((t) => t.status === 'pending').length, message: null,
  })

  const page = (items) => ({ items, meta: { page: 1, limit: 20, total: items.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false } })
  const ok = (data, message = 'Fetched successfully.', status = 200) => ({ status, body: { success: true, statusCode: status, message, data } })
  const fail = (status, errorCode, message, details) => ({ status, body: { success: false, statusCode: status, errorCode, message, ...(details ? { details } : {}) } })

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
      return ok({ targets: [{ projectId: ids.online, projectName: projects[0].name, user: { id: me.id, name: me.name }, role: 'sales_person', targetCount: 20, targetPeriod: 'weekly', achieved: 12, progressPercent: 60, periodStart: iso(), periodEnd: iso(), conversionsThisWeek: 12, conversionsThisMonth: 30 }], dueToday: 4, overdue: 1, followUpsToday: 7, myLeads: 42, notice: null })
    if (p === '/me/due-today') return ok(page([0, 1, 2, 3].map((i) => lead(i))))
    if (p === '/visits/capture-token') return ok({ captureToken: 'v1.test.sig', issuedAt: iso(), expiresAt: new Date(Date.now() + 600_000).toISOString() }, 'Created successfully.')
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
      return ok({ from: query.get('from'), to: query.get('to'), user: { id: query.get('userId'), name: who?.name ?? 'Priya Desai' }, totals: { followUps: sum('followUps'), visits: sum('visits'), statusChanges: sum('statusChanges'), newLeads: sum('newLeads'), conversions: sum('conversions'), activeDays: days.filter((x) => x.followUps + x.statusChanges > 0).length }, days })
    }
    if (p === '/exports/leads' || p === '/exports/follow-ups') return { status: 200, raw: '﻿Lead ID,Name\r\n1,Asha\r\n', headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${p.slice(9)}_${query.get('from')}_${query.get('to')}.csv"`, 'access-control-expose-headers': 'Content-Disposition' } }

    // ---- users
    if (p === '/users' && method === 'GET') {
      let list = users.filter((u) => (!query.get('role') || u.role === query.get('role')) && (query.get('isActive') === null || String(u.isActive) === query.get('isActive')))
      if (role === 'moderator') list = list.filter((u) => u.role === 'sales_person')
      return ok(page(list))
    }
    if (p === '/users' && method === 'POST') {
      const b = json()
      if (b.email === 'old@example.test') return fail(409, 'USER_DEACTIVATED_EXISTS', 'This email belongs to a deactivated user. Reactivate that user instead of creating a new one.', { userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Old Timer', role: 'sales_person' })
      const u = { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: b.name, email: b.email, phone: b.phone ?? null, role: b.role, isActive: true, createdBy: me.id, createdAt: iso(), canManage: true }
      users.push(u)
      return ok(u, 'User created. An email has been sent to set the password.', 201)
    }
    let m
    if ((m = p.match(/^\/users\/([^/]+)\/(deactivate|reactivate)$/))) {
      const u = users.find((x) => x.id === m[1]) ?? users[0]
      u.isActive = m[2] === 'reactivate'
      return ok(u, m[2] === 'reactivate' ? 'User reactivated.' : 'User deactivated.')
    }

    // ---- projects
    if (p === '/projects' && method === 'GET') return ok(page(projects.map((x) => projectDto(x))))
    if (p === '/projects' && method === 'POST') return ok(projectDto({ id: ids.other, name: 'New Drive', type: 'online', status: 'active' }, { typeLocked: false, memberCount: 0, leadCount: 0 }), 'Created successfully.', 201)
    if (p === '/projects/joinable') return ok([projectDto({ id: ids.other, name: 'Baner Expansion', type: 'online', status: 'active' }, { memberCount: 3, leadCount: 8 })])
    if ((m = p.match(/^\/projects\/([^/]+)\/join$/))) return ok(members[0], 'Project assigned to you.', 201)
    if ((m = p.match(/^\/projects\/([^/]+)\/(close|reopen)$/))) return ok(projectDto(projects[0], { status: m[2] === 'close' ? 'closed' : 'active' }), m[2] === 'close' ? 'Project closed. It is now read-only.' : 'Project reopened.')
    if ((m = p.match(/^\/projects\/([^/]+)\/members\/([^/]+)\/target$/))) return ok(members.find((x) => x.userId === m[2]) ?? members[0], 'Target updated.')
    if ((m = p.match(/^\/projects\/([^/]+)\/members\/([^/]+)$/)) && method === 'DELETE') return ok({ ...(members.find((x) => x.userId === m[2]) ?? members[0]), isActive: false }, 'Member removed from the project.')
    if ((m = p.match(/^\/projects\/([^/]+)\/members$/))) {
      if (method === 'POST') return ok(members[0], 'Member added to the project.', 201)
      return ok(members)
    }
    if ((m = p.match(/^\/projects\/([^/]+)\/leads\/import$/))) {
      const field = (name) => new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`).exec(body ?? '')?.[1]
      if (/filename="wrong\.csv"/.test(body ?? '')) return fail(400, 'VALIDATION_FAILED', 'The first row must name the columns, including name and phone.')
      const dryRun = field('dryRun') === 'true'
      const owners = (field('ownerIds') ?? '').split(',').filter(Boolean)
      const names = owners.map((id) => users.find((u) => u.id === id)?.name ?? 'Meera Nair')
      const picked = names.length ? names : ['Priya Desai']
      const result = {
        dryRun, total: 6, importable: 4, imported: dryRun ? 0 : 4, duplicates: 1, invalid: 1,
        byOwner: picked.map((name, i) => ({ user: { id: users.find((u) => u.name === name)?.id ?? ids.priya, name }, count: i === 0 ? Math.ceil(4 / picked.length) : Math.floor(4 / picked.length) })),
        problems: [
          { row: 5, kind: 'invalid', name: 'Bad Phone', phone: '12345', reason: 'Phone must be a 10-digit Indian mobile number.' },
          { row: 6, kind: 'duplicate', name: 'Asha Patil', phone: '9876543210', reason: 'Already a lead in this project, owned by Ravi Kumar.' },
        ],
        problemsTruncated: false,
        sample: [{ row: 2, name: 'Imran Shaikh', phone: '9123456780', businessName: null, location: field('defaultLocation') ?? 'Kondhwa', owner: { id: ids.priya, name: picked[0] } }],
      }
      // A review lists every row, unassigned, for picking on screen.
      result.rows = field('review') === 'true'
        ? [2, 3, 4, 7].map((row, i) => ({ row, name: `Lead ${i + 1}`, phone: `912345678${i}`, businessName: null, location: 'Kondhwa', owner: null }))
        : result.sample
      return ok(result, 'Leads imported.')
    }
    if ((m = p.match(/^\/projects\/([^/]+)\/leads\/reassign$/))) return ok({ reassigned: json().leadIds.length, skipped: 0 }, 'Leads reassigned.')
    if ((m = p.match(/^\/projects\/([^/]+)\/leads$/))) {
      if (method === 'POST') return ok(detail({ ...lead(9, m[1]), id: '55555555-5555-4555-8555-555555555555', name: 'New Client' }), 'Lead saved.', 201)
      return ok(page([0, 1, 2, 3].map((i) => lead(i, m[1]))))
    }
    if ((m = p.match(/^\/projects\/([^/]+)\/locations$/))) return ok([{ id: 'l1', name: 'Wanowrie', usageCount: 9 }, { id: 'l2', name: 'Kondhwa', usageCount: 4 }])
    if ((m = p.match(/^\/projects\/([^/]+)$/))) return ok(projectDto(projects.find((x) => x.id === m[1]) ?? projects[0]))

    // ---- transfers
    if (p === '/transfers/pending-count') return ok({ pending: transfers.filter((t) => t.status === 'pending').length })
    if (p === '/transfers') return ok(page(transfers.filter((t) => !query.get('status') || t.status === query.get('status'))))
    if ((m = p.match(/^\/transfers\/([^/]+)\/(approve|reject)$/))) {
      const t = transfers.find((x) => x.id === m[1])
      if (t.status !== 'pending') return fail(409, 'TRANSFER_ALREADY_DECIDED', 'Already decided by Farah Khan.', { status: t.status })
      Object.assign(t, { status: m[2] === 'approve' ? 'approved' : 'rejected', decidedBy: { id: me.id, name: me.name }, decidedAt: iso(), decisionNote: json().note ?? null, canDecide: false })
      return ok(t, m[2] === 'approve' ? 'Transfer approved.' : 'Transfer rejected.')
    }

    // ---- leads and entries
    if ((m = p.match(/^\/entries\/([^/]+)\/photo$/))) return ok({ url: PIXEL, expiresInSeconds: 600 })
    if ((m = p.match(/^\/entries\/([^/]+)$/)) && method === 'DELETE') return ok(null, 'Deleted successfully.')
    if ((m = p.match(/^\/entries\/([^/]+)$/))) {
      const found = day().find((e) => e.id === m[1]) ?? day()[1]
      if (method === 'PATCH') return ok({ entry: { ...found, edited: true }, lead: lead(0) }, 'Updated successfully.')
      return ok(found)
    }
    if ((m = p.match(/^\/leads\/([^/]+)\/reassign$/))) return ok({ reassigned: 1, skipped: 0 }, 'Leads reassigned.')
    if ((m = p.match(/^\/leads\/([^/]+)$/)) && method === 'DELETE') return ok(null, 'Deleted successfully.')
    if ((m = p.match(/^\/entries\/([^/]+)$/)) && method === 'DELETE') return ok(null, 'Deleted successfully.')
    if ((m = p.match(/^\/leads\/([^/]+)\/follow-ups$/))) return ok({ entry: entry(8), lead: lead(0) }, 'Follow-up saved.', 201)
    if ((m = p.match(/^\/leads\/([^/]+)$/))) return ok(detail({ ...lead(Number(m[1][7])), id: m[1] }))
    return fail(404, 'NOT_FOUND', `mock: no route for ${method} ${p}`)
  }

  return { handle, writes, calls, me }
}
