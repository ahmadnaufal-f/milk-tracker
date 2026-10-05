import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDomainMigrationConfig, formatMigrationRetirementDate } from '@/config/domainMigration';
import { isStandalonePwa } from '@/lib/pwa';
import usePumpingControl from '@/hooks/usePumpingControl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const DAY_MS = 24 * 60 * 60 * 1000;

function getSnoozeKey(campaignId: string): string {
  return `domainMigration:${campaignId}:dialogSnoozedUntil`;
}

function isDialogSnoozed(campaignId: string): boolean {
  try {
    const value = Number(localStorage.getItem(getSnoozeKey(campaignId)) || 0);
    return Number.isFinite(value) && value > Date.now();
  } catch {
    return false;
  }
}

function hasLocalPumpingActivity(): boolean {
  try {
    return Boolean(
      localStorage.getItem('pumping_startTime') ||
      localStorage.getItem('unsavedSession'),
    );
  } catch {
    return true;
  }
}

export default function DomainMigrationNotice() {
  const config = getDomainMigrationConfig();
  const { isPumping, showSaveDialog, isBusy } = usePumpingControl();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [snoozedInMemory, setSnoozedInMemory] = useState(false);
  const retirementDate = formatMigrationRetirementDate(config.retirementDate);
  const standalone = isStandalonePwa();
  const localActivity = hasLocalPumpingActivity();

  useEffect(() => {
    if (
      !standalone ||
      localActivity ||
      isPumping ||
      showSaveDialog ||
      isBusy ||
      snoozedInMemory ||
      isDialogSnoozed(config.campaignId)
    ) {
      if (dialogOpen) setDialogOpen(false);
      return;
    }
    setDialogOpen(true);
  }, [config.campaignId, dialogOpen, isBusy, isPumping, localActivity, showSaveDialog, snoozedInMemory, standalone]);

  const snoozeDialog = () => {
    try {
      localStorage.setItem(getSnoozeKey(config.campaignId), String(Date.now() + DAY_MS));
    } catch {
      // A blocked storage API should not keep the dialog open.
    }
    setSnoozedInMemory(true);
    setDialogOpen(false);
  };

  const destinationReady = config.destinationReady && config.destinationOrigin !== null;

  return (
    <>
      <aside
        aria-label="Milk Tracker move notice"
        className="w-full border-b border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-950 sm:px-6"
      >
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
          <p className="leading-snug">
            Milk Tracker is moving to a new web address.
            {retirementDate && (
              <span className="sm:ml-1">{' '}Please move before {retirementDate}.</span>
            )}
          </p>
          <Link
            to="/migration"
          className="inline-flex min-h-11 shrink-0 items-center font-semibold text-purple-900 underline underline-offset-4 hover:text-purple-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-800"
          >
            Read about the move
          </Link>
        </div>
      </aside>

      <Dialog open={dialogOpen} onOpenChange={(open) => open ? setDialogOpen(true) : snoozeDialog()}>
        <DialogContent className="border-purple-200 bg-[#fcfbfc] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-purple-950">Milk Tracker is moving</DialogTitle>
            <DialogDescription className="text-purple-900">
              {destinationReady
                ? 'To keep using the installed app, open the new site and add it to your home screen again. Finish and save your current session first.'
                : 'We’re getting the move ready. You can keep using this app for now and read the move details when you have a moment.'}
            </DialogDescription>
          </DialogHeader>
          {retirementDate && (
            <p className="text-sm text-purple-900">Please move before {retirementDate}.</p>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={snoozeDialog} className="min-h-11 text-purple-900">
              Remind me later
            </Button>
            <Button asChild className="min-h-11 bg-purple-800 text-white hover:bg-purple-900">
              <Link to="/migration" onClick={snoozeDialog}>Read move details</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
