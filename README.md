# Sales Tracker: portal application

The mobile-first web app for the Sales Tracker. It runs in the browser and installs to the home screen. It talks to the NestJS API in `../service-application`.

| Topic | Source |
| --- | --- |
| Look | [`../DESIGN.md`](../DESIGN.md) |
| Behaviour (components, phone vs laptop) | [`../UX-COMPONENTS.md`](../UX-COMPONENTS.md) |
| API contract | [`docs/api-contract.md`](docs/api-contract.md) |
| Product rules | [`../sales-tracker-PRD.md`](../sales-tracker-PRD.md) |

## Run

```bash
npm install
npm run dev        # http://localhost:5173; /api is proxied to the API on :4100
npm run build      # type-check + production build into dist/
```

Set `VITE_API_URL` only when the API is not same-origin. It defaults to `/api/v1`. The API's `AUTH_REDIRECT_URL` must point at `<app>/set-password`.

## Stack

- React 19, Vite 8, TypeScript, Tailwind v4. The DESIGN.md tokens live in `src/styles/index.css`.
- Radix primitives (shadcn-style, styled in-house), Vaul for bottom sheets, Sonner for toasts.
- TanStack Query for server state, React Hook Form with Zod for forms, React Router 8 with lazy routes.
- Icons8 iOS 17, free plan: 100px PNGs in `src/icons/`, drawn through a CSS mask (`<Icon name="camera" />`). The "Icons by Icons8" credit link is required and must stay.

## Layout

```
src/
  auth/            session state, roles (AuthProvider)
  components/
    layout/        AppShell (bottom bar / rail / drawer), Page, navigation per role
    ui/            Button, Field, Overlay (sheet ↔ dialog), Choice, Display, ListRow
  hooks/           window class, overlay back-button history, online, keyboard
  icons/           Icons8 PNGs + <Icon>
  lib/             api client, types, formatting, form errors
  pages/           one folder per area
```

Rules worth knowing:

- Every overlay goes through `ResponsiveOverlay`: a bottom sheet below 840px, a dialog or side panel above. The device Back button closes it, and unsaved input is confirmed before it is thrown away.
- `api()` unwraps the response envelope and throws `ApiError` (`code` holds the API's `errorCode`). An expired token is refreshed once. If refresh fails, a sign-in sheet opens over the current page, so the user's form survives.
- The API rejects unknown query params and body fields. Never send extras.

## Quality checks

```bash
npm run test:e2e        # browser tests on a fake API: flows, accessibility (axe), pull-to-refresh, offline
npm run test:e2e:real   # browser tests on the REAL API code (see below)
npm run build:check     # production build, then fail if the first load or a screen is over budget
```

**If a run looks slow or shows 15-minute test durations:** that is the machine's clock jumping (sleep, resume), which makes a pending wait time out at once. Re-run the failed test on its own (`node --test --test-name-pattern="<name>" e2e/<file>`), and never start a second run while one is still going.

**Against the real API.** `test:e2e:real` starts `../service-application/test/support/dev-server.ts`: the actual NestJS API on an in-memory PostgreSQL with a fake Supabase, seeded with a Super Admin, a moderator, three sales persons and two projects. Nothing touches the hosted Supabase project. It checks what a fake can't: real validation messages, phone normalisation, duplicate detection, the server stamping a real camera frame, signed photo links, transfer approval, reassign, the dashboard and the CSV. To poke at it by hand: `cd ../service-application && npm run dev:fake`, then `VITE_API_PROXY=<the printed baseUrl> npm run dev`. The API allows 10 sign-ins a minute per address, so the tests sign in once per person.

- **Offline:** the build writes `dist/sw.js` listing every built file. After one visit the app shell and every screen open with no signal; API calls, map tiles and signed photo links are never cached, and nothing can be saved offline (PRD §8). A new version waits behind an "Update" toast so an open form is never reloaded away.
- **Budget** (`scripts/check-bundle.mjs`, gzip): first-load JavaScript 215 KB, first-load CSS 20 KB, any one lazy screen 60 KB. The numbers are a ratchet just above today's size; lower them when you can.
- **Muted text colour:** DESIGN.md's `muted` (#7c828a) is 3.9:1 on white, under WCAG AA (4.5:1) for small text, so the app uses #656a75. Everything else follows DESIGN.md.

## Browser tests

```bash
npm run test:e2e   # starts Vite, drives the local Chrome against a fake API
```

`e2e/` needs no backend or accounts. `e2e/mock-api.mjs` fakes the API from `docs/api-contract.md`. Chrome runs with a fake camera that grants permission automatically, plus a fixed GPS position, so the door-to-door photo flow runs unattended. Set `CHROME_PATH` if Chrome isn't in the default place, and `HEADFUL=1` to watch.

## Testing on a phone

The camera and GPS only work on `https` or `localhost`. To try the visit flow on a real phone over Wi-Fi, serve the app over HTTPS (for example with a tunnel), or use Chrome's USB port forwarding so the phone sees `localhost:5173`.

## Test accounts

The Super Admin comes from the API seed:

```bash
# service-application/.env: set SEED_SUPER_ADMIN_NAME / _EMAIL / _PASSWORD (8+ chars)
cd ../service-application && npm run db:seed
```

Sign in as that Super Admin to create moderators, sales persons and projects (Phase 5 screens; until then use the API's Swagger at `http://localhost:4100/docs`).

## Phases

| # | Scope | Status |
| --- | --- | --- |
| 1 | Foundation: tokens, icons, UI kit, responsive overlay, app shell per role, API client with refresh, sign in, forgot / set password, session-expired sheet, Profile, PWA manifest, offline banner | **Done** |
| 2 | Field work: Home (targets, Due today), My leads (search, status filter, paging), Lead detail, Add lead, Log follow-up, Change status, Edit lead, Request transfer, location autocomplete, project switcher; online projects end to end | **Done** |
| 3 | Visit proof: camera screen, GPS with accuracy, capture token, photo compression, multipart save, 10-minute countdown, permission and failure states | **Done** |
| 4 | Timelines and maps: My day, Person timeline (`/people/:id/day`, linked from People in phase 5), `/entries/:id`, photo viewer, Leaflet + OpenStreetMap pins, same-day entry edit | **Done** |
| | Not built: the per-entry mini map and the place-name label (needs `gps_place_label` in the API, see UX-COMPONENTS.md §4.9) | |
| 5 | Admin: Dashboard (filters, targets, logged-nothing, status counts, conversions, people, CSV export), People (team and moderators, add, edit, deactivate), Projects (create, edit, close, reopen, join), Project detail (members, targets, leads with bulk reassign), Transfers (approve, reject) | **Done** |
| 7 | Admin requests after v1: person summary by week or month (`/people/:id`), bulk lead import from CSV (`/projects/:id/import`): review every lead and assign on screen, or send the whole file to one person (`?owner=<userId>` preselects them, from a member's menu). Needed two new API endpoints: `GET /timeline/summary` and `POST /projects/:id/leads/import` | **Done** |
| 6 | Polish: offline app shell (service worker), pull-to-refresh, automated accessibility checks (axe, WCAG 2.1 AA), bundle budget | **Done** |
# portal-application
