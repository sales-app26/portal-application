import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { Icon } from '@/icons'
import { api } from '@/lib/api'
import { handleFormError } from '@/lib/forms'

const schema = z.object({ email: z.email('Enter a valid email address.').trim() })

export function ForgotPassword({ open, onOpenChange, defaultEmail }: { open: boolean; onOpenChange: (o: boolean) => void; defaultEmail?: string }) {
  const [sent, setSent] = useState(false)
  const { register, handleSubmit, formState, reset } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  useEffect(() => {
    if (open) {
      setSent(false)
      reset({ email: defaultEmail ?? '' })
    }
  }, [open, defaultEmail, reset])

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email: email.toLowerCase() }, anonymous: true })
      // Same confirmation for known and unknown emails (PRD §5.1).
      setSent(true)
    } catch (err) {
      handleFormError(err)
    }
  })

  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange} title={sent ? 'Check your email' : 'Reset your password'} variant="short">
      {sent ? (
        <div className="flex flex-col items-start gap-4">
          <Icon name="checkmark" size={32} className="text-up" />
          <p className="text-body-md text-body">If an account exists for this email, a reset link has been sent. Open it on this phone to choose a new password.</p>
          <Button block onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <p className="text-body-md text-body">We'll email you a link to set a new password.</p>
          <TextField label="Email" type="email" inputMode="email" autoComplete="email" autoCapitalize="off" enterKeyHint="send" error={formState.errors.email?.message} {...register('email')} />
          <Button type="submit" block loading={formState.isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </ResponsiveOverlay>
  )
}
