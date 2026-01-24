'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Copy, ExternalLink, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Meeting } from '@/types/meeting';
import type { Task } from '@/types/task';

interface FollowUpEmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: Meeting;
  tasks: Task[];
}

function formatDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return format(d, 'dd.MM.yyyy', { locale: de });
}

export function FollowUpEmailModal({
  open,
  onOpenChange,
  meeting,
  tasks,
}: FollowUpEmailModalProps) {
  const [copied, setCopied] = useState(false);
  const onCloseRef = useRef(() => onOpenChange(false));

  useEffect(() => {
    onCloseRef.current = () => onOpenChange(false);
  }, [onOpenChange]);

  // Handle escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCloseRef.current();
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  const email = useMemo(() => {
    const decisions = meeting.summary?.decisions || [];
    const openQuestions = meeting.summary?.openQuestions || [];
    const pendingTasks = tasks.filter((t) => t.status !== 'completed');

    const meetingDate = meeting.startedAt || meeting.createdAt;

    const subject = `Follow-Up: ${meeting.title} - ${formatDate(meetingDate)}`;

    const decisionsText =
      decisions.length > 0
        ? decisions.map((d) => `- ${d.text}`).join('\n')
        : '- Keine expliziten Entscheidungen';

    const tasksText =
      pendingTasks.length > 0
        ? pendingTasks
            .map((t) => {
              let line = `- ${t.title}`;
              if (t.assigneeName) line += ` (@${t.assigneeName})`;
              if (t.dueDate) line += ` - bis ${formatDate(t.dueDate)}`;
              return line;
            })
            .join('\n')
        : '- Keine offenen Tasks';

    const questionsText =
      openQuestions.filter((q) => !q.answered).length > 0
        ? openQuestions
            .filter((q) => !q.answered)
            .map((q) => `- ${q.text}`)
            .join('\n')
        : '- Keine offenen Fragen';

    const body = `Hallo zusammen,

hier die Zusammenfassung unseres Meetings "${meeting.title}":

ENTSCHEIDUNGEN
${decisionsText}

NACHSTE SCHRITTE
${tasksText}

OFFENE FRAGEN
${questionsText}

Bei Fragen gerne melden.

Beste Grusse`;

    return { subject, body };
  }, [meeting, tasks]);

  const handleCopy = async () => {
    const fullText = `Betreff: ${email.subject}\n\n${email.body}`;
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenInMailClient = () => {
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
    window.open(mailtoUrl);
  };

  const handleClose = () => onOpenChange(false);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-modal-title"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-2xl rounded-xl bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute right-4 top-4 p-1 text-foreground-secondary transition-colors hover:text-foreground"
              aria-label="Dialog schliessen"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <h2
                id="email-modal-title"
                className="text-lg font-semibold text-foreground"
              >
                Follow-Up Email
              </h2>
            </div>

            {/* Subject */}
            <div className="space-y-1 mb-4">
              <label className="text-sm text-foreground-secondary">
                Betreff:
              </label>
              <div className="rounded-[var(--radius)] bg-foreground/5 p-2 text-sm font-medium text-foreground">
                {email.subject}
              </div>
            </div>

            {/* Body */}
            <div className="space-y-1 mb-6">
              <label className="text-sm text-foreground-secondary">
                Inhalt:
              </label>
              <div className="rounded-[var(--radius)] bg-foreground/5 p-3 text-sm whitespace-pre-wrap max-h-80 overflow-y-auto text-foreground">
                {email.body}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground-secondary"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-success" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? 'Kopiert!' : 'Kopieren'}
              </button>
              <button
                onClick={handleOpenInMailClient}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                In Mail-App offnen
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
