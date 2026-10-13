import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Page } from '@/components/layout/Page'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Choice'
import { DatePicker } from '@/components/ui/DatePicker'
import { Card, EmptyState, ErrorState, ListSkeleton, SectionTitle, Skeleton, Tag } from '@/components/ui/Display'
import { TextField } from '@/components/ui/Field'
import { Confirm, ResponsiveOverlay } from '@/components/ui/Overlay'
import { pricingKeys, useOffers, usePlanPrices } from '@/features/pricing/queries'
import { Icon } from '@/icons'
import { apiWithMessage } from '@/lib/api'
import { discountLabel, PLAN_LABEL } from '@/lib/deal'
import { formatDate, todayIST } from '@/lib/format'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import type { DiscountType, Offer, PlanCode, PlanPrice } from '@/lib/types'

/**
 * The sales head's price list and offers. Reps see the prices prefilled when they mark a lead as
 * won, and pick from the offers live today; deals already won keep what they were saved with.
 */
export function PlansOffersPage() {
  const [editing, setEditing] = useState<Offer | 'new' | null>(null)
  return (
    <Page title="Plans & offers" cta={{ label: 'Add offer', icon: 'plus-math', onClick: () => setEditing('new') }}>
      <div className="flex flex-col gap-8 expanded:max-w-[760px]">
        <PlanPrices />
        <Offers onEdit={setEditing} />
      </div>
      {editing && <OfferForm offer={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Page>
  )
}

// ---------------------------------------------------------------- plan prices

const digits = (v: string) => v.replace(/[,\s₹]/g, '')

function PlanPrices() {
  const qc = useQueryClient()
  const prices = usePlanPrices()
  const [typed, setTyped] = useState<Partial<Record<PlanCode, string>>>({})
  const [errors, setErrors] = useState<Partial<Record<PlanCode, string>>>({})
  const [busy, setBusy] = useState(false)

  const shown = (p: PlanPrice) => typed[p.plan] ?? (p.monthlyPrice === null ? '' : String(p.monthlyPrice))
  const changed = (prices.data ?? []).filter((p) => p.plan !== 'free' && typed[p.plan] !== undefined && digits(typed[p.plan] ?? '') !== (p.monthlyPrice === null ? '' : String(p.monthlyPrice)))

  const save = async () => {
    const problems: Partial<Record<PlanCode, string>> = {}
    for (const p of changed) {
      const d = digits(typed[p.plan] ?? '')
      if (d && !/^\d{1,9}$/.test(d)) problems[p.plan] = 'Enter the price in rupees, digits only.'
    }
    setErrors(problems)
    if (Object.keys(problems).length) return haptic.error()
    setBusy(true)
    try {
      const { data, message } = await apiWithMessage<PlanPrice[]>('/settings/plan-prices', {
        method: 'PUT',
        body: { prices: changed.map((p) => ({ plan: p.plan, monthlyPrice: digits(typed[p.plan] ?? '') ? Number(digits(typed[p.plan] ?? '')) : null })) },
      })
      qc.setQueryData(pricingKeys.prices, data)
      setTyped({})
      haptic.success()
      toast.success(message)
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <SectionTitle description="The usual price a month, before any offer. Reps see it filled in when they mark a lead as won.">Plan prices</SectionTitle>
      {prices.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : prices.isError ? (
        <ErrorState message={prices.error.message} onRetry={() => void prices.refetch()} />
      ) : (
        <Card className="flex flex-col gap-4">
          {(prices.data ?? []).map((p) =>
            p.plan === 'free' ? (
              <div key={p.plan} className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-semibold text-ink">{PLAN_LABEL.free}</span>
                <span className="text-body-md text-body">Always ₹0</span>
              </div>
            ) : (
              <TextField
                key={p.plan}
                label={PLAN_LABEL[p.plan]}
                prefix="₹"
                suffix={<span className="pr-4 text-body-sm text-muted">a month</span>}
                inputMode="numeric"
                placeholder="Not set"
                value={shown(p)}
                error={errors[p.plan]}
                onChange={(e) => setTyped((t) => ({ ...t, [p.plan]: e.target.value }))}
              />
            ),
          )}
          <Button className="self-start" loading={busy} disabled={changed.length === 0} onClick={() => void save()}>
            Save prices
          </Button>
        </Card>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- offers

/** Live, scheduled, finished or ended, from the switch and the dates (India dates). */
function offerState(o: Offer, today = todayIST()): { label: string; tone: 'up' | 'ink' | 'down' } {
  if (!o.active) return { label: 'Ended', tone: 'ink' }
  if (o.startsOn && o.startsOn > today) return { label: `Starts ${formatDate(o.startsOn)}`, tone: 'ink' }
  if (o.endsOn && o.endsOn < today) return { label: `Finished ${formatDate(o.endsOn)}`, tone: 'ink' }
  return { label: 'Live', tone: 'up' }
}

const dates = (o: Offer) =>
  o.startsOn && o.endsOn
    ? `${formatDate(o.startsOn)} to ${formatDate(o.endsOn)}`
    : o.startsOn
      ? `From ${formatDate(o.startsOn)}`
      : o.endsOn
        ? `Until ${formatDate(o.endsOn)}`
        : 'No end date'

function Offers({ onEdit }: { onEdit: (o: Offer) => void }) {
  const qc = useQueryClient()
  const offers = useOffers('all')
  const [removing, setRemoving] = useState<Offer | null>(null)
  const [busy, setBusy] = useState(false)
  const list = offers.data ?? []

  const refresh = () => void qc.invalidateQueries({ queryKey: pricingKeys.all })
  const setActive = async (o: Offer, active: boolean) => {
    try {
      await apiWithMessage(`/offers/${o.id}`, { method: 'PATCH', body: { active } })
      haptic.success()
      toast.success(active ? `${o.name} is back on.` : `${o.name} ended. Deals already won keep it.`)
      refresh()
    } catch (err) {
      handleFormError(err)
    }
  }
  const remove = async () => {
    if (!removing) return
    setBusy(true)
    try {
      const { message } = await apiWithMessage(`/offers/${removing.id}`, { method: 'DELETE' })
      toast.success(message)
      setRemoving(null)
      refresh()
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <SectionTitle description="For the whole company. Reps pick a live offer when they mark a lead as won.">Offers</SectionTitle>
      {offers.isLoading ? (
        <ListSkeleton rows={2} />
      ) : offers.isError ? (
        <ErrorState message={offers.error.message} onRetry={() => void offers.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon="goal" title="No offers yet" body="Add one, like 10% off for Diwali, and your team can pick it when they win a deal." className="card card--default rounded-2xl" />
      ) : (
        <ul className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
          {list.map((o) => {
            const state = offerState(o)
            return (
              <li key={o.id} className="flex items-start gap-3 border-b border-separator px-4 py-3.5 last:border-b-0">
                <span className="flex size-10 flex-none items-center justify-center rounded-full bg-accent-soft text-primary">
                  <Icon name="goal" size={20} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-title-sm">{o.name}</span>
                    <Tag tone={state.tone}>{state.label}</Tag>
                  </span>
                  <span className="text-body-sm text-ink">
                    {discountLabel(o.discountType, o.discountValue)} the whole deal{o.couponCode ? ` · coupon ${o.couponCode}` : ''}
                  </span>
                  <span className="text-caption text-muted">{dates(o)}</span>
                </span>
                <ActionMenu
                  title={o.name}
                  items={[
                    { label: 'Edit', icon: 'edit', onSelect: () => onEdit(o) },
                    o.active ? { label: 'End offer', icon: 'cancel', onSelect: () => void setActive(o, false) } : { label: 'Bring back', icon: 'refresh', onSelect: () => void setActive(o, true) },
                    { label: 'Remove', icon: 'trash', onSelect: () => setRemoving(o) },
                  ]}
                />
              </li>
            )
          })}
        </ul>
      )}
      <Confirm
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? 'this offer'}?`}
        body="It disappears from this list and from the Won picker. Deals already won with it keep its name and discount."
        confirmLabel="Remove offer"
        danger
        loading={busy}
        onConfirm={remove}
      />
    </section>
  )
}

// ---------------------------------------------------------------- offer form

function OfferForm({ offer, onClose }: { offer: Offer | null; onClose: () => void }) {
  const qc = useQueryClient()
  const initial = {
    name: offer?.name ?? '',
    discountType: (offer?.discountType ?? 'percent') as DiscountType,
    discountValue: offer ? String(offer.discountValue) : '',
    couponCode: offer?.couponCode ?? '',
    startsOn: offer?.startsOn ?? '',
    endsOn: offer?.endsOn ?? '',
  }
  const [v, setV] = useState(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof typeof initial, string>>>({})
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof initial>(k: K, value: (typeof initial)[K]) => {
    setV((x) => ({ ...x, [k]: value }))
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e))
  }

  const save = async () => {
    const problems: typeof errors = {}
    const value = Number(digits(v.discountValue).replace('%', ''))
    if (!v.name.trim()) problems.name = 'Give the offer a name.'
    if (!/^\d+(\.\d{1,2})?$/.test(digits(v.discountValue).replace('%', '')) || value <= 0) problems.discountValue = v.discountType === 'percent' ? 'Enter how much % off, like 10.' : 'Enter the rupees off, digits only.'
    else if (v.discountType === 'percent' && value > 100) problems.discountValue = 'A % off can be at most 100.'
    else if (v.discountType === 'amount' && !Number.isInteger(value)) problems.discountValue = 'Enter whole rupees.'
    if (v.couponCode.trim() && !/^[A-Za-z0-9_-]+$/.test(v.couponCode.trim())) problems.couponCode = 'Use only letters, numbers, - and _.'
    if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) problems.endsOn = 'The last day must be on or after the first day.'
    if (Object.keys(problems).length) {
      setErrors(problems)
      return haptic.error()
    }
    setBusy(true)
    try {
      const body = {
        name: v.name.trim(),
        discountType: v.discountType,
        discountValue: value,
        couponCode: v.couponCode.trim() ? v.couponCode.trim().toUpperCase() : null,
        startsOn: v.startsOn || null,
        endsOn: v.endsOn || null,
      }
      const { message } = await apiWithMessage(offer ? `/offers/${offer.id}` : '/offers', { method: offer ? 'PATCH' : 'POST', body })
      haptic.success()
      toast.success(message)
      void qc.invalidateQueries({ queryKey: pricingKeys.all })
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
      title={offer ? 'Edit offer' : 'New offer'}
      description={offer ? 'Deals already won keep the discount they were saved with.' : undefined}
      variant="form"
      dirty={JSON.stringify(v) !== JSON.stringify(initial) && !busy}
      footer={
        <Button size="lg" block loading={busy} onClick={() => void save()}>
          Save offer
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        <TextField label="Name" placeholder="e.g. Diwali offer" maxLength={60} value={v.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />
        <div className="flex flex-col gap-1.5">
          <span className="text-[15px] font-semibold text-ink">Discount on the whole deal</span>
          <Segmented
            label="Discount type"
            className="self-start"
            value={v.discountType}
            onChange={(t) => set('discountType', t)}
            options={[
              { value: 'percent', label: '% off' },
              { value: 'amount', label: '₹ off' },
            ]}
          />
        </div>
        <TextField
          label={v.discountType === 'percent' ? 'How much % off' : 'How many ₹ off'}
          prefix={v.discountType === 'amount' ? '₹' : undefined}
          suffix={v.discountType === 'percent' ? <span className="pr-4 text-body-md text-muted">%</span> : undefined}
          inputMode="decimal"
          placeholder={v.discountType === 'percent' ? '10' : '500'}
          value={v.discountValue}
          error={errors.discountValue}
          onChange={(e) => set('discountValue', e.target.value)}
        />
        <TextField
          label="Coupon code"
          optional
          autoCapitalize="characters"
          placeholder="e.g. DIWALI10"
          maxLength={40}
          hint="Filled in for the rep when they pick this offer."
          value={v.couponCode}
          error={errors.couponCode}
          onChange={(e) => set('couponCode', e.target.value)}
        />
        <div className="grid grid-cols-1 gap-4 medium:grid-cols-2">
          <DatePicker label="First day" optional value={v.startsOn} onChange={(d) => set('startsOn', d)} />
          <DatePicker label="Last day" optional min={v.startsOn || undefined} value={v.endsOn} error={errors.endsOn} onChange={(d) => set('endsOn', d)} />
        </div>
      </div>
    </ResponsiveOverlay>
  )
}
