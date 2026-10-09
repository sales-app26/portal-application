import { Navigate } from 'react-router'
import { useMe } from '@/auth/AuthProvider'
import { NAV } from '@/components/layout/navigation'
import { Page } from '@/components/layout/Page'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { useWindowClass } from '@/hooks/useWindowClass'

/** Compact-only overflow of the bottom bar. Larger screens list these in the rail. */
export function MorePage() {
  const me = useMe()
  const wc = useWindowClass()
  const items = NAV[me.role].more
  if (wc !== 'compact' || items.length === 0) return <Navigate to={items[0]?.to ?? '/'} replace />
  return (
    <Page title="More">
      <ListGroup>
        {items.map((i) => (
          <ListRow key={i.to} icon={i.icon} title={i.label} to={i.to} chevron />
        ))}
      </ListGroup>
    </Page>
  )
}
