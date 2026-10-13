import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/Display'
import { TextAreaField, TextField } from '@/components/ui/Field'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Icon } from '@/icons'
import { apiWithMessage } from '@/lib/api'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import type { MessageTemplate } from '@/lib/types'
import { teamKeys, useTemplates } from './queries'

/**
 * The project's WhatsApp messages, written once by the manager so every rep sends the same
 * approved wording. {client}, {rep} and {business} are filled in per lead.
 */
export function TemplatesManager({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const list = useTemplates(projectId)
  const [editing, setEditing] = useState<MessageTemplate | 'new' | null>(null)
  const templates = list.data ?? []

  const remove = async (t: MessageTemplate) => {
    try {
      await apiWithMessage(`/templates/${t.id}`, { method: 'DELETE' })
      toast.success('Message removed.')
      void qc.invalidateQueries({ queryKey: teamKeys.templates(projectId) })
    } catch (err) {
      handleFormError(err)
    }
  }

  return (
    <section className="flex flex-col gap-4 expanded:max-w-[900px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-body-sm text-body">
          Ready WhatsApp messages your team picks from. Use <code className="rounded-md bg-default px-1">{'{client}'}</code>,{' '}
          <code className="rounded-md bg-default px-1">{'{rep}'}</code> and <code className="rounded-md bg-default px-1">{'{business}'}</code>; they're filled in for each lead.
          With none here, our standard messages are used.
        </p>
        {canEdit && (
          <Button icon="plus-math" onClick={() => setEditing('new')}>
            Add message
          </Button>
        )}
      </div>
      {list.isLoading ? (
        <ListSkeleton rows={3} />
      ) : list.isError ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : templates.length === 0 ? (
        <EmptyState
          icon="templates"
          title="Using our standard messages"
          body="Add your own: a pricing message, the demo link, your brochure."
          className="card card--default rounded-2xl"
        />
      ) : (
        <ul className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
          {templates.map((t) => (
            <li key={t.id} className="flex items-start gap-3 border-b border-separator px-4 py-3.5 last:border-b-0">
              <span className="flex size-9 flex-none items-center justify-center rounded-full bg-[#25d366]/12 text-[#128c4a] dark:text-[#3ddc84]">
                <Icon name="templates" size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-title-sm">{t.label}</span>
                <span className="line-clamp-3 block text-body-sm whitespace-pre-line text-body">{t.body}</span>
              </span>
              {canEdit && (
                <ActionMenu
                  title={t.label}
                  items={[
                    { label: 'Edit', icon: 'edit', onSelect: () => setEditing(t) },
                    { label: 'Remove', icon: 'trash', onSelect: () => void remove(t) },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <TemplateForm projectId={projectId} template={editing === 'new' ? null : editing} nextSort={templates.length} onClose={() => setEditing(null)} />}
    </section>
  )
}

function TemplateForm({ projectId, template, nextSort, onClose }: { projectId: string; template: MessageTemplate | null; nextSort: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [label, setLabel] = useState(template?.label ?? '')
  const [body, setBody] = useState(template?.body ?? 'Hi {client}, this is {rep} from Pronttera. ')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      await apiWithMessage(template ? `/templates/${template.id}` : `/projects/${projectId}/templates`, {
        method: template ? 'PATCH' : 'POST',
        body: template ? { label: label.trim(), body: body.trim() } : { label: label.trim(), body: body.trim(), sort: nextSort },
      })
      haptic.success()
      toast.success(template ? 'Message updated.' : 'Message added. Your team sees it in WhatsApp now.')
      void qc.invalidateQueries({ queryKey: teamKeys.templates(projectId) })
      onClose()
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ResponsiveOverlay
      open
      onOpenChange={(o) => !o && onClose()}
      title={template ? 'Edit message' : 'New message'}
      variant="form"
      dirty={label !== (template?.label ?? '') || body !== (template?.body ?? 'Hi {client}, this is {rep} from Pronttera. ')}
      footer={
        <Button size="lg" block loading={busy} disabled={!label.trim() || !body.trim()} onClick={() => void save()}>
          Save message
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        <TextField label="Name" placeholder="e.g. Pricing" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} />
        <TextAreaField label="Message" maxLength={1000} hint="{client}, {rep} and {business} are filled in for each lead." value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
    </ResponsiveOverlay>
  )
}
