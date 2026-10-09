import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ME_KEY, useAuth, useMe } from '@/auth/AuthProvider'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Display'
import { TextField } from '@/components/ui/Field'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { Confirm, ResponsiveOverlay } from '@/components/ui/Overlay'
import { apiWithMessage } from '@/lib/api'
import { formatPhone, normalizePhone, ROLE_LABEL } from '@/lib/format'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import type { Me } from '@/lib/types'

export function ProfilePage() {
  const me = useMe()
  const { logout } = useAuth()
  const [editOpen, setEditOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)

  return (
    <Page title="Profile">
      <div className="flex flex-col gap-6 medium:max-w-[640px]">
        <div className="flex items-center gap-4">
          <Avatar name={me.name} size={64} />
          <div className="min-w-0">
            <p className="truncate text-title-md">{me.name}</p>
            <p className="text-body-sm text-body">{ROLE_LABEL[me.role]}</p>
          </div>
        </div>

        <ListGroup title="Account">
          <ListRow icon="user-male-circle" title="Name and phone" subtitle={me.phone ? `${me.name} · ${formatPhone(me.phone)}` : me.name} chevron onClick={() => setEditOpen(true)} />
          <ListRow icon="info" title="Email" subtitle={me.email} />
          <ListRow icon="lock" title="Change password" chevron onClick={() => setPasswordOpen(true)} />
        </ListGroup>

        {me.projects.length > 0 && (
          <ListGroup title="My projects">
            {me.projects.map((p) => (
              <ListRow
                key={p.id}
                icon="briefcase"
                title={p.name}
                subtitle={[p.type === 'door_to_door' ? 'Door-to-door' : 'Online', p.status === 'closed' ? 'Closed' : null].filter(Boolean).join(' · ')}
              />
            ))}
          </ListGroup>
        )}

        <ListGroup title="About">
          <ListRow
            icon="info"
            title="Credits"
            subtitle={
              <>
                Icons by{' '}
                <a href="https://icons8.com" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  Icons8
                </a>{' '}
                · Map data ©{' '}
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  OpenStreetMap contributors
                </a>
              </>
            }
          />
        </ListGroup>

        <ListGroup>
          <ListRow icon="logout-rounded" title="Log out" destructive onClick={() => setLogoutOpen(true)} />
        </ListGroup>
      </div>

      <EditProfile open={editOpen} onOpenChange={setEditOpen} me={me} />
      <ChangePassword open={passwordOpen} onOpenChange={setPasswordOpen} />
      <Confirm open={logoutOpen} onOpenChange={setLogoutOpen} title="Log out?" body="You'll need your email and password to sign in again." confirmLabel="Log out" onConfirm={logout} />
    </Page>
  )
}

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(120),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || normalizePhone(v) !== null, 'Enter a 10-digit Indian mobile number.'),
})

function EditProfile({ open, onOpenChange, me }: { open: boolean; onOpenChange: (o: boolean) => void; me: Me }) {
  const qc = useQueryClient()
  const { register, handleSubmit, formState, reset, setError } = useForm({ resolver: zodResolver(profileSchema), mode: 'onBlur', defaultValues: { name: me.name, phone: me.phone ?? '' } })

  useEffect(() => {
    if (open) reset({ name: me.name, phone: me.phone ?? '' })
  }, [open, me, reset])

  const onSubmit = handleSubmit(async ({ name, phone }) => {
    try {
      const { data } = await apiWithMessage<Me>('/auth/me', { method: 'PATCH', body: { name, phone: phone === '' ? null : normalizePhone(phone) } })
      qc.setQueryData(ME_KEY, data)
      haptic.success()
      toast.success('Profile saved.')
      onOpenChange(false)
    } catch (err) {
      handleFormError(err, setError, ['name', 'phone'])
    }
  })

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Name and phone"
      variant="short"
      dirty={formState.isDirty && !formState.isSubmitting}
      footer={
        <Button block size="lg" type="submit" form="profile-form" loading={formState.isSubmitting}>
          Save
        </Button>
      }
    >
      <form id="profile-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pt-1">
        <TextField label="Name" autoComplete="name" enterKeyHint="next" error={formState.errors.name?.message} {...register('name')} />
        <TextField label="Phone" optional type="tel" inputMode="tel" autoComplete="tel-national" prefix="+91" enterKeyHint="done" error={formState.errors.phone?.message} {...register('phone')} />
      </form>
    </ResponsiveOverlay>
  )
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z.string().min(8, 'Use at least 8 characters.').max(72, 'Use at most 72 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'The passwords do not match.' })

function ChangePassword({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { register, handleSubmit, formState, reset, setError } = useForm({
    resolver: zodResolver(passwordSchema),
    mode: 'onBlur',
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  })

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      const { message } = await apiWithMessage('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } })
      haptic.success()
      toast.success(message)
      onOpenChange(false)
    } catch (err) {
      const msg = handleFormError(err, setError, ['currentPassword', 'newPassword'])
      if (msg === 'The current password is incorrect.') setError('currentPassword', { message: msg })
    }
  })

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Change password"
      variant="short"
      dirty={formState.isDirty && !formState.isSubmitting}
      footer={
        <Button block size="lg" type="submit" form="password-form" loading={formState.isSubmitting}>
          Change password
        </Button>
      }
    >
      <form id="password-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pt-1">
        <TextField label="Current password" type="password" autoComplete="current-password" error={formState.errors.currentPassword?.message} {...register('currentPassword')} />
        <TextField label="New password" type="password" autoComplete="new-password" hint="At least 8 characters." error={formState.errors.newPassword?.message} {...register('newPassword')} />
        <TextField label="Confirm new password" type="password" autoComplete="new-password" enterKeyHint="done" error={formState.errors.confirm?.message} {...register('confirm')} />
      </form>
    </ResponsiveOverlay>
  )
}
