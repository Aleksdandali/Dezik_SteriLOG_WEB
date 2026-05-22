// Single source of truth for colors. Matches dezik.com.ua / Mini App palette.
export const colors = {
  brand: '#4b569e',
  brandDark: '#363f75',
  brandTint: '#eceef5',

  bg: '#F0F0F0',
  card: '#FFFFFF',
  surface: '#F8FAFC',

  text: '#111827',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',

  border: '#E5E7EB',
  divider: '#F3F4F6',

  success: '#10B981',
  successTint: '#D1FAE5',
  successText: '#065F46',

  danger: '#EF4444',
  dangerTint: '#FEE2E2',
  dangerText: '#991B1B',
  dangerBorder: '#FECACA',

  warning: '#F59E0B',
  warningTint: '#FEF3C7',
  warningText: '#92400E',

  info: '#3B82F6',
  infoTint: '#DBEAFE',
  infoText: '#1E40AF',

  // Hairline border on dark/colored surfaces (input outlines, focus rings).
  hairline: 'rgba(0,0,0,0.08)',
  overlay: 'rgba(0,0,0,0.5)',
  lightboxBg: 'rgba(0,0,0,0.95)',
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const text = {
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const, color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
  faint: { fontSize: 12, color: colors.textFaint },
} as const;
