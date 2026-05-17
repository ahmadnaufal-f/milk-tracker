import usePumpingControl from '@/hooks/usePumpingControl';
import { SaveSessionDialog } from './SaveSessionDialog';
import { motion, AnimatePresence } from 'motion/react';

export default function PumpingControl() {
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
      <div className="fixed bottom-0 left-0 right-0 z-50 h-30 bg-linear-to-b from-background/0 to-background flex items-center justify-center">
        <motion.div 
          layout
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
          className="text-card-foreground border w-fit h-fit mx-auto py-3 px-6 shadow-lg overflow-hidden border-solid border-purple-300 bg-purple-50 rounded-3xl"
        >
          <AnimatePresence mode="wait">
            {isPumping ? (
              <motion.div 
                key="pumping"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="flex flex-row items-center gap-6"
              >
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-semibold text-purple-600 uppercase tracking-wider">Elapsed</span>
                  <span className="font-mono text-xl font-medium text-purple-900">{formatTime(elapsedSeconds)}</span>
                </div>

                <div className="h-8 w-px bg-purple-200"></div>

                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-semibold text-purple-600 uppercase tracking-wider">Remaining</span>
                  <span className="font-mono text-xl font-medium text-purple-900">{formatTime(remainingSeconds)}</span>
                </div>

                <div className="h-8 w-px bg-purple-200"></div>

                <button
                  className="text-center font-semibold text-red-800 active:scale-95 transition-transform"
                  onClick={handleStop}
                >
                  Stop
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="start"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="text-center font-semibold text-purple-800 whitespace-nowrap block"
                onClick={handleStart}
              >
                Start Pumping
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
