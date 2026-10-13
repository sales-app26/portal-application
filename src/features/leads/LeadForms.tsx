import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useMe } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Display'
import { TextAreaField, TextField } from '@/components/ui/Field'
import { Confirm, ResponsiveOverlay } from '@/components/ui/Overlay'
import { StatusChip } from '@/components/ui/Choice'
import { useOffers } from '@/features/pricing/queries'
import { Icon } from '@/icons'
import { dealSentence, PLAN_LABEL } from '@/lib/deal'
import { Picker } from '@/components/ui/Picker'
import { ApiError, apiWithMessage } from '@/lib/api'
import { formatPhone, normalizePhone, relativeDay } from '@/lib/format'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import type { EntrySaveResult, LeadDetail, LeadSource } from '@/lib/types'
import { checkDeal, checkNextDate, dealBody, dealDefaults, dealShape, followUpSchema, followUpShape, outcomeBody, type FollowUpValues } from './entrySchema'
import { DealFields } from './DealFields'
import { SourceChoice } from './SourceChoice'
import { FollowUpFields } from './FollowUpFields'
import { LocationField } from './LocationField'
import { invalidateLeadData, leadKeys, useMembers } from './queries'
import { changeStatuses, followUpStatuses, nextDateRule } from './rules'
import { entryBody, ProofCountdown, VisitProofField, type VisitProof } from './VisitProof'

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
      // A new conversion is the moment the whole job is about: say so.
      if (result?.lead.status === 'converted' && lead.status !== 'converted') {
        haptic.celebrate()
        toast.success('Won! 🎉 Great work, it counts toward your target.', { duration: 6000 })
      } else {
        haptic.success()
        toast.success(message)
      }
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
  // What the rep is about to save, shown back before it goes into the history for good.
  const [pending, setPending] = useState<FollowUpValues | null>(null)
  const [saving, setSaving] = useState(false)
  const sendDeal = useRef(true)
  const helpers = useSaveHelpers(lead, onOpenChange)
  const statuses = followUpStatuses(lead.status)

  // Preselect where the lead stands (New becomes Contacted: logging a follow-up means contact).
  const defaults = (): FollowUpValues => ({
    status: lead.status === 'new' ? 'contacted' : lead.status,
    note: '',
    nextFollowUpDate: '',
    location: lead.location.name,
    reason: null,
    // An expected deal set earlier carries into "Mark as won".
    ...dealDefaults(lead),
  })
  const { register, control, handleSubmit, formState, reset, setError } = useForm<FollowUpValues>({
    resolver: zodResolver(followUpSchema),
    mode: 'onBlur',
    defaultValues: defaults(),
  })

  useEffect(() => {
    if (!open) return
    reset(defaults())
    setRequestId(crypto.randomUUID())
    setProof(null)
    setProofError(undefined)
    setPending(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // The photo's 10 minutes ran out while the rep was reading the summary: back to the form to retake it.
  useEffect(() => {
    if (pending && doorToDoor && !proof && !saving) {
      setPending(null)
      setProofError('The photo was taken more than 10 minutes ago. Take it again.')
      haptic.error()
    }
  }, [pending, doorToDoor, proof, saving])

  // Tapping Save checks the form, then asks for a last look.
  const onSubmit = handleSubmit((v) => {
    if (doorToDoor && !proof) {
      setProofError('Take a photo of the visit to save it.')
      haptic.error()
      return
    }
    // An after-sale visit on a won lead resends the deal only if the rep changed it, so an
    // old deal (its free-text plan included) is never rewritten by a visit.
    sendDeal.current = lead.status !== 'converted' || DEAL_FORM_FIELDS.some((k) => formState.dirtyFields[k])
    setPending(v)
  })

  const save = async () => {
    const v = pending
    if (!v) return
    setSaving(true)
    try {
      const fields = {
        clientRequestId: requestId,
        status: v.status ?? undefined,
        note: v.note.trim(),
        nextFollowUpDate: nextDateRule(v.status) === 'hidden' ? undefined : v.nextFollowUpDate || undefined,
        location: v.location.trim().replace(/\s+/g, ' '),
        ...outcomeBody(v, { dealAlways: false, withDeal: sendDeal.current }),
      }
      const { data, message } = await apiWithMessage<EntrySaveResult>(`/leads/${lead.id}/follow-ups`, { method: 'POST', body: entryBody(fields, doorToDoor ? proof : null) })
      setPending(null)
      helpers.done(message, data)
    } catch (err) {
      setPending(null)
      if (helpers.stale(err)) return
      if (err instanceof ApiError && (err.code === 'CAPTURE_EXPIRED' || err.code === 'VISIT_PROOF_REQUIRED')) {
        setProof(null)
        setProofError(err.message)
        haptic.error()
        return
      }
      handleFormError(err, setError, ['status', 'note', 'nextFollowUpDate', 'location', 'reason', ...DEAL_FIELDS])
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Log follow-up"
      description={lead.businessName ? `${lead.name} · ${lead.businessName}` : lead.name}
      variant="form"
      dirty={(formState.isDirty || !!proof) && !saving}
      footer={
        <Button type="submit" form="log-follow-up" size="lg" block loading={saving}>
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
        {lead.status === 'converted' && (
          <p className="rounded-md bg-surface-strong px-4 py-3 text-body-sm">This lead is won. The status stays Won unless your sales manager changes it.</p>
        )}
        <FollowUpFields projectId={lead.projectId} statuses={statuses} control={control} register={register} errors={formState.errors} dealLead={lead} />
      </form>
      <Confirm
        open={!!pending}
        onOpenChange={(o) => !o && !saving && setPending(null)}
        title="Save this follow-up?"
        confirmLabel="Save follow-up"
        cancelLabel="Go back"
        loading={saving}
        onConfirm={save}
        body={pending && <FollowUpSummary values={pending} lead={lead} proof={doorToDoor ? proof : null} />}
      />
    </ResponsiveOverlay>
  )
}

const NOTE_PREVIEW = 80

/**
 * What the save will record, and what can't be changed after it. The rule is the API's: the
 * author edits the note and next date until midnight India time; the stage, photo and time never;
 * and once won, only a sales manager moves the lead to another stage.
 */
function FollowUpSummary({ values, lead, proof }: { values: FollowUpValues; lead: LeadDetail; proof: VisitProof | null }) {
  const status = values.status
  const note = values.note.trim()
  const won = status === 'converted'
  const newlyWon = won && lead.status !== 'converted'
  const offerById = useOfferById(lead)
  const deal = won ? dealBody(values) : null
  const offer = offerById(deal?.offerId)
  const dealLine =
    deal && (deal.planCode || deal.dealValue != null)
      ? [
          deal.planCode ? PLAN_LABEL[deal.planCode] : null,
          dealSentence(
            deal.planCode ?? null,
            {
              price: deal.dealValue ?? null,
              tenure: deal.dealTenureMonths ?? null,
              discountType: offer?.discountType ?? deal.discountType ?? null,
              discountValue: offer?.discountValue ?? deal.discountValue ?? null,
            },
            offer ? offer.couponCode : deal.couponCode,
          ),
        ]
          .filter(Boolean)
          .join(' · ')
      : null
  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-2.5 rounded-xl bg-surface-secondary p-3">
        {status && (
          <SummaryRow label="Stage">
            <StatusChip status={status} size="sm" />
          </SummaryRow>
        )}
        {nextDateRule(status) !== 'hidden' && <SummaryRow label="Next follow-up">{values.nextFollowUpDate ? relativeDay(values.nextFollowUpDate) : 'None'}</SummaryRow>}
        <SummaryRow label="Note">“{note.length > NOTE_PREVIEW ? `${note.slice(0, NOTE_PREVIEW).trimEnd()}…` : note}”</SummaryRow>
        {proof && (
          <SummaryRow label="Photo">
            <span className="inline-flex flex-wrap items-center gap-1">
              <Icon name="checkmark" size={16} className="text-up" /> Visit photo attached · <ProofCountdown proof={proof} />
            </span>
          </SummaryRow>
        )}
        {dealLine && <SummaryRow label="Deal">{dealLine}</SummaryRow>}
      </dl>
      <p className="text-body-sm text-body">
        {newlyWon
          ? lead.permissions.canLeaveConverted
            ? 'Once won, the lead stays Won until a sales manager changes the stage. You can still fix the deal from Edit lead.'
            : 'Once won, only your sales manager can move this lead to another stage. You can still fix the deal from Edit lead.'
          : `It goes into the lead’s history for good. You can fix the note${nextDateRule(status) !== 'hidden' ? ' and next follow-up date' : ''} until midnight today; the stage${proof ? ', photo' : ''} and time can’t be changed after saving.`}
      </p>
    </div>
  )
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-body-sm">
      <dt className="w-28 flex-none text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

/** The offer picked on the form: from today's offers, or the one the lead was already won on. */
function useOfferById(lead: LeadDetail) {
  const offers = useOffers('live')
  return (id: string | null | undefined) => {
    if (!id) return null
    const live = offers.data?.find((o) => o.id === id)
    if (live) return live
    if (lead.offer?.id === id && lead.discountType && lead.discountValue !== null) return { discountType: lead.discountType, discountValue: lead.discountValue, couponCode: lead.couponCode }
    return null
  }
}

// ---------------------------------------------------------------- change status

/** The deal's form fields, and the names the API reports field errors under. */
const DEAL_FORM_FIELDS = ['planCode', 'dealTenureMonths', 'dealValue', 'offerChoice', 'discountType', 'discountValue', 'couponCode'] as const
const DEAL_FIELDS = ['planCode', 'dealTenureMonths', 'dealValue', 'discountType', 'discountValue', 'couponCode'] as const

const changeSchema = z
  .object({
    status: followUpShape.status,
    note: followUpShape.note,
    nextFollowUpDate: z.string(),
    reason: followUpShape.reason,
    ...dealShape,
  })
  .superRefine((v, ctx) => {
    checkNextDate(v, ctx)
    if (v.status === 'converted') checkDeal(v, ctx)
  })
type ChangeValues = z.input<typeof changeSchema>

/** Manual status change without a visit: no photo, reason required (PRD §5.9). */
export function ChangeStatusForm({ open, onOpenChange, lead }: FormProps) {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const helpers = useSaveHelpers(lead, onOpenChange)
  const statuses = changeStatuses(lead.status, lead.permissions.canLeaveConverted)
  const { register, control, handleSubmit, formState, reset, setError } = useForm<ChangeValues>({
    resolver: zodResolver(changeSchema),
    mode: 'onBlur',
    defaultValues: { status: null, note: '', nextFollowUpDate: '', reason: null, ...dealDefaults(lead) },
  })

  useEffect(() => {
    if (!open) return
    reset({ status: null, note: '', nextFollowUpDate: '', reason: null, ...dealDefaults(lead) })
    setRequestId(crypto.randomUUID())
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          ...outcomeBody(v),
        },
      })
      helpers.done(message, data)
    } catch (err) {
      if (helpers.stale(err)) return
      handleFormError(err, setError, ['status', 'note', 'nextFollowUpDate', 'reason', ...DEAL_FIELDS])
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
        <p className="text-body-md text-body">Ask your sales manager to change this.</p>
      ) : (
        <form id="change-status" onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pt-1">
          <FollowUpFields projectId={lead.projectId} statuses={statuses} control={control} register={register} errors={formState.errors} showLocation={false} dealLead={lead} />
        </form>
      )}
    </ResponsiveOverlay>
  )
}

// ---------------------------------------------------------------- edit lead

const editSchema = z.object({
  name: z.string().trim().min(1, 'Enter the client name.').max(120),
  businessName: z.string().trim().max(160),
  phone: z
    .string()
    .trim()
    .refine((v) => normalizePhone(v) !== null, 'Enter a 10-digit Indian mobile number.'),
  notes: z.string().trim().max(2000),
  location: followUpShape.location,
  ...dealShape,
  source: z.string().nullable(),
}).superRefine(checkDeal)
type EditValues = z.input<typeof editSchema>

export function EditLeadForm({ open, onOpenChange, lead }: FormProps) {
  const qc = useQueryClient()
  const defaults = (): EditValues => ({
    name: lead.name,
    businessName: lead.businessName ?? '',
    phone: formatPhone(lead.phone),
    notes: lead.notes ?? '',
    location: lead.location.name,
    ...dealDefaults(lead),
    source: lead.source,
  })
  const { register, control, handleSubmit, formState, reset, setError } = useForm<EditValues>({ resolver: zodResolver(editSchema), mode: 'onBlur', defaultValues: defaults() })

  useEffect(() => {
    if (open) reset(defaults())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onSubmit = handleSubmit(async (v) => {
    // Only changed fields: the API re-checks the phone for duplicates when it is sent.
    const body: Record<string, string | number | null | undefined> = {}
    const d = formState.dirtyFields
    if (d.name) body.name = v.name.trim()
    if (d.businessName) body.businessName = v.businessName.trim() || null
    if (d.phone) body.phone = normalizePhone(v.phone) ?? v.phone
    if (d.notes) body.notes = v.notes.trim() || null
    if (d.location) body.location = v.location.trim().replace(/\s+/g, ' ')
    // Any change to the deal sends it whole: the API replaces the deal as one.
    if (DEAL_FORM_FIELDS.some((k) => d[k])) Object.assign(body, dealBody(v, { replace: true }))
    if (d.source) body.source = v.source ?? null
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
      handleFormError(err, setError, ['name', 'businessName', 'phone', 'notes', 'location', ...DEAL_FIELDS, 'source'])
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
          render={({ field }) => (
            <LocationField projectId={lead.projectId} value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={formState.errors.location?.message} />
          )}
        />
        <TextAreaField label="About the client" optional error={formState.errors.notes?.message} {...register('notes')} />
        <Controller control={control} name="source" render={({ field }) => <SourceChoice value={(field.value as LeadSource | null) ?? null} onChange={field.onChange} />} />
        <DealFields control={control} errors={formState.errors} tone={lead.status === 'converted' ? 'won' : 'expected'} title={lead.status === 'converted' ? 'Deal won' : undefined} lead={lead} />
      </form>
    </ResponsiveOverlay>
  )
}

// ---------------------------------------------------------------- request transfer

const transferSchema = z.object({
  toUserId: z
    .string()
    .nullable()
    .refine((v) => !!v, 'Choose who should get this lead.'),
  reason: z.string().trim().min(1, 'Give a reason.').max(500),
  handoverNote: z.string().trim().max(500),
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
    defaultValues: { toUserId: null, reason: '', handoverNote: '' },
  })

  useEffect(() => {
    if (open) reset({ toUserId: null, reason: '', handoverNote: '' })
  }, [open, reset])

  const onSubmit = handleSubmit(async (v) => {
    try {
      const { message } = await apiWithMessage(`/leads/${lead.id}/transfers`, {
        method: 'POST',
        body: { toUserId: v.toUserId, reason: v.reason.trim(), ...(v.handoverNote.trim() ? { handoverNote: v.handoverNote.trim() } : {}) },
      })
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
      title="Ask for handover"
      description="The lead moves once a manager approves."
      variant="short"
      dirty={formState.isDirty && !formState.isSubmitting}
      footer={
        <Button type="submit" form="request-transfer" size="lg" block loading={formState.isSubmitting} disabled={!members.isLoading && candidates.length === 0}>
          Ask for handover
        </Button>
      }
    >
      <form id="request-transfer" onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pt-1">
        {!members.isLoading && candidates.length === 0 ? (
          <p className="text-body-md text-body">There's no one else in this campaign to hand it to.</p>
        ) : (
          <Controller
            control={control}
            name="toUserId"
            render={({ field }) => (
              <Picker
                label="Hand over to"
                value={field.value}
                onChange={field.onChange}
                placeholder={members.isLoading ? 'Loading team…' : 'Choose a person'}
                error={formState.errors.toUserId?.message}
                options={candidates.map((m) => ({ value: m.userId, label: m.name, leading: <Avatar name={m.name} size={32} /> }))}
              />
            )}
          />
        )}
        <TextAreaField label="Reason" placeholder="Why should this lead move?" error={formState.errors.reason?.message} {...register('reason')} />
        <TextAreaField
          label="Handover note"
          optional
          hint="Pinned on the lead for whoever takes it over."
          placeholder="e.g. Owner prefers calls after 4 pm; sent pricing last week."
          error={formState.errors.handoverNote?.message}
          {...register('handoverNote')}
        />
      </form>
    </ResponsiveOverlay>
  )
}
