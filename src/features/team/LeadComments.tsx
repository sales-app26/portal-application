import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Avatar, ErrorState, Skeleton, Tag } from '@/components/ui/Display'
import { Icon } from '@/icons'
import { apiWithMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import { ago, formatTime } from '@/lib/format'
import type { LeadComment, LeadDetail, PersonRef } from '@/lib/types'
import { leadKeys } from '@/features/leads/queries'
import { teamKeys, useComments, useMentionable } from './queries'

const KIND_TAG: Partial<Record<LeadComment['kind'], { label: string; tone: 'down' | 'accent' | 'warning' }>> = {
  help: { label: 'Help requested', tone: 'down' },
  handover: { label: 'Handover', tone: 'accent' },
  feedback: { label: 'Feedback', tone: 'warning' },
}

/** "@Priya Desai" in the text, drawn as a mention. */
function Body({ text, mentions }: { text: string; mentions: PersonRef[] }) {
  if (!mentions.length) return <>{text}</>
  const names = mentions.map((m) => `@${m.name}`).sort((a, b) => b.length - a.length)
  const parts = text.split(new RegExp(`(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g'))
  return (
    <>
      {parts.map((p, i) =>
        names.includes(p) ? (
          <span key={i} className="rounded-md bg-accent-soft px-1 font-semibold text-accent-soft-foreground">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  )
}

/**
 * The team's conversation about one lead: rep, moderators and the backup, with @mentions,
 * "Ask for help", pinned notes (handovers) and resolving help. Separate from the follow-up
 * log, which records what happened with the client.
 */
export function LeadComments({ lead }: { lead: LeadDetail }) {
  const qc = useQueryClient()
  const comments = useComments(lead.id)
  const [body, setBody] = useState('')
  const [mentioned, setMentioned] = useState<PersonRef[]>([])
  const [busy, setBusy] = useState(false)
  const [focused, setFocused] = useState(false)
  const people = useMentionable(lead.id, focused || !!body)
  const p = lead.permissions
  const canAskHelp = (p.canLogFollowUp || p.covering) && !lead.openHelp

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: teamKeys.comments(lead.id) })
    void qc.invalidateQueries({ queryKey: leadKeys.detail(lead.id) })
  }

  const toggleMention = (person: PersonRef) => {
    const on = mentioned.some((m) => m.id === person.id)
    setMentioned(on ? mentioned.filter((m) => m.id !== person.id) : [...mentioned, person])
    if (!on && !body.includes(`@${person.name}`)) setBody((b) => `${b.trimEnd()}${b.trim() ? ' ' : ''}@${person.name} `)
  }

  const send = async (kind: 'comment' | 'help') => {
    const text = body.trim()
    if (!text) return
    setBusy(true)
    try {
      // Only people still named in the text are mentioned.
      const mentionIds = mentioned.filter((m) => text.includes(`@${m.name}`)).map((m) => m.id)
      const { message } = await apiWithMessage(kind === 'help' ? `/leads/${lead.id}/help` : `/leads/${lead.id}/comments`, {
        method: 'POST',
        body: kind === 'help' ? { body: text } : { body: text, ...(mentionIds.length ? { mentionIds } : {}) },
      })
      haptic.success()
      toast.success(kind === 'help' ? 'Your sales managers have been asked to help.' : message)
      setBody('')
      setMentioned([])
      refresh()
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusy(false)
    }
  }

  const act = async (path: string, init: { method: 'POST' | 'PATCH' | 'DELETE'; body?: Record<string, unknown> }, done: string) => {
    try {
      await apiWithMessage(path, init)
      toast.success(done)
      refresh()
    } catch (err) {
      handleFormError(err)
    }
  }

  const list = comments.data ?? []

  return (
    <section aria-labelledby="team-notes-title" className="card card--default gap-0 rounded-2xl p-5 expanded:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="team-notes-title" className="flex items-center gap-2 text-title-md">
          <Icon name="comment" size={20} className="text-primary" /> Team notes
          {list.length > 0 && <span className="chip chip--sm bg-default px-2 text-caption-strong text-body tabular-nums">{list.length}</span>}
        </h2>
        {lead.openHelp && <Tag tone="down">Help requested</Tag>}
      </div>

      {comments.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-12 rounded-2xl" />
        </div>
      ) : comments.isError ? (
        <ErrorState message={comments.error.message} onRetry={() => void comments.refetch()} />
      ) : list.length === 0 ? (
        <p className="mb-3 text-body-sm text-muted">Talk to your team about this lead here: ask your manager, leave a handover note, @mention someone.</p>
      ) : (
        <ol className="mb-4 flex flex-col gap-3">
          {list.map((c) => {
            const tag = KIND_TAG[c.kind]
            return (
              <li key={c.id} className={cn('flex gap-3', c.pinned && 'rounded-2xl bg-warning-soft/40 p-3')}>
                <Avatar name={c.user.name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-title-sm">{c.user.name}</span>
                    <span className="text-caption text-muted">
                      {ago(c.createdAt)}, {formatTime(c.createdAt)}
                      {c.editedAt && ' · edited'}
                    </span>
                    {c.pinned && (
                      <span className="inline-flex items-center gap-1 text-caption-strong text-ink">
                        <Icon name="pin" filled size={12} /> Pinned
                      </span>
                    )}
                    {tag && <Tag tone={tag.tone}>{c.kind === 'help' && c.resolvedAt ? 'Help resolved' : tag.label}</Tag>}
                  </p>
                  <p className="mt-1 text-body-md break-words whitespace-pre-line">
                    <Body text={c.body} mentions={c.mentions} />
                  </p>
                  {(c.canPin || c.canDelete || (c.canResolve && c.kind === 'help' && !c.resolvedAt)) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.canResolve && c.kind === 'help' && !c.resolvedAt && (
                        <Button variant="tertiary" size="sm" icon="ok" onClick={() => void act(`/comments/${c.id}/resolve`, { method: 'POST' }, 'Marked as resolved.')}>
                          Resolve
                        </Button>
                      )}
                      {c.canPin && (
                        <Button
                          variant="tertiary"
                          size="sm"
                          icon="pin"
                          onClick={() => void act(`/comments/${c.id}`, { method: 'PATCH', body: { pinned: !c.pinned } }, c.pinned ? 'Unpinned.' : 'Pinned to the top of the lead.')}
                        >
                          {c.pinned ? 'Unpin' : 'Pin'}
                        </Button>
                      )}
                      {c.canDelete && (
                        <Button variant="tertiary" size="sm" icon="trash" className="text-down!" onClick={() => void act(`/comments/${c.id}`, { method: 'DELETE' }, 'Deleted.')}>
                          Delete
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {/* Composer */}
      <div className="flex flex-col gap-2 rounded-2xl border border-field-border bg-field p-3 focus-within:border-primary focus-within:ring-3 focus-within:ring-focus/25">
        <label htmlFor="team-note" className="sr-only">
          Write to your team
        </label>
        <textarea
          id="team-note"
          rows={2}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Write to your team…"
          className="min-h-12 w-full resize-none bg-transparent text-body-md outline-none placeholder:text-field-placeholder"
        />
        {(people.data?.length ?? 0) > 0 && (focused || body) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-caption text-muted">Mention</span>
            {people.data!.map((person) => {
              const on = mentioned.some((m) => m.id === person.id)
              return (
                <button
                  key={person.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleMention(person)}
                  className={cn(
                    'pressable inline-flex h-8 items-center gap-1 rounded-pill px-3 text-caption-strong',
                    on ? 'bg-primary text-on-primary' : 'bg-default text-ink hover:bg-default-hover',
                  )}
                >
                  <Icon name="mention" size={12} />
                  {person.name}
                </button>
              )
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canAskHelp && (
            <Button
              variant="danger-soft"
              size="sm"
              icon="help"
              disabled={!body.trim() || busy}
              onClick={() => void send('help')}
              title="Sends this to your campaign's sales managers"
            >
              Ask for help
            </Button>
          )}
          <Button size="sm" icon="send" loading={busy} disabled={!body.trim()} onClick={() => void send('comment')}>
            Send
          </Button>
        </div>
      </div>
    </section>
  )
}

/** The pinned note (a handover, or anything a manager pinned), shown at the top of the lead. */
export function PinnedNote({ lead }: { lead: LeadDetail }) {
  const pin = lead.pinnedComment
  if (!pin) return null
  return (
    <div className="flex gap-3 rounded-2xl bg-warning-soft px-4 py-3">
      <Icon name="pin" filled size={18} className="mt-0.5 flex-none text-ink" />
      <div className="min-w-0">
        <p className="text-body-md break-words whitespace-pre-line text-ink">{pin.body}</p>
        <p className="mt-0.5 text-caption text-body">
          {pin.user.name} · {ago(pin.createdAt)}
        </p>
      </div>
    </div>
  )
}
