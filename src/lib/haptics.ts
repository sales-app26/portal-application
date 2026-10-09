// Android only; iOS ignores navigator.vibrate silently (UX-COMPONENTS.md §6.7).
export const haptic = {
  success: () => navigator.vibrate?.(10),
  error: () => navigator.vibrate?.([20, 40, 20]),
}
