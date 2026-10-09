import type { Session } from './types'

// All routes are /api/v1/... (docs/api-contract.md §1). Dev proxies /api to the API on :4100.
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1'
const SESSION_KEY = 'st.session'
const TOKEN_EXPIRED = 'Your session has expired. Please sign in again.'

export class ApiError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>
  fieldErrors?: { field: string; messages: string[] }[]

  constructor(status: number, code: string, message: string, extra?: Partial<ApiError>) {
    super(message)
    this.status = status
    this.code = code
    this.details = extra?.details
    this.fieldErrors = extra?.fieldErrors
  }

  get isNetwork() {
    return this.code === 'NETWORK'
  }
}

// ---------------------------------------------------------------- session store

type SessionTokens = Pick<Session, 'accessToken' | 'refreshToken' | 'expiresAt'>
type AuthEvent = 'expired' | 'deactivated' | 'signed-out'

let tokens: SessionTokens | null = readStored()
const listeners = new Set<(e: AuthEvent, message?: string) => void>()

function readStored(): SessionTokens | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as SessionTokens) : null
  } catch {
    return null
  }
}

export function saveSession(s: Session) {
  const expiresAt = s.expiresAt ?? Math.floor(Date.now() / 1000) + s.expiresIn
  tokens = { accessToken: s.accessToken, refreshToken: s.refreshToken, expiresAt }
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(tokens))
  } catch {
    // Private mode: the session lives in memory for this tab only.
  }
}

export function clearSession() {
  tokens = null
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

export const hasSession = () => tokens !== null

export function onAuthEvent(fn: (e: AuthEvent, message?: string) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function emit(e: AuthEvent, message?: string) {
  listeners.forEach((fn) => fn(e, message))
}

// ---------------------------------------------------------------- refresh (single flight)

let refreshing: Promise<boolean> | null = null

function refresh(): Promise<boolean> {
  if (!tokens?.refreshToken) return Promise.resolve(false)
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens!.refreshToken }),
      })
      if (!res.ok) return false
      const body = await res.json()
      saveSession(body.data as Session)
      return true
    } catch {
      return false
    } finally {
      queueMicrotask(() => (refreshing = null))
    }
  })()
  return refreshing
}

const expiresSoon = () => !!tokens?.expiresAt && tokens.expiresAt * 1000 - Date.now() < 60_000

// ---------------------------------------------------------------- request

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | boolean | null | undefined>
  body?: unknown
  /** Skip the bearer header (login, forgot password…). */
  anonymous?: boolean
  signal?: AbortSignal
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  const url = new URL(`${BASE}${path}`, window.location.origin)
  // The API rejects unknown params, so empty values are left out, never sent blank.
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '') continue
    url.searchParams.set(k, String(v))
  }
  return url.toString()
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { 'x-request-id': crypto.randomUUID() }
  let body: BodyInit | undefined
  if (opts.body instanceof FormData) body = opts.body
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  if (!opts.anonymous && tokens) headers.Authorization = `Bearer ${tokens.accessToken}`

  try {
    return await fetch(buildUrl(path, opts.query), { method: opts.method ?? 'GET', headers, body, signal: opts.signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, 'NETWORK', navigator.onLine ? 'Could not reach the server. Please retry.' : 'No internet. Nothing was saved.')
  }
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const b = await res.json()
    return new ApiError(res.status, b.errorCode ?? 'INTERNAL', b.message ?? 'Something went wrong.', {
      details: b.details,
      fieldErrors: b.errors,
    })
  } catch {
    return new ApiError(res.status, 'INTERNAL', 'Something went wrong on our side. Please try again.')
  }
}

/** Raw response with auth + refresh handling. Throws ApiError on failure. */
export async function apiRaw(path: string, opts: RequestOptions = {}): Promise<Response> {
  if (!opts.anonymous && tokens && expiresSoon()) await refresh()

  let res = await send(path, opts)

  if (res.status === 401 && !opts.anonymous) {
    const err = await toError(res.clone())
    if (err.code === 'ACCOUNT_DEACTIVATED') {
      clearSession()
      emit('deactivated', err.message)
      throw err
    }
    if (err.message === TOKEN_EXPIRED && (await refresh())) {
      res = await send(path, opts)
    }
    if (res.status === 401) {
      // Keep the page and its form; the shell shows the login sheet on top (PRD §5.1).
      emit('expired')
      throw await toError(res)
    }
  }

  if (!res.ok) throw await toError(res)
  return res
}

/** JSON request; returns the envelope's `data`. */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await apiRaw(path, opts)
  const body = await res.json()
  return body.data as T
}

/** Same as api() but also returns the envelope message, for toasts. */
export async function apiWithMessage<T>(path: string, opts: RequestOptions = {}): Promise<{ data: T; message: string }> {
  const res = await apiRaw(path, opts)
  const body = await res.json()
  return { data: body.data as T, message: body.message as string }
}

export function signalSignedOut() {
  clearSession()
  emit('signed-out')
}
