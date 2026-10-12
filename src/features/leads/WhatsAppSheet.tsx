import { useMe } from '@/auth/AuthProvider'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { whatsappHref } from '@/lib/contact'
import { rememberContact } from '@/lib/contactPrompt'

export interface ContactLead {
  id: string
  name: string
  phone: string
  businessName?: string | null
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name

/** Messages reps send again and again, with the client's and the rep's names filled in. */
function templates(client: string, rep: string) {
  return [
    { label: 'Introduce yourself', text: `Hi ${client}, this is ${rep} from Pronttera. Thank you for your time today! Please save my number and message me here anytime.` },
    { label: 'Follow up', text: `Hi ${client}, ${rep} from Pronttera here. Following up on our conversation. Is this a good time to talk?` },
    { label: "Couldn't reach you", text: `Hi ${client}, I tried calling you today. When is a good time to talk?` },
    { label: 'Share the details', text: `Hi ${client}, as promised, sharing the details here. Happy to answer any questions or show you a quick demo.` },
    { label: 'Ask for a visit', text: `Hi ${client}, can I drop by tomorrow for a quick 10-minute demo? Let me know a time that suits you.` },
    { label: 'Thank you', text: `Hi ${client}, thank you for choosing us! I'm here if you need anything at all.` },
  ]
}

/**
 * Pick a ready message (or none) and open the chat in WhatsApp. Each option is a real
 * link, so it opens from the tap itself and works where pop-ups are blocked.
 */
export function WhatsAppSheet({ open, onOpenChange, lead, prompt = true }: { open: boolean; onOpenChange: (o: boolean) => void; lead: ContactLead; prompt?: boolean }) {
  const me = useMe()
  const sent = () => {
    if (prompt) rememberContact({ leadId: lead.id, name: lead.name, kind: 'whatsapp' })
    onOpenChange(false)
  }
  const href = (text?: string) => `${whatsappHref(lead.phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`

  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange} title={`WhatsApp ${lead.name}`} description="Pick a message. You can edit it in WhatsApp before sending." variant="choice">
      <ul className="flex flex-col py-1">
        <li>
          <a href={href()} target="_blank" rel="noreferrer" onClick={sent} className="flex min-h-14 flex-col justify-center px-4 py-3 active:bg-surface-soft expanded:px-6 expanded:hover:bg-surface-soft">
            <span className="text-title-sm">Just open the chat</span>
            <span className="text-body-sm text-body">No message, type your own</span>
          </a>
        </li>
        {templates(first(lead.name), first(me.name)).map((t) => (
          <li key={t.label} className="border-t border-hairline-soft">
            <a href={href(t.text)} target="_blank" rel="noreferrer" onClick={sent} className="flex flex-col gap-0.5 px-4 py-3 active:bg-surface-soft expanded:px-6 expanded:hover:bg-surface-soft">
              <span className="text-title-sm">{t.label}</span>
              <span className="line-clamp-2 text-body-sm text-body">{t.text}</span>
            </a>
          </li>
        ))}
      </ul>
    </ResponsiveOverlay>
  )
}
