// Task Store for Aurora Meeting Assistant

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  Task,
  TaskStatus,
  TaskPriority,
  TaskCreateInput,
  TaskUpdateInput,
  TaskFilters,
  TaskStats,
  TaskAttachment,
} from '@/types/task';
import {
  getAllTasks,
  getTaskById,
  getTasksByMeetingId,
  getTasksByAssignee,
  getTasksByStatus,
  saveTask,
  saveTasks,
  deleteTask as dbDeleteTask,
  getTaskStats as dbGetTaskStats,
} from '@/lib/db';
import { getProjectStorageProvider } from '@/lib/storage';
import { generateTasksMarkdown } from '@/lib/export/file-exporter';
import type { Meeting } from '@/types/meeting';

interface TaskState {
  // Tasks list
  tasks: Task[];
  isLoading: boolean;
  error: string | null;

  // Filters
  filters: TaskFilters;
  filteredTasks: Task[];

  // Stats
  stats: TaskStats;

  // Actions - CRUD
  loadTasks: () => Promise<void>;
  loadTasksForMeeting: (meetingId: string) => Promise<Task[]>;
  getTask: (id: string) => Promise<Task | undefined>;
  createTask: (input: TaskCreateInput, meeting?: Meeting) => Promise<Task>;
  createTasks: (inputs: TaskCreateInput[], meeting?: Meeting) => Promise<Task[]>;
  updateTask: (id: string, input: TaskUpdateInput) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  // Actions - Export
  exportTasksMarkdown: (meeting: Meeting, tasks: Task[]) => Promise<void>;

  // Actions - Notes & Attachments
  updateTaskNotes: (taskId: string, notes: string) => Promise<void>;
  addTaskAttachment: (taskId: string, attachment: Omit<TaskAttachment, 'id' | 'addedAt'>) => Promise<void>;
  removeTaskAttachment: (taskId: string, attachmentId: string) => Promise<void>;

  // Actions - Status
  setTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  reopenTask: (id: string) => Promise<void>;

  // Actions - Filters
  setFilters: (filters: TaskFilters) => void;
  clearFilters: () => void;
  applyFilters: () => void;

  // Actions - Stats
  refreshStats: () => Promise<void>;

  // Actions - Error handling
  setError: (error: string | null) => void;
  clearError: () => void;
}

// Helper to filter tasks
function filterTasks(tasks: Task[], filters: TaskFilters): Task[] {
  return tasks.filter((task) => {
    // Status filter
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      if (!statuses.includes(task.status)) return false;
    }

    // Priority filter
    if (filters.priority) {
      const priorities = Array.isArray(filters.priority) ? filters.priority : [filters.priority];
      if (!priorities.includes(task.priority)) return false;
    }

    // Assignee filter
    if (filters.assigneeId && task.assigneeId !== filters.assigneeId) {
      return false;
    }

    // Meeting filter
    if (filters.meetingId && task.meetingId !== filters.meetingId) {
      return false;
    }

    // Due date filter
    if (filters.hasDueDate !== undefined) {
      const hasDue = task.dueDate !== undefined;
      if (filters.hasDueDate !== hasDue) return false;
    }

    // Overdue filter
    if (filters.overdue) {
      const now = new Date();
      const isOverdue =
        task.dueDate &&
        task.dueDate < now &&
        task.status !== 'completed' &&
        task.status !== 'cancelled';
      if (!isOverdue) return false;
    }

    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      if (!task.tags || !filters.tags.some((tag) => task.tags?.includes(tag))) {
        return false;
      }
    }

    // Search query
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const matchesTitle = task.title.toLowerCase().includes(query);
      const matchesDescription = task.description?.toLowerCase().includes(query);
      const matchesAssignee = task.assigneeName?.toLowerCase().includes(query);
      if (!matchesTitle && !matchesDescription && !matchesAssignee) {
        return false;
      }
    }

    return true;
  });
}

export const useTaskStore = create<TaskState>((set, get) => ({
  // Initial state
  tasks: [],
  isLoading: false,
  error: null,
  filters: {},
  filteredTasks: [],
  stats: {
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
    overdue: 0,
  },

  // Load all tasks from IndexedDB
  loadTasks: async () => {
    set({ isLoading: true, error: null });
    try {
      const tasks = await getAllTasks();
      // Use set() callback to get current filters (avoids stale state after await)
      set((state) => ({
        tasks,
        filteredTasks: filterTasks(tasks, state.filters),
        isLoading: false,
      }));
      // Await refreshStats to ensure proper error handling
      await await get().refreshStats();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load tasks',
        isLoading: false,
      });
    }
  },

  // Load tasks for a specific meeting
  loadTasksForMeeting: async (meetingId: string) => {
    try {
      const tasks = await getTasksByMeetingId(meetingId);
      return tasks;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load meeting tasks' });
      return [];
    }
  },

  // Get a single task
  getTask: async (id: string) => {
    try {
      return await getTaskById(id);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to get task' });
      return undefined;
    }
  },

  // Create a new task
  createTask: async (input: TaskCreateInput, meeting?: Meeting) => {
    const now = new Date();
    const task: Task = {
      id: uuidv4(),
      meetingId: input.meetingId,
      title: input.title,
      description: input.description,
      assigneeId: input.assigneeId,
      assigneeName: input.assigneeName,
      status: 'pending',
      priority: input.priority || 'medium',
      dueDate: input.dueDate,
      sourceText: input.sourceText,
      sourceTimestamp: input.sourceTimestamp,
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await saveTask(task);
      set((state) => {
        const tasks = [task, ...state.tasks];
        return {
          tasks,
          filteredTasks: filterTasks(tasks, state.filters),
        };
      });
      await await get().refreshStats();

      // Auto-export tasks markdown if meeting has a project path (non-critical)
      if (meeting?.projectPath) {
        try {
          const meetingTasks = await getTasksByMeetingId(input.meetingId);
          await get().exportTasksMarkdown(meeting, meetingTasks);
        } catch (exportErr) {
          console.warn('Failed to export tasks markdown (non-critical):', exportErr);
        }
      }

      return task;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create task' });
      throw err;
    }
  },

  // Create multiple tasks (batch)
  createTasks: async (inputs: TaskCreateInput[], meeting?: Meeting) => {
    const now = new Date();
    const tasks: Task[] = inputs.map((input) => ({
      id: uuidv4(),
      meetingId: input.meetingId,
      title: input.title,
      description: input.description,
      assigneeId: input.assigneeId,
      assigneeName: input.assigneeName,
      status: 'pending',
      priority: input.priority || 'medium',
      dueDate: input.dueDate,
      sourceText: input.sourceText,
      sourceTimestamp: input.sourceTimestamp,
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
    }));

    try {
      await saveTasks(tasks);
      set((state) => {
        const allTasks = [...tasks, ...state.tasks];
        return {
          tasks: allTasks,
          filteredTasks: filterTasks(allTasks, state.filters),
        };
      });
      await get().refreshStats();

      // Auto-export tasks markdown if meeting has a project path
      if (meeting?.projectPath && inputs.length > 0) {
        const meetingId = inputs[0].meetingId;
        const meetingTasks = await getTasksByMeetingId(meetingId);
        await get().exportTasksMarkdown(meeting, meetingTasks);
      }

      return tasks;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create tasks' });
      throw err;
    }
  },

  // Update a task
  updateTask: async (id: string, input: TaskUpdateInput) => {
    const task = await getTaskById(id);
    if (!task) {
      throw new Error('Task not found');
    }

    const updated: Task = {
      ...task,
      ...input,
      updatedAt: new Date(),
    };

    try {
      await saveTask(updated);
      set((state) => {
        const tasks = state.tasks.map((t) => (t.id === id ? updated : t));
        return {
          tasks,
          filteredTasks: filterTasks(tasks, state.filters),
        };
      });
      await get().refreshStats();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update task' });
      throw err;
    }
  },

  // Delete a task
  deleteTask: async (id: string) => {
    try {
      await dbDeleteTask(id);
      set((state) => {
        const tasks = state.tasks.filter((t) => t.id !== id);
        return {
          tasks,
          filteredTasks: filterTasks(tasks, state.filters),
        };
      });
      await get().refreshStats();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete task' });
      throw err;
    }
  },

  // Set task status
  setTaskStatus: async (id: string, status: TaskStatus) => {
    const task = await getTaskById(id);
    if (!task) {
      throw new Error('Task not found');
    }

    const updated: Task = {
      ...task,
      status,
      completedAt: status === 'completed' ? new Date() : task.completedAt,
      updatedAt: new Date(),
    };

    try {
      await saveTask(updated);
      set((state) => {
        const tasks = state.tasks.map((t) => (t.id === id ? updated : t));
        return {
          tasks,
          filteredTasks: filterTasks(tasks, state.filters),
        };
      });
      await get().refreshStats();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update task status' });
      throw err;
    }
  },

  // Complete a task
  completeTask: async (id: string) => {
    await get().setTaskStatus(id, 'completed');
  },

  // Reopen a task
  reopenTask: async (id: string) => {
    const task = await getTaskById(id);
    if (!task) {
      throw new Error('Task not found');
    }

    const updated: Task = {
      ...task,
      status: 'pending',
      completedAt: undefined,
      updatedAt: new Date(),
    };

    try {
      await saveTask(updated);
      set((state) => {
        const tasks = state.tasks.map((t) => (t.id === id ? updated : t));
        return {
          tasks,
          filteredTasks: filterTasks(tasks, state.filters),
        };
      });
      await get().refreshStats();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to reopen task' });
      throw err;
    }
  },

  // Set filters
  setFilters: (filters: TaskFilters) => {
    set((state) => ({
      filters,
      filteredTasks: filterTasks(state.tasks, filters),
    }));
  },

  // Clear filters
  clearFilters: () => {
    set((state) => ({
      filters: {},
      filteredTasks: state.tasks,
    }));
  },

  // Apply current filters
  applyFilters: () => {
    set((state) => ({
      filteredTasks: filterTasks(state.tasks, state.filters),
    }));
  },

  // Refresh stats
  refreshStats: async () => {
    try {
      const stats = await dbGetTaskStats();
      set({ stats });
    } catch (err) {
      console.error('Failed to refresh task stats:', err);
    }
  },

  // Export tasks markdown to project folder
  exportTasksMarkdown: async (meeting: Meeting, tasks: Task[]) => {
    if (!meeting.projectPath) {
      console.log('No project path, skipping tasks markdown export');
      return;
    }

    try {
      const projectProvider = getProjectStorageProvider(meeting.projectPath);
      const fs = projectProvider.getFileSystem();
      const tasksMd = generateTasksMarkdown(tasks, meeting.title);
      await fs.saveTasksMarkdown(meeting, tasksMd);
      console.log('Tasks markdown exported');
    } catch (err) {
      console.error('Failed to export tasks markdown:', err);
    }
  },

  // Update task notes
  updateTaskNotes: async (taskId: string, notes: string) => {
    const task = await getTaskById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const updated: Task = {
      ...task,
      notes,
      updatedAt: new Date(),
    };

    try {
      await saveTask(updated);
      set((state) => {
        const tasks = state.tasks.map((t) => (t.id === taskId ? updated : t));
        return {
          tasks,
          filteredTasks: filterTasks(tasks, state.filters),
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update task notes' });
      throw err;
    }
  },

  // Add attachment to task
  addTaskAttachment: async (taskId: string, attachment: Omit<TaskAttachment, 'id' | 'addedAt'>) => {
    const task = await getTaskById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const newAttachment: TaskAttachment = {
      id: uuidv4(),
      ...attachment,
      addedAt: new Date(),
    };

    const updated: Task = {
      ...task,
      attachments: [...(task.attachments || []), newAttachment],
      updatedAt: new Date(),
    };

    try {
      await saveTask(updated);
      set((state) => {
        const tasks = state.tasks.map((t) => (t.id === taskId ? updated : t));
        return {
          tasks,
          filteredTasks: filterTasks(tasks, state.filters),
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to add attachment' });
      throw err;
    }
  },

  // Remove attachment from task
  removeTaskAttachment: async (taskId: string, attachmentId: string) => {
    const task = await getTaskById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const updated: Task = {
      ...task,
      attachments: (task.attachments || []).filter((a) => a.id !== attachmentId),
      updatedAt: new Date(),
    };

    try {
      await saveTask(updated);
      set((state) => {
        const tasks = state.tasks.map((t) => (t.id === taskId ? updated : t));
        return {
          tasks,
          filteredTasks: filterTasks(tasks, state.filters),
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to remove attachment' });
      throw err;
    }
  },

  // Error handling
  setError: (error: string | null) => set({ error }),
  clearError: () => set({ error: null }),
}));
