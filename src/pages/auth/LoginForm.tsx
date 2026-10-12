import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAuth } from '@/auth/AuthProvider'
import { Button, IconButton } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { ApiError } from '@/lib/api'
import { haptic } from '@/lib/haptics'
import type { Me } from '@/lib/types'
import { ForgotPassword } from './ForgotPassword'

const schema = z.object({
  email: z.email('Enter a valid email address.').trim(),
  password: z.string().min(1, 'Enter your password.'),
})
type Values = z.infer<typeof schema>

interface LoginFormProps {
  onSignedIn?: (me: Me) => void
  defaultEmail?: string
  /** Full page: the Sign in button sits at the bottom of the screen, in thumb reach. */
  pinnedAction?: boolean
  /** Rendered under the Sign in button. */
  footer?: React.ReactNode
}

export function LoginForm({ onSignedIn, defaultEmail, pinnedAction, footer }: LoginFormProps) {
  const { login } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, formState, getValues } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { email: defaultEmail ?? '', password: '' },
  })

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setFormError(null)
    try {
      const me = await login(email.toLowerCase(), password)
      haptic.success()
      onSignedIn?.(me)
    } catch (err) {
      haptic.error()
      // One generic message for wrong email or password (PRD §5.1).
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    }
  })

  return (
    <>
      <form onSubmit={onSubmit} noValidate className={pinnedAction ? 'flex flex-1 flex-col gap-5' : 'flex flex-col gap-5'}>
        {formError && (
          <p role="alert" className="rounded-md bg-surface-strong px-4 py-3 text-body-sm text-ink">
            {formError}
          </p>
        )}
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="off"
          enterKeyHint="next"
          error={formState.errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          enterKeyHint="go"
          error={formState.errors.password?.message}
          suffix={
            <IconButton
              icon={showPassword ? 'invisible' : 'visible'}
              label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((s) => !s)}
              className="size-11 text-muted"
            />
          }
          {...register('password')}
        />
        <Button type="button" variant="tertiary" size="sm" className="-mt-2 self-end px-0" onClick={() => setForgotOpen(true)}>
          Forgot password?
        </Button>
        <div className={pinnedAction ? 'mt-auto flex flex-col gap-3 pt-6 expanded:mt-2 expanded:pt-0' : 'flex flex-col gap-3'}>
          <Button type="submit" size="lg" block loading={formState.isSubmitting}>
            Sign in
          </Button>
          {footer}
        </div>
      </form>
      <ForgotPassword open={forgotOpen} onOpenChange={setForgotOpen} defaultEmail={getValues('email')} />
    </>
  )
}
