import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  /** When false the tooltip won't open (pass-through mode for enabled states) */
  disabled?: boolean;
  className?: string;
}

/**
 * Click-triggered tooltip that dismisses on outside click.
 * Wrap any trigger element with this component and set `disabled` to control
 * whether the tooltip is active.
 */
export function Tooltip({ content, children, disabled = true, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleClick = () => {
    if (disabled) setOpen((v) => !v);
  };

  return (
    <div ref={wrapperRef} className={`relative inline-block ${className ?? ''}`}>
      <div onClick={handleClick}>{children}</div>

      <AnimatePresence>
        {open && disabled && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-purple-900/60 backdrop-blur-sm text-white text-xs rounded-lg px-3 py-2 shadow-lg z-50 text-center leading-relaxed"
          >
            {content}
            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-purple-900/60" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
