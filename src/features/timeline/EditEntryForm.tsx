import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { TextAreaField } from '@/components/ui/Field'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { NEXT_DATE_MAX, NEXT_DATE_MIN, NOTE_MIN } from '@/features/leads/rules'
import { ApiError, apiWithMessage } from '@/lib/api'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import type { Entry, EntrySaveResult } from '@/lib/types'
import { invalidateTimelines } from './queries'

const schema = z.object({
  note: z.string().trim().min(NOTE_MIN, `Write at least ${NOTE_MIN} characters.`).max(2000),
  nextFollowUpDate: z.string(),
})
type Values = z.input<typeof schema>

/**
 * Same-day edit of an entry's note and next date; photo, GPS and time never change
 * (PRD §5.7, §5.11). Status changes only take a note.
 */
export function EditEntryForm({ entry, open, onOpenChange }: { entry: Entry; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const isFollowUp = entry.entryType === 'follow_up'
  const defaults = (): Values => ({ note: entry.note ?? '', nextFollowUpDate: entry.nextFollowUpDate ?? '' })
  const { register, control, handleSubmit, formState, reset, setError } = useForm<Values>({ resolver: zodResolver(schema), mode: 'onBlur', defaultValues: defaults() })

  useEffect(() => {
    if (open) reset(defaults())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onSubmit = handleSubmit(async (v) => {
    const body: Record<string, string | null> = {}
    if (formState.dirtyFields.note) body.note = v.note.trim()
    if (isFollowUp && formState.dirtyFields.nextFollowUpDate) {
      if (v.nextFollowUpDate && v.nextFollowUpDate < NEXT_DATE_MIN()) return setError('nextFollowUpDate', { message: 'The next follow-up date cannot be in the past.' })
      body.nextFollowUpDate = v.nextFollowUpDate || null
    }
    if (Object.keys(body).length === 0) return onOpenChange(false)
    try {
      const { message } = await apiWithMessage<EntrySaveResult>(`/entries/${entry.id}`, { method: 'PATCH', body })
      haptic.success()
      toast.success(message)
      invalidateTimelines(qc, entry.id)
      onOpenChange(false)
    } catch (err) {
      // Locked at midnight IST: close and refresh so the entry stops offering Edit.
      if (err instanceof ApiError && err.code === 'ENTRY_LOCKED') {
        haptic.error()
        toast.error(err.message)
        invalidateTimelines(qc, entry.id)
        onOpenChange(false)
        return
      }
      handleFormError(err, setError, ['note', 'nextFollowUpDate'])
    }
  })

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Edit follow-up"
      description="You can change the note and next date until midnight."
      variant="short"
      dirty={formState.isDirty && !formState.isSubmitting}
      footer={
        <Button type="submit" form="edit-entry" size="lg" block loading={formState.isSubmitting}>
          Save changes
        </Button>
      }
    >
      <form id="edit-entry" onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pt-1">
        <TextAreaField label="Note" error={formState.errors.note?.message} {...register('note')} />
        {isFollowUp && (
          <Controller
            control={control}
            name="nextFollowUpDate"
            render={({ field }) => (
              <DatePicker
                label="Next follow-up"
                optional
                min={NEXT_DATE_MIN()}
                max={NEXT_DATE_MAX()}
                value={field.value}
                onChange={field.onChange}
                error={formState.errors.nextFollowUpDate?.message}
              />
            )}
          />
        )}
      </form>
    </ResponsiveOverlay>
  )
}
