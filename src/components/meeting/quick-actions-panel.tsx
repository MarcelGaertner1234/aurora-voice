'use client';

import { useState } from 'react';
import {
  Mail,
  FileDown,
  Calendar,
  FolderOpen,
  Link,
  Check,
  Sparkles,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import type { Meeting } from '@/types/meeting';
import type { Task } from '@/types/task';

interface QuickActionsPanelProps {
  meeting: Meeting;
  tasks: Task[];
  onEmailClick: () => void;
  onExportClick: () => void;
}

interface QuickAction {
  id: string;
  icon: React.ElementType;
  label: string;
  color: string;
  available: boolean;
}

export function QuickActionsPanel({
  meeting,
  tasks,
  onEmailClick,
  onExportClick,
}: QuickActionsPanelProps) {
  const [completedActions, setCompletedActions] = useState<Set<string>>(
    new Set()
  );
  const [linkCopied, setLinkCopied] = useState(false);

  const hasSummary = !!meeting.summary;

  const actions: QuickAction[] = [
    {
      id: 'email',
      icon: Mail,
      label: 'Follow-Up Email',
      color: 'text-blue-400',
      available: hasSummary,
    },
    {
      id: 'export',
      icon: FileDown,
      label: 'Als Markdown exportieren',
      color: 'text-green-400',
      available: true,
    },
    {
      id: 'calendar',
      icon: Calendar,
      label: 'Nachfolge-Meeting planen',
      color: 'text-purple-400',
      available: false, // Not implemented yet
    },
    {
      id: 'folder',
      icon: FolderOpen,
      label: 'In Projekt-Ordner speichern',
      color: 'text-orange-400',
      available: false, // Not implemented yet
    },
    {
      id: 'link',
      icon: Link,
      label: 'Link kopieren',
      color: 'text-cyan-400',
      available: true,
    },
  ];

  const handleAction = async (actionId: string) => {
    switch (actionId) {
      case 'email':
        onEmailClick();
        break;
      case 'export':
        onExportClick();
        break;
      case 'link':
        await navigator.clipboard.writeText(window.location.href);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
        break;
      // calendar & folder: To be implemented later
      default:
        break;
    }
    setCompletedActions((prev) => new Set(prev).add(actionId));
  };

  return (
    <GlassCard>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground-secondary uppercase tracking-wide">
        <Sparkles className="h-4 w-4" />
        Schnellaktionen
      </h2>
      <div className="space-y-1">
        {actions.map((action) => {
          const Icon = action.icon;
          const isCompleted = completedActions.has(action.id);
          const isLinkAction = action.id === 'link';

          return (
            <button
              key={action.id}
              onClick={() => action.available && handleAction(action.id)}
              disabled={!action.available}
              className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${
                action.available
                  ? 'hover:bg-foreground/5 cursor-pointer'
                  : 'opacity-40 cursor-not-allowed'
              }`}
            >
              {isCompleted && !isLinkAction ? (
                <Check className="w-4 h-4 text-success flex-shrink-0" />
              ) : isLinkAction && linkCopied ? (
                <Check className="w-4 h-4 text-success flex-shrink-0" />
              ) : (
                <Icon
                  className={`w-4 h-4 flex-shrink-0 ${action.available ? action.color : 'text-foreground-secondary'}`}
                />
              )}
              <span
                className={`text-sm ${action.available ? 'text-foreground' : 'text-foreground-secondary'}`}
              >
                {isLinkAction && linkCopied ? 'Link kopiert!' : action.label}
              </span>
              {!action.available && action.id !== 'email' && (
                <span className="ml-auto text-xs text-foreground-secondary">
                  Bald
                </span>
              )}
            </button>
          );
        })}
      </div>
    </GlassCard>
  );
}
