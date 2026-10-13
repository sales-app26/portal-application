import { useController, useWatch, type Control, type FieldErrors, type FieldValues, type Path } from 'react-hook-form'
import { Segmented } from '@/components/ui/Choice'
import { TextField } from '@/components/ui/Field'
import { Icon } from '@/icons'
import { cn } from '@/lib/cn'
import { dealSentence, discountLabel, months, PLAN_LABEL, PLANS, TENURES } from '@/lib/deal'
import { rupees } from '@/lib/format'
import type { DiscountType, LeadSummary, Offer, PlanCode } from '@/lib/types'
import { usePlanPrices, useOffers } from '@/features/pricing/queries'
import { OTHER_DISCOUNT, rupeeDigits, type DealValues } from './entrySchema'

interface Props<T extends FieldValues> {
  // Shared by forms with different extra fields; only the deal fields are touched here.
  control: Control<T>
  errors: FieldErrors<T>
  /** `won`: Mark as won. `expected`: what the lead may buy (Add lead, Edit lead before it is won). */
  tone: 'won' | 'expected'
  /** The lead's saved deal, so an offer that has since ended still shows as picked. */
  lead?: Pick<LeadSummary, 'offer' | 'discountType' | 'discountValue' | 'couponCode'>
  /** Instead of "Mark as won" / "Expected deal" (Edit lead says "Deal"). */
  title?: string
}

const n = <T extends FieldValues>(name: keyof DealValues) => name as Path<T>

const chip = 'pressable inline-flex min-h-11 flex-none items-center justify-center gap-1.5 rounded-pill border px-4 text-nav whitespace-nowrap transition-colors'
const chipOn = 'border-ink bg-ink font-semibold text-on-ink'
const chipOff = 'border-border bg-surface text-ink hover:bg-surface-secondary'

/** A row of big one-tap chips with a label (radio group). */
function Chips<V extends string | number>({
  label,
  value,
  options,
  onChange,
  allowNone = false,
}: {
  label: string
  value: V | null | undefined
  options: { value: V; label: string; hint?: string }[]
  onChange: (v: V | null) => void
  allowNone?: boolean
}) {
  const id = `deal-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-[15px] font-semibold text-ink">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = o.value === value
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(on && allowNone ? null : o.value)}
              className={cn(chip, on ? chipOn : chipOff)}
            >
              {on && <Icon name="checkmark" size={16} />}
              <span>{o.label}</span>
              {o.hint && <span className={cn('text-caption', on ? 'text-on-ink/80' : 'text-muted')}>{o.hint}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The deal, for Mark as won, Change stage, Add lead (the expected deal) and Edit lead:
 * plan chips, tenure chips, the monthly price (prefilled from the plan's price), an offer or a
 * discount typed by hand, and one live line saying what the client pays.
 */
export function DealFields<T extends FieldValues>({ control, errors: allErrors, tone, lead, title }: Props<T>) {
  const errors = allErrors as FieldErrors<DealValues>
  const plan = useController({ control, name: n<T>('planCode') })
  const tenure = useController({ control, name: n<T>('dealTenureMonths') })
  const price = useController({ control, name: n<T>('dealValue') })
  const offerChoice = useController({ control, name: n<T>('offerChoice') })
  const discountType = useController({ control, name: n<T>('discountType') })
  const discountValue = useController({ control, name: n<T>('discountValue') })
  const coupon = useController({ control, name: n<T>('couponCode') })
  // Re-render the summary on every keystroke.
  useWatch({ control, name: [n<T>('dealValue'), n<T>('discountValue'), n<T>('couponCode')] })

  const prices = usePlanPrices()
  const offers = useOffers('live')
  const priceOf = (p: PlanCode) => prices.data?.find((x) => x.plan === p)?.monthlyPrice ?? null

  const planCode = (plan.field.value as PlanCode | null | undefined) ?? null
  const free = planCode === 'free'
  const choice = (offerChoice.field.value as string | undefined) ?? ''
  const typedType = ((discountType.field.value as DiscountType | undefined) ?? 'percent') as DiscountType

  // The active offers, plus the one this deal was saved with if it has ended since.
  const offerList: Pick<Offer, 'id' | 'name' | 'discountType' | 'discountValue' | 'couponCode'>[] = [...(offers.data ?? [])]
  if (lead?.offer && lead.discountType && lead.discountValue !== null && !offerList.some((o) => o.id === lead.offer?.id)) {
    offerList.push({ id: lead.offer.id, name: lead.offer.name, discountType: lead.discountType, discountValue: lead.discountValue, couponCode: lead.couponCode })
  }
  const picked = offerList.find((o) => o.id === choice)

  const pickPlan = (p: PlanCode | null) => {
    plan.field.onChange(p)
    if (p === 'free') {
      price.field.onChange('')
      tenure.field.onChange(null)
      offerChoice.field.onChange('')
      return
    }
    if (p) {
      const listed = priceOf(p)
      if (listed !== null) price.field.onChange(String(listed))
      if (tenure.field.value == null) tenure.field.onChange(1)
    }
  }

  const amount = (v: string | undefined) => {
    const d = rupeeDigits(v).replace('%', '')
    return d && /^\d+(\.\d{1,2})?$/.test(d) ? Number(d) : null
  }
  const terms = {
    price: amount(price.field.value as string),
    tenure: (tenure.field.value as number | null | undefined) ?? null,
    discountType: picked ? picked.discountType : choice === OTHER_DISCOUNT ? typedType : null,
    discountValue: picked ? picked.discountValue : choice === OTHER_DISCOUNT ? amount(discountValue.field.value as string) : null,
  }
  const sentence = dealSentence(planCode, terms, picked ? picked.couponCode : choice === OTHER_DISCOUNT ? ((coupon.field.value as string) || '').trim().toUpperCase() || null : null)
  const listed = planCode && !free ? priceOf(planCode) : null

  return (
    <div className={cn('flex flex-col gap-5 rounded-2xl p-4', tone === 'won' ? 'bg-success-soft' : 'bg-surface-secondary')}>
      <p className="flex items-center gap-2 text-title-sm">
        {title ? (
          title
        ) : tone === 'won' ? (
          <>
            <span aria-hidden>🎉</span> Mark as won
          </>
        ) : (
          'Expected deal'
        )}
        <span className="text-body-sm font-normal text-muted">(optional)</span>
      </p>

      <Chips label="Plan" value={planCode} allowNone onChange={pickPlan} options={PLANS.map((p) => ({ value: p, label: PLAN_LABEL[p] }))} />

      {!free && (
        <>
          <Chips
            label="For how long"
            value={(tenure.field.value as number | null | undefined) ?? null}
            onChange={(v) => tenure.field.onChange(v)}
            options={TENURES.map((t) => ({ value: t, label: months(t) }))}
          />
          <TextField
            label="Monthly price"
            prefix="₹"
            inputMode="numeric"
            placeholder="2,499"
            hint={listed !== null ? `Usual price for ${PLAN_LABEL[planCode as PlanCode]}: ${rupees(listed)} a month, before any offer.` : 'The price per month, before any offer.'}
            error={errors.dealValue?.message}
            name={price.field.name}
            ref={price.field.ref}
            value={(price.field.value as string) ?? ''}
            onChange={(e) => price.field.onChange(e.target.value)}
            onBlur={price.field.onBlur}
          />
          <Chips
            label="Offer or discount"
            value={choice}
            onChange={(v) => offerChoice.field.onChange(v ?? '')}
            options={[
              { value: '', label: 'No offer' },
              ...offerList.map((o) => ({ value: o.id, label: o.name, hint: discountLabel(o.discountType, o.discountValue) })),
              { value: OTHER_DISCOUNT, label: 'Other discount' },
            ]}
          />
          {picked?.couponCode && <p className="-mt-3 text-body-sm text-body">Coupon {picked.couponCode} is filled in for you.</p>}
          {choice === OTHER_DISCOUNT && (
            <div className="flex flex-col gap-4 rounded-xl bg-surface p-3">
              <Segmented
                label="Discount type"
                value={typedType}
                onChange={(v) => discountType.field.onChange(v)}
                options={[
                  { value: 'percent', label: '% off' },
                  { value: 'amount', label: '₹ off' },
                ]}
              />
              <TextField
                label={typedType === 'percent' ? 'How much % off' : 'How many ₹ off the whole deal'}
                prefix={typedType === 'amount' ? '₹' : undefined}
                suffix={typedType === 'percent' ? <span className="pr-4 text-body-md text-muted">%</span> : undefined}
                inputMode="decimal"
                placeholder={typedType === 'percent' ? '10' : '500'}
                error={errors.discountValue?.message}
                name={discountValue.field.name}
                ref={discountValue.field.ref}
                value={(discountValue.field.value as string) ?? ''}
                onChange={(e) => discountValue.field.onChange(e.target.value)}
                onBlur={discountValue.field.onBlur}
              />
              <TextField
                label="Coupon code"
                optional
                autoCapitalize="characters"
                placeholder="e.g. DIWALI10"
                maxLength={40}
                error={errors.couponCode?.message}
                name={coupon.field.name}
                ref={coupon.field.ref}
                value={(coupon.field.value as string) ?? ''}
                onChange={(e) => coupon.field.onChange(e.target.value)}
                onBlur={coupon.field.onBlur}
              />
            </div>
          )}
        </>
      )}

      {sentence && (
        <p aria-live="polite" className="rounded-xl bg-surface px-3 py-2.5 text-body-md font-semibold text-ink tabular-nums">
          {sentence}
        </p>
      )}
    </div>
  )
}
