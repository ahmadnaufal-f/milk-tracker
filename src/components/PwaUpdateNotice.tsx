import { useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import usePumpingControl from '@/hooks/usePumpingControl';
import { prepareForDomainMigration } from '@/services/storage';
import { activateAppUpdate, hasAppUpdate, subscribeToAppUpdate } from '@/services/pwaUpdates';
import { Button } from '@/components/ui/button';

export default function PwaUpdateNotice() {
  const available = useSyncExternalStore(subscribeToAppUpdate, hasAppUpdate, () => false);
  const { user, loading } = useAuth();
  const { isPumping, isBusy, showSaveDialog } = usePumpingControl();
  const liveState = useRef({ user, loading, isPumping, isBusy, showSaveDialog });
  liveState.current = { user, loading, isPumping, isBusy, showSaveDialog };
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('A small app update is ready. You can update after saving your session.');
  if (!available) return null;

  const update = async () => {
    setBusy(true);
    try {
      if (localStorage.getItem('pumping_startTime') || localStorage.getItem('unsavedSession')) {
        setMessage("Let's finish and save your session first. You can update afterwards.");
        return;
      }
      if (loading) return;
      const result = await prepareForDomainMigration(user?.uid ?? null, { isPumping, isBusy: isBusy || showSaveDialog });
      if (!result.safe) {
        setMessage(result.reason === 'missing-user'
          ? 'Please sign in so we can check your saved changes before updating.'
          : "We couldn't confirm your latest changes are saved yet. Please connect and try again when you're ready.");
        return;
      }
      // The user may have started a timer while synchronization was running.
      const latest = liveState.current;
      if (latest.loading || latest.user?.uid !== user?.uid || latest.isPumping || latest.isBusy || latest.showSaveDialog || localStorage.getItem('pumping_startTime') || localStorage.getItem('unsavedSession')) {
        setMessage("Let's finish and save your session first. You can update afterwards.");
        return;
      }
      await activateAppUpdate();
    } catch {
      setMessage("The update couldn't finish just now. You can try again a little later.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside aria-label="App update" className="bg-purple-50 text-purple-900 border-b border-purple-200 p-4">
      <div className="mx-auto max-w-lg flex flex-wrap items-center gap-3">
        <p role="status" className="flex-1 min-w-48 text-sm leading-relaxed">{message}</p>
        <Button onClick={() => void update()} disabled={busy || loading} className="min-h-11 bg-purple-800 text-white hover:bg-purple-900">
          {busy ? 'Checking your saved changes…' : 'Update app'}
        </Button>
      </div>
    </aside>
  );
}
