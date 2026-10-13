// Builds src/icons/sprite.svg from Gravity UI icons (MIT, the set HeroUI v3 uses), so the app's
// icons are one cached file and no JavaScript. Run after changing ICONS: `node scripts/build-icons.mjs`.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const dir = join(dirname(require.resolve('@gravity-ui/icons/package.json')), 'svgs')

/** App icon name → Gravity UI icon (and its filled variant, used for the active tab). */
export const ICONS = {
  home: ['house', 'house-fill'],
  contacts: ['persons'],
  timeline: ['list-timeline'],
  today: ['calendar'],
  dashboard: ['chart-column'],
  statistics: ['chart-line-arrow-up'],
  briefcase: ['briefcase', 'briefcase-fill'],
  'conference-call': ['office-badge'],
  'add-user-male': ['person-plus'],
  swap: ['arrow-right-arrow-left'],
  'menu-2': ['bars'],
  more: ['ellipsis'],
  'user-male-circle': ['person', 'person-fill'],
  'plus-math': ['plus'],
  camera: ['camera'],
  marker: ['map-pin'],
  map: ['geo-dots'],
  'near-me': ['location-arrow', 'location-arrow-fill'],
  calendar: ['calendar'],
  clock: ['clock', 'clock-fill'],
  phone: ['handset'],
  search: ['magnifier'],
  filter: ['funnel'],
  sort: ['bars-descending-align-left'],
  back: ['chevron-left'],
  forward: ['chevron-right'],
  'chevron-right': ['chevron-right'],
  'expand-arrow': ['chevron-down'],
  'collapse-arrow': ['chevron-up'],
  multiply: ['xmark'],
  checkmark: ['check'],
  edit: ['pencil'],
  synchronize: ['arrows-rotate-right'],
  refresh: ['arrow-rotate-right'],
  goal: ['target'],
  ok: ['circle-check', 'circle-check-fill'],
  approval: ['seal-check'],
  cancel: ['circle-xmark', 'circle-xmark-fill'],
  csv: ['file-text'],
  download: ['arrow-down-to-line'],
  image: ['picture'],
  'high-priority': ['triangle-exclamation', 'triangle-exclamation-fill'],
  error: ['circle-exclamation', 'circle-exclamation-fill'],
  'wi-fi-disconnected': ['cloud-slash'],
  lock: ['lock', 'lock-fill'],
  trash: ['trash-bin'],
  info: ['circle-info', 'circle-info-fill'],
  visible: ['eye'],
  invisible: ['eye-slash'],
  'logout-rounded': ['arrow-right-from-square'],
  share: ['arrow-up-from-square'],
  'add-square': ['square-plus'],
  smartphone: ['smartphone'],
  bell: ['bell', 'bell-fill'],
  comment: ['comment', 'comment-fill'],
  help: ['circle-question', 'circle-question-fill'],
  leave: ['plane', 'plane-fill'],
  pin: ['pin', 'pin-fill'],
  send: ['paper-plane'],
  'thumbs-up': ['thumbs-up', 'thumbs-up-fill'],
  mention: ['at'],
  templates: ['comments'],
  shield: ['shield-check'],
}

const symbol = (id, file) => {
  const svg = readFileSync(join(dir, `${file}.svg`), 'utf8')
  const viewBox = svg.match(/viewBox="([^"]+)"/)[1]
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  return `<symbol id="${id}" viewBox="${viewBox}">${inner}</symbol>`
}

const symbols = Object.entries(ICONS).flatMap(([name, [outline, filled]]) => [symbol(name, outline), symbol(`${name}-fill`, filled ?? outline)])
const out = new URL('../src/icons/sprite.svg', import.meta.url)
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join('')}</svg>\n`)
console.log(`sprite.svg: ${Object.keys(ICONS).length} icons`)
