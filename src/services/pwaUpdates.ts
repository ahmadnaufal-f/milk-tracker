import { registerSW } from 'virtual:pwa-register';

let available = false;
let initialized = false;
let applyUpdate: ((reload?: boolean) => Promise<void>) | undefined;
const listeners = new Set<() => void>();

export const hasAppUpdate = () => available;
export function subscribeToAppUpdate(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function registerAppUpdates(): void {
  if (initialized || !('serviceWorker' in navigator)) return;
  initialized = true;
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      available = true;
      for (const listener of listeners) listener();
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      let lastCheck = Date.now();
      const check = () => {
        if (document.visibilityState !== 'visible' || !navigator.onLine) return;
        if (Date.now() - lastCheck < 60_000) return;
        lastCheck = Date.now();
        void registration.update().catch(() => { /* Retry on the next foreground visit. */ });
      };
      document.addEventListener('visibilitychange', check);
      window.addEventListener('online', check);
    },
    onRegisterError() {
      // The cached installation remains usable if an update cannot be fetched.
      initialized = false;
    },
  });
}

export async function activateAppUpdate(): Promise<void> {
  if (!available || !applyUpdate) throw new Error('Update is not ready');
  await applyUpdate(true);
}
