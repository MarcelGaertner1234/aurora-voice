'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Trash2,
  Calendar,
  User,
  Tag,
  MoreVertical,
  Play,
  Pause,
  RotateCcw,
  Bell,
  TrendingUp,
  Users,
  FileText,
} from 'lucide-react';
import { useTaskStore } from '@/lib/store/task-store';
import { taskManager, type TaskSortOptions, type TaskGroupBy, type TaskGroup } from '@/lib/tasks/manager';
import { taskReminders, type Reminder, type ReminderSummary } from '@/lib/tasks/reminders';
import { GlassCard } from '@/components/ui/glass-card';
import { TaskFiltersPanel, TaskQuickFilters } from '@/components/tasks/task-filters';
import type { Task, TaskStatus, TaskPriority, TaskFilters } from '@/types/task';

// Priority badge component
function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const config = {
    urgent: { label: 'Dringend', color: 'bg-red-500/20 text-red-400', icon: AlertTriangle },
    high: { label: 'Hoch', color: 'bg-orange-500/20 text-orange-400', icon: AlertCircle },
    medium: { label: 'Mittel', color: 'bg-yellow-500/20 text-yellow-400', icon: null },
    low: { label: 'Niedrig', color: 'bg-gray-500/20 text-gray-400', icon: null },
  };

  const { label, color, icon: Icon } = config[priority];

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </span>
  );
}

// Status icon component
function StatusIcon({ status, size = 'md' }: { status: TaskStatus; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  switch (status) {
    case 'completed':
      return <CheckCircle2 className={`${sizeClass} text-green-400`} />;
    case 'in-progress':
      return <Play className={`${sizeClass} text-blue-400`} />;
    case 'cancelled':
      return <Circle className={`${sizeClass} text-gray-400 line-through`} />;
    default:
      return <Circle className={`${sizeClass} text-amber-400`} />;
  }
}

// Task row component
function TaskRow({
  task,
  onStatusChange,
  onDelete,
  onView,
}: {
  task: Task;
  onStatusChange: (status: TaskStatus) => void;
  onDelete: () => void;
  onView: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  const isOverdue =
    task.dueDate &&
    new Date(task.dueDate) < new Date() &&
    task.status !== 'completed' &&
    task.status !== 'cancelled';

  const handleToggleStatus = () => {
    if (task.status === 'completed') {
      onStatusChange('pending');
    } else if (task.status === 'pending') {
      onStatusChange('in-progress');
    } else if (task.status === 'in-progress') {
      onStatusChange('completed');
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={`group flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-white/5 ${
        task.status === 'completed' ? 'opacity-60' : ''
      }`}
    >
      {/* Status toggle */}
      <button
        onClick={handleToggleStatus}
        className="mt-0.5 flex-shrink-0 transition-transform hover:scale-110"
      >
        <StatusIcon status={task.status} />
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onView}>
        <div className="flex items-center gap-2">
          <span
            className={`font-medium text-foreground ${
              task.status === 'completed' ? 'line-through text-foreground-secondary' : ''
            }`}
          >
            {task.title}
          </span>
          <PriorityBadge priority={task.priority} />
          {isOverdue && (
            <span className="text-xs text-red-400 font-medium">Überfällig</span>
          )}
        </div>

        {task.description && (
          <p className="mt-0.5 text-sm text-foreground-secondary line-clamp-1">
            {task.description}
          </p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-foreground-secondary">
          {task.assigneeName && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {task.assigneeName}
            </span>
          )}

          {task.dueDate && (
            <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-400' : ''}`}>
              <Calendar className="h-3 w-3" />
              {format(new Date(task.dueDate), 'dd. MMM', { locale: de })}
            </span>
          )}

          {task.tags && task.tags.length > 0 && (
            <span className="flex items-center gap-1">
              <Tag className="h-3 w-3" />
              {task.tags.slice(0, 2).join(', ')}
              {task.tags.length > 2 && ` +${task.tags.length - 2}`}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="relative flex items-center gap-1">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-foreground-secondary opacity-0 transition-all hover:bg-white/10 group-hover:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        <AnimatePresence>
          {showMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute right-0 top-8 z-10 min-w-[160px] rounded-lg bg-background-secondary border border-white/10 py-1 shadow-xl"
              onMouseLeave={() => setShowMenu(false)}
            >
              {task.status !== 'in-progress' && (
                <button
                  onClick={() => {
                    onStatusChange('in-progress');
                    setShowMenu(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground-secondary hover:bg-white/5"
                >
                  <Play className="h-4 w-4 text-blue-400" />
                  In Bearbeitung
                </button>
              )}
              {task.status !== 'completed' && (
                <button
                  onClick={() => {
                    onStatusChange('completed');
                    setShowMenu(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground-secondary hover:bg-white/5"
                >
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  Abschließen
                </button>
              )}
              {task.status === 'completed' && (
                <button
                  onClick={() => {
                    onStatusChange('pending');
                    setShowMenu(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground-secondary hover:bg-white/5"
                >
                  <RotateCcw className="h-4 w-4" />
                  Wiedereröffnen
                </button>
              )}
              <hr className="my-1 border-white/10" />
              <button
                onClick={() => {
                  onDelete();
                  setShowMenu(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-white/5"
              >
                <Trash2 className="h-4 w-4" />
                Löschen
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// Task group component
function TaskGroupSection({
  group,
  isExpanded,
  onToggle,
  onTaskStatusChange,
  onTaskDelete,
  onTaskView,
}: {
  group: TaskGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onTaskStatusChange: (taskId: string, status: TaskStatus) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskView: (taskId: string) => void;
}) {
  return (
    <div className="mb-4">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-foreground-secondary hover:text-foreground transition-colors"
      >
        <motion.span
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronRight className="h-4 w-4" />
        </motion.span>
        <span>{group.label}</span>
        <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-xs">
          {group.count}
        </span>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-4 border-l border-white/10 pl-2">
              {group.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onStatusChange={(status) => onTaskStatusChange(task.id, status)}
                  onDelete={() => onTaskDelete(task.id)}
                  onView={() => onTaskView(task.id)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Reminder panel component
function ReminderPanel({ reminders, onDismiss }: { reminders: Reminder[]; onDismiss: (id: string) => void }) {
  if (reminders.length === 0) return null;

  const priorityColors = {
    critical: 'border-red-500 bg-red-500/10',
    high: 'border-orange-500 bg-orange-500/10',
    medium: 'border-yellow-500 bg-yellow-500/10',
    low: 'border-gray-500 bg-gray-500/10',
  };

  return (
    <GlassCard variant="subtle" padding="sm" className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-medium text-foreground">Erinnerungen</span>
        <span className="text-xs text-foreground-secondary">({reminders.length})</span>
      </div>

      <div className="space-y-2">
        {reminders.slice(0, 5).map((reminder) => (
          <div
            key={reminder.id}
            className={`flex items-start gap-2 rounded-lg border-l-2 px-3 py-2 ${priorityColors[reminder.priority]}`}
          >
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground">{reminder.title}</div>
              <div className="text-xs text-foreground-secondary">{reminder.message}</div>
            </div>
            <button
              onClick={() => onDismiss(reminder.id)}
              className="text-foreground-secondary hover:text-foreground"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// Stats panel component
function StatsPanel({ stats }: { stats: { total: number; pending: number; inProgress: number; completed: number; overdue: number } }) {
  return (
    <div className="grid grid-cols-5 gap-3 mb-6">
      <GlassCard variant="subtle" padding="sm" className="text-center">
        <div className="text-xl font-bold text-foreground">{stats.total}</div>
        <div className="text-xs text-foreground-secondary">Gesamt</div>
      </GlassCard>
      <GlassCard variant="subtle" padding="sm" className="text-center">
        <div className="text-xl font-bold text-amber-400">{stats.pending}</div>
        <div className="text-xs text-foreground-secondary">Ausstehend</div>
      </GlassCard>
      <GlassCard variant="subtle" padding="sm" className="text-center">
        <div className="text-xl font-bold text-blue-400">{stats.inProgress}</div>
        <div className="text-xs text-foreground-secondary">In Arbeit</div>
      </GlassCard>
      <GlassCard variant="subtle" padding="sm" className="text-center">
        <div className="text-xl font-bold text-green-400">{stats.completed}</div>
        <div className="text-xs text-foreground-secondary">Erledigt</div>
      </GlassCard>
      <GlassCard variant="subtle" padding="sm" className="text-center">
        <div className="text-xl font-bold text-red-400">{stats.overdue}</div>
        <div className="text-xs text-foreground-secondary">Überfällig</div>
      </GlassCard>
    </div>
  );
}

export default function TasksPage() {
  const router = useRouter();
  const {
    tasks,
    filteredTasks,
    isLoading,
    error,
    stats,
    filters,
    loadTasks,
    setTaskStatus,
    deleteTask,
    setFilters,
    clearError,
  } = useTaskStore();

  // Local state
  const [sortOptions, setSortOptions] = useState<TaskSortOptions>({
    field: 'priority',
    order: 'desc',
  });
  const [groupBy, setGroupBy] = useState<TaskGroupBy>('status');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['pending', 'in-progress']));
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('grouped');

  // Load tasks on mount
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Check reminders
  useEffect(() => {
    const checkReminders = async () => {
      const activeReminders = await taskReminders.checkReminders();
      setReminders(activeReminders);
    };

    checkReminders();
    const interval = setInterval(checkReminders, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(interval);
  }, [tasks]);

  // Get all tags and assignees for filters
  const availableTags = useMemo(() => taskManager.getAllTags(tasks), [tasks]);
  const availableAssignees = useMemo(() => taskManager.getAllAssignees(tasks), [tasks]);

  // Sort and group tasks
  const sortedTasks = useMemo(
    () => taskManager.sortTasks(filteredTasks, sortOptions),
    [filteredTasks, sortOptions]
  );

  const groupedTasks = useMemo(
    () => taskManager.groupTasks(sortedTasks, groupBy),
    [sortedTasks, groupBy]
  );

  // Handlers
  const handleTaskStatusChange = useCallback(
    async (taskId: string, status: TaskStatus) => {
      await setTaskStatus(taskId, status);
    },
    [setTaskStatus]
  );

  const handleTaskDelete = useCallback(
    async (taskId: string) => {
      if (confirm('Aufgabe wirklich löschen?')) {
        await deleteTask(taskId);
      }
    },
    [deleteTask]
  );

  const handleTaskView = useCallback(
    (taskId: string) => {
      // Could navigate to task detail view
      console.log('View task:', taskId);
    },
    []
  );

  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  const handleDismissReminder = useCallback((reminderId: string) => {
    taskReminders.dismissReminder(reminderId);
    setReminders((prev) => prev.filter((r) => r.id !== reminderId));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="titlebar-drag-region sticky top-0 z-40 flex h-14 items-center justify-between border-b border-foreground/5 bg-background/80 px-4 backdrop-blur-xl">
        <div className="titlebar-no-drag flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="flex h-8 w-8 items-center justify-center rounded-full text-foreground-secondary transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-sm font-medium text-foreground">Aufgaben</h1>
        </div>

        <div className="titlebar-no-drag flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-lg bg-foreground/5 p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`rounded-md px-3 py-1 text-xs transition-colors ${
                viewMode === 'list'
                  ? 'bg-primary text-white'
                  : 'text-foreground-secondary hover:text-foreground'
              }`}
            >
              Liste
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={`rounded-md px-3 py-1 text-xs transition-colors ${
                viewMode === 'grouped'
                  ? 'bg-primary text-white'
                  : 'text-foreground-secondary hover:text-foreground'
              }`}
            >
              Gruppiert
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-6">
        {/* Error Alert */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 flex items-start gap-3 rounded-lg bg-error/10 p-4 text-error"
            >
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">{error}</p>
              </div>
              <button onClick={clearError} className="text-error/60 hover:text-error">
                ×
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reminders */}
        <ReminderPanel reminders={reminders} onDismiss={handleDismissReminder} />

        {/* Stats */}
        <StatsPanel stats={stats} />

        {/* Filters */}
        <TaskFiltersPanel
          filters={filters}
          onFiltersChange={setFilters}
          sortOptions={sortOptions}
          onSortChange={setSortOptions}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          availableTags={availableTags}
          availableAssignees={availableAssignees}
        />

        {/* Task List */}
        {isLoading ? (
          <div className="text-center py-12 text-foreground-secondary">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-2 text-sm">Lade Aufgaben...</p>
          </div>
        ) : sortedTasks.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <div className="mb-4 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/5">
                <CheckCircle2 className="h-8 w-8 text-foreground-secondary" />
              </div>
            </div>
            <h3 className="text-lg font-medium text-foreground">Keine Aufgaben</h3>
            <p className="mt-1 text-sm text-foreground-secondary">
              Aufgaben werden automatisch aus Meetings extrahiert.
            </p>
          </motion.div>
        ) : viewMode === 'grouped' ? (
          <GlassCard>
            {groupedTasks.map((group) => (
              <TaskGroupSection
                key={group.key}
                group={group}
                isExpanded={expandedGroups.has(group.key)}
                onToggle={() => toggleGroup(group.key)}
                onTaskStatusChange={handleTaskStatusChange}
                onTaskDelete={handleTaskDelete}
                onTaskView={handleTaskView}
              />
            ))}
          </GlassCard>
        ) : (
          <GlassCard>
            <AnimatePresence mode="popLayout">
              {sortedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onStatusChange={(status) => handleTaskStatusChange(task.id, status)}
                  onDelete={() => handleTaskDelete(task.id)}
                  onView={() => handleTaskView(task.id)}
                />
              ))}
            </AnimatePresence>
          </GlassCard>
        )}

        {/* Quick stats at bottom */}
        {sortedTasks.length > 0 && (
          <div className="mt-6 text-center text-xs text-foreground-secondary">
            {filteredTasks.length} von {tasks.length} Aufgaben angezeigt
          </div>
        )}
      </main>
    </div>
  );
}
