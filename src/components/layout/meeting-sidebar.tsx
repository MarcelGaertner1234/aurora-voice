'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isToday, isYesterday, isThisWeek, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Mic,
  MoreHorizontal,
  Trash2,
  Pencil,
  X,
  Check,
} from 'lucide-react';
import { useMeetingStore } from '@/lib/store/meeting-store';
import { DATE_GROUP_LABELS } from '@/lib/constants/labels';
import type { Meeting, MeetingStatus } from '@/types/meeting';

// Status indicator component
function StatusIndicator({ status }: { status: MeetingStatus }) {
  const colors = {
    scheduled: 'bg-primary',
    'in-progress': 'bg-success animate-pulse',
    completed: 'bg-foreground/40',
    cancelled: 'bg-error/40',
  };

  return <span className={`h-2 w-2 rounded-full ${colors[status]}`} />;
}

// Meeting item component with Fix 18: ARIA labels and keyboard support
function MeetingItem({
  meeting,
  isActive,
  onClick,
  onDelete,
  onRename,
  isDeleting = false,
  showConfirmDialog,
}: {
  meeting: Meeting;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
  isDeleting?: boolean;
  showConfirmDialog?: (meetingId: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(meeting.title);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click-outside handler to close menu (Fix: Ensure cleanup always runs)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showMenu && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    // Always add/remove listener to ensure proper cleanup
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleRename = () => {
    if (editTitle.trim() && editTitle !== meeting.title) {
      onRename(editTitle.trim());
    }
    setIsEditing(false);
    setShowMenu(false);
  };

  // Fix 18: Handle keyboard events for rename input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      setEditTitle(meeting.title);
      setIsEditing(false);
    }
  };

  // Fix 18: Handle keyboard events for menu
  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowMenu(false);
    }
  };

  return (
    <div
      className={`group relative rounded-lg px-3 py-2 transition-colors ${
        isActive
          ? 'bg-primary/10 text-foreground'
          : 'text-foreground-secondary hover:bg-foreground/5 hover:text-foreground'
      } ${isDeleting ? 'opacity-50' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        // Menu bleibt offen - wird durch Click-Outside-Handler geschlossen
      }}
      onKeyDown={handleMenuKeyDown}
      role="listitem"
    >
      {isEditing ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleRename}
            className="flex-1 rounded bg-background-secondary px-2 py-1 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
            autoFocus
            aria-label="Meeting-Titel bearbeiten"
          />
          <button
            onClick={handleRename}
            className="p-1 text-success hover:bg-success/10 rounded"
            aria-label="Umbenennung bestätigen"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              setEditTitle(meeting.title);
              setIsEditing(false);
            }}
            className="p-1 text-error hover:bg-error/10 rounded"
            aria-label="Umbenennung abbrechen"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={onClick}
          className="flex w-full items-center gap-2 text-left"
          aria-label={`Meeting: ${meeting.title}`}
          aria-current={isActive ? 'true' : undefined}
          disabled={isDeleting}
        >
          <StatusIndicator status={meeting.status} />
          <span className="flex-1 truncate text-sm">{meeting.title}</span>
          {isDeleting && (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
          )}
        </button>
      )}

      {/* Quick actions on hover or when menu is open */}
      {(isHovered || showMenu) && !isEditing && !isDeleting && (
        <div ref={menuRef} className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 rounded hover:bg-foreground/10"
            aria-label="Meeting-Aktionen öffnen"
            aria-haspopup="menu"
            aria-expanded={showMenu}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Dropdown menu */}
      <AnimatePresence>
        {showMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-foreground/10 bg-background p-1 shadow-lg"
            role="menu"
            aria-label="Meeting-Aktionen"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground-secondary hover:bg-foreground/5 hover:text-foreground"
              role="menuitem"
              aria-label="Meeting umbenennen"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Umbenennen
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                // Fix 10: Use confirmation dialog instead of browser confirm
                if (showConfirmDialog) {
                  showConfirmDialog(meeting.id);
                } else {
                  // Fallback to browser confirm if dialog not available
                  if (confirm('Meeting wirklich löschen?')) {
                    onDelete();
                  }
                }
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-error hover:bg-error/10"
              role="menuitem"
              aria-label="Meeting löschen"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Löschen
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Group meetings by date (Fix 17: Use constants for labels)
function groupMeetingsByDate(meetings: Meeting[]) {
  const groups: { label: string; meetings: Meeting[] }[] = [
    { label: DATE_GROUP_LABELS.today, meetings: [] },
    { label: DATE_GROUP_LABELS.yesterday, meetings: [] },
    { label: DATE_GROUP_LABELS.thisWeek, meetings: [] },
    { label: DATE_GROUP_LABELS.older, meetings: [] },
  ];

  // Deduplicate meetings by ID (may come from multiple sources)
  const seen = new Set<string>();
  const uniqueMeetings = meetings.filter((meeting) => {
    if (seen.has(meeting.id)) return false;
    seen.add(meeting.id);
    return true;
  });

  // Sort meetings by createdAt descending
  const sorted = [...uniqueMeetings].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  sorted.forEach((meeting) => {
    const date = new Date(meeting.createdAt);
    if (isToday(date)) {
      groups[0].meetings.push(meeting);
    } else if (isYesterday(date)) {
      groups[1].meetings.push(meeting);
    } else if (isThisWeek(date, { locale: de })) {
      groups[2].meetings.push(meeting);
    } else {
      groups[3].meetings.push(meeting);
    }
  });

  // Filter out empty groups
  return groups.filter((g) => g.meetings.length > 0);
}

export function MeetingSidebar() {
  const router = useRouter();
  const pathname = usePathname();

  // Fix: Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fix 13: Use selective store subscriptions to reduce re-renders
  const meetings = useMeetingStore((state) => state.meetings);
  const activeRoomId = useMeetingStore((state) => state.activeRoomId);
  const sidebarCollapsed = useMeetingStore((state) => state.sidebarCollapsed);
  const loadMeetings = useMeetingStore((state) => state.loadMeetings);
  const setActiveRoom = useMeetingStore((state) => state.setActiveRoom);
  const setSidebarCollapsed = useMeetingStore((state) => state.setSidebarCollapsed);
  const createRoomFromRecording = useMeetingStore((state) => state.createRoomFromRecording);
  const deleteMeeting = useMeetingStore((state) => state.deleteMeeting);
  const updateMeeting = useMeetingStore((state) => state.updateMeeting);
  const setError = useMeetingStore((state) => state.setError);

  // Fix 9: Loading states for async operations
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // Fix 10: Confirmation dialog state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Load meetings on mount
  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  // Group meetings by date
  const groupedMeetings = useMemo(() => groupMeetingsByDate(meetings), [meetings]);

  // Fix 4 & 9: Handle new meeting creation with error handling and loading state
  const handleNewMeeting = async () => {
    if (isCreating) return;

    try {
      setIsCreating(true);
      const meeting = await createRoomFromRecording();
      // Fix: Check mounted state before navigation and state updates
      if (!isMountedRef.current) return;
      router.push(`/meeting/room?id=${meeting.id}`);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen des Meetings');
    } finally {
      if (isMountedRef.current) {
        setIsCreating(false);
      }
    }
  };

  // Handle meeting click
  const handleMeetingClick = (meeting: Meeting) => {
    setActiveRoom(meeting.id);
    router.push(`/meeting/room?id=${meeting.id}`);
  };

  // Fix 4 & 9: Handle meeting delete with error handling and loading state
  const handleDeleteMeeting = async (meetingId: string) => {
    if (deletingId) return;

    try {
      setDeletingId(meetingId);
      await deleteMeeting(meetingId);
      // Fix: Check mounted state before state updates
      if (!isMountedRef.current) return;
      if (activeRoomId === meetingId) {
        setActiveRoom(null);
        router.push('/');
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen des Meetings');
    } finally {
      if (isMountedRef.current) {
        setDeletingId(null);
      }
    }
  };

  // Fix 4 & 9: Handle meeting rename with error handling and loading state
  const handleRenameMeeting = async (meetingId: string, newTitle: string) => {
    if (renamingId) return;

    try {
      setRenamingId(meetingId);
      await updateMeeting(meetingId, { title: newTitle });
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Fehler beim Umbenennen des Meetings');
    } finally {
      if (isMountedRef.current) {
        setRenamingId(null);
      }
    }
  };

  if (sidebarCollapsed) {
    return (
      <motion.aside
        initial={{ width: 60 }}
        animate={{ width: 60 }}
        className="flex h-screen w-[60px] flex-col border-r border-foreground/5 bg-background-secondary"
        role="navigation"
        aria-label="Meeting Navigation"
      >
        {/* Header with expand button */}
        <div className="flex h-14 items-center justify-center border-b border-foreground/5">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="p-2 text-foreground-secondary transition-colors hover:text-foreground"
            aria-label="Sidebar öffnen"
            aria-expanded="false"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* New Meeting Button */}
        <div className="flex flex-col items-center py-2">
          <button
            onClick={handleNewMeeting}
            disabled={isCreating}
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
              isCreating
                ? 'bg-primary/50 text-white/50 cursor-wait'
                : 'bg-primary text-white hover:bg-primary/90'
            }`}
            title="Neues Meeting"
            aria-label="Neues Meeting erstellen"
          >
            {isCreating ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Plus className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Meeting List as Icons */}
        <nav className="flex-1 overflow-y-auto py-2">
          <div className="flex flex-col items-center gap-1">
            {meetings.slice(0, 10).map((meeting) => (
              <button
                key={meeting.id}
                onClick={() => handleMeetingClick(meeting)}
                title={meeting.title}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                  activeRoomId === meeting.id
                    ? 'bg-primary/20 text-primary'
                    : 'text-foreground-secondary hover:bg-foreground/5 hover:text-foreground'
                }`}
                aria-label={`Meeting: ${meeting.title}`}
                aria-current={activeRoomId === meeting.id ? 'true' : undefined}
              >
                {/* Status Indicator */}
                <span
                  className={`absolute left-1 top-1 h-2 w-2 rounded-full ${
                    meeting.status === 'in-progress'
                      ? 'bg-success'
                      : meeting.status === 'scheduled'
                        ? 'bg-primary'
                        : meeting.status === 'completed'
                          ? 'bg-foreground/30'
                          : 'bg-error'
                  }`}
                  aria-hidden="true"
                />
                {/* First Letter */}
                <span className="text-xs font-medium">
                  {meeting.title.charAt(0).toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </nav>

        {/* Footer Spacer */}
        <div className="h-14" />
      </motion.aside>
    );
  }

  return (
    <motion.aside
      initial={{ width: 260 }}
      animate={{ width: 260 }}
      className="flex h-screen flex-col border-r border-foreground/5 bg-background-secondary"
      role="navigation"
      aria-label="Meeting Navigation"
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-foreground/5 px-4">
        <div className="flex items-center gap-2">
          <Mic className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="font-semibold text-foreground">Aurora</span>
        </div>
        <button
          onClick={() => setSidebarCollapsed(true)}
          className="p-1.5 text-foreground-secondary transition-colors hover:text-foreground"
          aria-label="Sidebar einklappen"
          aria-expanded="true"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* New Meeting Button */}
      <div className="p-3">
        <button
          onClick={handleNewMeeting}
          disabled={isCreating}
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            isCreating
              ? 'bg-primary/50 text-white/50 cursor-wait'
              : 'bg-primary text-white hover:bg-primary/90'
          }`}
          aria-label="Neues Meeting erstellen"
          aria-busy={isCreating}
        >
          {isCreating ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Erstelle...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Neues Meeting
            </>
          )}
        </button>
      </div>

      {/* Meeting List */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {groupedMeetings.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-foreground-secondary">
            <p>Keine Meetings</p>
            <p className="mt-1 text-xs">Starte dein erstes Meeting!</p>
          </div>
        ) : (
          groupedMeetings.map((group) => (
            <div key={group.label} className="mb-4">
              <div className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-foreground-secondary">
                {group.label}
              </div>
              <div className="space-y-0.5" role="list">
                {group.meetings.map((meeting) => (
                  <MeetingItem
                    key={meeting.id}
                    meeting={meeting}
                    isActive={activeRoomId === meeting.id}
                    onClick={() => handleMeetingClick(meeting)}
                    onDelete={() => handleDeleteMeeting(meeting.id)}
                    onRename={(newTitle) => handleRenameMeeting(meeting.id, newTitle)}
                    isDeleting={deletingId === meeting.id}
                    showConfirmDialog={(id) => setDeleteConfirmId(id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-foreground/5 p-3">
        <button
          onClick={() => router.push('/')}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
            pathname === '/'
              ? 'bg-foreground/5 text-foreground'
              : 'text-foreground-secondary hover:bg-foreground/5 hover:text-foreground'
          }`}
          aria-label="Zum Voice Mode wechseln"
          aria-current={pathname === '/' ? 'page' : undefined}
        >
          <Mic className="h-4 w-4" aria-hidden="true" />
          Voice Mode
        </button>
      </div>

      {/* Fix 10: Confirmation Dialog for Delete */}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setDeleteConfirmId(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-80 rounded-lg bg-background p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="delete-dialog-title" className="text-lg font-semibold text-foreground">
                Meeting löschen?
              </h3>
              <p className="mt-2 text-sm text-foreground-secondary">
                Möchten Sie dieses Meeting wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="rounded-lg px-4 py-2 text-sm text-foreground-secondary transition-colors hover:bg-foreground/5"
                  aria-label="Abbrechen"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    if (deleteConfirmId) {
                      handleDeleteMeeting(deleteConfirmId);
                      setDeleteConfirmId(null);
                    }
                  }}
                  className="rounded-lg bg-error px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-error/90"
                  aria-label="Meeting löschen bestätigen"
                >
                  Löschen
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
