import { Link } from 'react-router'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Display'

export function NotFound() {
  return (
    <Page title="Not found" back="/">
      <EmptyState
        icon="search"
        title="This page doesn't exist"
        body="It may have moved, or it may not be open to you."
        action={
          <Button asChild variant="secondary">
            <Link to="/">Go home</Link>
          </Button>
        }
      />
    </Page>
  )
}
