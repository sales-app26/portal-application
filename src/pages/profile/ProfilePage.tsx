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
import { formatDate, formatPhone, normalizePhone, ROLE_LABEL, todayIST } from '@/lib/format'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import { Tag } from '@/components/ui/Display'
import { useLatestVersion } from '@/features/versions/queries'
import type { Me } from '@/lib/types'
import { ProntteraMark } from '@/components/brand/Logo'
import { Segmented } from '@/components/ui/Choice'
import { getThemeChoice, setThemeChoice, type ThemeChoice } from '@/lib/theme'
import { useInstall } from '@/hooks/useInstall'
import { LeaveForm } from '@/features/team/LeaveForm'
import { invalidateTeam, useLeaves } from '@/features/team/queries'
import { Icon } from '@/icons'

export function ProfilePage() {
  const me = useMe()
  const { logout } = useAuth()
  const [editOpen, setEditOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeChoice>(getThemeChoice)
  const install = useInstall()
  const [iosHelp, setIosHelp] = useState(false)
  const { data: latest } = useLatestVersion()

  return (
    <Page title="Profile">
      <div className="flex flex-col gap-6 medium:max-w-[640px]">
        <div className="card card--default flex-row items-center gap-4 rounded-3xl p-5">
          <Avatar name={me.name} size={64} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-title-md">{me.name}</p>
            <p className="truncate text-body-sm text-muted">{me.email}</p>
            <span className="chip chip--soft chip--accent chip--sm mt-1.5 h-6 px-2.5 text-caption-strong">{ROLE_LABEL[me.role]}</span>
          </div>
        </div>

        {install.mode && (
          <ListGroup title="App">
            <ListRow
              icon="smartphone"
              title="Install Pronttera Sales"
              subtitle="Open it from your home screen, full screen, like any app"
              chevron
              onClick={async () => {
                if (install.mode === 'ios') return setIosHelp(true)
                if (await install.install()) toast.success('Pronttera Sales is on your home screen.')
              }}
            />
          </ListGroup>
        )}

        {me.role !== 'super_admin' && <MyLeave />}
        {me.role === 'sales_person' && (
          <ListGroup title="Requests">
            <ListRow icon="swap" title="My handovers" subtitle="Leads you asked to hand over or take, and what was decided" to="/transfers" chevron />
          </ListGroup>
        )}

        <ListGroup title="Account">
          <ListRow
            icon="user-male-circle"
            title="Name and phone"
            subtitle={me.phone ? `${me.name} · ${formatPhone(me.phone)}` : me.name}
            chevron
            onClick={() => setEditOpen(true)}
          />
          <ListRow icon="info" title="Email" subtitle={me.email} />
          <ListRow icon="lock" title="Change password" chevron onClick={() => setPasswordOpen(true)} />
        </ListGroup>

        {me.projects.length > 0 && (
          <ListGroup title="My campaigns">
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

        <section aria-labelledby="appearance-title">
          <h2 id="appearance-title" className="mb-2 px-1 text-caption-strong text-muted uppercase">
            Appearance
          </h2>
          <div className="card card--default gap-0 rounded-2xl p-4">
            <Segmented<ThemeChoice>
              label="Theme"
              value={theme}
              onChange={(t) => (setTheme(t), setThemeChoice(t))}
              options={[
                { value: 'system', label: 'Auto' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              className="w-full"
            />
            <p className="mt-2 px-1 text-caption text-muted">Auto follows your phone's light or dark setting. Dark is easier on the eyes at night.</p>
          </div>
        </section>

        <ListGroup title="About">
          <ListRow
            icon="timeline"
            title="What’s new"
            subtitle={latest ? `Version ${latest.version}` : 'Latest updates'}
            trailing={latest && latest.notify && !latest.seen ? <Tag>New</Tag> : undefined}
            to="/whats-new"
            chevron
          />
        </ListGroup>

        <ListGroup>
          <ListRow icon="logout-rounded" title="Log out" destructive onClick={() => setLogoutOpen(true)} />
        </ListGroup>

        <footer className="flex flex-col items-center gap-2 pt-2 pb-4 text-center">
          <ProntteraMark size={36} />
          <p className="text-caption text-muted">
            Pronttera Sales{latest ? ` · v${latest.version}` : ''}
            <br />
            Made by Pronttera
          </p>
        </footer>
      </div>

      <EditProfile open={editOpen} onOpenChange={setEditOpen} me={me} />
      <ChangePassword open={passwordOpen} onOpenChange={setPasswordOpen} />
      <ResponsiveOverlay open={iosHelp} onOpenChange={setIosHelp} title="Install Pronttera Sales" description="Two taps in Safari." variant="short">
        <ol className="flex flex-col gap-4 pb-2">
          {[
            {
              icon: 'share' as const,
              text: (
                <>
                  Tap <strong>Share</strong> in Safari's toolbar.
                </>
              ),
            },
            {
              icon: 'add-square' as const,
              text: (
                <>
                  Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
                </>
              ),
            },
          ].map((step, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="flex size-10 flex-none items-center justify-center rounded-full bg-accent-soft text-primary">
                <Icon name={step.icon} size={20} />
              </span>
              <span className="text-body-md">{step.text}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-body-sm text-muted">Pronttera Sales then opens from its own icon, full screen, and keeps you signed in.</p>
      </ResponsiveOverlay>
      <Confirm
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        title="Log out?"
        body="You'll need your email and password to sign in again."
        confirmLabel="Log out"
        onConfirm={logout}
      />
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
  const { register, handleSubmit, formState, reset, setError } = useForm({
    resolver: zodResolver(profileSchema),
    mode: 'onBlur',
    defaultValues: { name: me.name, phone: me.phone ?? '' },
  })

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
        <TextField
          label="Phone"
          optional
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          prefix="+91"
          enterKeyHint="done"
          error={formState.errors.phone?.message}
          {...register('phone')}
        />
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
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          error={formState.errors.newPassword?.message}
          {...register('newPassword')}
        />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          enterKeyHint="done"
          error={formState.errors.confirm?.message}
          {...register('confirm')}
        />
      </form>
    </ResponsiveOverlay>
  )
}

/** Your leave: what's coming, cancel it, or mark new leave. Your backup covers meanwhile. */
function MyLeave() {
  const me = useMe()
  const qc = useQueryClient()
  const leaves = useLeaves(me.id)
  const [marking, setMarking] = useState(false)
  const cancel = async (id: string) => {
    try {
      await apiWithMessage(`/leaves/${id}`, { method: 'DELETE' })
      toast.success('Leave cancelled.')
      invalidateTeam(qc)
    } catch (err) {
      handleFormError(err)
    }
  }
  return (
    <ListGroup title="Leave">
      {(leaves.data ?? []).map((l) => (
        <ListRow
          key={l.id}
          icon="leave"
          title={l.startsOn === l.endsOn ? formatDate(l.startsOn) : `${formatDate(l.startsOn)} – ${formatDate(l.endsOn)}`}
          subtitle={l.note ?? (l.startsOn <= todayIST() ? 'On leave now' : 'Coming up')}
          trailing={
            <Button variant="tertiary" size="sm" onClick={() => void cancel(l.id)}>
              Cancel
            </Button>
          }
        />
      ))}
      <ListRow icon="plus-math" title="Mark leave" subtitle="Your backup covers your follow-ups while you're away" chevron onClick={() => setMarking(true)} />
      <LeaveForm open={marking} onOpenChange={setMarking} />
    </ListGroup>
  )
}
