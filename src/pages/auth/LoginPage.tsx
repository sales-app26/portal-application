import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { BrandMark } from '@/components/layout/AppShell'
import { homePath } from '@/components/layout/navigation'
import { IconsCredit } from '@/components/layout/Credits'
import { LoginForm } from './LoginForm'

export function LoginPage() {
  const { status, me, notice } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')

  if (status === 'signed-in' && me) return <Navigate to={next ?? homePath(me.role)} replace />

  return (
    <div className="flex min-h-dvh flex-col bg-canvas pt-safe expanded:items-center expanded:justify-center expanded:bg-surface-soft">
      <div className="flex flex-1 flex-col px-4 pt-12 pb-[max(16px,env(safe-area-inset-bottom))] medium:px-6 expanded:w-[400px] expanded:flex-none expanded:rounded-xl expanded:border expanded:border-hairline expanded:bg-canvas expanded:p-8">
        <BrandMark size={48} />
        <h1 className="mt-6 text-title-lg">Sign in</h1>
        <p className="mt-1 mb-8 text-body-md text-body">Sales Tracker for Pronttera teams.</p>
        {notice && (
          <p role="alert" className="mb-5 rounded-md bg-surface-strong px-4 py-3 text-body-sm text-ink">
            {notice}
          </p>
        )}
        <LoginForm
          pinnedAction
          footer={<IconsCredit className="text-center" />}
          onSignedIn={(me) => navigate(next ?? homePath(me.role), { replace: true })}
        />
      </div>
    </div>
  )
}
