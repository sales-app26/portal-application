import type { CSSProperties } from 'react'
import { cn } from '@/lib/cn'

// Icons8 iOS 17, free plan: 100px PNGs used as CSS masks (UX-COMPONENTS.md §8).
const outlined = import.meta.glob<string>('./ios/*.png', { eager: true, import: 'default', query: '?url' })
const filled = import.meta.glob<string>('./ios-filled/*.png', { eager: true, import: 'default', query: '?url' })

export type IconName =
  | 'home' | 'contacts' | 'timeline' | 'today' | 'dashboard' | 'statistics' | 'briefcase'
  | 'conference-call' | 'add-user-male' | 'swap' | 'menu-2' | 'more' | 'user-male-circle'
  | 'plus-math' | 'camera' | 'marker' | 'map' | 'near-me' | 'calendar' | 'clock' | 'phone'
  | 'search' | 'filter' | 'sort' | 'back' | 'forward' | 'chevron-right' | 'expand-arrow'
  | 'collapse-arrow' | 'multiply' | 'checkmark' | 'edit' | 'synchronize' | 'refresh' | 'goal'
  | 'ok' | 'approval' | 'cancel' | 'csv' | 'download' | 'image' | 'high-priority' | 'error'
  | 'wi-fi-disconnected' | 'lock' | 'trash' | 'info' | 'visible' | 'invisible' | 'logout-rounded'

interface IconProps {
  name: IconName
  filled?: boolean
  size?: number
  className?: string
}

export function Icon({ name, filled: isFilled = false, size = 24, className }: IconProps) {
  const src = (isFilled ? filled : outlined)[`./${isFilled ? 'ios-filled' : 'ios'}/${name}.png`]
  const style = { '--icon-size': `${size}px`, '--icon-src': `url("${src}")` } as CSSProperties
  return <span aria-hidden className={cn('icon', className)} style={style} />
}
