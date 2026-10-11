import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { formatMigrationRetirementDate, getDomainMigrationConfig } from '@/config/domainMigration';

export default function DomainMigrationNotice() {
  const config = getDomainMigrationConfig();
  const { user, isGuest, loading } = useAuth();
  const retirementDate = formatMigrationRetirementDate(config.retirementDate);
  const destinationReady = config.destinationReady && config.destinationOrigin !== null;

  let accountGuidance = 'Use the same Google account on the new site to see your records.';
  let actionLabel = 'See how to move';

  if (!destinationReady) {
    accountGuidance = 'We’re getting the move ready. Your records stay on this app for now.';
    actionLabel = 'See move details';
  } else if (loading || !user) {
    accountGuidance = 'You can review the move whenever you’re ready.';
    actionLabel = 'See move details';
  } else if (isGuest) {
    accountGuidance = 'Your guest records can move with you. You do not need a Google account.';
    actionLabel = 'Move my records';
  }

  return (
    <aside
      aria-label="Milk Tracker move notice"
      className="w-full border-b border-purple-200 bg-purple-50 px-4 py-3 text-purple-950 sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-snug">We’re moving to a new home.</h2>
          <p className="mt-1 text-sm leading-snug text-purple-900">{accountGuidance}</p>
          {retirementDate && (
            <p className="mt-1 text-xs leading-snug text-purple-800">
              Please move before {retirementDate}.
            </p>
          )}
        </div>
        <Button
          asChild
          className="min-h-11 w-full shrink-0 bg-purple-800 px-5 text-white hover:bg-purple-900 sm:w-auto"
        >
          <Link to="/migration">{actionLabel}</Link>
        </Button>
      </div>
    </aside>
  );
}
