import { Link } from 'react-router'
import { Tag } from '@/components/ui/Display'
import { Icon } from '@/icons'
import { formatDate, plural } from '@/lib/format'
import type { Project } from '@/lib/types'

export function ProjectCard({ p }: { p: Project }) {
  return (
    <li>
      <Link to={`/projects/${p.id}`} className="pressable flex h-full flex-col gap-3 rounded-xl border border-hairline bg-canvas p-5 active:bg-surface-soft">
        <div className="flex items-start gap-3">
          {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" className="size-12 flex-none rounded-md object-cover" /> : <span className="flex size-12 flex-none items-center justify-center rounded-md bg-surface-strong"><Icon name="briefcase" /></span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-title-md">{p.name}</p>
            <p className="text-body-sm text-body">{p.type === 'door_to_door' ? 'Door-to-door' : 'Online'}</p>
          </div>
          <Icon name="chevron-right" size={20} className="mt-1 text-muted-soft" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.status === 'closed' && <Tag>Closed</Tag>}
          {p.pastEndDate && <Tag tone="down">Past end date</Tag>}
          <Tag>{plural(p.memberCount, 'member')}</Tag>
          <Tag>{plural(p.leadCount, 'lead')}</Tag>
        </div>
        <p className="text-caption text-muted">
          {formatDate(p.startDate, { withYear: true })}
          {p.endDate && ` – ${formatDate(p.endDate, { withYear: true })}`}
        </p>
      </Link>
    </li>
  )
}
