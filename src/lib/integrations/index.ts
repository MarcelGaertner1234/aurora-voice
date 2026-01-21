// Integrations Hub for Aurora Meeting Assistant
// Central management for all external service integrations

import { v4 as uuidv4 } from 'uuid';

// Integration types
export type IntegrationType = 'notion' | 'jira' | 'linear' | 'calendar' | 'obsidian';
export type IntegrationStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Base integration configuration
export interface IntegrationConfig {
  id: string;
  type: IntegrationType;
  name: string;
  description: string;
  status: IntegrationStatus;
  enabled: boolean;
  lastSync?: Date;
  error?: string;
  settings: Record<string, unknown>;
}

// Integration capabilities
export interface IntegrationCapabilities {
  canExportMeetings: boolean;
  canExportTasks: boolean;
  canSyncCalendar: boolean;
  canCreateTasks: boolean;
  canUpdateTasks: boolean;
  canImportData: boolean;
}

// Sync result
export interface SyncResult {
  success: boolean;
  itemsSynced: number;
  errors: string[];
  timestamp: Date;
}

// Export options
export interface ExportOptions {
  meetingId?: string;
  taskIds?: string[];
  includeTranscript?: boolean;
  includeSummary?: boolean;
  includeTasks?: boolean;
  format?: string;
}

// Integration event types
export type IntegrationEventType =
  | 'connected'
  | 'disconnected'
  | 'sync_started'
  | 'sync_completed'
  | 'sync_failed'
  | 'export_completed'
  | 'error';

export interface IntegrationEvent {
  type: IntegrationEventType;
  integration: IntegrationType;
  data?: Record<string, unknown>;
  timestamp: Date;
}

// Event callback
export type IntegrationEventCallback = (event: IntegrationEvent) => void;

// Base integration interface
export interface Integration {
  type: IntegrationType;
  config: IntegrationConfig;
  capabilities: IntegrationCapabilities;

  // Connection
  connect(credentials: Record<string, string>): Promise<boolean>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  testConnection(): Promise<boolean>;

  // Operations
  sync?(): Promise<SyncResult>;
  export?(options: ExportOptions): Promise<SyncResult>;
}

// Integration registry
class IntegrationRegistry {
  private integrations: Map<IntegrationType, Integration> = new Map();
  private configs: Map<IntegrationType, IntegrationConfig> = new Map();
  private eventCallbacks: IntegrationEventCallback[] = [];

  // Register an integration
  register(integration: Integration): void {
    this.integrations.set(integration.type, integration);
    this.configs.set(integration.type, integration.config);
  }

  // Unregister an integration
  unregister(type: IntegrationType): void {
    this.integrations.delete(type);
    this.configs.delete(type);
  }

  // Get an integration
  get(type: IntegrationType): Integration | undefined {
    return this.integrations.get(type);
  }

  // Get all integrations
  getAll(): Integration[] {
    return Array.from(this.integrations.values());
  }

  // Get all configs
  getAllConfigs(): IntegrationConfig[] {
    return Array.from(this.configs.values());
  }

  // Get connected integrations
  getConnected(): Integration[] {
    return this.getAll().filter(i => i.isConnected());
  }

  // Subscribe to events
  onEvent(callback: IntegrationEventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      const index = this.eventCallbacks.indexOf(callback);
      if (index >= 0) {
        this.eventCallbacks.splice(index, 1);
      }
    };
  }

  // Emit an event
  emitEvent(event: IntegrationEvent): void {
    for (const callback of this.eventCallbacks) {
      callback(event);
    }
  }

  // Update config
  updateConfig(type: IntegrationType, updates: Partial<IntegrationConfig>): void {
    const config = this.configs.get(type);
    if (config) {
      Object.assign(config, updates);
    }
  }
}

// Create singleton registry
export const integrationRegistry = new IntegrationRegistry();

// Integration manager - high-level operations
export class IntegrationManager {
  // Connect to an integration
  async connect(
    type: IntegrationType,
    credentials: Record<string, string>
  ): Promise<boolean> {
    const integration = integrationRegistry.get(type);
    if (!integration) {
      throw new Error(`Integration ${type} not found`);
    }

    integrationRegistry.updateConfig(type, { status: 'connecting' });
    // Emit 'connecting' event, not 'connected' - the connection hasn't happened yet
    integrationRegistry.emitEvent({
      type: 'sync_started', // Use sync_started instead of prematurely emitting 'connected'
      integration: type,
      timestamp: new Date(),
    });

    try {
      const success = await integration.connect(credentials);

      if (success) {
        integrationRegistry.updateConfig(type, {
          status: 'connected',
          enabled: true,
          error: undefined,
        });
        integrationRegistry.emitEvent({
          type: 'connected',
          integration: type,
          timestamp: new Date(),
        });
      } else {
        integrationRegistry.updateConfig(type, {
          status: 'error',
          error: 'Connection failed',
        });
      }

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      integrationRegistry.updateConfig(type, {
        status: 'error',
        error: errorMessage,
      });
      integrationRegistry.emitEvent({
        type: 'error',
        integration: type,
        data: { error: errorMessage },
        timestamp: new Date(),
      });
      return false;
    }
  }

  // Disconnect from an integration
  async disconnect(type: IntegrationType): Promise<void> {
    const integration = integrationRegistry.get(type);
    if (!integration) return;

    await integration.disconnect();

    integrationRegistry.updateConfig(type, {
      status: 'disconnected',
      enabled: false,
    });
    integrationRegistry.emitEvent({
      type: 'disconnected',
      integration: type,
      timestamp: new Date(),
    });
  }

  // Sync an integration
  async sync(type: IntegrationType): Promise<SyncResult> {
    const integration = integrationRegistry.get(type);
    if (!integration) {
      throw new Error(`Integration ${type} not found`);
    }

    if (!integration.sync) {
      throw new Error(`Integration ${type} does not support sync`);
    }

    integrationRegistry.emitEvent({
      type: 'sync_started',
      integration: type,
      timestamp: new Date(),
    });

    try {
      const result = await integration.sync();

      integrationRegistry.updateConfig(type, { lastSync: new Date() });
      integrationRegistry.emitEvent({
        type: result.success ? 'sync_completed' : 'sync_failed',
        integration: type,
        data: { result },
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      const result: SyncResult = {
        success: false,
        itemsSynced: 0,
        errors: [errorMessage],
        timestamp: new Date(),
      };

      integrationRegistry.emitEvent({
        type: 'sync_failed',
        integration: type,
        data: { error: errorMessage },
        timestamp: new Date(),
      });

      return result;
    }
  }

  // Export to an integration
  async export(type: IntegrationType, options: ExportOptions): Promise<SyncResult> {
    const integration = integrationRegistry.get(type);
    if (!integration) {
      throw new Error(`Integration ${type} not found`);
    }

    if (!integration.export) {
      throw new Error(`Integration ${type} does not support export`);
    }

    try {
      const result = await integration.export(options);

      integrationRegistry.emitEvent({
        type: 'export_completed',
        integration: type,
        data: { result, options },
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Export failed';
      return {
        success: false,
        itemsSynced: 0,
        errors: [errorMessage],
        timestamp: new Date(),
      };
    }
  }

  // Sync all connected integrations
  async syncAll(): Promise<Map<IntegrationType, SyncResult>> {
    const results = new Map<IntegrationType, SyncResult>();
    const connected = integrationRegistry.getConnected();

    for (const integration of connected) {
      if (integration.sync) {
        const result = await this.sync(integration.type);
        results.set(integration.type, result);
      }
    }

    return results;
  }

  // Get integration status
  getStatus(type: IntegrationType): IntegrationConfig | undefined {
    return integrationRegistry.getAllConfigs().find(c => c.type === type);
  }

  // Get all statuses
  getAllStatuses(): IntegrationConfig[] {
    return integrationRegistry.getAllConfigs();
  }
}

// Create singleton manager
export const integrationManager = new IntegrationManager();

// Helper to create integration config
export function createIntegrationConfig(
  type: IntegrationType,
  name: string,
  description: string,
  settings: Record<string, unknown> = {}
): IntegrationConfig {
  return {
    id: uuidv4(),
    type,
    name,
    description,
    status: 'disconnected',
    enabled: false,
    settings,
  };
}
