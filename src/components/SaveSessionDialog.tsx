import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Save } from 'lucide-react';
import { Spinner } from './ui/spinner';

interface SaveSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isRestoredSession: boolean;
  elapsedSeconds: number;
  volume: string;
  setVolume: (volume: string) => void;
  handleCancel: () => void;
  handleSave: () => void;
  loading: boolean;
}

export const SaveSessionDialog: React.FC<SaveSessionDialogProps> = ({
  open,
  onOpenChange,
  isRestoredSession,
  elapsedSeconds,
  volume,
  setVolume,
  handleCancel,
  handleSave,
  loading
}) => {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const handleResize = () => {
      const heightDiff = window.innerHeight - viewport.height;
      setIsKeyboardVisible(heightDiff > 150);
    };

    viewport.addEventListener('resize', handleResize);
    return () => viewport.removeEventListener('resize', handleResize);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`sm:max-w-md ${isKeyboardVisible ? 'top-[35%]' : ''}`}>
        <DialogHeader>
          <DialogTitle>{isRestoredSession ? 'You have unsaved session' : 'Great Job Mama!'}</DialogTitle>
          <div className="flex items-center gap-2 w-full justify-center p-2">
            <img src="/baby-happy.webp" alt="Baby" className="size-30" />
          </div>
          <DialogDescription>
            How much milk did you pump during {isRestoredSession ? 'the last' : 'this'} {Math.max(1, Math.round(elapsedSeconds / 60))} minute session?
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4 py-4 px-2 w-full">
          <div className="flex flex-row items-center gap-4">
            <Label htmlFor="volume" className="min-w-fit">
              Volume (ml)
            </Label>
            <Input
              id="volume"
              type="number"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              className="font-mono text-lg"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleCancel} className="text-md">Cancel</Button>
          <Button onClick={handleSave} disabled={loading} className="bg-purple-200 text-purple-900 text-md">
            {loading ? <Spinner /> : <Save className="mr-1 size-4" />}
            Save session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
