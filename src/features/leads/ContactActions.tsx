import { useState } from 'react'
import { Icon } from '@/icons'
import { cn } from '@/lib/cn'
import { telHref } from '@/lib/contact'
import { rememberContact } from '@/lib/contactPrompt'
import { leadTitle } from '@/lib/format'
import { WhatsAppSheet, type ContactLead } from './WhatsAppSheet'

/** A chat bubble with a handset: reads as "WhatsApp" next to the green fill without copying the logo. */
export function ChatIcon({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className={cn('flex-none', className)}>
      <path d="M12 3a9 9 0 0 0-7.79 13.5L3 21l4.62-1.18A9 9 0 1 0 12 3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path
        d="M9.2 8.1c.2-.38.48-.4.7-.4h.48c.2 0 .4.1.5.36l.62 1.45c.1.23.04.48-.12.65l-.42.47a.4.4 0 0 0-.05.47 5.6 5.6 0 0 0 2.2 2.2c.17.1.37.08.48-.05l.47-.42c.17-.16.42-.22.65-.12l1.45.62c.26.1.36.3.36.5v.48c0 .22-.02.5-.4.7-.53.3-1.33.5-2.05.3a6.9 6.9 0 0 1-4.83-4.83c-.2-.72 0-1.52.3-2.05z"
        fill="currentColor"
      />
    </svg>
  )
}

const round = 'pressable inline-flex flex-none items-center justify-center rounded-full'

/**
 * Call and WhatsApp as two round buttons, for list rows. Starting either one remembers the
 * lead, so coming back to the app offers to log what happened.
 */
export function ContactButtons({ lead, size = 40, className }: { lead: ContactLead; size?: number; className?: string }) {
  const [chat, setChat] = useState(false)
  const style = { width: size, height: size }
  // Uploaded without a number: nothing to call or message yet.
  if (!lead.phone) return null
  return (
    <span className={cn('flex flex-none items-center gap-2', className)}>
      <a
        href={telHref(lead.phone)}
        aria-label={`Call ${leadTitle(lead)}`}
        title="Call"
        style={style}
        className={cn(round, 'bg-primary/10 text-primary active:bg-primary/20')}
        onClick={(e) => {
          e.stopPropagation()
          rememberContact({ leadId: lead.id, name: leadTitle(lead), kind: 'call' })
        }}
      >
        <Icon name="phone" size={20} />
      </a>
      <button
        type="button"
        aria-label={`WhatsApp ${leadTitle(lead)}`}
        title="WhatsApp"
        style={style}
        className={cn(round, 'bg-[#25d366]/12 text-[#128c4a] active:bg-[#25d366]/25 dark:text-[#3ddc84]')}
        onClick={(e) => {
          e.stopPropagation()
          setChat(true)
        }}
      >
        <ChatIcon size={21} />
      </button>
      <WhatsAppSheet open={chat} onOpenChange={setChat} lead={lead} />
    </span>
  )
}
