'use client';

import { useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  // Fix: Use ref to always have access to latest callback, avoiding stale closure
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  // Handle escape key to close dialog (Fix: Use ref to avoid stale closure)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancelRef.current();
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when dialog is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  const variantStyles = {
    danger: {
      icon: 'text-error bg-error/10',
      button: 'bg-error text-white hover:bg-error/90',
    },
    warning: {
      icon: 'text-warning bg-warning/10',
      button: 'bg-warning text-black hover:bg-warning/90',
    },
    info: {
      icon: 'text-primary bg-primary/10',
      button: 'bg-primary text-white hover:bg-primary/90',
    },
  };

  const styles = variantStyles[variant];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={onCancel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirmation-dialog-title"
          aria-describedby="confirmation-dialog-description"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md rounded-xl bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={onCancel}
              className="absolute right-4 top-4 p-1 text-foreground-secondary transition-colors hover:text-foreground"
              aria-label="Dialog schließen"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Icon */}
            <div className="flex items-start gap-4">
              <div className={`flex-shrink-0 rounded-full p-3 ${styles.icon}`}>
                <AlertTriangle className="h-6 w-6" aria-hidden="true" />
              </div>

              <div className="flex-1 pt-1">
                <h3
                  id="confirmation-dialog-title"
                  className="text-lg font-semibold text-foreground"
                >
                  {title}
                </h3>
                <p
                  id="confirmation-dialog-description"
                  className="mt-2 text-sm text-foreground-secondary"
                >
                  {message}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={onCancel}
                className="rounded-lg px-4 py-2 text-sm font-medium text-foreground-secondary transition-colors hover:bg-foreground/5 hover:text-foreground"
                aria-label={cancelLabel}
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${styles.button}`}
                aria-label={confirmLabel}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Simplified hook for using confirmation dialogs
import { useState } from 'react';

interface UseConfirmationOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
}

export function useConfirmation(options: UseConfirmationOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

  const confirm = (): Promise<boolean> => {
    setIsOpen(true);
    return new Promise((resolve) => {
      setResolvePromise(() => resolve);
    });
  };

  const handleConfirm = () => {
    setIsOpen(false);
    resolvePromise?.(true);
  };

  const handleCancel = () => {
    setIsOpen(false);
    resolvePromise?.(false);
  };

  const Dialog = () => (
    <ConfirmationDialog
      isOpen={isOpen}
      title={options.title}
      message={options.message}
      confirmLabel={options.confirmLabel}
      cancelLabel={options.cancelLabel}
      variant={options.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, Dialog };
}
