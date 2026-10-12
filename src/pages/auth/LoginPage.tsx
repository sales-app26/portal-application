import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { ProntteraLockup } from '@/components/brand/Logo'
import { homePath } from '@/components/layout/navigation'
import { LoginForm } from './LoginForm'

export function LoginPage() {
  const { status, me, notice } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')

  if (status === 'signed-in' && me) return <Navigate to={next ?? homePath(me.role)} replace />

  // Pronttera blue with the mark as a faint watermark: on brand, and no photo to download
  // before the very first screen can show.
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-[linear-gradient(135deg,#053f5e_0%,#0a78b0_55%,#1490c9_100%)] pt-safe expanded:items-center expanded:justify-center">
      <img src="/brand/pronttera-mark-white.svg" alt="" aria-hidden className="pointer-events-none absolute -top-16 -right-24 -z-10 h-[420px] opacity-[0.07] expanded:top-auto expanded:right-auto expanded:-bottom-40 expanded:-left-32 expanded:h-[720px]" />
      {/* Phones: a sheet rising from the bottom, the brand blue above it. */}
      <div className="mt-24 flex flex-1 flex-col rounded-t-[28px] bg-surface px-4 pt-8 pb-[max(16px,env(safe-area-inset-bottom))] medium:px-6 expanded:mt-0 expanded:w-[400px] expanded:flex-none expanded:rounded-3xl expanded:p-9 expanded:shadow-[0_24px_64px_rgb(0_0_0/0.35)]">
        <ProntteraLockup size={44} tagline="Sell more, every day" />
        <h1 className="mt-8 text-title-lg">Sign in</h1>
        <p className="mt-1 mb-8 text-body-md text-body">Your leads, follow-ups and visits in one place.</p>
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
