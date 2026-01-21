// Jira Integration for Aurora Meeting Assistant
// Create and sync tasks with Jira issues

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
import type { Task, TaskPriority, TaskStatus } from '@/types/task';

// Jira API types
interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: string;
    status: { name: string; id: string };
    priority?: { name: string; id: string };
    assignee?: { accountId: string; displayName: string };
    duedate?: string;
    labels?: string[];
    issuetype: { name: string; id: string };
    project: { key: string; name: string };
  };
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
  issueTypes: { id: string; name: string }[];
}

interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

interface JiraSearchResult {
  issues: JiraIssue[];
  total: number;
  maxResults: number;
}

// Jira settings
export interface JiraSettings {
  domain: string; // e.g., 'your-company.atlassian.net'
  email: string;
  apiToken: string;
  defaultProjectKey?: string;
  defaultIssueType?: string;
}

// Priority mapping
const PRIORITY_MAP: Record<TaskPriority, string> = {
  urgent: 'Highest',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const REVERSE_PRIORITY_MAP: Record<string, TaskPriority> = {
  'Highest': 'urgent',
  'High': 'high',
  'Medium': 'medium',
  'Low': 'low',
  'Lowest': 'low',
};

// Status mapping
const STATUS_MAP: Record<TaskStatus, string[]> = {
  'pending': ['To Do', 'Open', 'Backlog', 'New'],
  'in-progress': ['In Progress', 'In Review', 'In Development'],
  'completed': ['Done', 'Closed', 'Resolved'],
  'cancelled': ['Cancelled', 'Won\'t Do', 'Declined'],
};

// Jira API wrapper
class JiraAPI {
  private domain: string;
  private authHeader: string;

  constructor(domain: string, email: string, apiToken: string) {
    this.domain = domain.replace(/\/$/, '');
    // Jira uses Basic auth with email:token
    this.authHeader = 'Basic ' + btoa(`${email}:${apiToken}`);
  }

  private get baseUrl(): string {
    return `https://${this.domain}/rest/api/3`;
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: unknown
  ): Promise<T> {
    // Fix: Validate credentials exist before making request
    if (!this.authHeader) {
      throw new Error('Jira credentials are not configured');
    }

    // Fix: Add request timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch((parseErr) => {
          console.error('Failed to parse Jira API error response:', parseErr);
          return { errorMessages: [response.statusText] };
        });
        const message = error.errorMessages?.join(', ') || error.message || response.statusText;
        throw new Error(`Jira API error: ${message}`);
      }

      // Handle empty responses
      const text = await response.text();
      if (!text) return {} as T;

      return JSON.parse(text);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    try {
      await this.request('/myself');
      return true;
    } catch {
      return false;
    }
  }

  // Get current user
  async getCurrentUser(): Promise<JiraUser> {
    return this.request('/myself');
  }

  // Get projects
  async getProjects(): Promise<JiraProject[]> {
    const result = await this.request<{ values: JiraProject[] }>('/project/search');
    return result.values;
  }

  // Get project details with issue types
  async getProject(projectKey: string): Promise<JiraProject> {
    return this.request(`/project/${projectKey}`);
  }

  // Search issues
  async searchIssues(jql: string, maxResults: number = 50): Promise<JiraSearchResult> {
    return this.request('/search', 'POST', {
      jql,
      maxResults,
      fields: ['summary', 'description', 'status', 'priority', 'assignee', 'duedate', 'labels', 'issuetype', 'project'],
    });
  }

  // Get issue by key
  async getIssue(issueKey: string): Promise<JiraIssue> {
    return this.request(`/issue/${issueKey}`);
  }

  // Create issue
  async createIssue(
    projectKey: string,
    issueType: string,
    summary: string,
    description?: string,
    priority?: string,
    dueDate?: string,
    labels?: string[],
    assigneeId?: string
  ): Promise<JiraIssue> {
    const fields: Record<string, unknown> = {
      project: { key: projectKey },
      issuetype: { name: issueType },
      summary,
    };

    if (description) {
      // Jira uses Atlassian Document Format (ADF) for description
      fields.description = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: description }],
          },
        ],
      };
    }

    if (priority) {
      fields.priority = { name: priority };
    }

    if (dueDate) {
      fields.duedate = dueDate;
    }

    if (labels && labels.length > 0) {
      fields.labels = labels;
    }

    if (assigneeId) {
      fields.assignee = { accountId: assigneeId };
    }

    return this.request('/issue', 'POST', { fields });
  }

  // Update issue
  async updateIssue(
    issueKey: string,
    updates: {
      summary?: string;
      description?: string;
      priority?: string;
      dueDate?: string;
      labels?: string[];
    }
  ): Promise<void> {
    const fields: Record<string, unknown> = {};

    if (updates.summary) {
      fields.summary = updates.summary;
    }

    if (updates.description) {
      fields.description = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: updates.description }],
          },
        ],
      };
    }

    if (updates.priority) {
      fields.priority = { name: updates.priority };
    }

    if (updates.dueDate) {
      fields.duedate = updates.dueDate;
    }

    if (updates.labels) {
      fields.labels = updates.labels;
    }

    await this.request(`/issue/${issueKey}`, 'PUT', { fields });
  }

  // Transition issue (change status)
  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    await this.request(`/issue/${issueKey}/transitions`, 'POST', {
      transition: { id: transitionId },
    });
  }

  // Get available transitions for an issue
  async getTransitions(issueKey: string): Promise<{ id: string; name: string; to: { name: string } }[]> {
    const result = await this.request<{ transitions: { id: string; name: string; to: { name: string } }[] }>(
      `/issue/${issueKey}/transitions`
    );
    return result.transitions;
  }

  // Search users (Fix: Add input validation and use URL object for proper URL construction)
  async searchUsers(query: string): Promise<JiraUser[]> {
    // Fix: Validate query length to prevent API issues
    const MAX_QUERY_LENGTH = 256;
    if (!query || query.length === 0) {
      throw new Error('Search query cannot be empty');
    }
    if (query.length > MAX_QUERY_LENGTH) {
      throw new Error(`Search query too long (max ${MAX_QUERY_LENGTH} characters)`);
    }
    // Fix: Use URL object for proper URL construction instead of string concatenation
    const url = new URL(`${this.baseUrl}/user/search`);
    url.searchParams.set('query', query);
    // Extract the path and query string for the request method
    const endpoint = url.pathname.replace('/rest/api/3', '') + url.search;
    return this.request(endpoint);
  }

  // Add comment
  async addComment(issueKey: string, comment: string): Promise<void> {
    await this.request(`/issue/${issueKey}/comment`, 'POST', {
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: comment }],
          },
        ],
      },
    });
  }
}

// Convert task to Jira issue fields
function taskToJiraFields(task: Task, settings: JiraSettings): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    project: { key: settings.defaultProjectKey },
    issuetype: { name: settings.defaultIssueType || 'Task' },
    summary: task.title,
  };

  if (task.description) {
    fields.description = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: task.description }],
        },
      ],
    };
  }

  fields.priority = { name: PRIORITY_MAP[task.priority] };

  if (task.dueDate) {
    fields.duedate = format(task.dueDate, 'yyyy-MM-dd');
  }

  if (task.tags && task.tags.length > 0) {
    fields.labels = task.tags;
  }

  return fields;
}

// Map Jira status to Task status
function mapJiraStatusToTaskStatus(jiraStatus: string): TaskStatus {
  for (const [taskStatus, jiraStatuses] of Object.entries(STATUS_MAP)) {
    if (jiraStatuses.some(s => s.toLowerCase() === jiraStatus.toLowerCase())) {
      return taskStatus as TaskStatus;
    }
  }
  return 'pending';
}

// Jira Integration class
export class JiraIntegration implements Integration {
  type = 'jira' as const;
  config: IntegrationConfig;
  capabilities: IntegrationCapabilities = {
    canExportMeetings: false,
    canExportTasks: true,
    canSyncCalendar: false,
    canCreateTasks: true,
    canUpdateTasks: true,
    canImportData: true,
  };

  private api: JiraAPI | null = null;
  private settings: JiraSettings | null = null;

  constructor() {
    this.config = createIntegrationConfig(
      'jira',
      'Jira',
      'Create and sync tasks with Jira issues',
      {}
    );
  }

  // Connect to Jira
  async connect(credentials: Record<string, string>): Promise<boolean> {
    const { domain, email, apiToken } = credentials;

    if (!domain || !email || !apiToken) {
      throw new Error('Jira domain, email, and API token are required');
    }

    this.api = new JiraAPI(domain, email, apiToken);
    const connected = await this.api.testConnection();

    if (connected) {
      this.settings = {
        domain,
        email,
        apiToken,
        defaultProjectKey: credentials.defaultProjectKey,
        defaultIssueType: credentials.defaultIssueType || 'Task',
      };
      this.config.settings = {
        domain,
        email: '***',
        defaultProjectKey: this.settings.defaultProjectKey,
        defaultIssueType: this.settings.defaultIssueType,
      };
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

  // Create issue from task
  async createIssueFromTask(task: Task): Promise<string | null> {
    if (!this.api || !this.settings?.defaultProjectKey) {
      throw new Error('Jira not connected or default project not configured');
    }

    const issue = await this.api.createIssue(
      this.settings.defaultProjectKey,
      this.settings.defaultIssueType || 'Task',
      task.title,
      task.description,
      PRIORITY_MAP[task.priority],
      task.dueDate ? format(task.dueDate, 'yyyy-MM-dd') : undefined,
      task.tags
    );

    return issue.key;
  }

  // Export tasks to Jira
  async exportTasks(tasks: Task[]): Promise<SyncResult> {
    const errors: string[] = [];
    let itemsSynced = 0;

    for (const task of tasks) {
      try {
        await this.createIssueFromTask(task);
        itemsSynced++;
      } catch (error) {
        errors.push(`Failed to create issue for "${task.title}": ${error}`);
      }
    }

    return {
      success: errors.length === 0,
      itemsSynced,
      errors,
      timestamp: new Date(),
    };
  }

  // Sync task status with Jira issue
  async syncTaskStatus(issueKey: string, targetStatus: TaskStatus): Promise<boolean> {
    if (!this.api) {
      throw new Error('Jira not connected');
    }

    const transitions = await this.api.getTransitions(issueKey);
    const targetStatuses = STATUS_MAP[targetStatus];

    // Find matching transition
    const transition = transitions.find(t =>
      targetStatuses.some(s => s.toLowerCase() === t.to.name.toLowerCase())
    );

    if (transition) {
      await this.api.transitionIssue(issueKey, transition.id);
      return true;
    }

    return false;
  }

  // Import issues as tasks (for sync)
  async importIssues(jql: string): Promise<{
    issues: JiraIssue[];
    tasks: Partial<Task>[];
  }> {
    if (!this.api) {
      throw new Error('Jira not connected');
    }

    const result = await this.api.searchIssues(jql);

    const tasks: Partial<Task>[] = result.issues.map(issue => ({
      title: issue.fields.summary,
      description: typeof issue.fields.description === 'string'
        ? issue.fields.description
        : undefined,
      status: mapJiraStatusToTaskStatus(issue.fields.status.name),
      priority: issue.fields.priority
        ? REVERSE_PRIORITY_MAP[issue.fields.priority.name] || 'medium'
        : 'medium',
      dueDate: issue.fields.duedate ? new Date(issue.fields.duedate) : undefined,
      assigneeName: issue.fields.assignee?.displayName,
      tags: issue.fields.labels,
    }));

    return { issues: result.issues, tasks };
  }

  // Main export function
  async export(options: ExportOptions): Promise<SyncResult> {
    // This would be implemented with actual task retrieval
    return {
      success: true,
      itemsSynced: 0,
      errors: [],
      timestamp: new Date(),
    };
  }

  // Sync function
  async sync(): Promise<SyncResult> {
    if (!this.api || !this.settings?.defaultProjectKey) {
      throw new Error('Jira not connected or default project not configured');
    }

    // This would sync between local tasks and Jira issues
    return {
      success: true,
      itemsSynced: 0,
      errors: [],
      timestamp: new Date(),
    };
  }

  // Get available projects
  async getProjects(): Promise<{ key: string; name: string }[]> {
    if (!this.api) {
      throw new Error('Jira not connected');
    }

    const projects = await this.api.getProjects();
    return projects.map(p => ({ key: p.key, name: p.name }));
  }

  // Update settings
  updateSettings(settings: Partial<JiraSettings>): void {
    if (this.settings) {
      this.settings = { ...this.settings, ...settings };
    }
  }
}

// Create and register the integration
export const jiraIntegration = new JiraIntegration();
integrationRegistry.register(jiraIntegration);
