import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Choice'
import { DatePicker } from '@/components/ui/DatePicker'
import { FieldShell, TextAreaField, TextField } from '@/components/ui/Field'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { apiWithMessage } from '@/lib/api'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import { todayIST } from '@/lib/format'
import type { AppVersion } from '@/lib/types'
import { releaseDateToYmd, ymdToReleaseInstant } from './format'
import { invalidateVersions } from './queries'

const MAX_NOTE_BYTES = 512 * 1024

const schema = z.object({
  version: z
    .string()
    .trim()
    .regex(/^\d+\.\d+\.\d+$/, 'Use three numbers separated by dots, like 1.2.0.'),
  title: z.string().trim().max(120),
  tags: z.string().trim(),
  notes: z.string(),
  releasedOn: z.string().min(1, 'Choose a date.'),
  status: z.enum(['draft', 'published']),
  announce: z.enum(['announce', 'quiet']),
})
type Values = z.input<typeof schema>

const FIELDS = ['version', 'title', 'tags', 'notes', 'releasedAt', 'isPublished', 'notify'] as const

/** Add (no `version`) or edit a release. Super Admin only. */
export function VersionForm({ open, onOpenChange, version }: { open: boolean; onOpenChange: (o: boolean) => void; version?: AppVersion }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string>()
  const editing = !!version

  const defaults = (): Values => ({
    version: version?.version ?? '',
    title: version?.title ?? '',
    tags: version?.tags.join(', ') ?? '',
    notes: version?.notes ?? '',
    releasedOn: version ? releaseDateToYmd(version.releasedAt) : todayIST(),
    status: version?.isPublished ? 'published' : 'draft',
    announce: version && !version.notify ? 'quiet' : 'announce',
  })
  const { register, control, handleSubmit, formState, reset, setError } = useForm<Values>({ resolver: zodResolver(schema), mode: 'onBlur', defaultValues: defaults() })

  useEffect(() => {
    if (!open) return
    reset(defaults())
    setFile(null)
    setFileError(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, version?.id])

  const pickFile = (f: File | undefined) => {
    setFileError(undefined)
    if (!f) return setFile(null)
    if (!/\.(md|markdown|txt)$/i.test(f.name)) return setFileError('Choose a .md document.')
    if (f.size > MAX_NOTE_BYTES) return setFileError('The document must be 512 KB or smaller.')
    setFile(f)
  }

  const onSubmit = handleSubmit(async (v) => {
    if (!editing && !file && !v.notes.trim()) {
      setError('notes', { message: 'Write the note, or choose a .md document.' })
      return
    }
    const body = new FormData()
    body.append('version', v.version.trim())
    body.append('title', v.title.trim())
    body.append('tags', v.tags)
    // The file wins on the server; sending the text too would only be ignored.
    if (file) body.append('file', file)
    else body.append('notes', v.notes)
    body.append('releasedAt', ymdToReleaseInstant(v.releasedOn))
    body.append('isPublished', String(v.status === 'published'))
    body.append('notify', String(v.announce === 'announce'))

    try {
      await apiWithMessage<AppVersion>(version ? `/versions/${version.id}` : '/versions', { method: version ? 'PATCH' : 'POST', body })
      haptic.success()
      toast.success(editing ? 'Update saved.' : v.status === 'published' ? 'Update published.' : 'Update saved as a draft.')
      await invalidateVersions(qc)
      onOpenChange(false)
    } catch (err) {
      handleFormError(
        err,
        setError,
        FIELDS.filter((f) => f !== 'releasedAt' && f !== 'isPublished' && f !== 'notify'),
      )
    }
  })

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${version.version}` : 'New update'}
      variant="form"
      dirty={(formState.isDirty || !!file) && !formState.isSubmitting}
      footer={
        <Button type="submit" form="version-form" size="lg" block loading={formState.isSubmitting}>
          {editing ? 'Save changes' : 'Save update'}
        </Button>
      }
    >
      <form id="version-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pt-2">
        <TextField
          label="Version"
          placeholder="1.1.0"
          inputMode="decimal"
          autoCapitalize="none"
          enterKeyHint="next"
          error={formState.errors.version?.message}
          {...register('version')}
        />
        <TextField label="Title" optional placeholder="Add leads from a sheet, faster" enterKeyHint="next" error={formState.errors.title?.message} {...register('title')} />
        <TextField
          label="Tags"
          optional
          placeholder="Leads, Handovers"
          hint="What this update covers, separated by commas."
          error={formState.errors.tags?.message}
          {...register('tags')}
        />

        <TextAreaField
          label="Note"
          optional={editing}
          rows={8}
          placeholder="## Added, then - one line per change…"
          disabled={!!file}
          hint={file ? 'The note comes from the document below.' : undefined}
          error={formState.errors.notes?.message}
          {...register('notes')}
        />
        <FieldShell label="Or use a .md document" htmlFor="version-file" optional error={fileError} hint="Up to 512 KB. It replaces the note above.">
          <div className="flex items-center gap-3">
            <input
              id="version-file"
              ref={fileRef}
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              className="sr-only"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <Button type="button" variant="secondary" size="sm" icon="csv" onClick={() => fileRef.current?.click()}>
              {file ? 'Change document' : 'Choose document'}
            </Button>
            {file && (
              <>
                <span className="min-w-0 truncate text-body-sm text-body">{file.name}</span>
                <Button type="button" variant="secondary" size="sm" onClick={() => pickFile(undefined)}>
                  Remove
                </Button>
              </>
            )}
          </div>
        </FieldShell>

        <Controller
          control={control}
          name="releasedOn"
          render={({ field }) => <DatePicker label="Date" value={field.value} onChange={field.onChange} error={formState.errors.releasedOn?.message} />}
        />
        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <FieldShell label="Status" htmlFor="version-status" hint="A draft is seen only by you. Publish it to show it to everyone.">
              <div id="version-status">
                <Segmented
                  label="Status"
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: 'draft', label: 'Draft' },
                    { value: 'published', label: 'Published' },
                  ]}
                  className="w-full"
                />
              </div>
            </FieldShell>
          )}
        />
        <Controller
          control={control}
          name="announce"
          render={({ field }) => (
            <FieldShell label="Announcement" htmlFor="version-announce" hint="Quiet shows the version number but no pop-up.">
              <div id="version-announce">
                <Segmented
                  label="Announcement"
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: 'announce', label: 'Show pop-up' },
                    { value: 'quiet', label: 'Quiet' },
                  ]}
                  className="w-full"
                />
              </div>
            </FieldShell>
          )}
        />
      </form>
    </ResponsiveOverlay>
  )
}
