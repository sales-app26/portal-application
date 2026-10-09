import { useParams } from 'react-router'
import { Page } from '@/components/layout/Page'
import { TimelineView } from '@/features/timeline/TimelineView'

/** An admin's view of one person's day, with photos and map pins (flow 7.5). */
export function PersonTimelinePage() {
  const { id } = useParams()
  return (
    <Page title="Timeline" back={`/people/${id}`} wide>
      <TimelineView userId={id} />
    </Page>
  )
}
