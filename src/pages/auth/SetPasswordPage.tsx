import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { BrandMark } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Display'
import { TextField } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { handleFormError } from '@/lib/forms'

const schema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters.').max(72, 'Use at most 72 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The passwords do not match.' })

/**
 * Invite and reset links land here. The emails (Brevo) carry a one-time `token_hash`
 * in the query, spent only when the password is saved, so mail scanners opening the
 * link don't use it up.
 */
export function SetPasswordPage() {
  const link = useMemo(() => {
    // Some mail apps leave the link's "&" as "&amp;", turning "type" into "amp;type".
    const q = new URLSearchParams(window.location.search.replace(/&amp;/g, '&'))
    return { tokenHash: q.get('token_hash'), type: q.get('type') === 'invite' ? 'invite' : 'recovery' }
  }, [])
  const [done, setDone] = useState(false)
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(schema), mode: 'onBlur', defaultValues: { password: '', confirm: '' } })

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await api('/auth/set-password', { method: 'POST', body: { tokenHash: link.tokenHash, type: link.type, password }, anonymous: true })
      // The token is single-use; don't leave it in the address bar.
      window.history.replaceState(null, '', window.location.pathname)
      setDone(true)
    } catch (err) {
      handleFormError(err)
    }
  })

  const title = link.type === 'invite' ? 'Welcome! Choose a password' : 'Choose a new password'

  return (
    <div className="flex min-h-dvh flex-col bg-canvas pt-safe pb-safe expanded:items-center expanded:justify-center expanded:bg-surface-soft">
      <div className="flex flex-1 flex-col px-4 pt-12 medium:px-6 expanded:w-[400px] expanded:flex-none expanded:rounded-xl expanded:border expanded:border-hairline expanded:bg-canvas expanded:p-8">
        <BrandMark size={48} />
        {!link.tokenHash ? (
          <EmptyState
            icon="error"
            title="This link has expired or was already used"
            body='Ask your admin for a new invite, or use "Forgot password?" on the sign-in screen.'
            action={
              <Button asChild>
                <Link to="/login">Go to sign in</Link>
              </Button>
            }
          />
        ) : done ? (
          <EmptyState
            icon="checkmark"
            title="Password saved"
            body="You can sign in now."
            action={
              <Button asChild size="lg">
                <Link to="/login" replace>
                  Sign in
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            <h1 className="mt-6 mb-8 text-title-lg">{title}</h1>
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
              <TextField label="New password" type="password" autoComplete="new-password" hint="At least 8 characters." error={formState.errors.password?.message} {...register('password')} />
              <TextField label="Confirm password" type="password" autoComplete="new-password" enterKeyHint="done" error={formState.errors.confirm?.message} {...register('confirm')} />
              <Button type="submit" size="lg" block loading={formState.isSubmitting}>
                Save password
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
