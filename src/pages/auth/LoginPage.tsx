import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { BrandMark } from '@/components/layout/AppShell'
import { homePath } from '@/components/layout/navigation'
import loginBackground from '@/assets/login-bg.jpg'
import { LoginForm } from './LoginForm'

export function LoginPage() {
  const { status, me, notice } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')

  if (status === 'signed-in' && me) return <Navigate to={next ?? homePath(me.role)} replace />

  // Photo: unsplash.com/photos/nxZDMUQhN4o (Unsplash License, no attribution required).
  // The dark wash keeps it calm behind the white sheet and the card.
  return (
    <div
      className="flex min-h-dvh flex-col bg-ink bg-cover bg-center pt-safe expanded:items-center expanded:justify-center"
      style={{ backgroundImage: `linear-gradient(rgb(10 11 13 / 0.25), rgb(10 11 13 / 0.45)), url(${loginBackground})` }}
    >
      {/* Phones: a white sheet rising from the bottom, the photo showing above it. */}
      <div className="mt-24 flex flex-1 flex-col rounded-t-xl bg-canvas px-4 pt-8 pb-[max(16px,env(safe-area-inset-bottom))] medium:px-6 expanded:mt-0 expanded:w-[400px] expanded:flex-none expanded:rounded-xl expanded:p-8 expanded:shadow-[0_24px_64px_rgb(0_0_0/0.35)]">
        <BrandMark size={48} />
        <h1 className="mt-6 text-title-lg">Sign in</h1>
        <p className="mt-1 mb-8 text-body-md text-body">Lead tracking for Pronttera teams.</p>
        {notice && (
          <p role="alert" className="mb-5 rounded-md bg-surface-strong px-4 py-3 text-body-sm text-ink">
            {notice}
          </p>
        )}
        <LoginForm
          pinnedAction
          onSignedIn={(me) => navigate(next ?? homePath(me.role), { replace: true })}
        />
      </div>
    </div>
  )
}
