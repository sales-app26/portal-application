import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { Picker } from '@/components/ui/Picker'
import { ApiError, apiWithMessage } from '@/lib/api'
import { formatPhone, normalizePhone, ROLE_LABEL } from '@/lib/format'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import type { User, UserRole } from '@/lib/types'
import { invalidateUsers } from './queries'

const phoneRule = z.string().trim().refine((v) => v === '' || normalizePhone(v) !== null, 'Enter a 10-digit Indian mobile number.')

const createSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(120),
  email: z.email('Enter a valid email address.').trim(),
  phone: phoneRule,
  role: z.enum(['moderator', 'sales_person']),
})
type CreateValues = z.input<typeof createSchema>

/** Super Admin adds moderators and sales persons; a moderator adds sales persons only (PRD §5.2). */
export function AddUserForm({ open, onOpenChange, canAddModerator, defaultRole }: { open: boolean; onOpenChange: (o: boolean) => void; canAddModerator: boolean; defaultRole: UserRole }) {
  const qc = useQueryClient()
  const [existing, setExisting] = useState<{ userId: string; name: string } | null>(null)
  const role = defaultRole === 'moderator' && canAddModerator ? 'moderator' : 'sales_person'
  const { register, control, handleSubmit, formState, reset, setError } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    mode: 'onBlur',
    defaultValues: { name: '', email: '', phone: '', role },
  })

  useEffect(() => {
    if (!open) return
    reset({ name: '', email: '', phone: '', role })
    setExisting(null)
  }, [open, reset, role])

  const onSubmit = handleSubmit(async (v) => {
    setExisting(null)
    try {
      const { message } = await apiWithMessage<User>('/users', {
        method: 'POST',
        body: { name: v.name.trim(), email: v.email.toLowerCase(), role: canAddModerator ? v.role : 'sales_person', ...(v.phone ? { phone: normalizePhone(v.phone) } : {}) },
      })
      haptic.success()
      toast.success(message)
      invalidateUsers(qc)
      onOpenChange(false)
    } catch (err) {
      // A deactivated user already has this email: offer to bring them back (PRD §5.2).
      if (err instanceof ApiError && err.code === 'USER_DEACTIVATED_EXISTS') {
        haptic.error()
        setExisting({ userId: String(err.details?.userId), name: String(err.details?.name ?? 'this user') })
        setError('email', { message: err.message })
        return
      }
      handleFormError(err, setError, ['name', 'email', 'phone', 'role'])
    }
  })

  const reactivate = async () => {
    if (!existing) return
    try {
      const { message } = await apiWithMessage(`/users/${existing.userId}/reactivate`, { method: 'POST' })
      toast.success(message)
      invalidateUsers(qc)
      onOpenChange(false)
    } catch (err) {
      handleFormError(err)
    }
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={role === 'moderator' ? 'Add moderator' : 'Add sales person'}
      description="They get an email to set their password."
      variant="form"
      dirty={formState.isDirty && !formState.isSubmitting}
      footer={
        <Button type="submit" form="add-user" size="lg" block loading={formState.isSubmitting}>
          Add and send invite
        </Button>
      }
    >
      <form id="add-user" onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pt-2">
        {canAddModerator && (
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <Picker
                label="Role"
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: 'sales_person', label: ROLE_LABEL.sales_person },
                  { value: 'moderator', label: ROLE_LABEL.moderator },
                ]}
              />
            )}
          />
        )}
        <TextField label="Name" autoCapitalize="words" autoComplete="off" enterKeyHint="next" error={formState.errors.name?.message} {...register('name')} />
        <div className="flex flex-col gap-2">
          <TextField label="Email" type="email" inputMode="email" autoCapitalize="off" autoComplete="off" enterKeyHint="next" error={formState.errors.email?.message} {...register('email')} />
          {existing && (
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => void reactivate()}>
              Reactivate {existing.name}
            </Button>
          )}
        </div>
        <TextField label="Phone" optional type="tel" inputMode="tel" prefix="+91" autoComplete="off" enterKeyHint="done" error={formState.errors.phone?.message} {...register('phone')} />
      </form>
    </ResponsiveOverlay>
  )
}

const editSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(120),
  phone: phoneRule,
  email: z.email('Enter a valid email address.').trim(),
  role: z.enum(['super_admin', 'moderator', 'sales_person']),
})
type EditValues = z.input<typeof editSchema>

/** Name and phone for admins; email and role only for the Super Admin (PRD §5.2). */
export function EditUserForm({ user, open, onOpenChange, superAdmin }: { user: User; open: boolean; onOpenChange: (o: boolean) => void; superAdmin: boolean }) {
  const qc = useQueryClient()
  const defaults = (): EditValues => ({ name: user.name, phone: user.phone ? formatPhone(user.phone) : '', email: user.email, role: user.role })
  const { register, control, handleSubmit, formState, reset, setError } = useForm<EditValues>({ resolver: zodResolver(editSchema), mode: 'onBlur', defaultValues: defaults() })

  useEffect(() => {
    if (open) reset(defaults())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onSubmit = handleSubmit(async (v) => {
    const d = formState.dirtyFields
    try {
      // Separate endpoints, one request each; stop at the first refusal so nothing half-applies silently.
      if (d.name || d.phone) {
        const body: Record<string, string | null> = {}
        if (d.name) body.name = v.name.trim()
        if (d.phone) body.phone = v.phone ? normalizePhone(v.phone) : null
        await apiWithMessage(`/users/${user.id}`, { method: 'PATCH', body })
      }
      if (superAdmin && d.email) await apiWithMessage(`/users/${user.id}/email`, { method: 'PATCH', body: { email: v.email.toLowerCase() } })
      if (superAdmin && d.role) await apiWithMessage(`/users/${user.id}/role`, { method: 'PATCH', body: { role: v.role } })
      haptic.success()
      toast.success('User updated.')
      invalidateUsers(qc)
      onOpenChange(false)
    } catch (err) {
      invalidateUsers(qc)
      handleFormError(err, setError, ['name', 'phone', 'email', 'role'])
    }
  })

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Edit user"
      description={user.email}
      variant="form"
      dirty={formState.isDirty && !formState.isSubmitting}
      footer={
        <Button type="submit" form="edit-user" size="lg" block loading={formState.isSubmitting}>
          Save changes
        </Button>
      }
    >
      <form id="edit-user" onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pt-2">
        <TextField label="Name" autoCapitalize="words" error={formState.errors.name?.message} {...register('name')} />
        <TextField label="Phone" optional type="tel" inputMode="tel" prefix="+91" error={formState.errors.phone?.message} {...register('phone')} />
        {superAdmin && (
          <>
            <TextField label="Email" type="email" inputMode="email" autoCapitalize="off" hint="They sign in with the new email from then on." error={formState.errors.email?.message} {...register('email')} />
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Picker
                  label="Role"
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: 'sales_person', label: ROLE_LABEL.sales_person },
                    { value: 'moderator', label: ROLE_LABEL.moderator },
                    ...(user.role === 'super_admin' ? [{ value: 'super_admin' as const, label: ROLE_LABEL.super_admin }] : []),
                  ]}
                  hint="History stays under the same person."
                />
              )}
            />
          </>
        )}
      </form>
    </ResponsiveOverlay>
  )
}
