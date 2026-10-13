import { createBrowserRouter, Navigate, Outlet, useLocation, useRouteError } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/icons'
import { useAuth, useMe } from '@/auth/AuthProvider'
import { ProjectProvider } from '@/features/projects/ProjectContext'
import { AppShell } from '@/components/layout/AppShell'
import { ProntteraLockup } from '@/components/brand/Logo'
import { homePath } from '@/components/layout/navigation'
import { Spinner } from '@/components/ui/Spinner'
import type { UserRole } from '@/lib/types'
import { LoginPage } from '@/pages/auth/LoginPage'
import { NotFound } from '@/pages/misc/NotFound'

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas">
      <ProntteraLockup size={52} />
      <Spinner size={24} className="text-muted" />
    </div>
  )
}

/**
 * A screen that crashed, or whose code failed to download (bad signal, or a new version
 * replaced the old files). The tab bar stays, so the rest of the app is still reachable.
 */
function RouteError() {
  const error = useRouteError()
  const chunk = error instanceof Error && /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message)
  return (
    <div role="alert" className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <Icon name={chunk ? 'wi-fi-disconnected' : 'error'} size={48} className="text-muted" />
      <h1 className="text-title-md">{chunk ? "This screen didn't load" : 'Something went wrong'}</h1>
      <p className="max-w-sm text-body-sm text-body">
        {chunk
          ? 'The signal may be weak, or the app was just updated. Reloading usually fixes it.'
          : 'Reload to try again. If it keeps happening, tell your manager what you were doing.'}
      </p>
      <Button icon="refresh" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  )
}

function RequireAuth() {
  const { status, signedOutByUser } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <Splash />
  if (status === 'signed-out') {
    const next = signedOutByUser || location.pathname === '/' ? '' : `?next=${encodeURIComponent(location.pathname + location.search)}`
    return <Navigate to={`/login${next}`} replace />
  }
  return <Outlet />
}

/** Screens a role can't use redirect home instead of showing a dead end. */
function RequireRole({ roles }: { roles: UserRole[] }) {
  const me = useMe()
  return roles.includes(me.role) ? <Outlet /> : <Navigate to={homePath(me.role)} replace />
}

function RoleHome() {
  const me = useMe()
  return <Navigate to={homePath(me.role)} replace />
}

const FIELD: UserRole[] = ['sales_person', 'moderator']
const ADMIN: UserRole[] = ['super_admin', 'moderator']
const OWNER: UserRole[] = ['super_admin']

export const router = createBrowserRouter([
  // HydrateFallback: shown instead of a blank page while a lazy route's code loads on first visit.
  { path: '/login', element: <LoginPage /> },
  { path: '/set-password', HydrateFallback: Splash, lazy: async () => ({ Component: (await import('@/pages/auth/SetPasswordPage')).SetPasswordPage }) },
  {
    element: <RequireAuth />,
    HydrateFallback: Splash,
    errorElement: <RouteError />,
    children: [
      {
        element: (
          <ProjectProvider>
            <AppShell />
          </ProjectProvider>
        ),
        children: [
          {
            // Errors render inside the shell, so the navigation survives a broken screen.
            errorElement: <RouteError />,
            children: [
              { index: true, element: <RoleHome /> },
              { path: 'profile', lazy: async () => ({ Component: (await import('@/pages/profile/ProfilePage')).ProfilePage }) },
              { path: 'more', lazy: async () => ({ Component: (await import('@/pages/misc/MorePage')).MorePage }) },
              // Admins decide transfers; sales persons follow their own requests (the API scopes the list).
              { path: 'transfers', lazy: async () => ({ Component: (await import('@/pages/admin/TransfersPage')).TransfersPage }) },
              { path: 'notifications', lazy: async () => ({ Component: (await import('@/pages/team/NotificationsPage')).NotificationsPage }) },
              { path: 'whats-new', lazy: async () => ({ Component: (await import('@/pages/misc/WhatsNewPage')).WhatsNewPage }) },

              { path: 'day', lazy: async () => ({ Component: (await import('@/pages/timeline/MyDayPage')).MyDayPage }) },
              { path: 'entries/:id', lazy: async () => ({ Component: (await import('@/pages/timeline/EntryPage')).EntryPage }) },
              {
                path: 'leads',
                lazy: async () => ({ Component: (await import('@/pages/field/LeadsPage')).LeadsPage }),
                children: [{ path: ':id', lazy: async () => ({ Component: (await import('@/pages/field/LeadsPage')).LeadDetailRoute }) }],
              },
              {
                element: <RequireRole roles={FIELD} />,
                children: [
                  { path: 'home', lazy: async () => ({ Component: (await import('@/pages/field/HomePage')).HomePage }) },
                  {
                    path: 'performance',
                    lazy: async () => {
                      const { PersonSummaryPage } = await import('@/pages/timeline/PersonSummaryPage')
                      return { Component: () => <PersonSummaryPage self /> }
                    },
                  },
                ],
              },
              {
                element: <RequireRole roles={ADMIN} />,
                children: [
                  { path: 'dashboard', lazy: async () => ({ Component: (await import('@/pages/admin/DashboardPage')).DashboardPage }) },
                  { path: 'people', lazy: async () => ({ Component: (await import('@/pages/admin/PeoplePage')).PeoplePage }) },
                  { path: 'people/:id', lazy: async () => ({ Component: (await import('@/pages/timeline/PersonSummaryPage')).PersonSummaryPage }) },
                  { path: 'people/:id/day', lazy: async () => ({ Component: (await import('@/pages/timeline/PersonTimelinePage')).PersonTimelinePage }) },
                  { path: 'projects', lazy: async () => ({ Component: (await import('@/pages/admin/ProjectsPage')).ProjectsPage }) },
                  { path: 'projects/:id/import', lazy: async () => ({ Component: (await import('@/pages/admin/ImportLeadsPage')).ImportLeadsPage }) },
                  { path: 'projects/:id', lazy: async () => ({ Component: (await import('@/pages/admin/ProjectDetailPage')).ProjectDetailPage }) },
                ],
              },
              {
                element: <RequireRole roles={OWNER} />,
                children: [{ path: 'versions', lazy: async () => ({ Component: (await import('@/pages/admin/VersionsPage')).VersionsPage }) }],
              },
              { path: '*', element: <NotFound /> },
            ],
          },
        ],
      },
    ],
  },
])
