/** "8 Oct 2026" for a release timestamp, in India time like every other date in the app. */
export const formatReleaseDate = (iso: string): string =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso))

/** YYYY-MM-DD in India time, for the date picker. */
export const releaseDateToYmd = (iso: string): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso))

/** Start of that India-time day, as the ISO instant the API stores. */
export const ymdToReleaseInstant = (ymd: string): string => new Date(`${ymd}T00:00:00+05:30`).toISOString()

/** First line of a note that is not a heading — enough to recognise a release by. */
export function summarise(notes: string): string {
  const line = notes
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && !l.startsWith('---'))
  if (!line) return 'No summary yet.'
  const clean = line.replace(/^[-*]\s*/, '').replace(/[*_`]/g, '')
  return clean.length > 140 ? `${clean.slice(0, 140)}…` : clean
}
