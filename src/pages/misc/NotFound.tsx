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
        body="It may have moved, or you may not have access to it."
        action={
          <Button asChild variant="secondary">
            <Link to="/">Go home</Link>
          </Button>
        }
      />
    </Page>
  )
}
