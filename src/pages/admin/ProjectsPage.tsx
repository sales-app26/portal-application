import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { useMe } from '@/auth/AuthProvider'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { FilterChips } from '@/components/ui/Choice'
import { EmptyState, ErrorState, ListSkeleton, Tag } from '@/components/ui/Display'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { LoadMore } from '@/components/ui/LoadMore'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { ProjectCard } from '@/features/admin/ProjectCard'
import { ProjectForm } from '@/features/admin/ProjectForm'
import { invalidateProjects, useJoinable, useProjectList } from '@/features/admin/queries'
import { apiWithMessage } from '@/lib/api'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import type { ProjectStatus } from '@/lib/types'

/** Super Admin: all projects, create. Moderator: his projects, join another (PRD §6). */
export function ProjectsPage() {
  const me = useMe()
  const isSuper = me.role === 'super_admin'
  const [status, setStatus] = useState<ProjectStatus | 'all'>('active')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const list = useProjectList({ status: status === 'all' ? undefined : status })
  const items = list.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <Page
      title="Projects"
      wide
      cta={isSuper ? { label: 'New project', icon: 'plus-math', onClick: () => setCreating(true) } : { label: 'Join a project', icon: 'plus-math', onClick: () => setJoining(true) }}
      header={
        <FilterChips
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'closed', label: 'Closed' },
            { value: 'all', label: 'All' },
          ]}
        />
      }
    >
      {list.isLoading ? (
        <ListSkeleton rows={3} />
      ) : list.isError ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="briefcase"
          title={status === 'closed' ? 'No closed projects' : 'No projects yet'}
          body={isSuper ? 'Create a project, then add people and targets.' : 'Join a project to start working on it.'}
          action={
            status !== 'closed' && (
              <Button onClick={() => (isSuper ? setCreating(true) : setJoining(true))}>{isSuper ? 'New project' : 'Join a project'}</Button>
            )
          }
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 expanded:grid-cols-2 large:grid-cols-3">
            {items.map((p) => (
              <ProjectCard key={p.id} p={p} />
            ))}
          </ul>
          <LoadMore hasNext={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
        </>
      )}
      {isSuper && <ProjectForm open={creating} onOpenChange={setCreating} />}
      {!isSuper && <JoinProject open={joining} onOpenChange={setJoining} />}
    </Page>
  )
}

/** Moderator assigns an active project to himself, no approval needed (PRD §5.4). */
function JoinProject({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const q = useJoinable(open)
  const [busyId, setBusyId] = useState<string | null>(null)

  const join = async (id: string) => {
    setBusyId(id)
    try {
      const { message } = await apiWithMessage(`/projects/${id}/join`, { method: 'POST' })
      haptic.success()
      toast.success(message)
      invalidateProjects(qc)
      void qc.invalidateQueries({ queryKey: ['leads'] })
      onOpenChange(false)
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange} title="Join a project" description="Pick an active project to work on." variant="short">
      {q.isLoading || !q.data ? (
        q.isError ? <ErrorState message={q.error.message} onRetry={() => void q.refetch()} /> : <ListSkeleton rows={2} />
      ) : q.data.length === 0 ? (
        <EmptyState icon="briefcase" title="Nothing to join" body="You're already in every active project." />
      ) : (
        <ListGroup>
          {q.data.map((p) => (
            <ListRow
              key={p.id}
              icon="briefcase"
              title={p.name}
              subtitle={p.type === 'door_to_door' ? 'Door-to-door' : 'Online'}
              trailing={
                <Button size="sm" loading={busyId === p.id} disabled={!!busyId} onClick={() => void join(p.id)}>
                  Join
                </Button>
              }
            />
          ))}
        </ListGroup>
      )}
      {q.data?.some((p) => p.pastEndDate) && <Tag className="mt-3">Some projects are past their end date.</Tag>}
    </ResponsiveOverlay>
  )
}
