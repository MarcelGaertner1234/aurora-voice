// Linear Integration for Aurora Meeting Assistant
// Create and sync tasks with Linear issues

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

// Linear API types
interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  url: string;
  state: {
    id: string;
    name: string;
    type: string;
  };
  priority: number;
  assignee?: {
    id: string;
    name: string;
    email: string;
  };
  dueDate?: string;
  labels: {
    nodes: { id: string; name: string }[];
  };
  team: {
    id: string;
    name: string;
    key: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface LinearTeam {
  id: string;
  name: string;
  key: string;
  states: {
    nodes: { id: string; name: string; type: string }[];
  };
  labels: {
    nodes: { id: string; name: string }[];
  };
}

interface LinearUser {
  id: string;
  name: string;
  email: string;
}

interface LinearWorkflowState {
  id: string;
  name: string;
  type: 'triage' | 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
}

// Linear settings
export interface LinearSettings {
  apiKey: string;
  defaultTeamId?: string;
  defaultLabelIds?: string[];
}

// Priority mapping (Linear uses 0-4, with 0 being "No priority")
const PRIORITY_MAP: Record<TaskPriority, number> = {
  urgent: 1,
  high: 2,
  medium: 3,
  low: 4,
};

const REVERSE_PRIORITY_MAP: Record<number, TaskPriority> = {
  0: 'medium',
  1: 'urgent',
  2: 'high',
  3: 'medium',
  4: 'low',
};

// Status type mapping
const STATUS_TYPE_MAP: Record<string, TaskStatus> = {
  'triage': 'pending',
  'backlog': 'pending',
  'unstarted': 'pending',
  'started': 'in-progress',
  'completed': 'completed',
  'canceled': 'cancelled',
};

// GraphQL query fragments
const ISSUE_FRAGMENT = `
  id
  identifier
  title
  description
  url
  priority
  dueDate
  createdAt
  updatedAt
  state {
    id
    name
    type
  }
  assignee {
    id
    name
    email
  }
  labels {
    nodes {
      id
      name
    }
  }
  team {
    id
    name
    key
  }
`;

// Linear API wrapper (GraphQL)
class LinearAPI {
  private apiKey: string;
  private baseUrl = 'https://api.linear.app/graphql';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async query<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    // Fix: Validate API key exists before making request
    if (!this.apiKey) {
      throw new Error('Linear API key is not configured');
    }

    // Fix: Add request timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.statusText}`);
      }

      const result = await response.json();

      // Fix H2: Check if errors array is non-empty (empty array is truthy in JS)
      if (result.errors?.length > 0) {
        throw new Error(`Linear API error: ${result.errors[0].message}`);
      }

      return result.data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    try {
      await this.query<{ viewer: LinearUser }>(`
        query {
          viewer {
            id
            name
          }
        }
      `);
      return true;
    } catch {
      return false;
    }
  }

  // Get current user
  async getCurrentUser(): Promise<LinearUser> {
    const result = await this.query<{ viewer: LinearUser }>(`
      query {
        viewer {
          id
          name
          email
        }
      }
    `);
    return result.viewer;
  }

  // Get teams
  async getTeams(): Promise<LinearTeam[]> {
    const result = await this.query<{ teams: { nodes: LinearTeam[] } }>(`
      query {
        teams {
          nodes {
            id
            name
            key
            states {
              nodes {
                id
                name
                type
              }
            }
            labels {
              nodes {
                id
                name
              }
            }
          }
        }
      }
    `);
    return result.teams.nodes;
  }

  // Get team by ID
  async getTeam(teamId: string): Promise<LinearTeam> {
    const result = await this.query<{ team: LinearTeam }>(`
      query($id: String!) {
        team(id: $id) {
          id
          name
          key
          states {
            nodes {
              id
              name
              type
            }
          }
          labels {
            nodes {
              id
              name
            }
          }
        }
      }
    `, { id: teamId });
    return result.team;
  }

  // Search issues (Fix: Use parameterized query to prevent GraphQL injection)
  async searchIssues(teamId?: string, first: number = 50): Promise<LinearIssue[]> {
    // Validate and sanitize inputs
    const safeFirst = Math.min(Math.max(1, Math.floor(first)), 100);

    if (teamId) {
      // Use parameterized query with variables to prevent injection
      const result = await this.query<{ issues: { nodes: LinearIssue[] } }>(`
        query SearchIssues($first: Int!, $teamId: String!) {
          issues(first: $first, filter: { team: { id: { eq: $teamId } } }) {
            nodes {
              ${ISSUE_FRAGMENT}
            }
          }
        }
      `, { first: safeFirst, teamId });
      return result.issues.nodes;
    } else {
      const result = await this.query<{ issues: { nodes: LinearIssue[] } }>(`
        query SearchIssuesAll($first: Int!) {
          issues(first: $first) {
            nodes {
              ${ISSUE_FRAGMENT}
            }
          }
        }
      `, { first: safeFirst });
      return result.issues.nodes;
    }
  }

  // Get issue by identifier
  async getIssue(identifier: string): Promise<LinearIssue> {
    const result = await this.query<{ issue: LinearIssue }>(`
      query($identifier: String!) {
        issue(id: $identifier) {
          ${ISSUE_FRAGMENT}
        }
      }
    `, { identifier });
    return result.issue;
  }

  // Create issue
  async createIssue(input: {
    teamId: string;
    title: string;
    description?: string;
    priority?: number;
    dueDate?: string;
    labelIds?: string[];
    assigneeId?: string;
    stateId?: string;
  }): Promise<LinearIssue> {
    const result = await this.query<{ issueCreate: { success: boolean; issue: LinearIssue } }>(`
      mutation($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            ${ISSUE_FRAGMENT}
          }
        }
      }
    `, { input });

    if (!result.issueCreate.success) {
      throw new Error('Failed to create Linear issue');
    }

    return result.issueCreate.issue;
  }

  // Update issue
  async updateIssue(
    issueId: string,
    input: {
      title?: string;
      description?: string;
      priority?: number;
      dueDate?: string;
      labelIds?: string[];
      stateId?: string;
      assigneeId?: string;
    }
  ): Promise<LinearIssue> {
    const result = await this.query<{ issueUpdate: { success: boolean; issue: LinearIssue } }>(`
      mutation($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue {
            ${ISSUE_FRAGMENT}
          }
        }
      }
    `, { id: issueId, input });

    if (!result.issueUpdate.success) {
      throw new Error('Failed to update Linear issue');
    }

    return result.issueUpdate.issue;
  }

  // Get workflow states for a team
  async getWorkflowStates(teamId: string): Promise<LinearWorkflowState[]> {
    const result = await this.query<{ workflowStates: { nodes: LinearWorkflowState[] } }>(`
      query($teamId: String!) {
        workflowStates(filter: { team: { id: { eq: $teamId } } }) {
          nodes {
            id
            name
            type
          }
        }
      }
    `, { teamId });
    return result.workflowStates.nodes;
  }

  // Search team members
  async getTeamMembers(teamId: string): Promise<LinearUser[]> {
    const result = await this.query<{ team: { members: { nodes: LinearUser[] } } }>(`
      query($teamId: String!) {
        team(id: $teamId) {
          members {
            nodes {
              id
              name
              email
            }
          }
        }
      }
    `, { teamId });
    return result.team.members.nodes;
  }

  // Add comment
  async addComment(issueId: string, body: string): Promise<void> {
    await this.query(`
      mutation($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          success
        }
      }
    `, { issueId, body });
  }
}

// Linear Integration class
export class LinearIntegration implements Integration {
  type = 'linear' as const;
  config: IntegrationConfig;
  capabilities: IntegrationCapabilities = {
    canExportMeetings: false,
    canExportTasks: true,
    canSyncCalendar: false,
    canCreateTasks: true,
    canUpdateTasks: true,
    canImportData: true,
  };

  private api: LinearAPI | null = null;
  private settings: LinearSettings | null = null;
  private teamsCache: LinearTeam[] = [];

  constructor() {
    this.config = createIntegrationConfig(
      'linear',
      'Linear',
      'Create and sync tasks with Linear issues',
      {}
    );
  }

  // Connect to Linear
  async connect(credentials: Record<string, string>): Promise<boolean> {
    const apiKey = credentials.apiKey;

    if (!apiKey) {
      throw new Error('Linear API key is required');
    }

    this.api = new LinearAPI(apiKey);
    const connected = await this.api.testConnection();

    if (connected) {
      this.settings = {
        apiKey,
        defaultTeamId: credentials.defaultTeamId,
      };

      // Cache teams
      this.teamsCache = await this.api.getTeams();

      this.config.settings = {
        defaultTeamId: this.settings.defaultTeamId,
        teams: this.teamsCache.map(t => ({ id: t.id, name: t.name, key: t.key })),
      };
    }

    return connected;
  }

  // Disconnect
  async disconnect(): Promise<void> {
    this.api = null;
    this.settings = null;
    this.teamsCache = [];
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
    if (!this.api || !this.settings?.defaultTeamId) {
      throw new Error('Linear not connected or default team not configured');
    }

    const issue = await this.api.createIssue({
      teamId: this.settings.defaultTeamId,
      title: task.title,
      description: task.description,
      priority: PRIORITY_MAP[task.priority],
      dueDate: task.dueDate ? format(task.dueDate, 'yyyy-MM-dd') : undefined,
      labelIds: this.settings.defaultLabelIds,
    });

    return issue.identifier;
  }

  // Export tasks to Linear
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

  // Sync task status with Linear issue
  async syncTaskStatus(issueId: string, targetStatus: TaskStatus): Promise<boolean> {
    if (!this.api || !this.settings?.defaultTeamId) {
      throw new Error('Linear not connected');
    }

    // Get workflow states for the team
    const states = await this.api.getWorkflowStates(this.settings.defaultTeamId);

    // Find matching state
    const targetType = Object.entries(STATUS_TYPE_MAP).find(
      ([_, status]) => status === targetStatus
    )?.[0];

    const matchingState = states.find(s => s.type === targetType);

    if (matchingState) {
      await this.api.updateIssue(issueId, { stateId: matchingState.id });
      return true;
    }

    return false;
  }

  // Import issues as tasks
  async importIssues(teamId?: string): Promise<{
    issues: LinearIssue[];
    tasks: Partial<Task>[];
  }> {
    if (!this.api) {
      throw new Error('Linear not connected');
    }

    const issues = await this.api.searchIssues(teamId || this.settings?.defaultTeamId);

    const tasks: Partial<Task>[] = issues.map(issue => ({
      title: issue.title,
      description: issue.description,
      status: STATUS_TYPE_MAP[issue.state.type] || 'pending',
      priority: REVERSE_PRIORITY_MAP[issue.priority] || 'medium',
      dueDate: issue.dueDate ? new Date(issue.dueDate) : undefined,
      assigneeName: issue.assignee?.name,
      tags: issue.labels.nodes.map(l => l.name),
    }));

    return { issues, tasks };
  }

  // Main export function
  async export(options: ExportOptions): Promise<SyncResult> {
    return {
      success: true,
      itemsSynced: 0,
      errors: [],
      timestamp: new Date(),
    };
  }

  // Sync function
  async sync(): Promise<SyncResult> {
    if (!this.api || !this.settings?.defaultTeamId) {
      throw new Error('Linear not connected or default team not configured');
    }

    return {
      success: true,
      itemsSynced: 0,
      errors: [],
      timestamp: new Date(),
    };
  }

  // Get available teams
  async getTeams(): Promise<{ id: string; name: string; key: string }[]> {
    if (!this.api) {
      throw new Error('Linear not connected');
    }

    if (this.teamsCache.length === 0) {
      this.teamsCache = await this.api.getTeams();
    }

    return this.teamsCache.map(t => ({
      id: t.id,
      name: t.name,
      key: t.key,
    }));
  }

  // Get team labels
  async getTeamLabels(teamId: string): Promise<{ id: string; name: string }[]> {
    const team = this.teamsCache.find(t => t.id === teamId);
    if (team) {
      return team.labels.nodes;
    }

    if (!this.api) {
      throw new Error('Linear not connected');
    }

    const freshTeam = await this.api.getTeam(teamId);
    return freshTeam.labels.nodes;
  }

  // Update settings
  updateSettings(settings: Partial<LinearSettings>): void {
    if (this.settings) {
      this.settings = { ...this.settings, ...settings };
    }
  }
}

// Create and register the integration
export const linearIntegration = new LinearIntegration();
integrationRegistry.register(linearIntegration);
