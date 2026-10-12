import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useMe } from '@/auth/AuthProvider'
import { Page } from '@/components/layout/Page'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { FilterChips, Segmented } from '@/components/ui/Choice'
import { Avatar, EmptyState, ErrorState, ListSkeleton, Tag } from '@/components/ui/Display'
import { LoadMore } from '@/components/ui/LoadMore'
import { Confirm } from '@/components/ui/Overlay'
import { AddUserForm, EditUserForm } from '@/features/admin/UserForms'
import { invalidateUsers, useUserList } from '@/features/admin/queries'
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
                      { label: 'Share reset link', icon: 'lock', onSelect: () => void shareResetLink(u), hidden: !u.isActive || u.id === me.id },
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
    </Page>
  )
}

/**
 * A one-time password-reset link the admin sends by hand. Phones get the share sheet
 * (WhatsApp, SMS…); elsewhere it's copied.
 */
async function shareResetLink(user: User) {
  try {
    const { data, message } = await apiWithMessage<{ link: string }>(`/users/${user.id}/reset-link`, { method: 'POST' })
    const text = `Hi ${user.name}, use this link to set your Pronttera Sales password. It works once.`
    if (typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: 'Reset your password', text, url: data.link })
        return
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
      }
    }
    await navigator.clipboard.writeText(`${text}\n${data.link}`)
    toast.success(`Link copied. ${message}`)
  } catch (err) {
    handleFormError(err)
  }
}
