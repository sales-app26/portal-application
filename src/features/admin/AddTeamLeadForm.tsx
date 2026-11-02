import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Display'
import { TextAreaField, TextField } from '@/components/ui/Field'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { Picker } from '@/components/ui/Picker'
import { LocationField } from '@/features/leads/LocationField'
import { invalidateLeadData } from '@/features/leads/queries'
import { SourceChoice } from '@/features/leads/SourceChoice'
import { settleOverlays } from '@/hooks/useOverlayHistory'
import { ApiError, apiWithMessage } from '@/lib/api'
import { normalizePhone, ROLE_LABEL } from '@/lib/format'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import type { LeadDetail, LeadSource, Project } from '@/lib/types'
import { invalidateProjects, useProjectMembers } from './queries'

const NOT_ASSIGNED = 'not-assigned'

const schema = z.object({
  businessName: z.string().trim().min(1, 'Enter the shop or business name.').max(160),
  name: z.string().trim().max(120),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || normalizePhone(v) !== null, 'Enter a 10-digit Indian mobile number.'),
  location: z.string().trim().min(2, 'Enter the area, at least 2 letters.').max(100),
  notes: z.string().trim().max(2000),
  source: z.string().nullable(),
  ownerId: z.string(),
})
type Values = z.input<typeof schema>

const EMPTY: Values = { businessName: '', name: '', phone: '', location: '', notes: '', source: null, ownerId: NOT_ASSIGNED }

/**
 * The sales head adds one lead by hand, as one row of a sheet would be: New, with no follow-up
 * and no visit photo, because nobody has been there yet. It goes to someone on the team, or
 * waits under Not assigned, where reps can also take it from Open leads.
 */
export function AddTeamLeadForm({ open, onOpenChange, project }: { open: boolean; onOpenChange: (o: boolean) => void; project: Project }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const members = useProjectMembers(project.id)
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null)
  const { register, control, handleSubmit, formState, reset, setError } = useForm<Values>({ resolver: zodResolver(schema), mode: 'onBlur', defaultValues: EMPTY })

  useEffect(() => {
    if (!open) return
    reset(EMPTY)
    setDuplicateOf(null)
  }, [open, reset])

  const people = (members.data ?? []).filter((m) => m.isActive && m.userIsActive && m.role !== 'super_admin')

  const onSubmit = handleSubmit(async (v) => {
    setDuplicateOf(null)
    const owner = people.find((m) => m.userId === v.ownerId)
    try {
      const { message } = await apiWithMessage<LeadDetail>(`/projects/${project.id}/leads/add`, {
        method: 'POST',
        body: {
          businessName: v.businessName.trim(),
          name: v.name.trim() || undefined,
          phone: v.phone.trim() ? (normalizePhone(v.phone) ?? v.phone) : undefined,
          location: v.location.trim().replace(/\s+/g, ' '),
          notes: v.notes.trim() || undefined,
          source: v.source ?? undefined,
          ownerId: owner?.userId,
        },
      })
      haptic.success()
      toast.success(owner ? `${message} Assigned to ${owner.name}.` : `${message} It’s under Not assigned.`)
      invalidateLeadData(qc)
      invalidateProjects(qc)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_LEAD_OTHER') {
        haptic.error()
        setError(v.phone.trim() ? 'phone' : 'businessName', { message: err.message })
        setDuplicateOf(err.details?.leadId ? String(err.details.leadId) : null)
        return
      }
      handleFormError(err, setError, ['businessName', 'name', 'phone', 'location', 'notes', 'source', 'ownerId'])
    }
  })

  const openDuplicate = async () => {
    // Close the sheet and let its history entry go before navigating, or the two collide.
    onOpenChange(false)
    await settleOverlays()
    navigate(`/leads/${duplicateOf}`, { viewTransition: true })
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Add lead"
      description="No visit photo needed. It starts as New."
      variant="form"
      dirty={formState.isDirty && !formState.isSubmitting}
      footer={
        <Button type="submit" form="add-team-lead" size="lg" block loading={formState.isSubmitting}>
          Add lead
        </Button>
      }
    >
      <form id="add-team-lead" onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pt-2">
        <TextField label="Shop or business name" autoComplete="organization" autoCapitalize="words" enterKeyHint="next" error={formState.errors.businessName?.message} {...register('businessName')} />
        <TextField label="Owner or manager name" optional autoComplete="off" autoCapitalize="words" enterKeyHint="next" error={formState.errors.name?.message} {...register('name')} />
        <TextField label="Phone" optional type="tel" inputMode="tel" autoComplete="off" prefix="+91" enterKeyHint="next" error={formState.errors.phone?.message} {...register('phone')} />
        {duplicateOf && (
          <button type="button" className="-mt-3 self-start text-body-sm font-semibold text-primary" onClick={() => void openDuplicate()}>
            Open that lead
          </button>
        )}
        <Controller
          control={control}
          name="location"
          render={({ field }) => <LocationField projectId={project.id} value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={formState.errors.location?.message} />}
        />
        <Controller
          control={control}
          name="ownerId"
          render={({ field }) => (
            <Picker
              label="Assign to"
              value={field.value}
              onChange={field.onChange}
              error={formState.errors.ownerId?.message}
              hint={field.value === NOT_ASSIGNED ? 'Reps on this campaign can take it from Open leads.' : 'They get a notification.'}
              options={[
                { value: NOT_ASSIGNED, label: 'Not assigned', description: 'Hand it out later' },
                ...people.map((m) => ({ value: m.userId, label: m.name, description: ROLE_LABEL[m.role], leading: <Avatar name={m.name} size={36} /> })),
              ]}
            />
          )}
        />
        <TextAreaField label="About the client" optional placeholder="Anything worth remembering" error={formState.errors.notes?.message} {...register('notes')} />
        <Controller control={control} name="source" render={({ field }) => <SourceChoice value={(field.value as LeadSource | null) ?? null} onChange={field.onChange} />} />
      </form>
    </ResponsiveOverlay>
  )
}
