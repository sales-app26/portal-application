import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, apiRaw, clearSession, hasSession, onAuthEvent, saveSession } from '@/lib/api'
import type { Me, Session } from '@/lib/types'

interface AuthState {
  me: Me | null
  status: 'loading' | 'signed-out' | 'signed-in'
  /** Session ran out mid-use: the shell shows the login sheet over the current page. */
  expired: boolean
  /** Message to show on the login screen, e.g. after deactivation. */
  notice: string | null
  /** The user chose to log out, so there is no page to return to after signing in. */
  signedOutByUser: boolean
  login: (email: string, password: string) => Promise<Me>
  logout: () => Promise<void>
  clearNotice: () => void
}

const AuthContext = createContext<AuthState | null>(null)
export const ME_KEY = ['me'] as const

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [signedIn, setSignedIn] = useState(hasSession)
  const [expired, setExpired] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [signedOutByUser, setSignedOutByUser] = useState(false)

  const meQuery = useQuery({
    queryKey: ME_KEY,
    queryFn: () => api<Me>('/auth/me'),
    enabled: signedIn,
    staleTime: 5 * 60_000,
  })

  useEffect(
    () =>
      onAuthEvent((e, message) => {
        if (e === 'expired') setExpired(true)
        if (e === 'deactivated' || e === 'signed-out') {
          setSignedIn(false)
          setExpired(false)
          qc.clear()
          if (message) setNotice(message)
        }
      }),
    [qc],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await api<Session>('/auth/login', { method: 'POST', body: { email, password }, anonymous: true })
      saveSession(session)
      qc.setQueryData(ME_KEY, session.user)
      setSignedIn(true)
      setExpired(false)
      setNotice(null)
      setSignedOutByUser(false)
      // Anything that failed while the session was gone gets refetched.
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
      return session.user
    },
    [qc],
  )

  const logout = useCallback(async () => {
    try {
      await apiRaw('/auth/logout', { method: 'POST' })
    } catch {
      // Signing out locally is what matters.
    }
    clearSession()
    setSignedOutByUser(true)
    setSignedIn(false)
    setExpired(false)
    qc.clear()
  }, [qc])

  const value = useMemo<AuthState>(() => {
    const status = !signedIn ? 'signed-out' : meQuery.data ? 'signed-in' : meQuery.isError && !expired ? 'signed-out' : 'loading'
    return {
      me: meQuery.data ?? null,
      status,
      expired,
      notice,
      signedOutByUser,
      login,
      logout,
      clearNotice: () => setNotice(null),
    }
  }, [signedIn, meQuery.data, meQuery.isError, expired, notice, signedOutByUser, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}

/** The signed-in user. Only call below a route that requires auth. */
export function useMe(): Me {
  const { me } = useAuth()
  if (!me) throw new Error('useMe without a signed-in user')
  return me
}

export const isAdmin = (me: Me) => me.role === 'super_admin' || me.role === 'moderator'
export const doesSales = (me: Me) => me.role === 'sales_person' || me.role === 'moderator'
