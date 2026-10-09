import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/Button'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { LoginForm } from './LoginForm'

/**
 * Session ran out mid-use: sign in again on top of the current page, so a half-filled
 * form keeps its text (PRD §5.1). It cannot be dismissed except by signing in or out.
 */
export function LoginSheet() {
  const { me, logout } = useAuth()
  // Not dismissible: closing would throw away the page underneath. "Use another account" signs out.
  return (
    <ResponsiveOverlay open onOpenChange={() => {}} dismissible={false} title="Sign in again" description="Your session has expired. What you typed is still here." variant="short">
      <LoginForm defaultEmail={me?.email} />
      <Button variant="tertiary" block className="mt-2" onClick={() => void logout()}>
        Use another account
      </Button>
    </ResponsiveOverlay>
  )
}
