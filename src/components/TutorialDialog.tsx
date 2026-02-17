import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import Markdown from 'react-markdown';
// @ts-ignore
import tutorialEn from '@/data/tutorial-en.md?raw';
// @ts-ignore
import tutorialId from '@/data/tutorial-id.md?raw';

interface TutorialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TutorialDialog: React.FC<TutorialDialogProps> = ({ open, onOpenChange }) => {
  const [markdownData, setMarkdownData] = useState('');

  useEffect(() => {
    const locale = navigator.language;
    if (locale === 'id-ID') {
      setMarkdownData(tutorialId);
    } else {
      setMarkdownData(tutorialEn);
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] w-[calc(100%-2rem)] flex flex-col p-0 gap-0 mx-auto">
        <DialogHeader className="px-8 pt-6 pb-2">
          <DialogTitle>How to Use</DialogTitle>
          <DialogDescription className="sr-only">
            Guide on how to use the Milk Pump Tracker application
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-8 pb-6 pt-2">
          <div className="prose dark:prose-invert prose-sm max-w-none">
            <Markdown
              components={{
                img: ({ node, ...props }) => (
                  <img
                    {...props}
                    className="rounded-lg shadow-md max-w-full h-auto mx-auto my-4"
                    style={{ maxWidth: '100%' }}
                  />
                ),
                h1: ({ node, ...props }) => (
                  <h1 {...props} className="mb-2 text-xl font-bold" />
                ),
                h3: ({ node, ...props }) => (
                  <h3 {...props} className="mt-3 mb-2 text-lg font-semibold" />
                ),
                ul: ({ node, ...props }) => (
                  <ul {...props} className="list-disc pl-5 space-y-1 my-2" />
                ),
                p: ({ node, ...props }) => (
                  <p {...props} className="my-2 leading-relaxed" />
                ),
              }}
            >
              {markdownData}
            </Markdown>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TutorialDialog;
