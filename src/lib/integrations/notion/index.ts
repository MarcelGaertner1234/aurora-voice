// Notion Integration for Aurora Meeting Assistant
// Exports meetings, tasks, and notes to Notion

import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import {
  type Integration,
  type IntegrationConfig,
  type IntegrationCapabilities,
  type SyncResult,
  type ExportOptions,
  createIntegrationConfig,
  integrationRegistry,
} from '../index';
import type { Meeting } from '@/types/meeting';
import type { Task } from '@/types/task';

// Notion API types
interface NotionPage {
  id: string;
  object: 'page';
  properties: Record<string, NotionProperty>;
  url: string;
}

interface NotionProperty {
  type: string;
  title?: { text: { content: string } }[];
  rich_text?: { text: { content: string } }[];
  date?: { start: string; end?: string };
  select?: { name: string };
  multi_select?: { name: string }[];
  checkbox?: boolean;
  url?: string;
  people?: { id: string }[];
}

interface NotionDatabase {
  id: string;
  title: { text: { content: string } }[];
  properties: Record<string, { type: string }>;
}

// Notion settings
export interface NotionSettings {
  apiKey: string;
  meetingsDatabaseId?: string;
  tasksDatabaseId?: string;
  notesDatabaseId?: string;
  workspaceId?: string;
  defaultTags?: string[];
}

// Notion block types for content
type NotionBlockType =
  | 'paragraph'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'bulleted_list_item'
  | 'numbered_list_item'
  | 'to_do'
  | 'toggle'
  | 'divider'
  | 'callout'
  | 'quote';

interface NotionBlock {
  type: NotionBlockType;
  [key: string]: unknown;
}

// Notion API wrapper
class NotionAPI {
  private apiKey: string;
  private baseUrl = 'https://api.notion.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PATCH' = 'GET',
    body?: unknown
  ): Promise<T> {
    // Fix: Validate API key exists before making request
    if (!this.apiKey) {
      throw new Error('Notion API key is not configured');
    }

    // Fix: Add request timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch((parseErr) => {
          console.error('Failed to parse Notion API error response:', parseErr);
          return { message: response.statusText };
        });
        throw new Error(`Notion API error: ${error.message || response.statusText}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    try {
      await this.request('/users/me');
      return true;
    } catch {
      return false;
    }
  }

  // Get database
  async getDatabase(databaseId: string): Promise<NotionDatabase> {
    return this.request(`/databases/${databaseId}`);
  }

  // Query database
  async queryDatabase(
    databaseId: string,
    filter?: Record<string, unknown>,
    sorts?: Record<string, unknown>[]
  ): Promise<{ results: NotionPage[] }> {
    return this.request(`/databases/${databaseId}/query`, 'POST', {
      filter,
      sorts,
    });
  }

  // Create page
  async createPage(
    parentDatabaseId: string,
    properties: Record<string, NotionProperty>,
    children?: NotionBlock[]
  ): Promise<NotionPage> {
    return this.request('/pages', 'POST', {
      parent: { database_id: parentDatabaseId },
      properties,
      children,
    });
  }

  // Update page
  async updatePage(
    pageId: string,
    properties: Record<string, NotionProperty>
  ): Promise<NotionPage> {
    return this.request(`/pages/${pageId}`, 'PATCH', { properties });
  }

  // Append blocks to page
  async appendBlocks(pageId: string, children: NotionBlock[]): Promise<void> {
    await this.request(`/blocks/${pageId}/children`, 'PATCH', { children });
  }

  // Search
  async search(query: string): Promise<{ results: (NotionPage | NotionDatabase)[] }> {
    return this.request('/search', 'POST', { query });
  }
}

// Convert meeting to Notion properties
function meetingToNotionProperties(meeting: Meeting): Record<string, NotionProperty> {
  const properties: Record<string, NotionProperty> = {
    Name: {
      type: 'title',
      title: [{ text: { content: meeting.title } }],
    },
    Status: {
      type: 'select',
      select: { name: meeting.status },
    },
    Date: {
      type: 'date',
      date: {
        start: format(meeting.createdAt, 'yyyy-MM-dd'),
        end: meeting.endedAt ? format(meeting.endedAt, 'yyyy-MM-dd') : undefined,
      },
    },
  };

  if (meeting.description) {
    properties.Description = {
      type: 'rich_text',
      rich_text: [{ text: { content: meeting.description } }],
    };
  }

  if (meeting.tags && meeting.tags.length > 0) {
    properties.Tags = {
      type: 'multi_select',
      multi_select: meeting.tags.map(tag => ({ name: tag })),
    };
  }

  return properties;
}

// Convert task to Notion properties
function taskToNotionProperties(task: Task): Record<string, NotionProperty> {
  const properties: Record<string, NotionProperty> = {
    Name: {
      type: 'title',
      title: [{ text: { content: task.title } }],
    },
    Status: {
      type: 'select',
      select: { name: task.status },
    },
    Priority: {
      type: 'select',
      select: { name: task.priority },
    },
    Completed: {
      type: 'checkbox',
      checkbox: task.status === 'completed',
    },
  };

  if (task.description) {
    properties.Description = {
      type: 'rich_text',
      rich_text: [{ text: { content: task.description } }],
    };
  }

  if (task.dueDate) {
    properties.DueDate = {
      type: 'date',
      date: { start: format(task.dueDate, 'yyyy-MM-dd') },
    };
  }

  if (task.assigneeName) {
    properties.Assignee = {
      type: 'rich_text',
      rich_text: [{ text: { content: task.assigneeName } }],
    };
  }

  if (task.tags && task.tags.length > 0) {
    properties.Tags = {
      type: 'multi_select',
      multi_select: task.tags.map(tag => ({ name: tag })),
    };
  }

  return properties;
}

// Convert meeting content to Notion blocks
function meetingToNotionBlocks(meeting: Meeting): NotionBlock[] {
  const blocks: NotionBlock[] = [];

  // Summary section
  if (meeting.summary) {
    blocks.push({
      type: 'heading_2',
      heading_2: {
        rich_text: [{ text: { content: 'Zusammenfassung' } }],
      },
    });

    if (meeting.summary.overview) {
      blocks.push({
        type: 'paragraph',
        paragraph: {
          rich_text: [{ text: { content: meeting.summary.overview } }],
        },
      });
    }

    // Key points
    if (meeting.summary.keyPoints.length > 0) {
      blocks.push({
        type: 'heading_3',
        heading_3: {
          rich_text: [{ text: { content: 'Wichtige Punkte' } }],
        },
      });

      for (const point of meeting.summary.keyPoints) {
        blocks.push({
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: point } }],
          },
        });
      }
    }

    // Decisions
    if (meeting.summary.decisions.length > 0) {
      blocks.push({
        type: 'heading_3',
        heading_3: {
          rich_text: [{ text: { content: 'Entscheidungen' } }],
        },
      });

      for (const decision of meeting.summary.decisions) {
        blocks.push({
          type: 'callout',
          callout: {
            rich_text: [{ text: { content: decision.text } }],
            icon: { emoji: '✅' },
          },
        });
      }
    }
  }

  // Agenda
  if (meeting.agenda.length > 0) {
    blocks.push({ type: 'divider', divider: {} });
    blocks.push({
      type: 'heading_2',
      heading_2: {
        rich_text: [{ text: { content: 'Agenda' } }],
      },
    });

    for (const item of meeting.agenda) {
      blocks.push({
        type: 'to_do',
        to_do: {
          rich_text: [{ text: { content: item.title } }],
          checked: item.completed,
        },
      });
    }
  }

  return blocks;
}

// Notion Integration class
export class NotionIntegration implements Integration {
  type = 'notion' as const;
  config: IntegrationConfig;
  capabilities: IntegrationCapabilities = {
    canExportMeetings: true,
    canExportTasks: true,
    canSyncCalendar: false,
    canCreateTasks: true,
    canUpdateTasks: true,
    canImportData: false,
  };

  private api: NotionAPI | null = null;
  private settings: NotionSettings | null = null;

  constructor() {
    this.config = createIntegrationConfig(
      'notion',
      'Notion',
      'Export meetings and tasks to Notion databases',
      {}
    );
  }

  // Connect to Notion
  async connect(credentials: Record<string, string>): Promise<boolean> {
    const apiKey = credentials.apiKey;
    if (!apiKey) {
      throw new Error('Notion API key is required');
    }

    this.api = new NotionAPI(apiKey);
    const connected = await this.api.testConnection();

    if (connected) {
      this.settings = {
        apiKey,
        meetingsDatabaseId: credentials.meetingsDatabaseId,
        tasksDatabaseId: credentials.tasksDatabaseId,
        notesDatabaseId: credentials.notesDatabaseId,
      };
      this.config.settings = { ...this.settings, apiKey: '***' }; // Don't store full key
    }

    return connected;
  }

  // Disconnect
  async disconnect(): Promise<void> {
    this.api = null;
    this.settings = null;
    this.config.settings = {};
  }

  // Check connection
  isConnected(): boolean {
    return this.api !== null && this.settings !== null;
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    if (!this.api) return false;
    return this.api.testConnection();
  }

  // Export meeting to Notion
  async exportMeeting(meeting: Meeting): Promise<string | null> {
    if (!this.api || !this.settings?.meetingsDatabaseId) {
      throw new Error('Notion not connected or meetings database not configured');
    }

    const properties = meetingToNotionProperties(meeting);
    const blocks = meetingToNotionBlocks(meeting);

    const page = await this.api.createPage(
      this.settings.meetingsDatabaseId,
      properties,
      blocks
    );

    return page.url;
  }

  // Export task to Notion
  async exportTask(task: Task): Promise<string | null> {
    if (!this.api || !this.settings?.tasksDatabaseId) {
      throw new Error('Notion not connected or tasks database not configured');
    }

    const properties = taskToNotionProperties(task);
    const page = await this.api.createPage(this.settings.tasksDatabaseId, properties);

    return page.url;
  }

  // Export multiple tasks
  async exportTasks(tasks: Task[]): Promise<SyncResult> {
    const errors: string[] = [];
    let itemsSynced = 0;

    for (const task of tasks) {
      try {
        await this.exportTask(task);
        itemsSynced++;
      } catch (error) {
        errors.push(`Failed to export task "${task.title}": ${error}`);
      }
    }

    return {
      success: errors.length === 0,
      itemsSynced,
      errors,
      timestamp: new Date(),
    };
  }

  // Main export function
  async export(options: ExportOptions): Promise<SyncResult> {
    const errors: string[] = [];
    const itemsSynced = 0;

    // This would be implemented with actual meeting/task retrieval
    // For now, return a placeholder result

    return {
      success: errors.length === 0,
      itemsSynced,
      errors,
      timestamp: new Date(),
    };
  }

  // Update settings
  updateSettings(settings: Partial<NotionSettings>): void {
    if (this.settings) {
      this.settings = { ...this.settings, ...settings };
    }
  }

  // Get available databases (for setup)
  async getAvailableDatabases(): Promise<{ id: string; title: string }[]> {
    if (!this.api) {
      throw new Error('Notion not connected');
    }

    const result = await this.api.search('');
    const databases = result.results.filter(
      (item): item is NotionDatabase => 'title' in item && Array.isArray(item.title)
    );

    return databases.map(db => ({
      id: db.id,
      title: db.title[0]?.text?.content || 'Untitled',
    }));
  }
}

// Create and register the integration
export const notionIntegration = new NotionIntegration();
integrationRegistry.register(notionIntegration);
