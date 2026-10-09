import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError } from './api'
import { haptic } from './haptics'

/**
 * Puts API field errors on their inputs; anything else becomes a toast with the
 * server's message, word for word (UX-COMPONENTS.md §4.8). Returns the message.
 */
export function handleFormError<T extends FieldValues>(err: unknown, setError?: UseFormSetError<T>, fields?: readonly string[]): string {
  haptic.error()
  if (!(err instanceof ApiError)) {
    const message = 'Something went wrong. Please try again.'
    toast.error(message)
    return message
  }
  let placed = false
  if (setError && err.fieldErrors) {
    for (const fe of err.fieldErrors) {
      if (!fields || fields.includes(fe.field)) {
        setError(fe.field as Path<T>, { message: humanize(fe.messages[0] ?? '') })
        placed = true
      }
    }
  }
  if (!placed) toast.error(err.message)
  return err.message
}

/** class-validator messages start with the property name: "phone must be a string". */
function humanize(msg: string) {
  const s = msg.replace(/^[a-z][A-Za-z]*\s/, '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
