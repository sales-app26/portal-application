import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useMe } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Display'
import { TextAreaField, TextField } from '@/components/ui/Field'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { Picker } from '@/components/ui/Picker'
import { ApiError, apiWithMessage } from '@/lib/api'
import { formatPhone, normalizePhone } from '@/lib/format'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import type { EntrySaveResult, LeadDetail } from '@/lib/types'
import { checkNextDate, followUpSchema, followUpShape, type FollowUpValues } from './entrySchema'
import { FollowUpFields } from './FollowUpFields'
import { LocationField } from './LocationField'
import { invalidateLeadData, leadKeys, useMembers } from './queries'
import { changeStatuses, followUpStatuses, nextDateRule } from './rules'
import { entryBody, VisitProofField, type VisitProof } from './VisitProof'

interface FormProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  lead: LeadDetail
}

/** Errors that mean the lead changed under us: close the form and refresh the lead. */
const STALE = new Set(['LEAD_TRANSFERRED', 'PROJECT_CLOSED', 'NOT_FOUND'])

function useSaveHelpers(lead: LeadDetail, onOpenChange: (o: boolean) => void) {
  const qc = useQueryClient()
  return {
    done(message: string, result?: EntrySaveResult) {
      haptic.success()
      toast.success(message)
      invalidateLeadData(qc, lead.id)
      if (result) void qc.invalidateQueries({ queryKey: leadKeys.entries(lead.id) })
      onOpenChange(false)
    },
    stale(err: unknown) {
      if (err instanceof ApiError && STALE.has(err.code)) {
        haptic.error()
        toast.error(err.message)
        invalidateLeadData(qc, lead.id)
        onOpenChange(false)
        return true
      }
      return false
    },
  }
}

// ---------------------------------------------------------------- log follow-up

export function LogFollowUpForm({ open, onOpenChange, lead }: FormProps) {
  const doorToDoor = lead.project.type === 'door_to_door'
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [proof, setProof] = useState<VisitProof | null>(null)
  const [proofError, setProofError] = useState<string>()
  const helpers = useSaveHelpers(lead, onOpenChange)
  const statuses = followUpStatuses(lead.status)

  // Preselect where the lead stands (New becomes Contacted: logging a follow-up means contact).
  const defaults = (): FollowUpValues => ({
    status: lead.status === 'new' ? 'contacted' : lead.status,
    note: '',
    nextFollowUpDate: '',
    location: lead.location.name,
  })
  const { register, control, handleSubmit, formState, reset, setError } = useForm<FollowUpValues>({ resolver: zodResolver(followUpSchema), mode: 'onBlur', defaultValues: defaults() })

  useEffect(() => {
    if (!open) return
    reset(defaults())
    setRequestId(crypto.randomUUID())
    setProof(null)
    setProofError(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onSubmit = handleSubmit(async (v) => {
    if (doorToDoor && !proof) {
      setProofError('Take a photo of the visit to save it.')
      haptic.error()
      return
    }
    try {
      const fields = {
        clientRequestId: requestId,
        status: v.status ?? undefined,
        note: v.note.trim(),
        nextFollowUpDate: nextDateRule(v.status) === 'hidden' ? undefined : v.nextFollowUpDate || undefined,
        location: v.location.trim().replace(/\s+/g, ' '),
      }
      const { data, message } = await apiWithMessage<EntrySaveResult>(`/leads/${lead.id}/follow-ups`, { method: 'POST', body: entryBody(fields, doorToDoor ? proof : null) })
      helpers.done(message, data)
    } catch (err) {
      if (helpers.stale(err)) return
      if (err instanceof ApiError && (err.code === 'CAPTURE_EXPIRED' || err.code === 'VISIT_PROOF_REQUIRED')) {
        setProof(null)
        setProofError(err.message)
        haptic.error()
        return
      }
      handleFormError(err, setError, ['status', 'note', 'nextFollowUpDate', 'location'])
    }
  })

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Log follow-up"
      description={lead.businessName ? `${lead.name} · ${lead.businessName}` : lead.name}
      variant="form"
      dirty={(formState.isDirty || !!proof) && !formState.isSubmitting}
      footer={
        <Button type="submit" form="log-follow-up" size="lg" block loading={formState.isSubmitting}>
          Save follow-up
        </Button>
      }
    >
      <form id="log-follow-up" onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pt-2">
        {doorToDoor && (
          <div className="flex flex-col gap-1.5">
            <VisitProofField value={proof} onChange={(p) => (setProof(p), setProofError(undefined))} error={proofError} />
            {proofError && <p className="text-caption text-down">{proofError}</p>}
          </div>
        )}
        {lead.status === 'converted' && <p className="rounded-md bg-surface-strong px-4 py-3 text-body-sm">This lead is converted. The status stays Converted unless your moderator changes it.</p>}
        <FollowUpFields projectId={lead.projectId} statuses={statuses} control={control} register={register} errors={formState.errors} />
      </form>
    </ResponsiveOverlay>
  )
}

// ---------------------------------------------------------------- change status

const changeSchema = z
  .object({ status: followUpShape.status, note: followUpShape.note, nextFollowUpDate: z.string() })
  .superRefine(checkNextDate)
type ChangeValues = z.input<typeof changeSchema>

/** Manual status change without a visit: no photo, reason required (PRD §5.9). */
export function ChangeStatusForm({ open, onOpenChange, lead }: FormProps) {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const helpers = useSaveHelpers(lead, onOpenChange)
  const statuses = changeStatuses(lead.status, lead.permissions.canLeaveConverted)
  const { register, control, handleSubmit, formState, reset, setError } = useForm<ChangeValues>({
    resolver: zodResolver(changeSchema),
    mode: 'onBlur',
    defaultValues: { status: null, note: '', nextFollowUpDate: '' },
  })

  useEffect(() => {
    if (!open) return
    reset({ status: null, note: '', nextFollowUpDate: '' })
    setRequestId(crypto.randomUUID())
  }, [open, reset])

  const onSubmit = handleSubmit(async (v) => {
    try {
      const { data, message } = await apiWithMessage<EntrySaveResult>(`/leads/${lead.id}/status`, {
        method: 'POST',
        body: {
          clientRequestId: requestId,
          status: v.status,
          note: v.note.trim(),
          ...(nextDateRule(v.status) !== 'hidden' && v.nextFollowUpDate ? { nextFollowUpDate: v.nextFollowUpDate } : {}),
        },
      })
      helpers.done(message, data)
    } catch (err) {
      if (helpers.stale(err)) return
      handleFormError(err, setError, ['status', 'note', 'nextFollowUpDate'])
    }
  })

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Change status"
      variant="short"
      dirty={formState.isDirty && !formState.isSubmitting}
      footer={
        <Button type="submit" form="change-status" size="lg" block loading={formState.isSubmitting} disabled={statuses.length === 0}>
          Change status
        </Button>
      }
    >
      {statuses.length === 0 ? (
        <p className="text-body-md text-body">Ask your moderator to change this.</p>
      ) : (
        <form id="change-status" onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pt-1">
          <FollowUpFields projectId={lead.projectId} statuses={statuses} control={control} register={register} errors={formState.errors} showLocation={false} />
        </form>
      )}
    </ResponsiveOverlay>
  )
}

// ---------------------------------------------------------------- edit lead

const editSchema = z.object({
  name: z.string().trim().min(1, 'Enter the client name.').max(120),
  businessName: z.string().trim().max(160),
  phone: z.string().trim().refine((v) => normalizePhone(v) !== null, 'Enter a 10-digit Indian mobile number.'),
  notes: z.string().trim().max(2000),
  location: followUpShape.location,
})
type EditValues = z.input<typeof editSchema>

export function EditLeadForm({ open, onOpenChange, lead }: FormProps) {
  const qc = useQueryClient()
  const defaults = (): EditValues => ({
    name: lead.name,
    businessName: lead.businessName ?? '',
    phone: formatPhone(lead.phone),
    notes: lead.notes ?? '',
    location: lead.location.name,
  })
  const { register, control, handleSubmit, formState, reset, setError } = useForm<EditValues>({ resolver: zodResolver(editSchema), mode: 'onBlur', defaultValues: defaults() })

  useEffect(() => {
    if (open) reset(defaults())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onSubmit = handleSubmit(async (v) => {
    // Only changed fields: the API re-checks the phone for duplicates when it is sent.
    const body: Record<string, string | null> = {}
    const d = formState.dirtyFields
    if (d.name) body.name = v.name.trim()
    if (d.businessName) body.businessName = v.businessName.trim() || null
    if (d.phone) body.phone = normalizePhone(v.phone) ?? v.phone
    if (d.notes) body.notes = v.notes.trim() || null
    if (d.location) body.location = v.location.trim().replace(/\s+/g, ' ')
    if (Object.keys(body).length === 0) return onOpenChange(false)
    try {
      const { data } = await apiWithMessage<LeadDetail>(`/leads/${lead.id}`, { method: 'PATCH', body })
      qc.setQueryData(leadKeys.detail(lead.id), data)
      invalidateLeadData(qc)
      haptic.success()
      toast.success('Lead updated.')
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'DUPLICATE_LEAD_OWN' || err.code === 'DUPLICATE_LEAD_OTHER')) {
        setError('phone', { message: err.message })
        haptic.error()
        return
      }
      handleFormError(err, setError, ['name', 'businessName', 'phone', 'notes', 'location'])
    }
  })

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Edit lead"
      variant="form"
      dirty={formState.isDirty && !formState.isSubmitting}
      footer={
        <Button type="submit" form="edit-lead" size="lg" block loading={formState.isSubmitting}>
          Save changes
        </Button>
      }
    >
      <form id="edit-lead" onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pt-2">
        <TextField label="Name" autoCapitalize="words" error={formState.errors.name?.message} {...register('name')} />
        <TextField label="Business name" optional autoCapitalize="words" error={formState.errors.businessName?.message} {...register('businessName')} />
        <TextField label="Phone" type="tel" inputMode="tel" prefix="+91" error={formState.errors.phone?.message} {...register('phone')} />
        <Controller
          control={control}
          name="location"
          render={({ field }) => <LocationField projectId={lead.projectId} value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={formState.errors.location?.message} />}
        />
        <TextAreaField label="About the client" optional error={formState.errors.notes?.message} {...register('notes')} />
      </form>
    </ResponsiveOverlay>
  )
}

// ---------------------------------------------------------------- request transfer

const transferSchema = z.object({
  toUserId: z.string().nullable().refine((v) => !!v, 'Choose who should get this lead.'),
  reason: z.string().trim().min(1, 'Give a reason.').max(500),
})
type TransferValues = z.input<typeof transferSchema>

/** Owner asks to move a lead; an admin approves (PRD §5.10). */
export function RequestTransferForm({ open, onOpenChange, lead }: FormProps) {
  const me = useMe()
  const helpers = useSaveHelpers(lead, onOpenChange)
  const members = useMembers(lead.projectId, open)
  const candidates = (members.data ?? []).filter((m) => m.isActive && m.userIsActive && m.userId !== lead.owner.id && m.userId !== me.id)
  const { register, control, handleSubmit, formState, reset, setError } = useForm<TransferValues>({
    resolver: zodResolver(transferSchema),
    mode: 'onBlur',
    defaultValues: { toUserId: null, reason: '' },
  })

  useEffect(() => {
    if (open) reset({ toUserId: null, reason: '' })
  }, [open, reset])

  const onSubmit = handleSubmit(async (v) => {
    try {
      const { message } = await apiWithMessage(`/leads/${lead.id}/transfers`, { method: 'POST', body: { toUserId: v.toUserId, reason: v.reason.trim() } })
      helpers.done(message)
    } catch (err) {
      if (helpers.stale(err)) return
      handleFormError(err, setError, ['toUserId', 'reason'])
    }
  })

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Request transfer"
      description="The lead moves once an admin approves."
      variant="short"
      dirty={formState.isDirty && !formState.isSubmitting}
      footer={
        <Button type="submit" form="request-transfer" size="lg" block loading={formState.isSubmitting} disabled={!members.isLoading && candidates.length === 0}>
          Request transfer
        </Button>
      }
    >
      <form id="request-transfer" onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pt-1">
        {!members.isLoading && candidates.length === 0 ? (
          <p className="text-body-md text-body">There's no one else in this project to transfer to.</p>
        ) : (
          <Controller
            control={control}
            name="toUserId"
            render={({ field }) => (
              <Picker
                label="Transfer to"
                value={field.value}
                onChange={field.onChange}
                placeholder={members.isLoading ? 'Loading members…' : 'Choose a person'}
                error={formState.errors.toUserId?.message}
                options={candidates.map((m) => ({ value: m.userId, label: m.name, leading: <Avatar name={m.name} size={32} /> }))}
              />
            )}
          />
        )}
        <TextAreaField label="Reason" placeholder="Why should this lead move?" error={formState.errors.reason?.message} {...register('reason')} />
      </form>
    </ResponsiveOverlay>
  )
}
