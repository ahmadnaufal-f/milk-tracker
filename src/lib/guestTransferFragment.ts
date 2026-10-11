// Capture before importing Firebase, App Check, or the application routes.
// A transfer code is a private capability: retain it only in module memory.
let capturedCode: string | null = null;

export function captureGuestTransferCode(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (!params.has('transfer')) return;
  capturedCode = params.get('transfer');
  params.delete('transfer');
  const remaining = params.toString();
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${window.location.search}${remaining ? `#${remaining}` : ''}`,
  );
}

export function consumeGuestTransferCode(): string | null {
  const code = capturedCode;
  capturedCode = null;
  return code;
}
