import { Platform, type ViewStyle } from 'react-native'

export const colors = {
  bg: '#F4EFE6',
  surface: '#FFFDF8',
  ink: '#1C2430',
  muted: '#5C6570',
  line: '#E4DCCE',
  navy: '#24344D',
  gold: '#C9892E',
  teal: '#0F766E',
  rose: '#BE3B4A',
  white: '#FFFFFF',
} as const

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const

export const type = {
  kicker: 11,
  meta: 12,
  body: 15,
  title: 17,
  h2: 20,
  h1: 30,
} as const

export const radii = { control: 14, card: 18, sheet: 24, pill: 999 } as const

export const cardShadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#1C2430',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
  },
  android: { elevation: 3 },
  default: {},
}) as ViewStyle

export const statusTone: Record<string, { bg: string; fg: string; label: string }> = {
  draft: { bg: '#EEF2F6', fg: '#475569', label: 'Gesendet' },
  scheduled: { bg: '#E8F0FE', fg: '#1D4ED8', label: 'Geplant' },
  assigned: { bg: '#E8F0FE', fg: '#1D4ED8', label: 'Geplant' },
  en_route: { bg: '#FFF4D6', fg: '#92400E', label: 'Unterwegs' },
  on_site: { bg: '#EDE9FE', fg: '#6D28D9', label: 'Unterwegs' },
  waiting_parts: { bg: '#FFEDD5', fg: '#C2410C', label: 'Geplant' },
  completed: { bg: '#D1FAE5', fg: '#047857', label: 'Erledigt' },
  invoiced: { bg: '#D1FAE5', fg: '#047857', label: 'Erledigt' },
  cancelled: { bg: '#F4F4F5', fg: '#71717A', label: 'Storniert' },
}

export const tracker = ['Gesendet', 'Geplant', 'Unterwegs', 'Erledigt'] as const

export function trackerIndex(status?: string) {
  if (!status) return 0
  if (['draft'].includes(status)) return 0
  if (['scheduled', 'assigned', 'waiting_parts'].includes(status)) return 1
  if (['en_route', 'on_site'].includes(status)) return 2
  if (['completed', 'invoiced'].includes(status)) return 3
  return 0
}
