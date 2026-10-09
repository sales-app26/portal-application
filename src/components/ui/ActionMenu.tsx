import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { useState, type ReactNode } from 'react'
import { useIsSheetLayout } from '@/hooks/useWindowClass'
import { Icon, type IconName } from '@/icons'
import { IconButton } from './Button'
import { ResponsiveOverlay } from './Overlay'

export interface ActionItem {
  label: string
  icon: IconName
  onSelect: () => void
  hidden?: boolean
}

/** Overflow ⋯ menu: action sheet on phones, dropdown on laptops (UX-COMPONENTS.md §3). */
export function ActionMenu({ items, label = 'More actions', title, trigger }: { items: ActionItem[]; label?: string; title?: string; trigger?: ReactNode }) {
  const sheet = useIsSheetLayout()
  const [open, setOpen] = useState(false)
  const visible = items.filter((i) => !i.hidden)
  if (visible.length === 0) return null

  const button = trigger ?? <IconButton icon="more" label={label} onClick={sheet ? () => setOpen(true) : undefined} />

  if (sheet) {
    return (
      <>
        {trigger ? <span onClick={() => setOpen(true)}>{trigger}</span> : button}
        <ResponsiveOverlay open={open} onOpenChange={setOpen} title={title ?? label} variant="choice">
          <div className="flex flex-col py-1">
            {visible.map((i) => (
              <button
                key={i.label}
                type="button"
                className="flex min-h-14 items-center gap-4 px-4 text-left text-body-md active:bg-surface-soft"
                onClick={() => {
                  setOpen(false)
                  // Let the sheet close (and its history entry unwind) before opening the next overlay.
                  setTimeout(i.onSelect, 320)
                }}
              >
                <Icon name={i.icon} />
                {i.label}
              </button>
            ))}
          </div>
        </ResponsiveOverlay>
      </>
    )
  }

  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>{button}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={4} className="z-50 min-w-52 rounded-lg border border-hairline bg-canvas py-1 shadow-soft">
          {visible.map((i) => (
            <Dropdown.Item key={i.label} onSelect={i.onSelect} className="flex h-10 cursor-pointer items-center gap-3 px-3 text-body-sm outline-none data-[highlighted]:bg-surface-soft">
              <Icon name={i.icon} size={20} />
              {i.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}
