// Task Types for Aurora Meeting Assistant

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// Task file attachment
export interface TaskAttachment {
  id: string;
  name: string;
  path: string;       // Local file path (via Tauri dialog)
  addedAt: Date;
}

export interface Task {
  id: string;
  meetingId: string;
  title: string;
  description?: string;
  assigneeId?: string; // speaker/participant ID
  assigneeName?: string; // fallback name if no speaker profile
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: Date;
  completedAt?: Date;
  // Source tracking
  sourceText?: string; // original text that created this task
  sourceTimestamp?: number; // ms from meeting start
  // Project context
  linkedFile?: string; // linked file path from project context
  // Metadata
  tags?: string[];
  notes?: string;
  attachments?: TaskAttachment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskCreateInput {
  meetingId: string;
  title: string;
  description?: string;
  assigneeId?: string;
  assigneeName?: string;
  priority?: TaskPriority;
  dueDate?: Date;
  sourceText?: string;
  sourceTimestamp?: number;
  linkedFile?: string;
  tags?: string[];
}

export interface TaskUpdateInput {
  title?: string;
  description?: string;
  assigneeId?: string;
  assigneeName?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date;
  notes?: string;
  tags?: string[];
}

// Task filter/query types
export interface TaskFilters {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  assigneeId?: string;
  meetingId?: string;
  hasDueDate?: boolean;
  overdue?: boolean;
  tags?: string[];
  searchQuery?: string;
}

export interface TaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  overdue: number;
}

// Task extraction type
export type TaskExtractionType = 'explicit' | 'implicit';

// AI-extracted task from transcript
export interface ExtractedTask {
  title: string;
  assigneeName?: string;
  dueDate?: string; // raw text like "next week", "Friday"
  priority: TaskPriority;
  sourceText: string;
  confidence: number; // 0-1
  type?: TaskExtractionType; // explicit = directly stated, implicit = inferred from context
  linkedFile?: string; // linked file path from project context
}

export interface TaskExtractionResult {
  tasks: ExtractedTask[];
  rawResponse: string;
}
