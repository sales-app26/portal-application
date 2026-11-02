import { relativeDay } from '@/lib/format'
import type { CallOutcome, FollowUpChannel, NextStepChannel, ProjectType, WorkType } from '@/lib/types'

/** "Today, 4:00 pm", or just the day when no time was set. */
export function relativeDayTime(ymd: string, time?: string | null): string {
  if (!time) return relativeDay(ymd)
  const [hours, minutes] = time.split(':').map(Number)
  return `${relativeDay(ymd)}, ${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}`
}

export const WORK_TYPE_LABEL: Record<WorkType, string> = { field: 'Field', calling: 'Calling', both: 'Field and calling' }
export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  spoke: 'Spoke',
  no_answer: 'No answer',
  busy: 'Busy',
  switched_off: 'Switched off',
  wrong_number: 'Wrong number',
}

/** What this person can log in this campaign, the commonest first. The API holds the same rule. */
export function channelsFor(projectType: ProjectType, workType: WorkType): FollowUpChannel[] {
  if (projectType === 'online') return ['call', 'other']
  return workType === 'calling' ? ['call'] : ['visit', 'call']
}

/** What their next follow-up can be. */
export function nextStepsFor(projectType: ProjectType, workType: WorkType): NextStepChannel[] {
  return projectType === 'online' || workType === 'calling' ? ['call'] : ['visit', 'call']
}

export const CHANNEL_LABEL: Record<FollowUpChannel, string> = { visit: 'Visit', call: 'Call', other: 'WhatsApp or note' }

/** A call nobody answered: an attempt, which keeps the lead's status and needs no recording. */
export const isUnreached = (outcome: CallOutcome | null) => !!outcome && outcome !== 'spoke'

/** The note an attempt saves on its own, so it takes two taps. Long enough for the 5-character rule. */
export const ATTEMPT_NOTE: Record<Exclude<CallOutcome, 'spoke'>, string> = {
  no_answer: 'No answer',
  busy: 'Line busy',
  switched_off: 'Phone switched off',
  wrong_number: 'Wrong number',
}

/** The next step's time and kind go with a date, or not at all. */
export function nextStepBody(v: { nextFollowUpDate: string; nextFollowUpTime?: string; nextFollowUpChannel?: string }, hidden: boolean) {
  if (hidden || !v.nextFollowUpDate) return {}
  return { nextFollowUpTime: v.nextFollowUpTime || undefined, nextFollowUpChannel: v.nextFollowUpChannel || undefined }
}
