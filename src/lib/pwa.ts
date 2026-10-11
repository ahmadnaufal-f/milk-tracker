export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;

  const displayMode =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return displayMode || iosStandalone;
}
