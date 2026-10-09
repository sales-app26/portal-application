import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router'
import { useAuth, useMe } from '@/auth/AuthProvider'
import { ProjectProvider } from '@/features/projects/ProjectContext'
import { AppShell, BrandMark } from '@/components/layout/AppShell'
import { homePath } from '@/components/layout/navigation'
import { Spinner } from '@/components/ui/Spinner'
import type { UserRole } from '@/lib/types'
import { LoginPage } from '@/pages/auth/LoginPage'
import { NotFound } from '@/pages/misc/NotFound'

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas">
      <BrandMark size={56} />
      <Spinner size={24} className="text-muted" />
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

export const router = createBrowserRouter([
  // HydrateFallback: shown instead of a blank page while a lazy route's code loads on first visit.
  { path: '/login', element: <LoginPage /> },
  { path: '/set-password', HydrateFallback: Splash, lazy: async () => ({ Component: (await import('@/pages/auth/SetPasswordPage')).SetPasswordPage }) },
  {
    element: <RequireAuth />,
    HydrateFallback: Splash,
    children: [
      {
        element: (
          <ProjectProvider>
            <AppShell />
          </ProjectProvider>
        ),
        children: [
          { index: true, element: <RoleHome /> },
          { path: 'profile', lazy: async () => ({ Component: (await import('@/pages/profile/ProfilePage')).ProfilePage }) },
          { path: 'more', lazy: async () => ({ Component: (await import('@/pages/misc/MorePage')).MorePage }) },

          { path: 'day', lazy: async () => ({ Component: (await import('@/pages/timeline/MyDayPage')).MyDayPage }) },
          { path: 'entries/:id', lazy: async () => ({ Component: (await import('@/pages/timeline/EntryPage')).EntryPage }) },
          {
            path: 'leads',
            lazy: async () => ({ Component: (await import('@/pages/field/LeadsPage')).LeadsPage }),
            children: [{ path: ':id', lazy: async () => ({ Component: (await import('@/pages/field/LeadsPage')).LeadDetailRoute }) }],
          },
          {
            element: <RequireRole roles={FIELD} />,
            children: [{ path: 'home', lazy: async () => ({ Component: (await import('@/pages/field/HomePage')).HomePage }) }],
          },
          {
            element: <RequireRole roles={ADMIN} />,
            children: [
              { path: 'dashboard', lazy: async () => ({ Component: (await import('@/pages/admin/DashboardPage')).DashboardPage }) },
              { path: 'transfers', lazy: async () => ({ Component: (await import('@/pages/admin/TransfersPage')).TransfersPage }) },
              { path: 'people', lazy: async () => ({ Component: (await import('@/pages/admin/PeoplePage')).PeoplePage }) },
              { path: 'people/:id', lazy: async () => ({ Component: (await import('@/pages/timeline/PersonSummaryPage')).PersonSummaryPage }) },
              { path: 'people/:id/day', lazy: async () => ({ Component: (await import('@/pages/timeline/PersonTimelinePage')).PersonTimelinePage }) },
              { path: 'projects', lazy: async () => ({ Component: (await import('@/pages/admin/ProjectsPage')).ProjectsPage }) },
              { path: 'projects/:id/import', lazy: async () => ({ Component: (await import('@/pages/admin/ImportLeadsPage')).ImportLeadsPage }) },
              { path: 'projects/:id', lazy: async () => ({ Component: (await import('@/pages/admin/ProjectDetailPage')).ProjectDetailPage }) },
            ],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
])
