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
import { Segmented } from '@/components/ui/Choice'
import { useMembers } from '@/features/leads/queries'
import { ApiError, apiWithMessage } from '@/lib/api'
import { formatPhone, normalizePhone, ROLE_LABEL } from '@/lib/format'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import type { User, UserRole } from '@/lib/types'
import { invalidateUsers } from './queries'

const phoneRule = z
  .string()
  .trim()
  .refine((v) => v === '' || normalizePhone(v) !== null, 'Enter a 10-digit Indian mobile number.')

const createSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(120),
  email: z.email('Enter a valid email address.').trim(),
  phone: phoneRule,
  role: z.enum(['moderator', 'sales_person']),
})
type CreateValues = z.input<typeof createSchema>

/** Super Admin adds moderators and sales persons; a moderator adds sales persons only (PRD §5.2). */
export function AddUserForm({
  open,
  onOpenChange,
  canAddModerator,
  defaultRole,
  projects = [],
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  canAddModerator: boolean
  defaultRole: UserRole
  /** Projects the person can be put straight into, with a target and a backup, in the same step. */
  projects?: { id: string; name: string }[]
}) {
  const qc = useQueryClient()
  const [projectId, setProjectId] = useState<string | null>(projects.length === 1 ? projects[0].id : null)
  const [targetCount, setTargetCount] = useState('')
  const [targetPeriod, setTargetPeriod] = useState<'weekly' | 'monthly'>('weekly')
  const [backupId, setBackupId] = useState<string | null>(null)
  const members = useMembers(projectId ?? '-', !!projectId)
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
    setProjectId(projects.length === 1 ? projects[0].id : null)
    setTargetCount('')
    setBackupId(null)
  }, [open, reset, role])

  const onSubmit = handleSubmit(async (v) => {
    setExisting(null)
    try {
      const created = await apiWithMessage<User>('/users', {
        method: 'POST',
        body: { name: v.name.trim(), email: v.email.toLowerCase(), role: canAddModerator ? v.role : 'sales_person', ...(v.phone ? { phone: normalizePhone(v.phone) } : {}) },
      })
      // One step for the manager: project, target and backup follow the account. If one of
      // them fails the account still exists, so say what's left to do instead of failing it all.
      let followUp = ''
      if (projectId) {
        const n = Number(targetCount)
        try {
          await apiWithMessage(`/projects/${projectId}/members`, { method: 'POST', body: { userId: created.data.id, ...(n > 0 ? { targetCount: n, targetPeriod } : {}) } })
          if (backupId) await apiWithMessage(`/projects/${projectId}/members/${created.data.id}/backup`, { method: 'PUT', body: { backupUserId: backupId } })
          followUp = ` Added to ${projects.find((p) => p.id === projectId)?.name}${n > 0 ? ` with a target of ${n} a ${targetPeriod === 'monthly' ? 'month' : 'week'}` : ''}.`
        } catch (err) {
          toast.error(`${v.name.trim()} was added, but not to the campaign: ${err instanceof ApiError ? err.message : 'please add them from the campaign.'}`)
        }
      }
      haptic.success()
      toast.success(`${created.message}${followUp}`)
      invalidateUsers(qc)
      void qc.invalidateQueries({ queryKey: ['projects'] })
      void qc.invalidateQueries({ queryKey: ['team'] })
      onOpenChange(false)
    } catch (err) {
      // A deactivated user already has this email: offer to bring them back (PRD §5.2).
      if (err instanceof ApiError && err.code === 'USER_DEACTIVATED_EXISTS') {
        haptic.error()
        setExisting({ userId: String(err.details?.userId), name: String(err.details?.name ?? 'this person') })
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
      title={role === 'moderator' ? 'Add sales manager' : 'Add sales rep'}
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
                label="Position"
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
          <TextField
            label="Email"
            type="email"
            inputMode="email"
            autoCapitalize="off"
            autoComplete="off"
            enterKeyHint="next"
            error={formState.errors.email?.message}
            {...register('email')}
          />
          {existing && (
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => void reactivate()}>
              Bring {existing.name} back to the team
            </Button>
          )}
        </div>
        <TextField
          label="Phone"
          optional
          type="tel"
          inputMode="tel"
          prefix="+91"
          autoComplete="off"
          enterKeyHint="done"
          error={formState.errors.phone?.message}
          {...register('phone')}
        />
        {projects.length > 0 && (role === 'sales_person' || !canAddModerator) && (
          <fieldset className="flex flex-col gap-4 rounded-2xl bg-surface-secondary p-4">
            <legend className="sr-only">Put them to work</legend>
            <p className="text-title-sm">
              Put them to work <span className="text-body-sm font-normal text-muted">(optional)</span>
            </p>
            <Picker
              label="Campaign"
              value={projectId}
              onChange={(v) => (setProjectId(v), setBackupId(null))}
              placeholder="Choose a campaign"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
            {projectId && (
              <>
                <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                  <TextField
                    label="Target"
                    optional
                    inputMode="numeric"
                    placeholder="e.g. 10"
                    value={targetCount}
                    onChange={(e) => setTargetCount(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                  <Segmented
                    label="Per"
                    value={targetPeriod}
                    onChange={setTargetPeriod}
                    options={[
                      { value: 'weekly', label: 'Week' },
                      { value: 'monthly', label: 'Month' },
                    ]}
                    className="h-12"
                  />
                </div>
                <Picker
                  label="Backup while on leave"
                  value={backupId}
                  onChange={setBackupId}
                  placeholder={members.isLoading ? 'Loading…' : 'No backup'}
                  options={(members.data ?? []).filter((m) => m.isActive && m.userIsActive && m.role !== 'super_admin').map((m) => ({ value: m.userId, label: m.name }))}
                />
              </>
            )}
          </fieldset>
        )}
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
      toast.success('Details saved.')
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
      title="Edit details"
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
            <TextField
              label="Email"
              type="email"
              inputMode="email"
              autoCapitalize="off"
              hint="They sign in with the new email from then on."
              error={formState.errors.email?.message}
              {...register('email')}
            />
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Picker
                  label="Position"
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
