import usePumpingControl from '@/hooks/usePumpingControl';
import { SaveSessionDialog } from './SaveSessionDialog';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Play } from 'lucide-react';

export default function PumpingControl() {
  const reduceMotion = useReducedMotion();
  const {
    isPumping,
    handleStart,
    handleStop,
    elapsedSeconds,
    targetDuration,
    showSaveDialog,
    setShowSaveDialog,
    volume,
    setVolume,
    loading,
    isRestoredSession,
    handleSave,
    handleCancel
  } = usePumpingControl()

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  const remainingSeconds = Math.max(0, (Number(targetDuration) * 60) - elapsedSeconds);

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-50 flex min-h-24 items-center justify-center bg-linear-to-b from-background/0 via-background/90 to-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <motion.div
          layout={!reduceMotion}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.6 }}
          className={isPumping
            ? "mx-auto h-fit w-fit rounded-3xl border border-solid border-purple-300 bg-purple-50 p-2 text-card-foreground shadow-lg"
            : "mx-auto h-fit w-fit text-card-foreground"}
        >
          <AnimatePresence mode="wait">
            {isPumping ? (
              <motion.div
                key="pumping"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, scale: 0.95 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
                className="flex flex-row items-center gap-3 sm:gap-4"
              >
                <div className="flex min-w-[4.25rem] flex-col items-center">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-purple-700">Elapsed</span>
                  <span className="font-mono text-lg font-semibold tabular-nums text-purple-950">{formatTime(elapsedSeconds)}</span>
                </div>

                <div aria-hidden="true" className="h-8 w-px bg-purple-200" />

                <div className="flex min-w-[4.25rem] flex-col items-center">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-purple-700">Remaining</span>
                  <span className="font-mono text-lg font-semibold tabular-nums text-purple-950">{formatTime(remainingSeconds)}</span>
                </div>

                <div aria-hidden="true" className="h-8 w-px bg-purple-200" />

                <button
                  className="min-h-11 min-w-12 rounded-xl px-3 text-center font-semibold text-red-800 transition-colors hover:bg-red-100 active:bg-red-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-300 focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none"
                  onClick={handleStop}
                >
                  Stop
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="start"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, scale: 0.95 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
                className="block min-h-14 whitespace-nowrap rounded-2xl border border-purple-300 bg-purple-200 px-7 py-4 text-center text-base font-semibold text-purple-950 shadow-sm transition-colors hover:bg-purple-300 active:bg-purple-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-400 focus-visible:ring-offset-2 motion-reduce:transition-none"
                onClick={handleStart}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <Play aria-hidden="true" className="size-5 fill-current" />
                  Start Pumping
                </span>
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <SaveSessionDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        isRestoredSession={isRestoredSession}
        elapsedSeconds={elapsedSeconds}
        volume={volume}
        setVolume={setVolume}
        handleCancel={handleCancel}
        handleSave={handleSave}
        loading={loading}
      />
    </>
  );
}
