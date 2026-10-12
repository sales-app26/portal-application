import { useState } from 'react'
import { useMe } from '@/auth/AuthProvider'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { FilterChips } from '@/components/ui/Choice'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/Display'
import { LoadMore } from '@/components/ui/LoadMore'
import { ProjectCard } from '@/features/admin/ProjectCard'
import { ProjectForm } from '@/features/admin/ProjectForm'
import { useProjectList } from '@/features/admin/queries'
import type { ProjectStatus } from '@/lib/types'

/** Super Admin: all projects, create. Moderator: the projects the Super Admin added him to. */
export function ProjectsPage() {
  const me = useMe()
  const isSuper = me.role === 'super_admin'
  const [status, setStatus] = useState<ProjectStatus | 'all'>('active')
  const [creating, setCreating] = useState(false)
  const list = useProjectList({ status: status === 'all' ? undefined : status })
  const items = list.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <Page
      title="Projects"
      wide
      cta={isSuper ? { label: 'New project', icon: 'plus-math', onClick: () => setCreating(true) } : undefined}
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
          body={isSuper ? 'Create a project, then add people and targets.' : 'The Super Admin adds you to projects. Yours will show here.'}
          action={
            isSuper && status !== 'closed' && <Button onClick={() => setCreating(true)}>New project</Button>
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
    </Page>
  )
}
