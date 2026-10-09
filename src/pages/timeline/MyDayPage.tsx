import { Page } from '@/components/layout/Page'
import { TimelineView } from '@/features/timeline/TimelineView'

/** Own timeline for a chosen day (PRD §6). */
export function MyDayPage() {
  return (
    <Page title="My day" wide>
      <TimelineView />
    </Page>
  )
}
