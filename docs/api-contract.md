# Sales Tracker API: contract for the React front end

Source: `/Users/apple/Desktop/pronttera/sales-application/service-application/src`. I read every controller, DTO, presenter and the services that build responses. Field names below are exactly as serialized. Everything is camelCase except enum values, which are snake_case.

---

## 1. Global conventions

### Base URL, prefix and versioning
- Files: `app.setup.ts`, `config/configuration.ts`.
- Global prefix comes from `API_PREFIX` (default `api`). URI versioning uses `API_VERSION` (default `v1`) as the default version.
- **Every route is `/api/v1/...`.** No controller declares its own version.
- Default port is `4100`.
- Swagger UI is at `/docs` and the JSON at `/docs/json`. Both sit outside the prefix. Outside development they need basic auth if `SWAGGER_USER`/`SWAGGER_PASSWORD` are set.
- CORS:
  - origins from `CORS_ORIGINS`; empty or `*` means any origin
  - `credentials: true`
  - methods `GET, POST, PUT, PATCH, DELETE, OPTIONS`
  - **`exposedHeaders: ['Content-Disposition']`**, so you can read the CSV filename
- JSON and urlencoded body limit is `BODY_LIMIT` (default `1mb`). Photos go as multipart, and multer applies its own limit.
- Rate limit:
  - global: `THROTTLE_LIMIT` (default 120) requests per `THROTTLE_TTL_SECONDS` (default 60) per IP
  - these auth endpoints: 10 per 60 s: `login`, `refresh`, `forgot-password`, `set-password`, `change-password`
  - over the limit: 429 with `RATE_LIMITED`
- Optional request header `x-request-id`. It is echoed back as `requestId` in error bodies.

### Global ValidationPipe (`app.module.ts`)
Settings: `whitelist: true`, **`forbidNonWhitelisted: true`**, `transform: true`, `enableImplicitConversion: false`.

- **Any body field or query parameter not declared in the DTO returns 400.** For example, sending `page` to an endpoint without paging fails, and so does sending an unknown form field.
- Multipart fields arrive as strings. Numeric visit fields (`latitude`, `longitude`, `gpsAccuracyM`) are converted explicitly. Paging `page`/`limit` use `@Type(() => Number)`. Booleans in queries must be the literal strings `"true"` or `"false"`.
- Dates are validated by `@IsIsoDate`: a real calendar date as `YYYY-MM-DD`. Message: `<field> must be a calendar date as YYYY-MM-DD`.
- `:id` path params are validated as UUID v4. A bad value returns 400.

### Success envelope (`common/interceptors/response.interceptor.ts`)
Every non-file response is wrapped:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Fetched successfully.",
  "data": <payload>,
  "timestamp": "2026-10-08T09:30:00.000Z",
  "path": "/api/v1/leads?page=1"
}
```
- `message` is the route's `@ResponseMessage(...)` if it has one.
- Otherwise it defaults by HTTP method:
  - POST: `"Created successfully."`
  - PUT and PATCH: `"Updated successfully."`
  - DELETE: `"Deleted successfully."`
  - GET and anything else: `"Fetched successfully."`
- `statusCode` repeats the HTTP status. POST is 201 unless the route sets `@HttpCode(200)`; this is noted per endpoint below.
- Endpoints that return `null` give `"data": null`.
- `StreamableFile` (the CSV exports) is never wrapped.

### Paginated payload (`common/dto/paginated-response.dto.ts`)
Paged lists put this object inside `data`:
```json
{
  "items": [ ... ],
  "meta": {
    "page": 1, "limit": 20, "total": 134, "totalPages": 7,
    "hasNextPage": true, "hasPreviousPage": false
  }
}
```
- `totalPages = ceil(total/limit)`
- `hasNextPage = page < totalPages`
- `hasPreviousPage = page > 1 && total > 0`

### Pagination query (`common/dto/pagination-query.dto.ts`)
| param | type | default | constraints |
|---|---|---|---|
| `page` | int | `1` | min 1 |
| `limit` | int | `20` | min 1, **max 100** |
| `search` | string | none | max 120 chars; trimmed; empty becomes undefined |

### Error JSON (`common/filters/all-exceptions.filter.ts`, `business.exception.ts`, `common/dto/api-response.dto.ts`)
```json
{
  "success": false,
  "statusCode": 409,
  "errorCode": "DUPLICATE_LEAD_OWN",
  "message": "You already have this lead.",
  "errors": [ { "field": "phone", "messages": ["phone must be a string"] } ],
  "details": { "leadId": "..." },
  "timestamp": "2026-10-08T09:30:00.000Z",
  "path": "/api/v1/projects/.../leads",
  "requestId": "..."
}
```
- The code field is named **`errorCode`**, not `code`.
- **`errors`** is present only on DTO validation failures:
  - `errorCode` is `VALIDATION_FAILED`
  - `message` is `"Some of the submitted values are not valid."`
  - messages are grouped by their first word (the property name)
- **`details`** is present only when a `BusinessException` carries it:
  - `DUPLICATE_LEAD_OWN`: `{ leadId }`
  - `DUPLICATE_LEAD_OTHER`: `{ ownerName }`
  - `USER_DEACTIVATED_EXISTS`: `{ userId, name, role }`
  - `TRANSFER_ALREADY_DECIDED`: `{ status }`
- `requestId` appears only if you sent `x-request-id`.

HTTP status for each `errorCode` (fixed mapping):

| errorCode | HTTP |
|---|---|
| VALIDATION_FAILED | 400 (also used for multer 413 "File too large") |
| UNAUTHORIZED, INVALID_CREDENTIALS, ACCOUNT_DEACTIVATED | 401 |
| FORBIDDEN | 403 |
| NOT_FOUND | 404 |
| CONFLICT, USER_DEACTIVATED_EXISTS, PROJECT_CLOSED, DUPLICATE_LEAD_OWN, DUPLICATE_LEAD_OTHER, LEAD_TRANSFERRED, ENTRY_LOCKED, TRANSFER_PENDING, TRANSFER_ALREADY_DECIDED | 409 |
| UNPROCESSABLE, VISIT_PROOF_REQUIRED, CAPTURE_EXPIRED | 422 |
| RATE_LIMITED | 429 |
| INTERNAL | 500 |
| INTEGRATION_ERROR | 502 |
| SERVICE_BUSY | 503 |

Errors that come from plain HTTP exceptions (multer, Nest) get a code from their status: 400 and 413 → VALIDATION_FAILED, 401 → UNAUTHORIZED, 403 → FORBIDDEN, 404 → NOT_FOUND, 409 → CONFLICT, 422 → UNPROCESSABLE, 429 → RATE_LIMITED, anything else → INTERNAL.

Database errors are translated as follows.

Unique-constraint races (409):
- `users_email_key`: CONFLICT, "A user with this email already exists."
- `leads_project_phone_key`: DUPLICATE_LEAD_OTHER, "This number is already a lead in this project."
- `lead_transfers_one_pending_per_lead`: TRANSFER_PENDING
- `project_members_project_user_key`: CONFLICT, "This person is already a member of the project."
- `follow_ups_client_request_id_key`: CONFLICT, "This request id was already used for a different entry."
- Any other unique violation: 409 CONFLICT, "A record with these details already exists."

Other database errors:
- Foreign-key violation: 422 UNPROCESSABLE, "A referenced record does not exist or belongs to another project."
- Check violation: 422 UNPROCESSABLE.
  - Constraint `leads_phone_format`: "Enter a 10-digit Indian mobile number."
  - Otherwise: "The submitted values violate a data integrity rule."
- Not-null violation: 400, "A required field was missing."
- Invalid text representation: 400, "One of the ids in the request is not valid."
- Serialization failure, deadlock or lock timeout: 409 CONFLICT, "This record is being updated by another request. Please try again."
- Connection pool exhausted: 503 SERVICE_BUSY.

### Auth
- **Guard** (`modules/auth/guards/auth.guard.ts`) is global. Every route needs auth unless it is `@Public()`.
  - It reads the `authorization` header, which must start with `"Bearer "`.
  - The token is a Supabase access JWT, verified locally (issuer `<SUPABASE_URL>/auth/v1`, audience `authenticated`).
  - It then loads the `users` row on every request.
- Guard failures:
  - No token or a bad token: 401 `UNAUTHORIZED`, "Please sign in to continue."
  - Expired token: 401 `UNAUTHORIZED`, **"Your session has expired. Please sign in again."** Branch on this to trigger a refresh.
  - No user row: 401 `UNAUTHORIZED`, "This login has no account in the Sales Tracker. Contact your admin."
  - Deactivated user: 401 `ACCOUNT_DEACTIVATED`, "Your account is deactivated. Contact your admin." This is checked on the next request after deactivation.
- **Roles guard:** if `@Roles(...)` does not include the caller's role, you get 403 `FORBIDDEN`, "You do not have access to this."
- Project scope is checked in the services. A project or lead you cannot see returns **404**, not 403.
- **Login** returns `SessionDto` (`POST /auth/login`):
  ```json
  {
    "accessToken": "string",
    "refreshToken": "string",
    "expiresIn": 3600,
    "expiresAt": 1791446400,
    "user": MeDto
  }
  ```
  - `expiresIn` is seconds until expiry.
  - `expiresAt` is Unix seconds and optional.
- **MeDto:**
  ```json
  {
    "id": "uuid",
    "name": "string",
    "email": "string",
    "phone": "string|null",
    "role": "super_admin|moderator|sales_person",
    "projects": [
      {
        "id": "uuid",
        "name": "string",
        "type": "online|door_to_door",
        "status": "active|closed",
        "targetCount": "number|null",
        "targetPeriod": "weekly|monthly|null"
      }
    ],
    "notice": "string|null",
    "onLeave": "LeaveSpanDto|null",
    "nextLeave": "LeaveSpanDto|null"
  }
  ```
  - `projects` lists active memberships ordered by `joinedAt` ascending. It is always `[]` for super_admin.
  - `notice` is `"You are not assigned to any project yet."` for a non-super-admin with no projects, otherwise `null`.
  - `onLeave` is the caller's active (not cancelled) leave covering today (IST), else null. `nextLeave` is the soonest active leave starting after today, else null. Both are `{ "startsOn": "YYYY-MM-DD", "endsOn": "YYYY-MM-DD" }` (inclusive dates).
- **Refresh:** `POST /auth/refresh` with `{ refreshToken }` returns a new `SessionDto` with the same shape. A rejected token gives 401 `UNAUTHORIZED`, "Your session has expired. Please sign in again." Refresh is also refused for deactivated or unknown accounts (`ACCOUNT_DEACTIVATED` / `UNAUTHORIZED`).
- Login errors:
  - Wrong email or password: 401 `INVALID_CREDENTIALS`, "Email or password is incorrect".
  - Supabase unavailable: an `INTEGRATION_ERROR`, probably with "Sign-in is temporarily unavailable. Please try again." I did not read `supabase-auth.client.ts`.

---

## 2. Enums (`common/enums/sales.enums.ts`)

- `UserRole`: `super_admin`, `moderator`, `sales_person`
- `ProjectType`: `online`, `door_to_door`
- `ProjectStatus`: `active`, `closed`
- `TargetPeriod`: `weekly`, `monthly`. Weeks run Monday to Sunday and months are calendar months, both in IST.
- `LeadStatus`: `new`, `contacted`, `interested`, `follow_up_scheduled`, `not_interested`, `converted`, `lost`
- `EntryType`: `follow_up`, `status_change`
- `TransferStatus`: `pending`, `approved`, `rejected`
- `LeadOwnerTag` (derived, admins only): `owner_inactive`, `owner_removed`
- `LeadSource` (`leads.source`): `walk_in`, `referral`, `phone`, `whatsapp`, `social`, `event`, `import`, `other`. The CSV import sets `import`; anything may be sent by hand.
- `LostReason` (`follow_ups.reason`): `price`, `has_alternative`, `not_ready`, `no_need`, `owner_unavailable`, `shop_closed`, `competitor`, `other`
- `LeadDue` (lead list `due` filter, derived): `overdue`, `today`, `tomorrow`, `week`, `none`
- `FunnelStage` (dashboard `funnel`): `created`, `contacted`, `interested`, `converted`
- `AttentionKind` (dashboard `needsAttention`): `behind_target`, `overdue_pile`, `idle`, `stale_transfer`, `help_request`
- `TrendBucket` (dashboard `trendBucket`): `day`, `week`
- `CommentKind` (`lead_comments.kind`): `comment`, `help`, `feedback`, `handover`. `POST /leads/:id/comments` accepts only `comment` and `feedback`; `help` comes from `POST /leads/:id/help`, `handover` from transfers and reassignments.
- `NotificationKind` (`notifications.kind`): `transfer_requested`, `transfer_decided`, `lead_assigned`, `mention`, `help_requested`, `help_resolved`, `comment`, `feedback`, `leave_cover`
- `LeaderboardPeriod` (`GET /projects/:id/leaderboard?period=`): `week` (default), `month`
- `PlanCode` (`leads.plan_code`, `plan_prices.plan`): `free`, `growth`, `growth_plus`, `pro` (shown as Free, Growth, Growth Plus, Pro)
- `DiscountType` (`leads.discount_type`, `offers.discount_type`): `percent` (0–100, two decimals at most, off the whole deal), `amount` (whole rupees off the whole deal)
- Deal tenures (`leads.deal_tenure_months`): 1, 3, 6, 12 months

Related constants:
- `TERMINAL_STATUSES` = `NOT_DUE_STATUSES` = [`not_interested`, `converted`, `lost`]
- `REASON_STATUSES` = [`not_interested`, `lost`]: the only statuses an entry may carry a `reason` for.
- `UNSPECIFIED` = `"unspecified"`: what dashboard `lostReasons` and `sources` show for a null reason or source.
- Lead list `sort` values: `updated` (default, DESC), `created` (DESC), `name` (ASC), `next_follow_up` (ASC), `value` (`dealValue` DESC: biggest deal first), `activity` (`lastActivityAt` ASC: longest untouched first). All use NULLS LAST.

---

## 3. Endpoints

All paths below are relative to `/api/v1`.

"Roles" means the `@Roles` decorator. "any" means any authenticated user, with scope applied in the service.

### Shared response shapes
- **PersonRefDto:** `{ id, name }`
- **LocationRefDto:** `{ id, name }`
- **LeaveSpanDto:** `{ startsOn: "YYYY-MM-DD", endsOn: "YYYY-MM-DD" }`, India dates, both included.
- **UserDto:**
  ```json
  {
    "id": "...", "name": "...", "email": "...", "phone": "string|null",
    "role": "...", "isActive": true, "createdBy": "uuid|null",
    "createdAt": "ISO", "canManage": true, "canManageAccount": true,
    "onLeave": "LeaveSpanDto|null"
  }
  ```
  - `onLeave` is the person's leave covering today (IST). It is filled only for people the caller manages (`canManage`: the Super Admin everyone, a moderator the sales persons he created or shares an active project with); for anyone else it is always `null`, matching what `GET /leaves` lets the caller see.
- **ProjectDto:**
  ```json
  {
    "id": "...", "name": "...", "description": "string|null",
    "imageUrl": "string|null",
    "type": "...", "status": "...", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD|null",
    "closedAt": "ISO|null", "createdAt": "ISO",
    "pastEndDate": false, "typeLocked": false, "memberCount": 0, "leadCount": 0,
    "myTargetCount": "number|null",
    "myTargetPeriod": "weekly|monthly|null",
    "warnings": ["Another project already has this name."]
  }
  ```
  - `imageUrl` is a short-lived signed URL.
  - `pastEndDate` is true when the project is active and `endDate` is before today in IST.
  - `typeLocked` is true once the project has ever had a lead.
  - `myTargetCount` / `myTargetPeriod` are present only when the caller is an active member.
  - `warnings` is present only on create or update when another project already has the same name.
- **MemberDto:**
  ```json
  {
    "userId": "...", "name": "...", "role": "...", "userIsActive": true, "isActive": true,
    "joinedAt": "ISO",
    "email": "...", "phone": "string|null", "targetCount": "number|null",
    "targetPeriod": "...|null", "removedAt": "ISO|null",
    "backup": "{id,name}|null",
    "onLeave": "LeaveSpanDto|null"
  }
  ```
  `email`, `phone`, `targetCount`, `targetPeriod` and `removedAt` are only present when the caller is an admin of the project. `backup` (who covers this member's follow-ups in this project while he is on leave) and `onLeave` (his leave covering today, IST) are present for every caller who may list the members.
- **EntryDto:**
  ```json
  {
    "id": "...", "leadId": "...", "projectId": "...",
    "entryType": "follow_up|status_change",
    "status": "<LeadStatus after this entry>",
    "note": "string|null",
    "reason": "<LostReason>|null",
    "nextFollowUpDate": "YYYY-MM-DD|null",
    "location": "{id,name}|null",
    "hasPhoto": true,
    "photoUrl": "string|null",
    "latitude": "number|null", "longitude": "number|null", "gpsAccuracyM": "number|null",
    "lowAccuracy": false,
    "user": { "id": "...", "name": "..." },
    "coveringFor": "{id,name}|null",
    "feedback": [ { "id": "...", "body": "...", "user": { "id": "...", "name": "..." }, "createdAt": "ISO" } ],
    "createdAt": "ISO", "updatedAt": "ISO",
    "edited": false,
    "editable": false
  }
  ```
  - `location` is null for a `status_change`.
  - `reason` is set only on `not_interested` and `lost` entries, and only when one was given. It is never editable.
  - `photoUrl` is a signed URL with a TTL of `SIGNED_URL_TTL_SECONDS` (default 600 s).
  - `lowAccuracy` is true when `gpsAccuracyM > 100`.
  - `user` is whoever logged the entry.
  - `coveringFor` is the lead's owner when a backup logged the entry for him while he was on leave (`follow_ups.covering_for_id`), else null. `user` is then the backup.
  - `feedback` lists admins' `feedback` comments on this entry, oldest first (`[]` when none). It is on every `EntryDto`: lead detail `recentEntries`, `GET /leads/:id/entries`, `GET /timeline`, `GET /entries/:id` and `EntrySaveResultDto.entry`.
  - `createdAt` is the server time and is the official visit time.
  - `edited` is true when `updatedAt > createdAt`.
  - `editable` is true when the viewer is the author, the project is active, and the entry was created today in IST.
- **LeadSummaryDto:**
  ```json
  {
    "id": "...", "projectId": "...", "name": "...", "businessName": "string|null",
    "phone": "10 digits", "status": "...", "nextFollowUpDate": "YYYY-MM-DD|null",
    "overdueDays": "number|null",
    "location": { "id": "...", "name": "..." },
    "owner": { "id": "...", "name": "...", "isActive": true },
    "ownerTag": "owner_inactive|owner_removed|null",
    "convertedAt": "ISO|null",
    "dealValue": "number|null",
    "plan": "string|null",
    "planCode": "<PlanCode>|null",
    "dealTenureMonths": "1|3|6|12|null",
    "discountType": "percent|amount|null",
    "discountValue": "number|null",
    "couponCode": "string|null",
    "offer": "{id,name}|null",
    "dealTotal": "number|null",
    "effectiveMonthlyValue": "number|null",
    "source": "<LeadSource>|null",
    "lastActivityAt": "ISO",
    "createdBy": "{id,name}|null",
    "hasPendingTransfer": false,
    "createdAt": "ISO", "updatedAt": "ISO"
  }
  ```
  - `overdueDays` is set when `nextFollowUpDate` is before today and the status is not terminal; otherwise null.
  - `ownerTag` is always null for non-admins.
  - The deal (see §3b): `dealValue` is the **list price per month** in whole rupees (0–100000000), before any discount. `planCode` is the plan sold or offered. `plan` is the **old free-text plan**, kept for history: never written any more, shown when `planCode` is null, and cleared when a new deal is saved. `dealTenureMonths` null reads as 1. `discountType`/`discountValue`/`couponCode` are the discount (copied from the offer when `offer` is set). `dealTotal` = price × tenure − discount (what the client pays for the whole tenure); `effectiveMonthlyValue` = `dealTotal` ÷ tenure, two decimals — what the deal adds to revenue. Both null without a price. The deal is set on create, on an entry that wins the lead, or by `PATCH /leads/:id`. Leaving Converted keeps it, but revenue only counts converted leads.
  - `lastActivityAt` is the time of the latest live entry, or `createdAt` if there is none (imported leads). Every follow-up and status change moves it; it falls back when the Super Admin deletes the latest entry. Editing the lead or an entry, and transfers, do not move it.
  - `createdBy` is who added the lead (the person who logged its first entry) or the admin who imported it. It does not change on transfer. Null only for leads imported before it was recorded.
- **LeadDetailDto** is `LeadSummaryDto` plus:
  ```json
  {
    "notes": "string|null",
    "project": { "id": "...", "name": "...", "type": "...", "status": "..." },
    "convertedBy": "{id,name}|null",
    "recentEntries": [EntryDto],
    "entryCount": 0,
    "pendingTransfer": "LeadTransferRefDto|null",
    "lastDecidedTransfer": "LeadTransferRefDto|null",
    "permissions": {
      "canLogFollowUp": true, "canChangeStatus": true, "canLeaveConverted": false,
      "canEdit": true, "canRequestTransfer": true, "canReassign": false, "canDelete": false,
      "covering": false
    },
    "coveringFor": "{id,name}|null",
    "openHelp": false,
    "pinnedComment": "{ id, body, user: {id,name}, createdAt }|null",
    "commentCount": 0
  }
  ```
  - `recentEntries` holds at most 20 entries, newest first.
  - `coveringFor` is the owner when the caller is covering for him (see *Covering* below), else null.
  - `openHelp` is true while a `help` comment on the lead is unresolved.
  - `pinnedComment` is the newest pinned, non-deleted comment of any kind (a handover note is pinned automatically).
  - `commentCount` counts non-deleted comments of every kind.
  - `lastDecidedTransfer` is the latest approved or rejected transfer where `fromUser` is the current owner.
- **LeadTransferRefDto:**
  ```json
  {
    "id": "...", "status": "...", "toUser": { "id": "...", "name": "..." }, "reason": "...",
    "createdAt": "ISO", "decidedBy": "{id,name}|null", "decidedAt": "ISO|null",
    "decisionNote": "string|null"
  }
  ```
- **Permission rules.** Let *ownerWorks* mean the caller is the owner and an active member, *covering* mean the caller is covering for the owner today (see *Covering*), and *open* mean the project is active.
  - `covering` = covering
  - `canLogFollowUp` = open && (ownerWorks || covering)
  - `canChangeStatus` = open && (ownerWorks || isAdmin || covering)
  - `canLeaveConverted` = canChangeStatus && isAdmin
  - `canEdit` = open && ownerWorks
  - `canRequestTransfer` = open && ownerWorks && no pending transfer
  - `canReassign` = open && isAdmin && not (caller is a moderator who owns the lead)
  - `canDelete` = role is super_admin
- **EntrySaveResultDto:** `{ entry: EntryDto, lead: LeadSummaryDto }`
- **TransferDto:**
  ```json
  {
    "id": "...",
    "lead": { "id": "...", "name": "...", "businessName": "string|null", "projectId": "...", "projectName": "..." },
    "fromUser": { "id": "...", "name": "..." },
    "toUser": { "id": "...", "name": "..." },
    "requestedBy": { "id": "...", "name": "..." },
    "reason": "...",
    "status": "...",
    "createdAt": "ISO",
    "decidedBy": "{id,name}|null",
    "decidedAt": "ISO|null",
    "decisionNote": "string|null",
    "canDecide": false
  }
  ```
  - `canDecide` is true when the transfer is pending, the caller is not a party (`fromUser`, `toUser`, `requestedBy`), and the caller is an admin of the project.
  - Auto-rejected transfers have a `decisionNote` of `"User deactivated"`, `"Member removed from the project"`, `"Project closed"`, `"Lead deleted"` or `"Superseded by a direct reassignment"`.

---

### Health
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/health` | Public | `data: { status: "ok", database: "up", time: ISO }`. If the database is down: 503. |

### Auth (`modules/auth/auth.controller.ts`)
| Method | Path | Roles | Body | data | message / status |
|---|---|---|---|---|---|
| POST | `/auth/login` | Public | `email` (email, lowercased and trimmed, required); `password` (string, non-empty, max 72) | `SessionDto` | "Signed in.", 200 |
| POST | `/auth/refresh` | Public | `refreshToken` (string, non-empty) | `SessionDto` | "Session refreshed.", 200 |
| POST | `/auth/forgot-password` | Public | `email` (email) | `{ message: "If an account exists for this email, a reset link has been sent." }` | envelope message is "Created successfully.", 200 |
| POST | `/auth/set-password` | Public | `tokenHash` (string, non-empty; `token_hash` from the invite or reset link's query); `type` (`invite` or `recovery`; `type` from the link); `password` (string, 8–72) | `null` | "Password saved. You can sign in now.", 200. A bad link gives 401 UNAUTHORIZED, "This link has expired or was already used. Ask for a new one." |
| POST | `/auth/logout` | any | none | `null` | "Signed out.", 200 |
| GET | `/auth/me` | any | none | `MeDto` | |
| PATCH | `/auth/me` | any | `name?` (trimmed, non-empty, max 120); `phone?` (string or null, max 20; empty or null clears; otherwise must normalize to an Indian mobile, else 400 VALIDATION_FAILED "Enter a 10-digit Indian mobile number.") | `MeDto` | "Updated successfully." |
| POST | `/auth/change-password` | any | `currentPassword` (string, non-empty, max 72); `newPassword` (string, 8–72) | `null` | "Password changed.", 200. A wrong current password gives 400 VALIDATION_FAILED, "The current password is incorrect." |

Phone normalization (`phone.util.ts`):
- Spaces, `-`, `(`, `)` and `.` are removed.
- A leading `+91`, a 12-digit number starting `91`, or an 11-digit number starting `0` is stripped to 10 digits.
- The result must match `^[6-9]\d{9}$`.

### Users (`modules/users/users.controller.ts`)
Controller-level roles: **super_admin, moderator**.

| Method | Path | Roles | Params / Body | data |
|---|---|---|---|---|
| GET | `/users` | SA, MOD | Query: pagination plus `role?` (UserRole; ignored for moderators, who only ever see `sales_person`), `isActive?` ("true"/"false"), `projectId?` (uuid v4; only active members of that project, and a moderator must be an admin of it), `manageableOnly?` ("true"/"false"; moderators only). `search` matches name, email or phone. Sorted active first, then by name. | Paginated `UserDto` |
| GET | `/users/:id` | SA, MOD | | `UserDto`. A moderator looking up a non-sales user other than himself gets 404. |
| POST | `/users` | SA, MOD | `name` (trimmed, non-empty, max 120); `email` (email, lowercased); `phone?` (string, max 20, Indian mobile); `role` must be `moderator` or `sales_person` (a moderator may only send `sales_person`, else 403) | `UserDto`. 201, "User created. An email has been sent to set the password." |
| PATCH | `/users/:id` | SA, MOD | `name?` (trimmed, non-empty, max 120); `phone?` (string, null or "" clears, max 20) | `UserDto` |
| POST | `/users/:id/deactivate` | SA, MOD | none | `UserDto`. 200, "User deactivated." Refusals: the last active super admin gives 409 CONFLICT; an already inactive user gives 409 CONFLICT. |
| POST | `/users/:id/reactivate` | SA, MOD | none | `UserDto`. 200, "User reactivated." |
| PATCH | `/users/:id/role` | **SA only** | `role` (UserRole) | `UserDto` |
| PATCH | `/users/:id/email` | **SA only** | `email` (email) | `UserDto` |

Who can manage whom:
- Super admin can manage anyone. He may deactivate himself, but cannot edit or reactivate himself.
- A moderator can manage a `sales_person` he created or shares an active project with. Otherwise 403 "You can only manage sales persons you created or share a project with."

Create errors:
- Email held by an active user: 409 CONFLICT.
- Email held by a deactivated user: 409 `USER_DEACTIVATED_EXISTS` with `details: { userId, name, role }`.
- Email already registered in Supabase: 409 CONFLICT, "This email is already registered with the login system. Contact support to link it."

### Projects (`modules/projects/projects.controller.ts`)
| Method | Path | Roles | Params / Body | data |
|---|---|---|---|---|
| GET | `/projects` | any | Query: pagination plus `status?` (ProjectStatus), `type?` (ProjectType). `search` matches the name. Super admin sees all projects; others see projects they are active members of. Sorted by status, then `createdAt` descending. | Paginated `ProjectDto` |
| GET | `/projects/:id` | any (must be a member, else 404) | | `ProjectDto` |
| POST | `/projects` | **SA** | JSON **or** `multipart/form-data`. Fields: `name` (trimmed, non-empty, max 120); `description?` (string or null, max 2000; empty becomes null); `type` (ProjectType); `startDate` (YYYY-MM-DD); `endDate?` (YYYY-MM-DD; empty is ignored; must be on or after `startDate`, else 400). Optional file field **`image`**: JPG or PNG, at most 2 MB (service check), with a multer ceiling of 8 MB. | `ProjectDto` (may include `warnings`). 201 |
| PATCH | `/projects/:id` | **SA** | `name?`, `description?` (null or "" clears), `type?` (409 CONFLICT "The project type cannot change once the project has a lead." if `typeLocked`), `startDate?`, `endDate?` (null or "" clears) | `ProjectDto` |
| POST | `/projects/:id/image` | **SA** | multipart, file field **`image`** (required) | `ProjectDto`, 200 |
| DELETE | `/projects/:id/image` | **SA** | | `ProjectDto`. If there is no image: 404 NOT_FOUND "This project has no image." |
| POST | `/projects/:id/close` | **SA** | | `ProjectDto`. 200, "Project closed. It is now read-only." Already closed: 409 CONFLICT. |
| POST | `/projects/:id/reopen` | **SA** | | `ProjectDto`. 200, "Project reopened." |
| GET | `/projects/:id/members` | any member | Query: `includeRemoved?` ("true"/"false"; admins only). **No pagination params; sending them gives 400.** | `MemberDto[]`: active first, then by name. Non-admins see only active members, without email, phone or targets. |
| POST | `/projects/:id/members` | SA, MOD | `userId` (uuid v4); `targetCount?` (int, 1–100000); `targetPeriod?` (TargetPeriod). Send both or neither, else 400 "Set the target number and the period together, or clear both." | `MemberDto`. 201, "Member added to the project." |
| DELETE | `/projects/:id/members/:userId` | SA, MOD | both params are uuid v4 | `MemberDto` (with `isActive: false` and `removedAt` set). "Member removed from the project." |
| PATCH | `/projects/:id/members/:userId/target` | SA, MOD | `targetCount` (int 1–100000, or null; **required key**); `targetPeriod` (TargetPeriod or null; **required key**). Both null clears the target. | `MemberDto`. "Target updated." |
| PUT | `/projects/:id/members/:userId/backup` | SA, MOD | `backupUserId` (uuid v4 or null; **required key**). null clears it. | `MemberDto`. "Backup updated." See *Backups* in section 3a. |

Membership errors:
- Inactive user: 422 "A deactivated user cannot be added to a project."
- Super admin: 422 "Super Admins have access to every project and are not added as members."
- Moderator adding a non-sales user: 403 "Only the Super Admin can add moderators to a project."
- Closed project: 409 PROJECT_CLOSED.
- A previously removed member is reactivated and keeps their old target unless a new one is sent.
- Removing a member (`DELETE /projects/:id/members/:userId`) also clears every `backup` in that project that pointed to him.

### Locations (`modules/locations/locations.controller.ts`)
| Method | Path | Roles | Query | data |
|---|---|---|---|---|
| GET | `/projects/:id/locations` | any member | `q?` (string, max 100) | `[{ id, name, usageCount }]`, at most 10. Names starting with `q` come first, then by usage descending, then by name. Empty `q` returns the most used. **No pagination params.** |

The API never takes a location id. Leads and follow-ups send the location as **free text**, and the server finds or creates it, case-insensitively.

### Leads (`modules/leads/leads.controller.ts`)
| Method | Path | Roles | Params / Body | data |
|---|---|---|---|---|
| POST | `/projects/:id/leads` | **SP, MOD** (must be an active member) | JSON or multipart. **CreateLeadDto**, see the field table below. | `LeadDetailDto`. **201**, "Lead saved." |
| GET | `/projects/:id/leads` | any member | Query: pagination plus `status?` (LeadStatus), `ownerId?` (uuid v4; admins), `coveringFor?` (uuid v4; the owner the caller is covering for today — that owner's leads, any other value is 403 "You are not covering for this person in this project today."; overrides `mine`/`ownerId`, every other filter still applies), `mine?` ("true"/"false"), `ownerUnavailable?` ("true"/"false"; admins), `due?` (LeadDue, see below), `cold?` ("true"/"false"), `source?` (LeadSource), `sort?` (`updated`, `created`, `name`, `next_follow_up`, `value` or `activity`). `search` matches name or business name, plus phone when the search term is 3–10 digits. Sales persons only ever get their own leads. Filters combine with AND. | Paginated `LeadSummaryDto` |
| GET | `/leads/:id` | any (admin of the project, owner and active member, or the backup covering for the owner today; else 404) | | `LeadDetailDto` |
| GET | `/leads/:id/entries` | same | Query: pagination | Paginated `EntryDto`, newest first |
| PATCH | `/leads/:id` | **SP, MOD** (owner and active member, else 403 "Only the lead's owner can edit it.") | `name?` (trimmed, non-empty, max 120); `businessName?` (string or null, max 160, "" becomes null); `phone?` (string, non-empty, max 20; normalized and re-checked for duplicates); `notes?` (string or null, max 2000); `location?` (trimmed, non-empty, max 200, then 2–100 chars after collapsing whitespace); the deal fields (§3b), each also nullable — **sending any of them replaces the whole deal** (fields left out are cleared; all null clears it); `source?` (LeadSource, or null to clear). `plan` is no longer accepted (400 "isn't used here"). | `LeadDetailDto` |
| DELETE | `/leads/:id` | **SA** | | `null`, "Deleted successfully." This is a soft delete. |
| POST | `/leads/:id/follow-ups` | **SP, MOD** (owner, or the backup covering for him) | JSON or multipart. **LogFollowUpDto**, see below. | `EntrySaveResultDto`. **201**, "Follow-up saved." |
| POST | `/leads/:id/status` | any (owner, an admin of the project, or the backup covering for the owner) | **ChangeStatusDto**, JSON: `clientRequestId` (uuid v4); `status` (LeadStatus); `note` (trimmed, 5–2000; why it changed); `nextFollowUpDate?` (YYYY-MM-DD; "" is ignored); `reason?` (LostReason; only with `not_interested`/`lost`); the deal fields (§3b; only with `converted`) | `EntrySaveResultDto`. **200**, "Stage updated." |

**CreateLeadDto fields.** It extends `LogFollowUpDto`, so it includes every follow-up field.

| field | type | req | validation |
|---|---|---|---|
| `name` | string | yes | trimmed, non-empty, max 120 |
| `businessName` | string\|null | no | "" becomes null, max 160 |
| `phone` | string | yes | non-empty, max 20. Server: Indian mobile, else 400 VALIDATION_FAILED "Enter a 10-digit Indian mobile number." |
| `notes` | string\|null | no | max 2000. About the client, separate from the note. |
| deal fields | | no | `dealValue`, `planCode`, `dealTenureMonths`, `offerId`, `discountType`, `discountValue`, `couponCode` — see §3b. Allowed with any status on create (the expected deal). Numeric strings accepted (multipart); "" is ignored. |
| `source` | LeadSource | no | "" is ignored. Not sent → null. |
| `reason` | LostReason | no | only with `not_interested` or `lost`, else 400 (see below); "" is ignored |
| `clientRequestId` | uuid v4 | yes | idempotency key |
| `status` | LeadStatus | yes | `new` is allowed only here |
| `note` | string | yes | trimmed, **min 5**, max 2000 (the first follow-up note) |
| `nextFollowUpDate` | YYYY-MM-DD | no | "" is ignored. See the next-date rules below. |
| `location` | string | yes | trimmed, non-empty, max 200. Server: 2–100 chars after collapsing whitespace, else 400 "Location must be 2 to 100 characters." |
| `latitude` | number | door-to-door | −90 to 90; numeric strings accepted |
| `longitude` | number | door-to-door | −180 to 180 |
| `gpsAccuracyM` | number | door-to-door | 0 to 100000, in metres |
| `captureToken` | string | door-to-door | max 512; "" is treated as missing |
| `photo` (file part) | binary | door-to-door | multipart file field `photo` |

Duplicate phone on create:
- The phone is already your lead: 409 `DUPLICATE_LEAD_OWN`, "You already have this lead.", `details: { leadId }`.
- The phone is someone else's lead: 409 `DUPLICATE_LEAD_OTHER`, "This number is already a lead in this project, owned by {owner}.", `details: { ownerName, canRequest: true }`. `canRequest` means the screen can offer `POST /projects/:id/leads/request-by-phone`. (`PATCH /leads/:id` with a taken phone gives the same error without `canRequest`.)

Other create errors:
- Super admin: 403 "Only members of the project can add leads."
- Not a member: 404.
- Closed project: 409 PROJECT_CLOSED "This project is closed."

**LogFollowUpDto fields:** `clientRequestId`, `status`, `note`, `nextFollowUpDate?`, `location` (required; pre-fill it with the lead's location), `reason?`, the deal fields (§3b), plus `latitude?`, `longitude?`, `gpsAccuracyM?`, `captureToken?` and the `photo` file. Constraints are the same as in the table above, except that the deal fields are allowed only when `status` is `converted`.

**List filters (`GET /projects/:id/leads`).** "Today" is the IST date.
- `due=overdue`: `nextFollowUpDate` before today.
- `due=today` / `due=tomorrow`: `nextFollowUpDate` equals today / today + 1.
- `due=week`: `nextFollowUpDate` from today + 1 to today + 7, inclusive (so it includes tomorrow).
- `due=none`: no `nextFollowUpDate` and the status is not terminal.
- `cold=true`: status not terminal and `lastActivityAt` more than 14 × 24 hours ago. `cold=false` or absent: no filter.
- `source=<LeadSource>`: exact match; leads with no source never match.
- Unknown values give 400.

Follow-up and status rules (`lead-rules.ts`):
- Next follow-up date:
  - For terminal statuses (`not_interested`, `converted`, `lost`), any value sent is ignored and stored as null.
  - Required for `follow_up_scheduled`, else 400 "Choose the next follow-up date for Follow-up scheduled."
  - A past date gives 400 "The next follow-up date cannot be in the past."
  - More than 365 days ahead gives 400 "The next follow-up date can be at most 365 days ahead."
  - "Today" is measured in IST.
- A follow-up:
  - Status `new` gives 422 "A lead cannot be set back to New."
  - On a converted lead, any status other than `converted` gives 403 "Ask your moderator to change this."
- A manual status change:
  - The same status gives 422 "The lead already has this status."
  - `new` gives 422.
  - Leaving `converted` as a non-admin gives 403 "Ask your moderator to change this."
- Reason (create, follow-up, status change): optional. Allowed only when `status` is `not_interested` or `lost`; otherwise 400 VALIDATION_FAILED "A reason can be given only for Not interested or Lost." An unknown value is a 400 from the validator.
- The deal on a follow-up or status change: allowed only when `status` is `converted` (a new conversion, or a follow-up on a lead that stays converted); otherwise 400 VALIDATION_FAILED "Deal details can be added only when the lead is Won." When any deal field is sent with a value, the whole deal is replaced (fields left out are cleared); when none is (or all are blank), the lead's deal is left as it is.
- Every follow-up and status change sets the lead's `lastActivityAt` to the entry's `createdAt`.
- A follow-up by an admin who is not the owner gives 403 "Only the lead's owner can log a follow-up."
- If the lead was transferred away from the caller (an approved transfer from them), the error is 409 `LEAD_TRANSFERRED`, "This lead now belongs to {name}." Otherwise 404.
- If the project closed meanwhile: 409 `PROJECT_CLOSED`.

### Entries (`modules/leads/entries.controller.ts`)
| Method | Path | Roles | Body | data |
|---|---|---|---|---|
| GET | `/entries/:id` | any (author, owner who is an active member, admin of the project, or the backup covering for the owner today; else 404) | | `EntryDto` |
| GET | `/entries/:id/photo` | same | | `{ url: string, expiresInSeconds: number }` (default 600). No photo: 404 "This entry has no photo." Storage failure: 502 INTEGRATION_ERROR. |
| PATCH | `/entries/:id` | any (author only) | `note?` (trimmed, 5–2000); `nextFollowUpDate?` (YYYY-MM-DD, or null/"" to clear; follow-ups only). At least one field is required, else 400 "Send a note or a next follow-up date to change." | `EntrySaveResultDto`, "Updated successfully." |
| DELETE | `/entries/:id` | **SA** | | `null`. The lead's status, next date, conversion and `lastActivityAt` are rebuilt from the remaining entries (`lastActivityAt` falls back to the lead's `createdAt` if none remain). The deal is kept. |

Entry edit errors:
- An admin who is not the author: 403 "Only the person who logged this entry can edit it."
- Anyone else: 404.
- After midnight IST: 409 `ENTRY_LOCKED`, "This entry is now locked."
- `nextFollowUpDate` on a status_change: 422 "Only the note of a status change can be edited."
- Changing the date when you no longer own the lead: 403.
- The lead's own date changes only if this entry is the latest one.

### Visits (`modules/visits/visits.controller.ts`)
| Method | Path | Roles | Body | data |
|---|---|---|---|---|
| POST | `/visits/capture-token` | **SP, MOD** | none | `{ captureToken: string, issuedAt: ISO, expiresAt: ISO }`. 200, "Fetched successfully." is not used here; POST with `@HttpCode(200)` and no `@ResponseMessage` gives the default **"Created successfully."** |

### Transfers (`modules/transfers/transfers.controller.ts`)
| Method | Path | Roles | Body / Query | data |
|---|---|---|---|---|
| POST | `/leads/:id/transfers` | **SP, MOD** (owner and active member, else 403 "Only the lead's owner can request a transfer.") | `toUserId` (uuid v4); `reason` (trimmed, non-empty, max 500); `handoverNote?` (string or null, trimmed, max 500, "" becomes null) | `TransferDto`. **201**, "Transfer requested. It moves once an admin approves it." |
| POST | `/projects/:id/leads/request-by-phone` | **SP, MOD** (active member of the project, else 404; SA 403) | `phone` (string, non-empty, max 20; normalised like a lead's phone, else 400 "Enter a 10-digit Indian mobile number."); `reason` (trimmed, non-empty, max 500) | `TransferDto` (pending, `fromUser` = the owner, `toUser` = `requestedBy` = the caller). **201**, "Request sent. The lead moves to you once an admin approves it." |
| POST | `/leads/:id/reassign` | SA, MOD | same body: `toUserId`, `reason`, `handoverNote?` | `{ reassigned: number, skipped: number }`. 200, "Leads reassigned." |
| POST | `/projects/:id/leads/reassign` | SA, MOD | `toUserId`, `reason`, `handoverNote?`, `leadIds` (array of uuid v4, 1–500, unique) | `{ reassigned, skipped }`. 200, "Leads reassigned." |
| GET | `/transfers` | any | Query: pagination plus `status?` (TransferStatus), `projectId?` (uuid v4). Ordered by `createdAt` descending. Scope: SA sees all; MOD sees transfers in his projects; SP sees transfers where he is `fromUser`, `toUser` or `requestedBy`. | Paginated `TransferDto` |
| GET | `/transfers/pending-count` | any | | `{ pending: number }` |
| GET | `/transfers/:id` | any (in scope, else 404) | | `TransferDto` |
| POST | `/transfers/:id/approve` | SA, MOD | `note?` (string or null, max 500; "" becomes null) | `TransferDto`. 200, "Transfer approved." |
| POST | `/transfers/:id/reject` | SA, MOD | `note?` | `TransferDto`. 200, "Transfer rejected." |

Transfer errors:
- A pending transfer already exists: 409 `TRANSFER_PENDING`, "A transfer is already waiting for approval."
- Invalid recipient: 422, "Choose an active member of this project other than the current owner."
- The decider is a party to the transfer: 403, "You cannot decide a transfer you requested or would receive."
- Already decided: 409 `TRANSFER_ALREADY_DECIDED`, "Already decided by {name}.", `details: { status }`.
- The owner changed since the request: 409 CONFLICT, "The lead's owner changed after this request was made."
- A moderator reassigning to or from himself: 403, "You cannot reassign a lead to or from yourself. Ask another admin."
- Bulk reassign with leads not in the project: 404, "Some leads were not found in this project."
- Single reassign where the recipient already owns the lead (skipped > 0): 422 RECIPIENT_INVALID.

Request by phone (`POST /projects/:id/leads/request-by-phone`):
- No live lead with that number in the project: 404 "Lead not found."
- The caller already owns it: 409 `DUPLICATE_LEAD_OWN`, "You already have this lead.", `details: { leadId }`.
- A pending transfer on it already: 409 `TRANSFER_PENDING`.
- Closed project: 409 `PROJECT_CLOSED`.
- It is decided by an admin like any request (`canDecide` is false for the requester, who is also `toUser`).

Handover note: when `handoverNote` is sent, a pinned comment of kind `handover`, written by the caller, is added to the lead (request) or to every lead that actually moves (reassign; skipped leads get none). It shows in `GET /leads/:id/comments` and as the lead's `pinnedComment`.

Transfer notifications (never to the person who acted):
- A request (owner's or by phone): `transfer_requested` to every admin of the project (active super admins and active moderator members), link `/transfers`, `body` = the reason (first 140 chars). Title: "{requester} asked to move {lead} to {recipient}", or "{requester} asked for {lead}" when the requester is the recipient (by phone).
- Approve: `lead_assigned` to the new owner ("{admin} assigned {lead} to you", link `/leads/:id`), and `transfer_decided` to the requester and the previous owner ("{admin} approved moving {lead} to {recipient}", link `/leads/:id`, `body` = decision note). Each person gets one: a requester who is also the new owner gets only `lead_assigned`.
- Reject: `transfer_decided` to the requester and the owner ("{admin} rejected moving {lead} to {recipient}").
- Reassign: one `lead_assigned` to the new owner. One lead moved: "{admin} assigned {lead} to you", link `/leads/:id`, `leadId` set. Several: "{admin} assigned {n} leads in {project} to you", link `/leads`, `leadId` null. `body` = the reason.
- Automatic rejections (deactivation, removal, project closed, lead deleted, superseded) notify nobody.

### Me, timeline, dashboard (`modules/reports/reports.controller.ts`)

**GET `/me/home`** (roles SP, MOD)
- Query: `projectId?` (uuid v4).
- `data`:
  ```json
  {
    "targets": [TargetProgressDto],
    "dueToday": 0,
    "overdue": 0,
    "followUpsToday": 0,
    "myLeads": 0,
    "conversionsThisMonth": 0,
    "revenueThisMonth": 0,
    "notice": "string|null"
  }
  ```
  - `targets` holds the caller's own progress per active project.
  - `dueToday` counts due plus overdue.
  - `followUpsToday` counts `follow_up` entries the caller logged today in IST.
  - `conversionsThisMonth` counts leads whose `convertedBy` is the caller and whose `convertedAt` falls in the current IST calendar month, across the caller's projects (or `projectId`).
  - `revenueThisMonth` is the sum of `effectiveMonthlyValue` (₹/month after discount, §3b) over those leads, rounded to paise; a lead without a price adds 0. A number, not a string.
  - `notice` is "You are not assigned to any project yet." when the caller has no projects.

**GET `/me/agenda`** (roles SP, MOD; a Super Admin gets 403)
- Query: `projectId?` (uuid v4; a project the caller is not a member of gives 404).
- `data`:
  ```json
  {
    "overdue": 0,
    "today": 0,
    "tomorrow": 0,
    "thisWeek": 0,
    "cold": 0,
    "untouched": 0
  }
  ```
  - Counts only leads the caller owns, not deleted, in active projects where the caller is still an active member (the same scope as `/me/due-today`).
  - `overdue`, `today`, `tomorrow`, `thisWeek` match the lead list's `due=overdue|today|tomorrow|week`. `thisWeek` is today + 1 to today + 7, so it includes `tomorrow`.
  - `cold` matches `cold=true`: open leads with no activity for 14 days.
  - `untouched`: status `new` with no live entry at all, i.e. imported and never contacted.

**GET `/me/due-today`** (roles SP, MOD)
- Query: pagination plus `projectId?`.
- `data`: paginated `LeadSummaryDto`, with `ownerTag` always null.
- Included: own leads in active projects where the caller is still a member, `nextFollowUpDate <= today`, and status not terminal.
- Ordered by `nextFollowUpDate` ascending.

**GET `/timeline`** (roles: any)
- Query: `date?` (YYYY-MM-DD, default today in IST); `userId?` (uuid v4, default the caller; a sales person asking for anyone else gets 403); `projectId?`.
- `data`:
  ```json
  {
    "date": "YYYY-MM-DD",
    "user": { "id": "...", "name": "..." },
    "entries": [TimelineEntryDto],
    "followUps": 0,
    "visits": 0,
    "statusChanges": 0,
    "message": "string|null"
  }
  ```
  - `entries` are in ascending time order.
  - `TimelineEntryDto` is `EntryDto` plus `lead: { id, name, businessName }` and `project: { id, name, type, status }`.
  - `visits` counts follow-ups that have a photo.
  - `message` is "Nothing logged on this day." when there are no entries.
- A moderator sees only entries in his own projects.

**GET `/dashboard`** (roles SA, MOD)
- Query (`ReportFilterDto`):
  - `from?`, `to?`: YYYY-MM-DD, inclusive, IST. If only one is sent, it is used for both; if neither, today. `from > to` gives 400 "The start date must be on or before the end date." More than **366 days** gives 400 VALIDATION_FAILED "The dashboard can cover at most 366 days."
  - `projectId?`, `userId?`: uuid v4.
- `data`:
  ```json
  {
    "from": "YYYY-MM-DD", "to": "YYYY-MM-DD",
    "targets": [TargetProgressDto],
    "newLeads": 0,
    "followUps": 0,
    "followUpsToday": 0,
    "conversions": 0,
    "revenue": 0,
    "funnel": [
      { "stage": "created", "count": 0 },
      { "stage": "contacted", "count": 0 },
      { "stage": "interested", "count": 0 },
      { "stage": "converted", "count": 0 }
    ],
    "trendBucket": "day|week",
    "trend": [
      { "date": "YYYY-MM-DD", "followUps": 0, "newLeads": 0, "conversions": 0, "revenue": 0 }
    ],
    "lostReasons": [ { "reason": "<LostReason>|unspecified", "count": 0 } ],
    "sources": [ { "source": "<LeadSource>|unspecified", "count": 0 } ],
    "people": [
      { "user": { "id": "...", "name": "..." }, "role": "...", "newLeads": 0, "followUps": 0, "conversions": 0, "revenue": 0, "followUpsToday": 0 }
    ],
    "needsAttention": [
      {
        "kind": "behind_target|overdue_pile|idle|stale_transfer|help_request",
        "user": "{id,name}|null",
        "projectName": "string|null",
        "detail": "...",
        "leadCount": 0,
        "leadId": "uuid"
      }
    ],
    "loggedNothingToday": [
      { "user": { "id": "...", "name": "..." }, "role": "...", "projects": ["Project name"] }
    ],
    "leadsByStatus": [ { "status": "new", "count": 0 } ],
    "conversionsThisWeek": [
      {
        "leadId": "...", "leadName": "...", "businessName": "string|null", "phone": "...",
        "projectName": "...", "convertedBy": { "id": "...", "name": "..." },
        "currentOwner": { "id": "...", "name": "..." }, "convertedAt": "ISO",
        "via": "follow_up|status_change"
      }
    ],
    "pendingTransfers": 0,
    "message": "string|null"
  }
  ```
  - `targets` are for the current week or month, not the date range.
  - `newLeads` counts leads whose `createdAt` is in the range, credited to `createdBy` (the person who added the lead, or the admin who imported it), so imported leads count. With `userId`, only leads that person created. `people[].newLeads` uses the same rule, so an admin who imported leads appears in `people` with them. Leads imported before `createdBy` was recorded count in the total only. `/timeline/summary` counts `newLeads` the same way.
  - `followUps` counts entries in the range.
  - `conversions` counts leads whose `convertedAt` is in the range; `revenue` is the sum of their `effectiveMonthlyValue` (₹/month after discount, §3b; a lead without a price adds 0), rounded to paise. With `userId`, conversions credited to that person (`convertedBy`). `people[].conversions` / `people[].revenue` are the same per person.
  - `funnel` covers leads **created** in the range, by current status: `created` = all of them; `contacted` = any status but `new`; `interested` = `interested`, `follow_up_scheduled` or `converted`; `converted` = `converted`. Always four items in that order. With `userId` it follows the lead's current **owner** (whose pipeline it is), unlike `newLeads`.
  - `trend` has one point per IST day in the range, zeros included, and `trendBucket` is `day`. When the range is longer than 92 days the points are Monday–Sunday weeks instead (`trendBucket` is `week`, at most 53 points); each point's `date` is the week's Monday, except the first, which is `from` when the range starts mid-week. `followUps` counts `follow_up` entries (filtered by who logged them), `newLeads` as above, `conversions` and `revenue` as above.
  - `lostReasons` counts `not_interested` and `lost` entries logged in the range by `reason` (null → `"unspecified"`), filtered by who logged them; only non-zero reasons, most common first.
  - `sources` counts leads created in the range by `source` (null → `"unspecified"`); only non-zero, most common first. With `userId` it follows the owner, like `funnel`.
  - `needsAttention` is about **now**, not the date range (project and person filters still apply). At most 20 items, most severe first. Severity is how far past its threshold each item is (gap ÷ 20 points, overdue ÷ 5, idle days ÷ 2, hours ÷ 24), then by kind (`help_request`, then the order listed), then name. A help request scores 10 + days waited, so it ranks above everything short of an extreme.
    - `help_request`: one per unresolved help request (`POST /leads/:id/help`) on a live lead in an active project in scope, oldest first (at most 20 fetched). `user` = who asked, `projectName` set, `detail`: "Asked for help on {lead name}", `leadId` = the lead (present only on this kind). With `userId`, requests that person asked or that are on his leads. No `leadCount`.
    - `behind_target`: one per member target (active project) whose conversions share (`achieved / targetCount`, capped at 100%) is more than 20 percentage points behind the share of the current week or month gone. `detail`: "3 of 10 conversions with 65% of the week gone." No `leadCount`.
    - `overdue_pile`: one per owner and project with 5 or more overdue leads (`nextFollowUpDate` before today), counting only owners who are active users and active members of an active project. `leadCount` = the overdue leads. `detail`: "7 leads overdue for a follow-up."
    - `idle`: one per active sales person or moderator, **not on leave today**, who owns at least one lead in an active project in scope and has logged no entry in scope for 2 or more IST days (today counts as day 0, so nothing today or yesterday). Someone who never logged is counted from the day they joined. `projectName` is null when it spans several projects. `leadCount` = their open (non-terminal) leads in scope. `detail`: "No entry for 3 days." or "Nothing logged since joining 5 days ago."
    - `stale_transfer`: one per pending transfer older than 24 hours, oldest first; `user` is the person it is from. With `userId`, transfers from or to that person. `detail`: "Transfer of Asha Patil to Priya Desai waiting 30 hours." No `leadCount`.
    - `leadCount` and `leadId` are omitted (not null) where they do not apply.
  - `loggedNothingToday` leaves out anyone with an active leave covering today (IST).
  - `leadsByStatus` always contains all 7 statuses, zeros included.
  - `conversionsThisWeek` covers the current Monday–Sunday IST week, newest first, at most 500.
  - `message` is "No data for these dates." when both `newLeads` and `followUps` are 0.

**TargetProgressDto:**
```json
{
  "projectId": "...", "projectName": "...", "user": { "id": "...", "name": "..." }, "role": "...",
  "targetCount": "number|null", "targetPeriod": "weekly|monthly|null",
  "achieved": 0,
  "progressPercent": "number|null",
  "periodStart": "ISO", "periodEnd": "ISO",
  "conversionsThisWeek": 0, "conversionsThisMonth": 0
}
```
- `achieved` counts the current month for a monthly target; otherwise it counts the current week.
- `progressPercent` is `round(achieved / targetCount * 100)`, or null when there is no target.
- `periodEnd` is exclusive.

---

### Team scorecard and rep review (`modules/reports/performance.controller.ts`)

| Method | Path | Roles |
|---|---|---|
| GET | `/reports/scorecard` | SA, MOD |
| GET | `/reports/people/:id/review` | SA, MOD |
| GET | `/exports/scorecard` (CSV, §5) | SA, MOD |

Sales reps get 403. **Query (`ScorecardQueryDto`)**: `from`, `to` (YYYY-MM-DD, IST, **required**, inclusive, at most 366 days, else 400 "A scorecard or review can cover at most 366 days."; `from > to` gives 400) and `projectId?` (one campaign; a campaign the caller cannot see gives 404).

**Scope.** The sales head sees every campaign; a sales manager only the campaigns he is an active member of. Rows are **sales reps** with a membership in scope: everyone on a campaign team now, plus anyone who has since left but did something in the dates. A review's person must be visible to the caller (the sales head: anyone but himself; a sales manager: someone who is, or was, on one of his campaigns), else 404 "We couldn’t find this person on your team."; its numbers cover only the caller's campaigns.

**ScorecardNumbers** (on every row, `totals`, `averages`, `numbers`, `teamAverage`):
- `leadsAdded`: leads whose `createdAt` is in the dates, credited to `createdBy` (as the dashboard's `newLeads`).
- `followUps`: `follow_up` entries in the dates; `visits`: those with a photo.
- `activeDays`: **working days** with at least one entry of any kind (follow-up, visit or stage change). `workingDays` = days of the period up to today minus `leaveDays`. An entry on a leave day counts as a follow-up but not as an active day, so `activeDays ≤ workingDays`.
- `leaveDays`: days on leave (not cancelled, overlaps counted once) between `from` and the earlier of `to` and today.
- `dealsWon`: leads with `convertedAt` in the dates credited to `convertedBy`; `wonRevenue`: their monthly revenue (₹/month), summed exactly as the dashboard's `revenue`.
- `lostLeads`: leads the rep marked `not_interested` or `lost` in the dates, each lead once, leaving out leads that are `converted` now.
- `conversionPercent` = `dealsWon ÷ (dealsWon + lostLeads)`, whole %; null when both are 0.
- `avgDaysToWin`: average days from `createdAt` to `convertedAt` over the deals won, one decimal; null without wins.
- `target`: each campaign target (active member, active campaign) scaled to the dates — monthly: once per calendar month, by share of days for part of one; weekly: per 7 days; rounded, at least 1 — summed; null without a target. `achieved`: deals won in the campaigns with a target (all deals won when there is none). `targetPercent` = achieved ÷ target, null without a target.
- `overdueNow`, `openNow`: open (not Not interested, Won or Lost) leads the rep owns **now** in active campaigns in scope; overdue = next follow-up date before today.
- `handoversAsked`: transfers the rep asked for (`requestedBy`) in the dates, whatever the answer; `handoversReceived`: approved transfers to the rep decided in the dates.

**`GET /reports/scorecard`** `data`:
```json
{
  "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "daysSoFar": 13,
  "rows": [ { "user": { "id": "...", "name": "..." }, "isActive": true, "campaigns": ["North"],
              "topLostReason": "<LostReason>|unspecified|null", "...ScorecardNumbers": 0 } ],
  "totals": { "...ScorecardNumbers": 0 },
  "averages": "{...ScorecardNumbers}|null"
}
```
- `rows` are ordered by name. `totals` add the counts; `conversionPercent` and `targetPercent` are worked out from those sums, `avgDaysToWin` is weighted by wins. `averages` is the average rep: counts ÷ number of rows (one decimal), percentages and days to win averaged over the reps that have one; null with no rows.

**`GET /reports/people/:id/review`** `data`:
```json
{
  "from": "...", "to": "...",
  "person": { "id": "...", "name": "...", "role": "sales_person|moderator", "isActive": true, "campaigns": ["..."] },
  "numbers": "{ScorecardRow}", "teamAverage": "{ScorecardNumbers}|null", "teamSize": 3,
  "trendBucket": "day|week",
  "trend": [ { "date": "YYYY-MM-DD", "followUps": 0, "visits": 0, "newLeads": 0, "wins": 0 } ],
  "funnel": [ { "stage": "created|contacted|interested|converted", "count": 0 } ],
  "lostReasons": [ { "reason": "<LostReason>|unspecified", "count": 0 } ],
  "sources": [ { "source": "<LeadSource>|unspecified", "count": 0 } ],
  "planMix": [ { "plan": "growth|unspecified|<as typed>", "count": 0, "revenue": 0 } ],
  "recentWins": [ { "leadId": "...", "leadName": "...", "businessName": "string|null", "projectName": "...", "plan": "string|null", "dealValue": "number|null", "wonAt": "ISO" } ],
  "weekdays": [ { "weekday": 0, "followUps": 0, "visits": 0 } ],
  "feedback": { "count": 0, "recent": [ { "id": "...", "body": "...", "author": { "id": "...", "name": "..." }, "leadId": "...", "leadName": "...", "entryId": "uuid|null", "createdAt": "ISO" } ] }
}
```
- `teamAverage` is the scorecard's `averages` for the caller's scope and the same dates; `teamSize` is its number of reps.
- `trend`: every IST day for ranges up to 31 days, else Monday–Sunday weeks (first point labelled `from`), zeros included.
- `funnel` and `sources`: leads created in the dates that the person owns **or** added. `lostReasons`: the `lostLeads`, by their latest reason. `planMix`: deals won by the lead's `plan` column (empty → `unspecified`), most first. `recentWins`: the 10 latest deals won in the dates. `weekdays`: Monday (0) to Sunday (6), follow-ups and visits. `feedback`: managers' `feedback` comments in the dates on this person's own entries; `recent` is the latest 5.

## 3a. Team collaboration (`06_team_collaboration.sql`)

Leave and cover, comments and help on leads, in-app notifications, the roster, the leaderboard and message templates. "Admin of project P" means the Super Admin, or a moderator with an active membership in P. All dates are IST calendar days.

### Leave (`modules/leaves/leaves.controller.ts`)
**LeaveDto:**
```json
{
  "id": "uuid",
  "user": { "id": "...", "name": "..." },
  "startsOn": "YYYY-MM-DD",
  "endsOn": "YYYY-MM-DD",
  "note": "string|null",
  "createdBy": { "id": "...", "name": "..." },
  "createdAt": "ISO"
}
```

| Method | Path | Roles | Params / Body | data |
|---|---|---|---|---|
| POST | `/leaves` | any | `userId?` (uuid v4; omit or your own id for yourself); `startsOn` (YYYY-MM-DD); `endsOn` (YYYY-MM-DD); `note?` (string or null, trimmed, max 200, "" becomes null) | `LeaveDto`. **201**, "Leave saved." |
| GET | `/leaves` | any | Query: `userId?` (uuid v4). **No pagination params.** | `LeaveDto[]`: not cancelled, `endsOn` today or later, by `startsOn` then name. |
| DELETE | `/leaves/:id` | any | | `null`, "Leave cancelled." Sets `cancelled_at`; the row stays. |

Who:
- Booking for yourself: anyone. For someone else: the Super Admin (anyone), or a moderator for a sales person he manages (created by him, or sharing an active project). A sales person sending another `userId`: 403 "You can add leave only for yourself." A moderator outside his reach (another moderator, a sales person elsewhere): 403 "You can only manage sales persons you created or share a project with." Unknown or deleted user: 404. Deactivated user: 422 "Leave can be added only for an active user."
- Listing: a sales person sees his own (another `userId`: 403). A moderator sees his own and those of people he manages (another `userId`: 404 "User not found."); without `userId`, all of those. The Super Admin sees everyone.
- Cancelling: the person, or whoever could have booked it for him; otherwise (and for an already cancelled leave) 404 "Leave not found."

Date rules (400 VALIDATION_FAILED unless noted):
- `endsOn` before `startsOn`: "The last day of leave must be on or after the first."
- `endsOn` more than 60 days after `startsOn` (`user_leaves_span_max`, so at most 61 days): "The last day of leave can be at most 60 days after the first."
- `endsOn` before today: "A leave cannot end before today." A leave that started earlier is fine while it still covers today.
- `startsOn` more than 365 days ahead: "A leave can start at most 365 days ahead."
- Overlaps another active leave of the same person: **409** CONFLICT "This person already has leave on some of these days."

"On leave today" means an active leave with `startsOn <= today <= endsOn`. It shows as `onLeave` on `MeDto` (plus `nextLeave`), `MemberDto`, `UserDto` and the roster. People on leave today are left out of the dashboard's `loggedNothingToday` and `needsAttention` `idle`.

Booking a leave sends one `leave_cover` notification to each active backup of the person (in active projects where both are active members): title "{name} is on leave 14 Oct–16 Oct" (a single day: "on leave 14 Oct"), body "You're covering their follow-ups in {Project A, Project B}.", link `/home`.

### Backups
`PUT /projects/:id/members/:userId/backup` with `{ "backupUserId": "uuid|null" }` (key required).
- Who: an admin of the project. A moderator may set it for sales persons and for himself only, else 403 "You can set backups only for sales persons in your projects and for yourself." A project he is not in: 404. A sales person: 403 (roles).
- The member must be an active member (else 404 "This person is not a member of the project.").
- The backup must be an active, undeleted user, an active member of the same project, not a Super Admin and not the member himself; else 422 UNPROCESSABLE "Choose an active member of this project as the backup — not this person, and not a Super Admin."
- Closed project: 409 `PROJECT_CLOSED`.
- Returns the admin view of `MemberDto` (with `backup` and `onLeave`).

### Covering
User A **covers** owner O in project P today when O has an active leave covering today, O's membership in P is active with `backup` = A, and A is an active member of P. It is checked on every request, never stored, so it ends with the leave, a cancellation, or a backup change.

While covering, A:
- sees O's leads in P: `GET /projects/:id/leads?coveringFor=<O>`, `GET /leads/:id`, `GET /leads/:id/entries`, `GET /entries/:id`, `GET /entries/:id/photo`, and the lead's comments;
- logs follow-ups and status changes on them (`permissions.covering`, `canLogFollowUp`, `canChangeStatus` are true; `canEdit`, `canRequestTransfer`, `canReassign`, `canLeaveConverted` stay false). The entry's `user` is A and `coveringFor` is O; the lead stays O's, a conversion is credited to O (`convertedBy`), `lastActivityAt` moves. Door-to-door visits still need A's own capture token, photo and GPS;
- may comment, be mentioned, and ask for help on them.

Anyone else (another rep, a backup whose owner is not on leave) gets 404 on the lead and 403 on `coveringFor`.

**GET `/me/covering`** (roles SP, MOD)
- Query: `projectId?` (uuid v4; a project the caller cannot see gives 404). **No pagination.**
- `data`, by owner name then project (active projects only):
  ```json
  [
    {
      "user": { "id": "...", "name": "..." },
      "projectId": "...", "projectName": "...",
      "leave": { "startsOn": "YYYY-MM-DD", "endsOn": "YYYY-MM-DD" },
      "dueToday": 0,
      "overdue": 0
    }
  ]
  ```
  - `dueToday`: the owner's open (non-terminal) leads in that project with `nextFollowUpDate <= today` (overdue included). `overdue`: `nextFollowUpDate < today`.

### Comments, mentions, help (`modules/comments/comments.controller.ts`)
Whoever may open the lead — the owner (active member), the project's admins, the backup covering for the owner — may read and write its comments. Anyone else gets **404** on every route below (a comment id included).

**CommentDto:**
```json
{
  "id": "uuid",
  "kind": "comment|help|feedback|handover",
  "body": "string",
  "user": { "id": "...", "name": "..." },
  "mentions": [ { "id": "...", "name": "..." } ],
  "pinned": false,
  "entryId": "uuid|null",
  "resolvedAt": "ISO|null",
  "resolvedBy": "{id,name}|null",
  "createdAt": "ISO",
  "editedAt": "ISO|null",
  "canEdit": false,
  "canDelete": false,
  "canPin": false,
  "canResolve": false
}
```
- `canEdit`: the caller wrote it and the project is active. `canDelete`: the caller wrote it, or is the Super Admin. `canPin`: the project is active and the caller is the owner (active member) or an admin. `canResolve`: an unresolved `help` comment, the project is active, and the caller is an admin or wrote it.

| Method | Path | Roles | Body | data |
|---|---|---|---|---|
| GET | `/leads/:id/comments` | any | | `CommentDto[]`, oldest first, deleted ones left out. **No pagination.** |
| GET | `/leads/:id/mentionable` | any | | `PersonRefDto[]` by name: the lead's owner, the project's active moderators, and the owner's backup **while he is covering** — active users who are active members and can open the lead — never the caller. |
| POST | `/leads/:id/comments` | any | `body` (trimmed, 1–2000); `mentionIds?` (uuid v4 array, unique, max 20, each from `mentionable`, else 400 VALIDATION_FAILED "You can mention only the lead’s owner, the project’s moderators and the backup covering for the owner."); `pinned?` (boolean; owner or admin, else 403 "Only the lead’s owner or an admin can pin a comment."); `kind?` (`comment` default, or `feedback`); `entryId?` (uuid v4; must be a live entry of this lead, else 400 "That entry is not part of this lead’s history.") | `CommentDto`. **201**, "Comment saved." |
| PATCH | `/comments/:id` | any | `body?` (trimmed, 1–2000; author only, else 403 "Only the person who wrote this comment can edit it."; sets `editedAt`); `pinned?` (owner or admin). At least one, else 400 "Send a new text or pin setting to change." | `CommentDto`, "Comment saved." |
| DELETE | `/comments/:id` | any | | `null`, "Comment deleted." Author or Super Admin, else 403 "Only the person who wrote this comment, or the Super Admin, can delete it." Soft delete. |
| POST | `/leads/:id/help` | **SP, MOD** | `body` (trimmed, 1–2000) | `CommentDto` (kind `help`). **201**, "Your moderators have been asked for help." |
| POST | `/comments/:id/resolve` | any | none | `CommentDto`. 200, "Help request resolved." |

Rules:
- `kind: "feedback"`: an admin of the project only (403 "Only an admin of the project can give feedback on an entry."), `entryId` required (400 "Choose the entry this feedback is about."). It appears in that entry's `feedback` everywhere `EntryDto` is returned.
- Help: the owner (active member) or the backup covering for him, else 403 "Only the lead’s owner, or the backup covering for them, can ask for help." It mentions every active moderator of the project (except the caller). One open help per lead: 409 CONFLICT "A help request on this lead is already open." Unresolved help shows as `openHelp` on the lead and as a `help_request` item on the dashboard.
- Resolve: an admin of the project or the person who asked (403 "Only an admin of the project or the person who asked can resolve this."). Not a help comment: 422 "Only a help request can be resolved." Already resolved: 409 "This help request is already resolved."
- Writes (except DELETE) in a closed project: 409 `PROJECT_CLOSED`.

Comment notifications (one per person, never the author; `link` `/leads/:id`, `leadId` set, `body` = first 140 characters of the comment):
- `mention` to each mentioned person: "{author} mentioned you on {lead}".
- `feedback` to the entry's author (if not already mentioned): "{author} left feedback on your entry for {lead}", link `/day?date=<entry's IST date>`.
- `comment` to the lead's owner, if he can open the lead and was not already told: "{author} commented on {lead}".
- `help_requested` to each mentioned moderator: "{asker} asked for help on {lead}".
- `help_resolved` to the asker when someone else resolves it (and he can still open the lead): "{resolver} resolved your help request on {lead}". No body.

### Notifications (`modules/notifications/notifications.controller.ts`)
Private: every route reads or changes only the caller's own rows. Nobody, the Super Admin included, sees anyone else's.

**NotificationDto:**
```json
{
  "id": "uuid",
  "kind": "<NotificationKind>",
  "title": "Meera Nair mentioned you on Anil Sharma",
  "body": "string|null",
  "link": "/leads/<id>|/transfers|/leads|/home|/day?date=YYYY-MM-DD|null",
  "actor": "{id,name}|null",
  "leadId": "uuid|null",
  "createdAt": "ISO",
  "readAt": "ISO|null"
}
```

| Method | Path | Roles | Params / Body | data |
|---|---|---|---|---|
| GET | `/notifications` | any | Query: pagination plus `unreadOnly?` ("true"/"false"). | Paginated `NotificationDto`, newest first. |
| GET | `/notifications/unread-count` | any | | `{ count: number }` |
| POST | `/notifications/read` | any | `ids?` (uuid v4 array, 1–100, unique; ids that are not the caller's are ignored) and/or `all?` (boolean). Neither: 400 "Send the ids to mark as read, or all: true." | `{ count: number }` = the caller's unread count afterwards. 200, "Marked as read." |

What sends which kind: leave booked → `leave_cover`; transfers → `transfer_requested`, `transfer_decided`, `lead_assigned` (see *Transfer notifications*); comments → `mention`, `comment`, `feedback`, `help_requested`, `help_resolved`. The actor is never notified about his own action.

### Team (`modules/team/team.controller.ts`)
**GET `/projects/:id/leaderboard`** (any active member of the project, or the Super Admin; else 404)
- Query: `period?` (`week` default, `month`; anything else 400).
- `data`:
  ```json
  {
    "period": "week|month",
    "from": "YYYY-MM-DD",
    "to": "YYYY-MM-DD",
    "rows": [
      { "user": { "id": "...", "name": "..." }, "role": "sales_person|moderator", "conversions": 0, "followUps": 0, "rank": 1, "isMe": false }
    ]
  }
  ```
  - `from`/`to`: the current Monday–Sunday week or calendar month, IST, inclusive.
  - Rows: every active sales person and moderator with an active membership in the project. `conversions` = leads in the project credited to them (`convertedBy`) with `convertedAt` in the period; `followUps` = their `follow_up` entries in the project in the period (status changes not counted).
  - Ordered by conversions desc, follow-ups desc, then name. `rank` starts at 1; equal conversions and follow-ups share a rank and the next one skips (1, 2, 2, 4). No revenue.

**GET `/team/roster`** (roles SA, MOD)
- Query: `projectId?` (uuid v4; a moderator's must be one of his projects, else 404). Without it: the caller's active projects (every active project for the Super Admin). **No pagination.**
- `data`:
  ```json
  [
    {
      "user": { "id": "...", "name": "...", "phone": "string|null", "email": "..." },
      "role": "sales_person|moderator",
      "projects": [ { "id": "...", "name": "..." } ],
      "onLeave": "LeaveSpanDto|null",
      "nextLeave": "LeaveSpanDto|null",
      "backup": "{id,name}|null",
      "lastActivityAt": "ISO|null",
      "followUpsToday": 0,
      "openLeads": 0,
      "dueToday": 0,
      "overdue": 0,
      "target": "{ count: number, period: 'weekly|monthly', achieved: number }|null"
    }
  ]
  ```
  - One row per active, undeleted sales person or moderator with an active membership in the projects in scope (deduplicated; `projects` lists those projects).
  - Every count covers only the projects in scope: `lastActivityAt` = their latest entry; `followUpsToday` = `follow_up` entries today (IST); `openLeads` = owned non-terminal leads; `dueToday` = open leads with `nextFollowUpDate <= today` (overdue included); `overdue` = before today.
  - `backup` and `target` only with `projectId` (else null). `target` is null when no target is set; `achieved` is the current week/month count as in `TargetProgressDto`.
  - Sorted: people on leave today last, then `overdue` desc, then name.

### Message templates (`modules/templates/templates.controller.ts`)
**TemplateDto:** `{ "id": "uuid", "label": "string", "body": "string", "sort": 0 }`. The body keeps `{client}`, `{rep}` and `{business}` exactly as written; the app fills them in.

| Method | Path | Roles | Body | data |
|---|---|---|---|---|
| GET | `/projects/:id/templates` | any (member of the project or SA, else 404) | | `TemplateDto[]` by `sort`, then label (case-insensitive). Deleted ones left out. |
| POST | `/projects/:id/templates` | SA, MOD (admin of the project; a member who is not: 403; others 404) | `label` (trimmed, 1–40); `body` (trimmed, 1–1000); `sort?` (int 0–10000, default 0) | `TemplateDto`. **201**, "Template saved." |
| PATCH | `/templates/:id` | SA, MOD (admin of the template's project; can't see the project: 404) | `label?`, `body?`, `sort?` (same rules). At least one, else 400 "Send a label, text or position to change." | `TemplateDto`, "Template saved." |
| DELETE | `/templates/:id` | SA, MOD (same) | | `null`, "Deleted successfully." Soft delete; a deleted template is 404 afterwards. |

Writes in a closed project: 409 `PROJECT_CLOSED`.

---

## 3b. Deals, plan prices and offers (`08_deal_terms.sql`)

**Deal fields** (create, follow-up and status change with `converted`, `PATCH /leads/:id`). All optional; JSON or multipart.

| field | type | validation |
|---|---|---|
| `dealValue` | integer | 0–100000000. The **list price per month**, before any discount. 0 for Free. |
| `planCode` | PlanCode | `free`, `growth`, `growth_plus`, `pro` |
| `dealTenureMonths` | integer | 1, 3, 6 or 12. Not sent: 1. Not with Free. |
| `offerId` | uuid v4 | an offer live today (`GET /offers?active=true`). Its discount and coupon are **copied onto the lead**; editing or ending the offer later never changes this deal. Don't send `discountType`/`discountValue`/`couponCode` with it. |
| `discountType` | DiscountType | a discount typed by hand ("Other discount"): `percent` or `amount` |
| `discountValue` | number | with `discountType`. Percent 0–100 (two decimals at most); amount whole rupees, at most price × tenure. |
| `couponCode` | string | with a typed discount only. Letters, digits, `-` and `_`, max 40; trimmed and stored in capitals. |

Rules (400 VALIDATION_FAILED unless noted):
- Free: no price (0), tenure, offer or discount — "The Free plan has no price, tenure or discount."
- An offer and a typed discount together — "Pick an offer or type a discount, not both."; a coupon with an offer — "This offer fills in its own coupon."
- Half a discount — "Choose % off or ₹ off, and how much."; a discount without a price — "Enter the monthly price before adding a discount."; a coupon without a discount — "A coupon goes with a discount. Add the discount too."
- Percent over 100 — "A % discount must be between 0 and 100."; ₹ off more than price × tenure — "The ₹ discount can't be more than the deal total."
- An offer that is ended, removed, not started or past its dates — **422** UNPROCESSABLE "This offer has ended. Pick another offer or type the discount." The offer **already on the lead** is accepted (its copied discount is kept), so re-saving a won deal after its offer ended works.

**The money** (`leads/deal-rules.ts`, and in SQL `reports/revenue-rules.ts`):
- Deal total = price × tenure − discount. A percent comes off the whole deal and the client's total is **rounded down to a rupee** (10% off ₹2,499 × 6 = ₹14,994 → ₹13,494).
- Effective monthly value = deal total ÷ tenure (₹2,249). **Every revenue figure** — home `revenueThisMonth`, dashboard `revenue`, `people[].revenue`, `trend[].revenue`, exports — sums this.
- Deals saved before this (no tenure, no discount) count exactly as before: their monthly price.

**Plan prices**

| Method | Path | Roles | Body | data |
|---|---|---|---|---|
| GET | `/settings/plan-prices` | any signed in | | `[{ plan, monthlyPrice \| null }]` — always the four plans in order free, growth, growth_plus, pro. `null`: not set yet. Free is always 0. |
| PUT | `/settings/plan-prices` | **SA** (else 403) | `{ prices: [{ plan: PlanCode, monthlyPrice: integer 0–100000000 \| null }] }`, 1–4 items; plans left out keep their price. Free accepts only 0 or null ("The Free plan is always ₹0."); a plan twice is 400 "Each plan can be priced once." | same list, "Plan prices saved." |

The Won picker prefills `dealValue` from the plan's price; deals already saved keep their price.

**Offers** (company-wide). **OfferDto:** `{ "id": "uuid", "name": "string", "couponCode": "string|null", "discountType": "percent|amount", "discountValue": 10, "startsOn": "YYYY-MM-DD|null", "endsOn": "YYYY-MM-DD|null", "active": true }`. `active` is the sales head's switch (false = ended). Reps can pick an offer only while it is **live**: active, not removed, and today (IST) within `startsOn`–`endsOn` (inclusive; null = no limit).

| Method | Path | Roles | Body | data |
|---|---|---|---|---|
| GET | `/offers` | any signed in | Query `active?` ("true"/"false") | `OfferDto[]`. SP and MOD always get only live offers. SA gets every offer not removed, newest first; with `active=true`, only live ones. |
| POST | `/offers` | **SA** | `name` (trimmed, 1–60); `couponCode?` (string or null; trimmed, capitals, letters/digits/`-`/`_`, max 40; "" becomes null); `discountType`; `discountValue` (percent: more than 0, at most 100, two decimals; amount: whole rupees more than 0); `startsOn?`, `endsOn?` (YYYY-MM-DD or null; "" becomes null; `endsOn` ≥ `startsOn`); `active?` (default true) | `OfferDto`. **201**, "Offer saved." |
| PATCH | `/offers/:id` | **SA** | any of the above. `active: false` **ends** it; `true` brings it back. Nothing sent: 400 "Change something, then save." | `OfferDto`, "Offer saved." |
| DELETE | `/offers/:id` | **SA** | | `null`, "Offer removed." Hidden from every list (404 afterwards); deals won on it keep its name and discount. |

Errors: unknown or removed offer 404 "We couldn't find this offer."; percent out of range 400 "A % off must be more than 0 and at most 100."; amount 400 "A ₹ off must be whole rupees, more than 0."; dates 400 "The last day must be on or after the first day."

---

## 3c. Training (`09_training.sql`, `10_training_playlists.sql`, `modules/training/*`)

Courses live in a library (Super Admin); each campaign attaches courses and may add its own lessons (its admins). Lesson `kind`: `video` (YouTube link + optional checks), `playlist` (a YouTube playlist link; its videos are the modules, read from YouTube's public feed when saved, or when the payload says `refresh: true`), `document` (PDF/image in the private bucket, or a link), `card` (Markdown), `quiz`, `roleplay` (practice pitch with an AI owner, via Claude). `step`: `watch · tutorial · practise · prove · field · library`. Documents and links are shown inside the app (pdf.js, image, or a frame), never in a new tab.

| Method & path | Who | Notes |
|---|---|---|
| `GET /training/courses` | SA (all), moderator (published) | `CourseDto[]` |
| `POST /training/courses` · `PATCH/DELETE /training/courses/:id` | SA | Delete hides and detaches; progress stays |
| `GET /training/courses/:id` | SA; moderator if published | `{ course, lessons: LessonDto[] }`, answers and hidden role-play instructions included |
| `POST /training/courses/:id/items` | SA | `CreateLessonDto { kind, step?, title, summary?, sort?, required?, minutes?, payload }` |
| `GET/PATCH/DELETE /training/items/:id` | SA; a campaign lesson's admins | |
| `POST /training/items/:id/file` | same | multipart `file`: PDF, JPG, PNG, WebP ≤ 20 MB |
| `GET/PUT /projects/:id/training/courses` | campaign admins | PUT `{ courseIds }` replaces the list; published courses only |
| `GET/POST /projects/:id/training/items` | campaign admins | campaign-only lessons |
| `GET /projects/:id/training` | members, SA | `CampaignTrainingDto`: syllabus with my progress, `certifiedAt`, `roleplayLeftToday`. No answers |
| `GET /projects/:id/training/board` | campaign admins | every member × lessons, best scores, recent pitches |
| `POST /training/items/:id/progress` | members | `{ projectId, percent?, positionSeconds?, done?, moduleId? }`: video ≥ 90% or `done` (no checks); document/card `done`; playlist per module (`moduleId`, kept in `progress.watched`), done when every module ≥ 90%, or `done` when YouTube listed none |
| `POST /training/items/:id/attempts` | members | `{ projectId, answers }` for a quiz (3 tries/day until passed) or a video's checks (all right) |
| `GET /training/items/:id/file?projectId=` | members | short-lived signed link |
| `POST /training/items/:id/roleplay` | members | `{ projectId }` starts a pitch (`ROLEPLAY_DAILY_LIMIT` a day); the owner speaks first |
| `GET /training/items/:id/roleplay?projectId=` | members | my pitches for the lesson |
| `GET /roleplay/:id` | its rep, campaign admins | |
| `POST /roleplay/:id/turns` | its rep | `{ message }` (≤ 800 chars), at most `ROLEPLAY_MAX_TURNS` |
| `POST /roleplay/:id/finish` | its rep | coach score 0–100 + feedback; ≥ pass score completes the lesson |

Finishing the last required lesson writes a certificate once and sends the campaign's managers a `training` notification (link `/projects/:id?tab=training`). Role-play answers `422` when `ANTHROPIC_API_KEY` is empty, `429` past the daily cap, `502` when Claude can't answer (nothing is saved, resend).

## 4. Door-to-door visit flow

**Step 1: get a capture token.** Call `POST /api/v1/visits/capture-token` (SP or MOD, no body) when the camera opens, and **again on every retake**.
- Response `data`: `{ captureToken: "v1.<base64url payload>.<base64url HMAC>", issuedAt: ISO, expiresAt: ISO }`. `expiresAt` is `issuedAt` + 10 minutes.
- The token is stateless, bound to the user id, and timed on the server clock with 30 s of allowed skew. The phone clock does not matter.

**Step 2: submit.**
- Create a lead with its first follow-up: `POST /api/v1/projects/:projectId/leads`.
- Log a follow-up: `POST /api/v1/leads/:leadId/follow-ups`.

Both are **`multipart/form-data`**. There is no base64 path. Parts:
- `photo`: **file part**, exactly one file. The field name must be `photo` (`UPLOAD_FIELD.PHOTO`). A different name or a second file is a multer error, returned as 400.
- `latitude`, `longitude`, `gpsAccuracyM`: text parts with numeric strings, converted on the server.
- `captureToken`: text part.
- `clientRequestId`, `status`, `note`, `nextFollowUpDate` (optional; an empty string means not sent), `location`: text parts.
- Optional text parts: `reason` and the deal fields (`dealValue`, `dealTenureMonths`, `discountValue` as numeric strings; `planCode`, `offerId`, `discountType`, `couponCode`). An empty string means not sent.
- For create only: `name`, `businessName`, `phone`, `notes`, `source`.
- Do not send any other parts; `forbidNonWhitelisted` rejects them with 400.

**Size and format limits**
- Multer limit is `VISIT_PHOTO_MAX_BYTES` = 8 MB (8×1024×1024). Over it: HTTP 413 with `errorCode` `VALIDATION_FAILED` and message "File too large". The service also checks: "The photo is too large. Take it again."
- The format is detected from the bytes, not the MIME type: jpeg, png or webp. Anything else gives 400 VALIDATION_FAILED "The photo could not be read. Take it again."
- The server then:
  - rotates the image upright by EXIF and strips all metadata
  - resizes to a 1280 px maximum edge
  - stamps "Lat x, Long y (±N m)" and "08 Oct 2026, 03:42 pm IST · Name"
  - re-encodes as JPEG with quality 72, then 62, then 52, aiming for 300 KB or less
- Compressing on the client before upload is recommended.

**Validation order (door-to-door only).** These run before anything is written:
1. No photo: 422 `VISIT_PROOF_REQUIRED`, "Take a photo of the visit to save it."
2. Any of `latitude`/`longitude`/`gpsAccuracyM` missing: 422 `VISIT_PROOF_REQUIRED`, "Your location is needed to save a visit. Turn on location and try again."
3. Capture token:
   - Missing: 422 `VISIT_PROOF_REQUIRED`, "Take the photo again before saving."
   - Bad signature or another user's token: 422 `VISIT_PROOF_REQUIRED`, "This photo could not be verified. Take it again."
   - Older than 10 minutes: 422 `CAPTURE_EXPIRED`, "The photo was taken more than 10 minutes ago. Take it again."

**Other details**
- Accuracy above 100 m is accepted but flagged with `lowAccuracy: true`. Stored coordinates are rounded to 6 decimals and accuracy to 2.
- If storage fails: 502 `INTEGRATION_ERROR`, "The photo could not be saved. Please retry."
- **Online projects** can send plain JSON with the same fields minus the photo. Any photo or GPS sent for an online project is ignored and not stored.
- Manual status changes (`POST /leads/:id/status`) never take a photo, even in door-to-door projects. They are JSON only.

**`clientRequestId`**
- A UUID v4 that the form generates once per submission.
- Applies to create-lead, follow-up and status-change requests.
- A retry or double tap with the same id returns the **first saved result**: `LeadDetailDto` for create, `EntrySaveResultDto` for the others.
- Reusing the id for a different lead, or reuse by another user, gives 409 CONFLICT, "This request id was already used for a different entry."
- Keep the id across retries of the same submission. Generate a new one for each new submission.

**Photo display**
- `EntryDto.photoUrl` is a signed URL that expires after `SIGNED_URL_TTL_SECONDS` (default 600 s).
- To refresh it, call `GET /entries/:id/photo`, which returns `{ url, expiresInSeconds }`.
- `ProjectDto.imageUrl` is signed the same way; refetch the project to get a fresh one.

---

## 5. Exports

| Method | Path | Roles |
|---|---|---|
| GET | `/exports/leads` | SA, MOD |
| GET | `/exports/follow-ups` | SA, MOD |
| GET | `/exports/scorecard` | SA, MOD |

**Query (`ExportFilterDto`):**
- `from`: YYYY-MM-DD, **required**.
- `to`: YYYY-MM-DD, **required**.
- `projectId?`, `userId?`: uuid v4.
- The span is inclusive and **at most 92 days**, else 400 VALIDATION_FAILED "An export can cover at most 92 days." `from > to` gives 400.
- A file holds **at most 20,000 rows**. More gives 400 VALIDATION_FAILED "An export can hold at most 20,000 rows. Choose fewer days, one project or one person." Nothing is downloaded; narrow the filters and retry.
- A moderator's export covers only his projects. For leads, `userId` filters by owner; for follow-ups, by the person who logged the entry.

**Response**
- **Raw file, not the JSON envelope.**
- `Content-Type: text/csv; charset=utf-8`.
- `Content-Disposition: attachment; filename="leads_<from>_<to>.csv"` or `filename="follow-ups_<from>_<to>.csv"`. CORS exposes this header.
- Fetch it with the Bearer header as a blob. Errors still come back as JSON error bodies.
- The CSV is UTF-8 with a BOM, CRLF line endings, and RFC 4180 quoting. Cells starting with `= + - @ tab CR` get a leading `'` (numbers are left alone).
- Date-times are formatted `YYYY-MM-DD HH:mm` in IST.

**Leads columns:** Lead reference, Campaign, Contact person, Business name, Phone, Location, Stage, Next follow-up, Lead owner, Owner still on team, Won on (IST), Won by, **Plan** (Free/Growth/Growth Plus/Pro, or the old free text), **Tenure (months)** (blank for Free or no price; 1 when not recorded), **Monthly price (₹)**, **Discount** ("10% off", "₹500 off", with the offer's name in brackets when one was picked), **Coupon**, **Deal total (₹)**, **Monthly revenue after discount (₹)**, Lead source, Added on (IST), Last changed (IST), Last activity (IST), Notes. Rows are leads whose `created_at` falls in the range.

**Scorecard** (`/exports/scorecard?from&to&projectId?`, same 92-day limit; numbers as in §3 "Team scorecard"): `filename="scorecard_<from>_<to>.csv"`. Columns: Sales rep, Campaign(s), Leads added, Follow-ups, Visits, Active days, Days on leave, Deals won, Revenue won (₹/month), Conversion %, Avg days to win, Target, Achieved, Target %, Overdue now, Open leads now, Lost leads, Top lost reason, Handovers asked, Handovers received, Working days, Still on team. One line per sales rep, then "Team total" and "Team average". Blank cells where a number does not apply (no target, nothing closed).

**Follow-ups columns:** Entry ID, Logged at (IST), Project, Lead, Business name, Phone, Logged by, Type (`follow_up`/`status_change`), Status, Reason (LostReason value or blank), Note, Next follow-up, Typed location, Latitude, Longitude, GPS accuracy (m), Low accuracy (yes/no/blank), Photo (login required), Edited (yes/no).
- The photo cell is `${APP_URL}/entries/<entryId>`, or `entries/<entryId>` if `APP_URL` is not set.
- **Your web app needs a route `/entries/:id`** that, after login, calls `GET /api/v1/entries/:id` and `GET /api/v1/entries/:id/photo`.

---

## 6. Constants

### Error codes (`ERROR_CODE`)
`VALIDATION_FAILED`, `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `ACCOUNT_DEACTIVATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `UNPROCESSABLE`, `RATE_LIMITED`, `INTERNAL`, `SERVICE_BUSY`, `INTEGRATION_ERROR`, `USER_DEACTIVATED_EXISTS`, `PROJECT_CLOSED`, `DUPLICATE_LEAD_OWN`, `DUPLICATE_LEAD_OTHER`, `LEAD_TRANSFERRED`, `ENTRY_LOCKED`, `VISIT_PROOF_REQUIRED`, `CAPTURE_EXPIRED`, `TRANSFER_PENDING`, `TRANSFER_ALREADY_DECIDED`

### Messages (`common/constants/error-message.constants.ts`)
**COMMON_ERROR**
- INTERNAL: "Something went wrong on our side. Please try again."
- SERVICE_BUSY: "The service is busy. Please try again in a moment."
- VALIDATION_FAILED: "Some of the submitted values are not valid."
- FORBIDDEN: "You do not have access to this."
- UNAUTHORIZED: "Please sign in to continue."
- TOKEN_EXPIRED: "Your session has expired. Please sign in again."
- INVALID_UUID: "One of the ids in the request is not valid."
- NOT_FOUND: "Not found."
- INVALID_DATE_RANGE: "The start date must be on or before the end date."

**AUTH_ERROR**
- INVALID_CREDENTIALS: "Email or password is incorrect"
- ACCOUNT_DEACTIVATED: "Your account is deactivated. Contact your admin."
- ACCOUNT_NOT_SET_UP: "This login has no account in the Sales Tracker. Contact your admin."
- INVALID_REFRESH_TOKEN: "Your session has expired. Please sign in again."
- INVALID_SET_PASSWORD_LINK: "This link has expired or was already used. Ask for a new one."
- CURRENT_PASSWORD_WRONG: "The current password is incorrect."
- AUTH_UNAVAILABLE: "Sign-in is temporarily unavailable. Please try again."

**USER_ERROR**
- NOT_FOUND: "User not found."
- EMAIL_EXISTS: "A user with this email already exists."
- EMAIL_EXISTS_DEACTIVATED: "This email belongs to a deactivated user. Reactivate that user instead of creating a new one."
- EMAIL_IN_AUTH: "This email is already registered with the login system. Contact support to link it."
- MODERATOR_CREATES_SALES_ONLY: "Moderators can only create sales persons."
- CANNOT_CREATE_SUPER_ADMIN: "Super Admins cannot be created from the app."
- NOT_MANAGEABLE: "You can only manage sales persons you created or share a project with."
- LAST_SUPER_ADMIN: "You are the only active Super Admin, so this account cannot be deactivated."
- LAST_SUPER_ADMIN_ROLE: "The only active Super Admin cannot change role."
- ALREADY_ACTIVE: "This user is already active."
- ALREADY_INACTIVE: "This user is already deactivated."
- SAME_ROLE: "The user already has this role."
- SAME_EMAIL: "The user already has this email."

**PROJECT_ERROR**
- NOT_FOUND: "Project not found."
- CLOSED: "This project is closed."
- ALREADY_CLOSED: "This project is already closed."
- ALREADY_ACTIVE: "This project is already active."
- TYPE_LOCKED: "The project type cannot change once the project has a lead."
- END_BEFORE_START: "The end date must be on or after the start date."
- NAME_EXISTS_WARNING: "Another project already has this name."
- IMAGE_TYPE: "The project image must be a JPG or PNG."
- IMAGE_TOO_LARGE: "The project image must be 2 MB or smaller."
- NO_IMAGE: "This project has no image."

**MEMBER_ERROR**
- NOT_MEMBER: "This person is not a member of the project."
- ALREADY_MEMBER: "This person is already a member of the project."
- USER_INACTIVE: "A deactivated user cannot be added to a project."
- SUPER_ADMIN_NOT_MEMBER: "Super Admins have access to every project and are not added as members."
- MODERATOR_ADDS_SALES_ONLY: "Only the Super Admin can add moderators to a project."
- MODERATOR_REMOVES_SALES_ONLY: "Only the Super Admin can remove another moderator."
- SELF_ASSIGN_CLOSED: "A closed project cannot be assigned."
- ALREADY_ASSIGNED: "This project is already assigned to you."
- TARGET_PAIR: "Set the target number and the period together, or clear both."
- TARGET_NOT_ALLOWED: "You can set targets only for sales persons in your projects and for yourself."
- BACKUP_NOT_ALLOWED: "You can set backups only for sales persons in your projects and for yourself."
- BACKUP_INVALID: "Choose an active member of this project as the backup — not this person, and not a Super Admin."

**LEAVE_ERROR**
- NOT_FOUND: "Leave not found."
- ONLY_SELF: "You can add leave only for yourself."
- USER_INACTIVE: "Leave can be added only for an active user."
- END_BEFORE_START: "The last day of leave must be on or after the first."
- IN_PAST: "A leave cannot end before today."
- TOO_LONG: "The last day of leave can be at most 60 days after the first."
- TOO_FAR: "A leave can start at most 365 days ahead."
- OVERLAP: "This person already has leave on some of these days."

**COVER_ERROR**
- NOT_COVERING: "You are not covering for this person in this project today."

**COMMENT_ERROR**
- NOT_FOUND: "Comment not found."
- MENTION_INVALID: "You can mention only the lead’s owner, the project’s moderators and the backup covering for the owner."
- PIN_NOT_ALLOWED: "Only the lead’s owner or an admin can pin a comment."
- FEEDBACK_ADMIN_ONLY: "Only an admin of the project can give feedback on an entry."
- FEEDBACK_NEEDS_ENTRY: "Choose the entry this feedback is about."
- ENTRY_NOT_ON_LEAD: "That entry is not part of this lead’s history."
- ONLY_AUTHOR_EDITS: "Only the person who wrote this comment can edit it."
- ONLY_AUTHOR_DELETES: "Only the person who wrote this comment, or the Super Admin, can delete it."
- NOTHING_TO_UPDATE: "Send a new text or pin setting to change."
- HELP_OPEN: "A help request on this lead is already open."
- HELP_NOT_ALLOWED: "Only the lead’s owner, or the backup covering for them, can ask for help."
- NOT_HELP: "Only a help request can be resolved."
- ALREADY_RESOLVED: "This help request is already resolved."
- RESOLVE_NOT_ALLOWED: "Only an admin of the project or the person who asked can resolve this."

**NOTIFICATION_ERROR**
- NOTHING_TO_MARK: "Send the ids to mark as read, or all: true."

**TEMPLATE_ERROR**
- NOT_FOUND: "Template not found."
- NOTHING_TO_UPDATE: "Send a label, text or position to change."

**LOCATION_ERROR**
- LENGTH: "Location must be 2 to 100 characters."

**LEAD_ERROR**
- NOT_FOUND: "Lead not found."
- INVALID_PHONE: "Enter a 10-digit Indian mobile number."
- DUPLICATE_OWN: "You already have this lead."
- DUPLICATE_OTHER: "This number is already a lead in this project, owned by {owner}."
- NOT_A_MEMBER: "You are not a member of this project."
- ADMINS_CANNOT_ADD: "Only members of the project can add leads."
- ONLY_OWNER_EDITS: "Only the lead's owner can edit it."
- OWNER_UNAVAILABLE: "The lead's owner is inactive or removed. Reassign the lead first."

**FOLLOW_UP_ERROR**
- NOT_FOUND: "Entry not found."
- ONLY_OWNER_LOGS: "Only the lead's owner can log a follow-up."
- LEAD_TRANSFERRED: "This lead now belongs to {owner}."
- NEW_NOT_ALLOWED: "A lead cannot be set back to New."
- CONVERTED_LOCKED: "Ask your moderator to change this."
- NEXT_DATE_REQUIRED: "Choose the next follow-up date for Follow-up scheduled."
- NEXT_DATE_PAST: "The next follow-up date cannot be in the past."
- NEXT_DATE_TOO_FAR: "The next follow-up date can be at most 365 days ahead."
- SAME_STATUS: "The lead already has this status."
- LOCKED: "This entry is now locked."
- ONLY_AUTHOR_EDITS: "Only the person who logged this entry can edit it."
- STATUS_CHANGE_NOTE_ONLY: "Only the note of a status change can be edited."
- NEXT_DATE_NOT_OWNER: "The next follow-up date can be changed only while you own the lead."
- CLIENT_REQUEST_REUSED: "This request id was already used for a different entry."
- NOTHING_TO_UPDATE: "Send a note or a next follow-up date to change."
- REASON_NOT_ALLOWED: "A reason can be given only for Not interested or Lost."
- DEAL_ONLY_WHEN_CONVERTED: "Deal details can be added only when the lead is Won."

**VISIT_ERROR**
- PHOTO_REQUIRED: "Take a photo of the visit to save it."
- GPS_REQUIRED: "Your location is needed to save a visit. Turn on location and try again."
- CAPTURE_TOKEN_REQUIRED: "Take the photo again before saving."
- CAPTURE_EXPIRED: "The photo was taken more than 10 minutes ago. Take it again."
- CAPTURE_INVALID: "This photo could not be verified. Take it again."
- PHOTO_INVALID: "The photo could not be read. Take it again."
- PHOTO_TOO_LARGE: "The photo is too large. Take it again."
- STORAGE_UNAVAILABLE: "The photo could not be saved. Please retry."
- STORAGE_NOT_CONFIGURED: "Photo storage is not configured on the server."
- NO_PHOTO: "This entry has no photo."

**TRANSFER_ERROR**
- NOT_FOUND: "Transfer not found."
- PENDING_EXISTS: "A transfer is already waiting for approval."
- ONLY_OWNER_REQUESTS: "Only the lead's owner can request a transfer."
- RECIPIENT_INVALID: "Choose an active member of this project other than the current owner."
- ALREADY_DECIDED: "Already decided by {name}."
- SELF_DECISION: "You cannot decide a transfer you requested or would receive."
- SELF_REASSIGN: "You cannot reassign a lead to or from yourself. Ask another admin."
- OWNER_CHANGED: "The lead's owner changed after this request was made."
- LEADS_NOT_IN_PROJECT: "Some leads were not found in this project."

**REPORT_ERROR**
- EXPORT_RANGE_TOO_LONG: "An export can cover at most 92 days."
- EXPORT_TOO_MANY_ROWS: "An export can hold at most 20,000 rows. Choose fewer days, one project or one person."
- DASHBOARD_RANGE_TOO_LONG: "The dashboard can cover at most 366 days."
- DATE_REQUIRED: "Choose a start and end date."

The messages use the typographic apostrophe `’` in "lead’s".

### Success messages (`SUCCESS_MESSAGE`)
| key | text |
|---|---|
| CREATED | "Created successfully." |
| UPDATED | "Updated successfully." |
| DELETED | "Deleted successfully." |
| FETCHED | "Fetched successfully." |
| LOGGED_IN | "Signed in." |
| LOGGED_OUT | "Signed out." |
| TOKEN_REFRESHED | "Session refreshed." |
| RESET_LINK_SENT | "If an account exists for this email, a reset link has been sent." |
| PASSWORD_SET | "Password saved. You can sign in now." |
| PASSWORD_CHANGED | "Password changed." |
| USER_CREATED | "User created. An email has been sent to set the password." |
| USER_DEACTIVATED | "User deactivated." |
| USER_REACTIVATED | "User reactivated." |
| PROJECT_CLOSED | "Project closed. It is now read-only." |
| PROJECT_REOPENED | "Project reopened." |
| MEMBER_ADDED | "Member added to the project." |
| MEMBER_REMOVED | "Member removed from the project." |
| TARGET_UPDATED | "Target updated." |
| JOINED_PROJECT | "Project assigned to you." |
| LEAD_CREATED | "Lead saved." |
| FOLLOW_UP_LOGGED | "Follow-up saved." |
| STATUS_CHANGED | "Status changed." |
| TRANSFER_REQUESTED | "Transfer requested. It moves once an admin approves it." |
| TRANSFER_APPROVED | "Transfer approved." |
| TRANSFER_REJECTED | "Transfer rejected." |
| LEADS_REASSIGNED | "Leads reassigned." |
| LEAVE_SAVED | "Leave saved." |
| LEAVE_CANCELLED | "Leave cancelled." |
| BACKUP_UPDATED | "Backup updated." |
| COMMENT_SAVED | "Comment saved." |
| COMMENT_DELETED | "Comment deleted." |
| HELP_REQUESTED | "Your moderators have been asked for help." |
| HELP_RESOLVED | "Help request resolved." |
| NOTIFICATIONS_READ | "Marked as read." |
| LEAD_REQUESTED | "Request sent. The lead moves to you once an admin approves it." |
| TEMPLATE_SAVED | "Template saved." |
| PLAN_PRICES_SAVED | "Plan prices saved." |
| OFFER_SAVED | "Offer saved." |
| OFFER_REMOVED | "Offer removed." |
| NOTHING_LOGGED | "Nothing logged on this day." |
| NO_DATA | "No data for these dates." |
| NO_PROJECTS | "You are not assigned to any project yet." |

### Business rules (`common/constants/business-rules.constants.ts`, `app.constants.ts`)
**Passwords, text lengths**
- PASSWORD_MIN_LENGTH 8, PASSWORD_MAX_LENGTH 72
- PHONE_DIGITS 10; phone input fields allow a raw maximum of 20 characters
- NAME_MAX_LENGTH 120; also the maximum length of the `search` param
- BUSINESS_NAME_MAX_LENGTH 160
- NOTES_MAX_LENGTH 2000, DESCRIPTION_MAX_LENGTH 2000
- REASON_MAX_LENGTH 500 (transfer reason and decision note)
- NOTE_MIN_LENGTH **5**, NOTE_MAX_LENGTH 2000

**Locations, follow-ups**
- LOCATION_MIN_LENGTH 2, LOCATION_MAX_LENGTH 100. The DTO allows 200 raw characters; the limit is enforced after collapsing whitespace.
- LOCATION_SUGGESTION_LIMIT 10
- NEXT_FOLLOW_UP_MAX_DAYS_AHEAD **365**

**Visit proof, images**
- CAPTURE_WINDOW_MINUTES **10**
- LOW_ACCURACY_METRES 100
- MAX_GPS_ACCURACY_METRES 100000
- VISIT_PHOTO_MAX_BYTES 8 MB; VISIT_PHOTO_MAX_EDGE_PX 1280; VISIT_PHOTO_QUALITY_STEPS [72, 62, 52]; VISIT_PHOTO_TARGET_MAX_BYTES 300 KB
- PROJECT_IMAGE_MAX_BYTES 2 MB (JPG or PNG only); PROJECT_IMAGE_MAX_EDGE_PX 1200
- Signed URL TTL: 600 s by default

**Sales insights**
- DEAL_VALUE_MAX 100000000 (whole rupees per month, minimum 0); PLAN_MAX_LENGTH 80
- COLD_LEAD_DAYS **14** (counted as 14 × 24 hours from `lastActivityAt`)
- DASHBOARD_MAX_DAYS **366**; TREND_MAX_DAILY_POINTS 92 (longer ranges trend by week)
- Needs attention: ATTENTION_BEHIND_TARGET_POINTS 20, ATTENTION_OVERDUE_PILE 5, ATTENTION_IDLE_DAYS 2, ATTENTION_STALE_TRANSFER_HOURS 24, ATTENTION_LIST_LIMIT 20

**Exports, transfers, members**
- EXPORT_MAX_DAYS **92**; EXPORT_MAX_ROWS **20,000**
- BULK_REASSIGN_MAX_LEADS 500
- Member target count: 1 to 100000

**Team collaboration**
- LEAVE_MAX_SPAN_DAYS **60** (from the first day to the last; at most 61 days), LEAVE_MAX_DAYS_AHEAD 365, LEAVE_NOTE_MAX_LENGTH 200
- COMMENT_MAX_LENGTH 2000, COMMENT_MAX_MENTIONS 20, NOTIFICATION_PREVIEW_LENGTH 140 (notification `body`)
- HANDOVER_NOTE_MAX_LENGTH 500
- TEMPLATE_LABEL_MAX_LENGTH 40, TEMPLATE_BODY_MAX_LENGTH 1000, TEMPLATE_SORT_MAX 10000
- NOTIFICATIONS_READ_MAX_IDS 100
- ATTENTION_HELP_BASE_SEVERITY 10 (dashboard help requests; + 1 per day waiting)
- Notification links (`NOTIFICATION_LINK`): `/home`, `/transfers`, `/leads`, `/leads/:id`, `/day?date=YYYY-MM-DD`

**Lists, paging**
- LEAD_DETAIL_RECENT_ENTRIES 20
- PAGINATION: DEFAULT_PAGE 1, DEFAULT_LIMIT 20, MIN_LIMIT 1, MAX_LIMIT 100
- Dashboard conversions list: at most 500

**Time**
- Time zone `Asia/Kolkata`. All "today", week (Monday–Sunday) and month calculations, and the midnight entry-edit lock, use IST.
- Dates (`startDate`, `endDate`, `nextFollowUpDate`, report dates) are serialized as `"YYYY-MM-DD"` strings.
- Timestamps are ISO 8601 UTC strings.

### Things to watch in the client
- POST `/visits/capture-token` and `/auth/forgot-password` return the default message "Created successfully." even though the status is 200.
- `forbidNonWhitelisted` means you must not send extra query params (for example `page` on `/projects/:id/members` or `/projects/:id/locations`) or extra form fields.
- Create endpoints return 201 even when `clientRequestId` replays an earlier save.
- Not-visible resources return 404, not 403.

Files with the most contract detail:
- `/Users/apple/Desktop/pronttera/sales-application/service-application/src/modules/leads/dto/lead.dto.ts`
- `/Users/apple/Desktop/pronttera/sales-application/service-application/src/modules/leads/dto/entry.dto.ts`
- `/Users/apple/Desktop/pronttera/sales-application/service-application/src/modules/reports/dto/report.dto.ts`
- `/Users/apple/Desktop/pronttera/sales-application/service-application/src/modules/transfers/dto/transfer.dto.ts`
- `/Users/apple/Desktop/pronttera/sales-application/service-application/src/modules/projects/dto/project.dto.ts`
- `/Users/apple/Desktop/pronttera/sales-application/service-application/src/modules/projects/dto/member.dto.ts`
- `/Users/apple/Desktop/pronttera/sales-application/service-application/src/modules/users/dto/user.dto.ts`
- `/Users/apple/Desktop/pronttera/sales-application/service-application/src/modules/auth/dto/auth.dto.ts`
- `/Users/apple/Desktop/pronttera/sales-application/service-application/src/modules/visits/capture-token.service.ts`
- `/Users/apple/Desktop/pronttera/sales-application/service-application/src/modules/visits/visit-proof.service.ts`

Of the files used for this report, I did not read `supabase-auth.client.ts`. Its exact Supabase failure mapping (likely `AUTH_UNAVAILABLE` / `INTEGRATION_ERROR`) is inferred, not confirmed.