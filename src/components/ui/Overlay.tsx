import * as Dialog from '@radix-ui/react-dialog'
import { useState, type ReactNode } from 'react'
import { Drawer } from 'vaul'
import { useIsSheetLayout } from '@/hooks/useWindowClass'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'
import { cn } from '@/lib/cn'
import { Button, IconButton } from './Button'

export type OverlayVariant = 'form' | 'short' | 'choice' | 'confirm'

interface ResponsiveOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  variant?: OverlayVariant
  /** Sticky footer, usually the Save pill. Rides above the keyboard on phones. */
  footer?: ReactNode
  /** Ask before discarding typed input. */
  dirty?: boolean
  /** False for overlays that must be completed (the session-expired sign-in). */
  dismissible?: boolean
  children: ReactNode
}

/**
 * One component, three presentations (UX-COMPONENTS.md §3):
 * bottom sheet below 840px, side panel (form) or centred dialog at 840px and up.
 */
/**
 * Full-screen layers opened from inside a sheet (the visit camera) are portaled to <body>, outside
 * the sheet. Taps and focus there are not "outside" the sheet: it must stay open and quiet.
 */
const isOverlayLayer = (target: EventTarget | null) => target instanceof Element && !!target.closest('[data-overlay-layer]')

export function ResponsiveOverlay({ open, onOpenChange, title, description, variant = 'short', footer, dirty, dismissible = true, children }: ResponsiveOverlayProps) {
  const sheet = useIsSheetLayout()
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const requestClose = () => {
    if (!dismissible) return
    if (dirty) setConfirmDiscard(true)
    else onOpenChange(false)
  }
  const close = () => {
    setConfirmDiscard(false)
    onOpenChange(false)
  }

  useOverlayHistory(open, () => {
    if (!dismissible) return true
    // Back button: with unsaved input, ask first and keep the overlay open.
    if (dirty) {
      setConfirmDiscard(true)
      return true
    }
    onOpenChange(false)
  })

  const discardBar = confirmDiscard && (
    <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-separator bg-warning-soft px-4 py-3 expanded:px-6">
      <p className="flex-1 text-body-sm text-ink">Discard what you typed?</p>
      <Button size="sm" variant="secondary" onClick={() => setConfirmDiscard(false)}>
        Keep editing
      </Button>
      <Button size="sm" onClick={close}>
        Discard
      </Button>
    </div>
  )

  const header = (
    <div className="flex min-h-14 items-center gap-2 px-4 expanded:px-6 expanded:pt-2">
      <div className="min-w-0 flex-1">
        <Title sheet={sheet} className="truncate text-title-md">
          {title}
        </Title>
        {description ? (
          <Description sheet={sheet} className="text-body-sm text-body">
            {description}
          </Description>
        ) : (
          <Description sheet={sheet} className="sr-only">
            {title}
          </Description>
        )}
      </div>
      {dismissible && (variant === 'form' || !sheet) && <IconButton icon="multiply" label="Close" onClick={requestClose} className="-mr-2" />}
    </div>
  )

  const body = (
    <>
      {header}
      {discardBar}
      <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 expanded:px-6', variant === 'choice' ? 'px-0 expanded:px-0' : 'pb-4')}>{children}</div>
      {footer && <div className="border-t border-separator bg-overlay px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] expanded:px-6 expanded:pb-4">{footer}</div>}
    </>
  )

  if (sheet) {
    return (
      // Forms stay put: no drag-to-close (handleOnly with no handle), so scrolling or a stray swipe
      // on a phone or iPad never moves the sheet. They close with ✕ or Back. Pickers still swipe away.
      <Drawer.Root
        open={open}
        onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}
        repositionInputs
        dismissible={dismissible && !confirmDiscard}
        handleOnly={variant === 'form'}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-backdrop backdrop-blur-[2px]" />
          <Drawer.Content
            onInteractOutside={(e) => isOverlayLayer(e.target) && e.preventDefault()}
            className={cn(
              'fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-[28px] bg-overlay text-overlay-foreground shadow-overlay outline-none',
              variant === 'form' ? 'h-[92dvh] pt-2' : 'max-h-[92dvh]',
              !footer && 'pb-safe',
            )}
          >
            {variant !== 'form' && <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 flex-none rounded-pill bg-border" />}
            {body}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay-scrim fixed inset-0 z-40 bg-backdrop backdrop-blur-[2px]" />
        <Dialog.Content
          onPointerDownOutside={(e) => !dismissible && e.preventDefault()}
          onInteractOutside={(e) => isOverlayLayer(e.target) && e.preventDefault()}
          onEscapeKeyDown={(e) => {
            if (!dismissible) e.preventDefault()
            else if (dirty) {
              e.preventDefault()
              setConfirmDiscard(true)
            }
          }}
          className={cn(
            'fixed z-50 flex flex-col bg-overlay text-overlay-foreground shadow-overlay outline-none',
            variant === 'form'
              ? 'side-panel inset-y-2 right-2 w-[480px] max-w-[calc(100vw-16px)] rounded-3xl'
              : 'dialog-pop top-1/2 left-1/2 max-h-[85dvh] w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl pb-2',
          )}
        >
          {body}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Title({ sheet, className, children }: { sheet: boolean; className?: string; children: ReactNode }) {
  return sheet ? <Drawer.Title className={className}>{children}</Drawer.Title> : <Dialog.Title className={className}>{children}</Dialog.Title>
}

function Description({ sheet, className, children }: { sheet: boolean; className?: string; children: ReactNode }) {
  return sheet ? <Drawer.Description className={className}>{children}</Drawer.Description> : <Dialog.Description className={className}>{children}</Dialog.Description>
}

// ---------------------------------------------------------------- confirmation

interface ConfirmProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body: ReactNode
  /** Spell out the verb: "Deactivate Ravi", not "OK". */
  confirmLabel: string
  onConfirm: () => void | Promise<void>
  loading?: boolean
}

/** Action sheet on phones, dialog on laptops. Never window.confirm (UX-COMPONENTS.md §4.2). */
export function Confirm({ open, onOpenChange, title, body, confirmLabel, onConfirm, loading }: ConfirmProps) {
  const sheet = useIsSheetLayout()
  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange} title={title} variant="confirm">
      <div className="text-body-md text-body">{body}</div>
      <div className={cn('mt-6 flex gap-3', sheet ? 'flex-col' : 'flex-row-reverse')}>
        <Button block={sheet} loading={loading} onClick={() => void onConfirm()}>
          {confirmLabel}
        </Button>
        <Button block={sheet} variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
          Cancel
        </Button>
      </div>
    </ResponsiveOverlay>
  )
}
