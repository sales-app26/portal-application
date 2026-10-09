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
    "notice": "string|null"
  }
  ```
  - `projects` lists active memberships ordered by `joinedAt` ascending. It is always `[]` for super_admin.
  - `notice` is `"You are not assigned to any project yet."` for a non-super-admin with no projects, otherwise `null`.
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

Related constants:
- `TERMINAL_STATUSES` = `NOT_DUE_STATUSES` = [`not_interested`, `converted`, `lost`]
- Lead list `sort` values: `updated` (default, DESC), `created` (DESC), `name` (ASC), `next_follow_up` (ASC). All use NULLS LAST.

---

## 3. Endpoints

All paths below are relative to `/api/v1`.

"Roles" means the `@Roles` decorator. "any" means any authenticated user, with scope applied in the service.

### Shared response shapes
- **PersonRefDto:** `{ id, name }`
- **LocationRefDto:** `{ id, name }`
- **UserDto:**
  ```json
  {
    "id": "...", "name": "...", "email": "...", "phone": "string|null",
    "role": "...", "isActive": true, "createdBy": "uuid|null",
    "createdAt": "ISO", "canManage": true
  }
  ```
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
    "targetPeriod": "...|null", "removedAt": "ISO|null"
  }
  ```
  `email`, `phone`, `targetCount`, `targetPeriod` and `removedAt` are only present when the caller is an admin of the project.
- **EntryDto:**
  ```json
  {
    "id": "...", "leadId": "...", "projectId": "...",
    "entryType": "follow_up|status_change",
    "status": "<LeadStatus after this entry>",
    "note": "string|null",
    "nextFollowUpDate": "YYYY-MM-DD|null",
    "location": "{id,name}|null",
    "hasPhoto": true,
    "photoUrl": "string|null",
    "latitude": "number|null", "longitude": "number|null", "gpsAccuracyM": "number|null",
    "lowAccuracy": false,
    "user": { "id": "...", "name": "..." },
    "createdAt": "ISO", "updatedAt": "ISO",
    "edited": false,
    "editable": false
  }
  ```
  - `location` is null for a `status_change`.
  - `photoUrl` is a signed URL with a TTL of `SIGNED_URL_TTL_SECONDS` (default 600 s).
  - `lowAccuracy` is true when `gpsAccuracyM > 100`.
  - `user` is whoever logged the entry.
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
    "hasPendingTransfer": false,
    "createdAt": "ISO", "updatedAt": "ISO"
  }
  ```
  - `overdueDays` is set when `nextFollowUpDate` is before today and the status is not terminal; otherwise null.
  - `ownerTag` is always null for non-admins.
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
      "canEdit": true, "canRequestTransfer": true, "canReassign": false, "canDelete": false
    }
  }
  ```
  - `recentEntries` holds at most 20 entries, newest first.
  - `lastDecidedTransfer` is the latest approved or rejected transfer where `fromUser` is the current owner.
- **LeadTransferRefDto:**
  ```json
  {
    "id": "...", "status": "...", "toUser": { "id": "...", "name": "..." }, "reason": "...",
    "createdAt": "ISO", "decidedBy": "{id,name}|null", "decidedAt": "ISO|null",
    "decisionNote": "string|null"
  }
  ```
- **Permission rules.** Let *ownerWorks* mean the caller is the owner and an active member, and *open* mean the project is active.
  - `canLogFollowUp` = open && ownerWorks
  - `canChangeStatus` = open && (ownerWorks || isAdmin)
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
| POST | `/auth/set-password` | Public | `accessToken` (string, non-empty; the Supabase token from the invite or reset link's URL fragment); `password` (string, 8–72) | `null` | "Password saved. You can sign in now.", 200. A bad link gives 401 UNAUTHORIZED, "This link has expired or was already used. Ask for a new one." |
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
| GET | `/projects/joinable` | **MOD** | | `ProjectDto[]` (not paged): active projects the moderator is not in, sorted by name |
| GET | `/projects/:id` | any (must be a member, else 404) | | `ProjectDto` |
| POST | `/projects` | **SA** | JSON **or** `multipart/form-data`. Fields: `name` (trimmed, non-empty, max 120); `description?` (string or null, max 2000; empty becomes null); `type` (ProjectType); `startDate` (YYYY-MM-DD); `endDate?` (YYYY-MM-DD; empty is ignored; must be on or after `startDate`, else 400). Optional file field **`image`**: JPG or PNG, at most 2 MB (service check), with a multer ceiling of 8 MB. | `ProjectDto` (may include `warnings`). 201 |
| PATCH | `/projects/:id` | **SA** | `name?`, `description?` (null or "" clears), `type?` (409 CONFLICT "The project type cannot change once the project has a lead." if `typeLocked`), `startDate?`, `endDate?` (null or "" clears) | `ProjectDto` |
| POST | `/projects/:id/image` | **SA** | multipart, file field **`image`** (required) | `ProjectDto`, 200 |
| DELETE | `/projects/:id/image` | **SA** | | `ProjectDto`. If there is no image: 404 NOT_FOUND "This project has no image." |
| POST | `/projects/:id/close` | **SA** | | `ProjectDto`. 200, "Project closed. It is now read-only." Already closed: 409 CONFLICT. |
| POST | `/projects/:id/reopen` | **SA** | | `ProjectDto`. 200, "Project reopened." |
| GET | `/projects/:id/members` | any member | Query: `includeRemoved?` ("true"/"false"; admins only). **No pagination params; sending them gives 400.** | `MemberDto[]`: active first, then by name. Non-admins see only active members, without email, phone or targets. |
| POST | `/projects/:id/members` | SA, MOD | `userId` (uuid v4); `targetCount?` (int, 1–100000); `targetPeriod?` (TargetPeriod). Send both or neither, else 400 "Set the target number and the period together, or clear both." | `MemberDto`. 201, "Member added to the project." |
| POST | `/projects/:id/join` | **MOD** | none | `MemberDto`. 201, "Project assigned to you." Closed project: 409 PROJECT_CLOSED. Already a member: 409 CONFLICT. |
| DELETE | `/projects/:id/members/:userId` | SA, MOD | both params are uuid v4 | `MemberDto` (with `isActive: false` and `removedAt` set). "Member removed from the project." |
| PATCH | `/projects/:id/members/:userId/target` | SA, MOD | `targetCount` (int 1–100000, or null; **required key**); `targetPeriod` (TargetPeriod or null; **required key**). Both null clears the target. | `MemberDto`. "Target updated." |

Membership errors:
- Inactive user: 422 "A deactivated user cannot be added to a project."
- Super admin: 422 "Super Admins have access to every project and are not added as members."
- Moderator adding a non-sales user: 403 "Only the Super Admin can add moderators to a project."
- Closed project: 409 PROJECT_CLOSED.
- A previously removed member is reactivated and keeps their old target unless a new one is sent.

### Locations (`modules/locations/locations.controller.ts`)
| Method | Path | Roles | Query | data |
|---|---|---|---|---|
| GET | `/projects/:id/locations` | any member | `q?` (string, max 100) | `[{ id, name, usageCount }]`, at most 10. Names starting with `q` come first, then by usage descending, then by name. Empty `q` returns the most used. **No pagination params.** |

The API never takes a location id. Leads and follow-ups send the location as **free text**, and the server finds or creates it, case-insensitively.

### Leads (`modules/leads/leads.controller.ts`)
| Method | Path | Roles | Params / Body | data |
|---|---|---|---|---|
| POST | `/projects/:id/leads` | **SP, MOD** (must be an active member) | JSON or multipart. **CreateLeadDto**, see the field table below. | `LeadDetailDto`. **201**, "Lead saved." |
| GET | `/projects/:id/leads` | any member | Query: pagination plus `status?` (LeadStatus), `ownerId?` (uuid v4; admins), `mine?` ("true"/"false"), `ownerUnavailable?` ("true"/"false"; admins), `sort?` (`updated`, `created`, `name` or `next_follow_up`). `search` matches name or business name, plus phone when the search term is 3–10 digits. Sales persons only ever get their own leads. | Paginated `LeadSummaryDto` |
| GET | `/leads/:id` | any (admin of the project, or owner and active member; else 404) | | `LeadDetailDto` |
| GET | `/leads/:id/entries` | same | Query: pagination | Paginated `EntryDto`, newest first |
| PATCH | `/leads/:id` | **SP, MOD** (owner and active member, else 403 "Only the lead's owner can edit it.") | `name?` (trimmed, non-empty, max 120); `businessName?` (string or null, max 160, "" becomes null); `phone?` (string, non-empty, max 20; normalized and re-checked for duplicates); `notes?` (string or null, max 2000); `location?` (trimmed, non-empty, max 200, then 2–100 chars after collapsing whitespace) | `LeadDetailDto` |
| DELETE | `/leads/:id` | **SA** | | `null`, "Deleted successfully." This is a soft delete. |
| POST | `/leads/:id/follow-ups` | **SP, MOD** (owner only) | JSON or multipart. **LogFollowUpDto**, see below. | `EntrySaveResultDto`. **201**, "Follow-up saved." |
| POST | `/leads/:id/status` | any (owner, or an admin of the project) | **ChangeStatusDto**, JSON: `clientRequestId` (uuid v4); `status` (LeadStatus); `note` (trimmed, 5–2000; the reason); `nextFollowUpDate?` (YYYY-MM-DD; "" is ignored) | `EntrySaveResultDto`. **200**, "Status changed." |

**CreateLeadDto fields.** It extends `LogFollowUpDto`, so it includes every follow-up field.

| field | type | req | validation |
|---|---|---|---|
| `name` | string | yes | trimmed, non-empty, max 120 |
| `businessName` | string\|null | no | "" becomes null, max 160 |
| `phone` | string | yes | non-empty, max 20. Server: Indian mobile, else 400 VALIDATION_FAILED "Enter a 10-digit Indian mobile number." |
| `notes` | string\|null | no | max 2000. About the client, separate from the note. |
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
- The phone is someone else's lead: 409 `DUPLICATE_LEAD_OTHER`, "This number is already a lead in this project, owned by {owner}.", `details: { ownerName }`.

Other create errors:
- Super admin: 403 "Only members of the project can add leads."
- Not a member: 404.
- Closed project: 409 PROJECT_CLOSED "This project is closed."

**LogFollowUpDto fields:** `clientRequestId`, `status`, `note`, `nextFollowUpDate?`, `location` (required; pre-fill it with the lead's location), plus `latitude?`, `longitude?`, `gpsAccuracyM?`, `captureToken?` and the `photo` file. Constraints are the same as in the table above.

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
- A follow-up by an admin who is not the owner gives 403 "Only the lead's owner can log a follow-up."
- If the lead was transferred away from the caller (an approved transfer from them), the error is 409 `LEAD_TRANSFERRED`, "This lead now belongs to {name}." Otherwise 404.
- If the project closed meanwhile: 409 `PROJECT_CLOSED`.

### Entries (`modules/leads/entries.controller.ts`)
| Method | Path | Roles | Body | data |
|---|---|---|---|---|
| GET | `/entries/:id` | any (author, owner who is an active member, or admin of the project; else 404) | | `EntryDto` |
| GET | `/entries/:id/photo` | same | | `{ url: string, expiresInSeconds: number }` (default 600). No photo: 404 "This entry has no photo." Storage failure: 502 INTEGRATION_ERROR. |
| PATCH | `/entries/:id` | any (author only) | `note?` (trimmed, 5–2000); `nextFollowUpDate?` (YYYY-MM-DD, or null/"" to clear; follow-ups only). At least one field is required, else 400 "Send a note or a next follow-up date to change." | `EntrySaveResultDto`, "Updated successfully." |
| DELETE | `/entries/:id` | **SA** | | `null` |

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
| POST | `/leads/:id/transfers` | **SP, MOD** (owner and active member, else 403 "Only the lead's owner can request a transfer.") | `toUserId` (uuid v4); `reason` (trimmed, non-empty, max 500) | `TransferDto`. **201**, "Transfer requested. It moves once an admin approves it." |
| POST | `/leads/:id/reassign` | SA, MOD | same body: `toUserId`, `reason` | `{ reassigned: number, skipped: number }`. 200, "Leads reassigned." |
| POST | `/projects/:id/leads/reassign` | SA, MOD | `toUserId`, `reason`, `leadIds` (array of uuid v4, 1–500, unique) | `{ reassigned, skipped }`. 200, "Leads reassigned." |
| GET | `/transfers` | any | Query: pagination plus `status?` (TransferStatus), `projectId?` (uuid v4). Ordered by `createdAt` descending. Scope: SA sees all; MOD sees transfers in his projects; SP sees transfers where he is `fromUser` or `requestedBy`. | Paginated `TransferDto` |
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
    "notice": "string|null"
  }
  ```
  - `targets` holds the caller's own progress per active project.
  - `dueToday` counts due plus overdue.
  - `followUpsToday` counts `follow_up` entries the caller logged today in IST.
  - `notice` is "You are not assigned to any project yet." when the caller has no projects.

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
  - `from?`, `to?`: YYYY-MM-DD, inclusive, IST. If only one is sent, it is used for both; if neither, today. `from > to` gives 400 "The start date must be on or before the end date."
  - `projectId?`, `userId?`: uuid v4.
- `data`:
  ```json
  {
    "from": "YYYY-MM-DD", "to": "YYYY-MM-DD",
    "targets": [TargetProgressDto],
    "newLeads": 0,
    "followUps": 0,
    "followUpsToday": 0,
    "people": [
      { "user": { "id": "...", "name": "..." }, "role": "...", "newLeads": 0, "followUps": 0, "conversions": 0, "followUpsToday": 0 }
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
  - `followUps` counts entries in the range.
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
- For create only: `name`, `businessName`, `phone`, `notes`.
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

**Query (`ExportFilterDto`):**
- `from`: YYYY-MM-DD, **required**.
- `to`: YYYY-MM-DD, **required**.
- `projectId?`, `userId?`: uuid v4.
- The span is inclusive and **at most 92 days**, else 400 VALIDATION_FAILED "An export can cover at most 92 days." `from > to` gives 400.
- A moderator's export covers only his projects. For leads, `userId` filters by owner; for follow-ups, by the person who logged the entry.

**Response**
- **Raw file, not the JSON envelope.**
- `Content-Type: text/csv; charset=utf-8`.
- `Content-Disposition: attachment; filename="leads_<from>_<to>.csv"` or `filename="follow-ups_<from>_<to>.csv"`. CORS exposes this header.
- Fetch it with the Bearer header as a blob. Errors still come back as JSON error bodies.
- The CSV is UTF-8 with a BOM, CRLF line endings, and RFC 4180 quoting. Cells starting with `= + - @ tab CR` get a leading `'` (numbers are left alone).
- Date-times are formatted `YYYY-MM-DD HH:mm` in IST.

**Leads columns:** Lead ID, Project, Name, Business name, Phone, Location, Status, Next follow-up, Owner, Owner active (yes/no), Converted at (IST), Converted by, Added at (IST), Updated at (IST), Notes. Rows are leads whose `created_at` falls in the range.

**Follow-ups columns:** Entry ID, Logged at (IST), Project, Lead, Business name, Phone, Logged by, Type (`follow_up`/`status_change`), Status, Note, Next follow-up, Typed location, Latitude, Longitude, GPS accuracy (m), Low accuracy (yes/no/blank), Photo (login required), Edited (yes/no).
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

**Exports, transfers, members**
- EXPORT_MAX_DAYS **92**
- BULK_REASSIGN_MAX_LEADS 500
- Member target count: 1 to 100000

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