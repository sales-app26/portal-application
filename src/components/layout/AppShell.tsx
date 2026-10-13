import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth, useMe } from '@/auth/AuthProvider'
import { WhatsNewDialog } from '@/features/versions/WhatsNewDialog'
import { LoginSheet } from '@/pages/auth/LoginSheet'
import { Banner } from '@/components/ui/Display'
import { Avatar } from '@/components/ui/Display'
import { ProntteraLockup, ProntteraMark } from '@/components/brand/Logo'
import { Icon } from '@/icons'
import { useKeyboardOpen } from '@/hooks/useKeyboardOpen'
import { useLogAfterContact } from '@/hooks/useLogAfterContact'
import { useOnline } from '@/hooks/useOnline'
import { usePendingTransfers } from '@/hooks/usePendingTransfers'
import { cn } from '@/lib/cn'
import { ROLE_LABEL } from '@/lib/format'
import { NAV, flatNav, moreItem, type NavItem } from './navigation'

/**
 * Compact: bottom bar. Medium/expanded: rail. Large: permanent drawer.
 * Pure CSS switching, so there is no layout flash on load (UX-COMPONENTS.md §4.1).
 */
export function AppShell() {
  const me = useMe()
  const { expired } = useAuth()
  const online = useOnline()
  useLogAfterContact(me.role !== 'super_admin')

  return (
    <div className="min-h-dvh bg-canvas">
      <SideRail />
      <SideDrawer />
      <div className="medium:pl-20 large:pl-[264px]">
        {!online && (
          <div className="sticky top-0 z-30 pt-safe">
            <Banner icon="wi-fi-disconnected" tone="dark">
              No internet. Nothing will be saved until you're back online.
            </Banner>
          </div>
        )}
        <main className="pb-[calc(64px+env(safe-area-inset-bottom))] medium:pb-0">
          <Outlet />
        </main>
      </div>
      <BottomBar items={NAV[me.role].bar} />
      {/* The newest release note, once per person. Held back while the session-expired
          sign-in is up, so the two never stack. */}
      {expired ? <LoginSheet /> : <WhatsNewDialog />}
    </div>
  )
}

function useBadge(item: NavItem) {
  const pending = usePendingTransfers()
  return item.badge === 'transfers' ? pending : 0
}

function scrollTopIfActive(isActive: boolean) {
  // Tapping the active tab again scrolls to the top (UX-COMPONENTS.md §5.2).
  if (isActive) window.scrollTo({ top: 0, behavior: 'smooth' })
}

function BottomBar({ items }: { items: NavItem[] }) {
  const keyboard = useKeyboardOpen()
  const { pathname } = useLocation()
  const me = useMe()
  const moreActive = NAV[me.role].more.some((i) => pathname.startsWith(i.to)) || pathname === '/more'

  return (
    <nav
      aria-label="Main"
      className={cn('fixed inset-x-0 bottom-0 z-20 border-t border-separator bg-surface/85 pb-safe backdrop-blur-xl backdrop-saturate-150 medium:hidden', keyboard && 'hidden')}
    >
      <ul className="flex h-16">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <BarLink item={item} forceActive={item === moreItem ? moreActive : undefined} />
          </li>
        ))}
      </ul>
    </nav>
  )
}

function BarLink({ item, forceActive }: { item: NavItem; forceActive?: boolean }) {
  const badge = useBadge(item)
  return (
    <NavLink
      to={item.to}
      className="flex h-full flex-col items-center justify-center gap-0.5"
      onClick={(e) => scrollTopIfActive(e.currentTarget.getAttribute('aria-current') === 'page')}
    >
      {({ isActive }) => {
        const active = forceActive ?? isActive
        return (
          <>
            <span
              className={cn(
                'relative flex h-8 w-14 items-center justify-center rounded-pill transition-[background-color,transform] duration-200 active:scale-90',
                active ? 'bg-accent-soft text-primary' : 'text-muted',
              )}
            >
              <Icon name={item.icon} filled={active} />
              <Badge count={badge} />
            </span>
            <span className={cn('text-caption-strong', active ? 'text-primary' : 'text-muted')}>{item.label}</span>
          </>
        )
      }}
    </NavLink>
  )
}

function Badge({ count }: { count: number }) {
  if (!count) return null
  return (
    <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-down px-1 text-[10px] leading-none font-bold text-white tabular-nums ring-2 ring-surface">
      <span className="sr-only">, </span>
      {count > 99 ? '99+' : count}
      <span className="sr-only"> pending</span>
    </span>
  )
}

function SideRail() {
  const me = useMe()
  return (
    <nav
      aria-label="Main"
      className="fixed inset-y-0 left-0 z-20 hidden w-20 flex-col items-center gap-1 border-r border-separator bg-surface pt-[max(12px,env(safe-area-inset-top))] medium:flex large:hidden"
    >
      <BrandMark className="mb-4" />
      {flatNav(me.role).map((item) => (
        <RailLink key={item.to} item={item} />
      ))}
    </nav>
  )
}

function RailLink({ item }: { item: NavItem }) {
  const badge = useBadge(item)
  return (
    <NavLink
      to={item.to}
      className="group flex w-full flex-col items-center gap-1 py-1.5"
      onClick={(e) => scrollTopIfActive(e.currentTarget.getAttribute('aria-current') === 'page')}
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'relative flex h-8 w-14 items-center justify-center rounded-pill transition-colors',
              isActive ? 'bg-accent-soft text-primary' : 'text-muted group-hover:bg-default',
            )}
          >
            <Icon name={item.icon} filled={isActive} />
            <Badge count={badge} />
          </span>
          <span className={cn('text-caption-strong', isActive ? 'text-primary' : 'text-muted')}>{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

function SideDrawer() {
  const me = useMe()
  return (
    <nav aria-label="Main" className="fixed inset-y-0 left-0 z-20 hidden w-[264px] flex-col border-r border-separator bg-surface px-3 py-5 large:flex">
      <div className="mb-7 px-3">
        <ProntteraLockup size={32} />
      </div>
      <ul className="flex flex-1 flex-col gap-1">
        {flatNav(me.role).map((item) => (
          <li key={item.to}>
            <DrawerLink item={item} />
          </li>
        ))}
      </ul>
      <NavLink to="/profile" className="flex items-center gap-3 rounded-2xl bg-surface-secondary px-3 py-2.5 transition-colors hover:bg-default">
        <Avatar name={me.name} size={36} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-title-sm">{me.name}</span>
          <span className="text-caption text-muted">{ROLE_LABEL[me.role]}</span>
        </span>
      </NavLink>
    </nav>
  )
}

function DrawerLink({ item }: { item: NavItem }) {
  const badge = useBadge(item)
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex h-11 items-center gap-3 rounded-xl px-3.5 text-nav transition-colors',
          isActive ? 'bg-accent-soft font-semibold text-ink' : 'text-body hover:bg-default hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon name={item.icon} filled={isActive} className={isActive ? 'text-primary' : undefined} />
          <span className="flex-1">{item.label}</span>
          {badge > 0 && <span className="rounded-pill bg-down px-2 text-caption-strong text-white tabular-nums">{badge}</span>}
        </>
      )}
    </NavLink>
  )
}

/** The Pronttera mark, theme-aware (see components/brand/Logo). */
export function BrandMark({ className, size = 32 }: { className?: string; size?: number }) {
  return <ProntteraMark size={size} className={className} />
}
