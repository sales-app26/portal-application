import { Controller, useWatch, type Control, type FieldErrors, type FieldValues, type Path, type UseFormRegister } from 'react-hook-form'
import { StatusChip } from '@/components/ui/Choice'
import { DatePicker } from '@/components/ui/DatePicker'
import { TextAreaField } from '@/components/ui/Field'
import { Picker } from '@/components/ui/Picker'
import { cn } from '@/lib/cn'
import { STATUS_DOT } from '@/lib/format'
import type { LeadStatus } from '@/lib/types'
import type { FollowUpValues } from './entrySchema'
import { LocationField } from './LocationField'
import { NEXT_DATE_MAX, NEXT_DATE_MIN, NOTE_MIN, nextDateRule, statusOptions } from './rules'

interface Props<T extends FieldValues> {
  projectId: string
  statuses: LeadStatus[]
  // Shared by forms with different extra fields; only the follow-up fields are touched here.
  control: Control<T>
  register: UseFormRegister<T>
  errors: FieldErrors<T>
  showLocation?: boolean
}

const n = <T extends FieldValues>(name: keyof FollowUpValues) => name as Path<T>

/** Status, note, next date, location: the body of every follow-up (PRD §5.6). */
export function FollowUpFields<T extends FieldValues>({ projectId, statuses, control, register, errors: allErrors, showLocation = true }: Props<T>) {
  const errors = allErrors as FieldErrors<FollowUpValues>
  const status = useWatch({ control, name: n<T>('status') }) as LeadStatus | null
  const note = (useWatch({ control, name: n<T>('note') }) as string | undefined) ?? ''
  const rule = nextDateRule(status)

  return (
    <>
      <Controller
        control={control}
        name={n<T>('status')}
        render={({ field }) => (
          <Picker
            label="Status"
            value={field.value as LeadStatus | null}
            onChange={field.onChange}
            options={statusOptions(statuses).map((o) => ({ ...o, leading: <span aria-hidden className={cn('size-2.5 flex-none rounded-full', STATUS_DOT[o.value])} /> }))}
            renderValue={(v) => <StatusChip status={v} />}
            placeholder="Choose a status"
            error={errors.status?.message}
          />
        )}
      />
      <TextAreaField
        label="Note"
        placeholder="What happened? What did the client say?"
        error={errors.note?.message}
        hint={note.trim().length < NOTE_MIN ? `At least ${NOTE_MIN} characters.` : undefined}
        value={note}
        {...register(n<T>('note'))}
      />
      {rule !== 'hidden' && (
        <Controller
          control={control}
          name={n<T>('nextFollowUpDate')}
          render={({ field }) => (
            <DatePicker
              label="Next follow-up"
              optional={rule === 'optional'}
              min={NEXT_DATE_MIN()}
              max={NEXT_DATE_MAX()}
              value={(field.value as string) ?? ''}
              onChange={field.onChange}
              error={errors.nextFollowUpDate?.message}
            />
          )}
        />
      )}
      {showLocation && (
        <Controller
          control={control}
          name={n<T>('location')}
          render={({ field }) => <LocationField projectId={projectId} value={(field.value as string) ?? ''} onChange={field.onChange} onBlur={field.onBlur} error={errors.location?.message} />}
        />
      )}
    </>
  )
}
