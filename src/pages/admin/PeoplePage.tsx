import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useMe } from '@/auth/AuthProvider'
import { Page } from '@/components/layout/Page'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { FilterChips, Segmented } from '@/components/ui/Choice'
import { Avatar, EmptyState, ErrorState, ListSkeleton, Tag } from '@/components/ui/Display'
import { LoadMore } from '@/components/ui/LoadMore'
import { Confirm, ResponsiveOverlay } from '@/components/ui/Overlay'
import { Picker } from '@/components/ui/Picker'
import { Button } from '@/components/ui/Button'
import { AddUserForm, EditUserForm } from '@/features/admin/UserForms'
import { invalidateProjects, invalidateUsers, useUserList, useUserOptions } from '@/features/admin/queries'
import { useDebounced } from '@/hooks/useDebounced'
import { Icon } from '@/icons'
import { apiWithMessage } from '@/lib/api'
import { handleFormError } from '@/lib/forms'
import type { User, UserRole } from '@/lib/types'

type Activity = 'active' | 'inactive' | 'all'

/** Super Admin: Team and Moderators. Moderator: his sales persons (PRD §6). */
export function PeoplePage() {
  const me = useMe()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isSuper = me.role === 'super_admin'
  const [tab, setTab] = useState<'sales_person' | 'moderator'>('sales_person')
  const [activity, setActivity] = useState<Activity>('active')
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [toggling, setToggling] = useState<User | null>(null)
  const [deleting, setDeleting] = useState<User | null>(null)
  const [sharing, setSharing] = useState<User | null>(null)
  const [busy, setBusy] = useState(false)
  const q = useDebounced(search.trim(), 300)

  const role: UserRole = isSuper ? tab : 'sales_person'
  const list = useUserList({ role: isSuper ? role : undefined, isActive: activity === 'all' ? undefined : activity === 'active', search: q || undefined })
  const users = list.data?.pages.flatMap((p) => p.items) ?? []

  const toggleActive = async () => {
    if (!toggling) return
    setBusy(true)
    try {
      const { message } = await apiWithMessage(`/users/${toggling.id}/${toggling.isActive ? 'deactivate' : 'reactivate'}`, { method: 'POST' })
      toast.success(message)
      invalidateUsers(qc)
      void qc.invalidateQueries({ queryKey: ['transfers'] })
      setToggling(null)
    } catch (err) {
      handleFormError(err)
      setToggling(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page
      title={isSuper ? 'People' : 'Team'}
      wide
      cta={{ label: role === 'moderator' ? 'Add moderator' : 'Add sales person', icon: 'add-user-male', onClick: () => setAdding(true) }}
      header={
        <div className="flex flex-col gap-3">
          {isSuper && (
            <Segmented
              label="Group"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'sales_person', label: 'Team' },
                { value: 'moderator', label: 'Moderators' },
              ]}
              className="w-full medium:w-auto medium:self-start"
            />
          )}
          <label className="flex h-11 items-center gap-2 rounded-pill bg-surface-strong px-4 medium:max-w-md">
            <Icon name="search" size={20} className="text-muted" />
            <span className="sr-only">Search people</span>
            <input type="search" enterKeyHint="search" placeholder="Name, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={120} className="h-full min-w-0 flex-1 bg-transparent text-body-md outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden" />
          </label>
          <FilterChips
            label="Activity"
            value={activity}
            onChange={setActivity}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
      }
    >
      <div className="expanded:max-w-[900px]">
        {list.isLoading ? (
          <ListSkeleton />
        ) : list.isError ? (
          <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
        ) : users.length === 0 ? (
          <EmptyState icon="conference-call" title={q ? 'No one matches' : 'No people here yet'} body={q ? 'Try another name, email or number.' : 'Add someone and they get an email to set a password.'} />
        ) : (
          <div className="-mx-4 border-t border-hairline medium:mx-0 medium:overflow-hidden medium:rounded-xl medium:border">
            {users.map((u) => (
              <div key={u.id} className="flex min-h-[72px] items-center gap-3 border-b border-hairline-soft px-4 py-3 last:border-b-0">
                <Avatar name={u.name} />
                <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={() => navigate(`/people/${u.id}`)}>
                  <span className="flex items-center gap-2">
                    <span className="truncate text-title-sm">{u.name}</span>
                    {!u.isActive && <Tag>Inactive</Tag>}
                    {isSuper && u.role === 'moderator' && tab === 'sales_person' && <Tag>Moderator</Tag>}
                  </span>
                  <span className="truncate text-body-sm text-body">{u.email}</span>
                </button>
                {u.canManage && (
                  <ActionMenu
                    title={u.name}
                    items={[
                      { label: 'Week and month', icon: 'statistics', onSelect: () => navigate(`/people/${u.id}`) },
                      { label: 'View their day', icon: 'timeline', onSelect: () => navigate(`/people/${u.id}/day`) },
                      { label: 'Edit', icon: 'edit', onSelect: () => setEditing(u), hidden: !u.isActive && u.id === me.id },
                      { label: 'Email reset link', icon: 'lock', onSelect: () => void emailResetLink(u), hidden: !u.isActive || u.id === me.id },
                      { label: 'Copy reset link (to share yourself)', icon: 'lock', onSelect: () => setSharing(u), hidden: !u.isActive || u.id === me.id },
                      { label: 'Delete', icon: 'trash', onSelect: () => setDeleting(u), hidden: !isSuper || u.id === me.id || u.role === 'super_admin' },
                      { label: u.isActive ? 'Deactivate' : 'Reactivate', icon: u.isActive ? 'lock' : 'refresh', onSelect: () => setToggling(u), hidden: !u.isActive && u.id === me.id },
                    ]}
                  />
                )}
              </div>
            ))}
            <LoadMore hasNext={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
          </div>
        )}
      </div>

      <AddUserForm open={adding} onOpenChange={setAdding} canAddModerator={isSuper} defaultRole={role} />
      {editing && <EditUserForm user={editing} open onOpenChange={(o) => !o && setEditing(null)} superAdmin={isSuper} />}
      <Confirm
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.isActive ? `Deactivate ${toggling?.name}?` : `Reactivate ${toggling?.name}?`}
        body={
          toggling?.isActive
            ? 'They can no longer sign in. Their leads stay in their name, tagged “Owner inactive”, until you reassign them. Pending transfers they are part of are rejected.'
            : `${toggling?.name} can sign in again.`
        }
        confirmLabel={toggling?.isActive ? `Deactivate ${toggling?.name ?? ''}`.trim() : `Reactivate ${toggling?.name ?? ''}`.trim()}
        onConfirm={toggleActive}
        loading={busy}
      />
      {sharing && <ResetLinkSheet user={sharing} onClose={() => setSharing(null)} />}
      {deleting && <DeleteUserSheet user={deleting} onClose={() => setDeleting(null)} />}
    </Page>
  )
}

/**
 * A one-time password-reset link the admin sends by hand (WhatsApp, SMS…). The link is
 * shown first and copied only on the admin's own tap: browsers may refuse a clipboard
 * write that happens after a network wait, which would leave the old clipboard in place.
 */
function ResetLinkSheet({ user, onClose }: { user: User; onClose: () => void }) {
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const text = `Hi ${user.name}, use this link to set your Pronttera Sales password. It works once.`

  useEffect(() => {
    let live = true
    apiWithMessage<{ link: string }>(`/users/${user.id}/reset-link`, { method: 'POST' })
      .then(({ data }) => live && setLink(data.link))
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.'))
    return () => {
      live = false
    }
  }, [user.id])

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(`${text}\n${link}`)
      setCopied(true)
      toast.success('Link copied. Paste it to the person; it is not emailed.')
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.')
    }
  }
  const canShare = typeof navigator.share === 'function'
  const share = async () => {
    if (!link) return
    try {
      await navigator.share({ title: 'Reset your password', text, url: link })
    } catch {
      /* cancelled */
    }
  }

  return (
    <ResponsiveOverlay open onOpenChange={(o) => !o && onClose()} title={`Reset link for ${user.name}`} description="Works once. Share it only with this person." variant="confirm">
      {error ? (
        <ErrorState message={error} />
      ) : !link ? (
        <ListSkeleton rows={1} />
      ) : (
        <div className="flex flex-col gap-4">
          <input
            readOnly
            value={link}
            aria-label="Reset link"
            onFocus={(e) => e.currentTarget.select()}
            className="h-12 w-full rounded-md border border-hairline bg-surface-soft px-3 font-mono text-caption"
          />
          <div className="flex flex-col gap-3 medium:flex-row-reverse">
            <Button icon={copied ? 'checkmark' : undefined} onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            {canShare && (
              <Button variant="secondary" onClick={() => void share()}>
                Share…
              </Button>
            )}
          </div>
        </div>
      )}
    </ResponsiveOverlay>
  )
}

/**
 * Super Admin: delete someone for good. Their leads go to the person picked; the
 * visits and follow-ups they logged stay, shown as "Deleted user".
 */
function DeleteUserSheet({ user, onClose }: { user: User; onClose: () => void }) {
  const qc = useQueryClient()
  const options = useUserOptions({ isActive: true })
  const [to, setTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const people = (options.data ?? []).filter((p) => p.id !== user.id && p.role !== 'super_admin')

  const remove = async () => {
    setBusy(true)
    try {
      const { data, message } = await apiWithMessage<{ leadsMoved: number }>(`/users/${user.id}/delete`, { method: 'POST', body: to ? { transferToId: to } : {} })
      const who = people.find((p) => p.id === to)?.name
      toast.success(data.leadsMoved && who ? `${message} ${data.leadsMoved} ${data.leadsMoved === 1 ? 'lead' : 'leads'} moved to ${who}.` : message)
      invalidateUsers(qc)
      invalidateProjects(qc)
      void qc.invalidateQueries({ queryKey: ['leads'] })
      void qc.invalidateQueries({ queryKey: ['transfers'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ResponsiveOverlay open onOpenChange={(o) => !o && onClose()} title={`Delete ${user.name}?`} variant="confirm">
      <div className="flex flex-col gap-4 text-body-md text-body">
        <p>
          This can’t be undone. Their login, name, email and phone are erased, and the email can be used for a new account. The visits and follow-ups they logged stay, shown as <b>Deleted user</b>.
        </p>
        <Picker
          label="Who takes over their leads"
          value={to}
          options={people.map((p) => ({ value: p.id, label: p.name, description: p.email, leading: <Avatar name={p.name} size={32} /> }))}
          onChange={setTo}
          placeholder="Choose a person"
          hint="Needed if they own any leads. That person joins those projects if they aren’t in them already."
        />
        <div className="mt-2 flex flex-col gap-3 medium:flex-row-reverse">
          <Button loading={busy} onClick={() => void remove()}>
            Delete {user.name}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    </ResponsiveOverlay>
  )
}

/** Emails the person a reset link to their account email (Brevo). */
async function emailResetLink(user: User) {
  try {
    const { data } = await apiWithMessage<{ email: string }>(`/users/${user.id}/reset-email`, { method: 'POST' })
    toast.success(`Reset email sent to ${data.email}.`)
  } catch (err) {
    handleFormError(err)
  }
}
