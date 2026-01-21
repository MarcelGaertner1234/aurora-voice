'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  Check,
  X,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  Loader2,
  Link2,
  Unlink,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import {
  integrationManager,
  integrationRegistry,
  type IntegrationType,
  type IntegrationConfig,
  type IntegrationStatus,
} from '@/lib/integrations';

// Integration icons
const IntegrationIcon = ({ type, className = 'h-6 w-6' }: { type: IntegrationType; className?: string }) => {
  const icons: Record<IntegrationType, React.ReactNode> = {
    notion: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466l1.823 1.447zm.793 3.313v13.729c0 .7.373 1.026 1.166.98l14.149-.793c.793-.047 .886-.467.886-1.073V6.474c0-.606-.233-.933-.7-.886l-14.756.84c-.514.047-.745.327-.745.933zm13.961.793c.093.42 0 .84-.42.886l-.7.14v10.12c-.606.326-1.166.513-1.632.513-.747 0-.933-.234-1.493-.933l-4.573-7.18v6.947l1.447.327s0 .84-1.166.84l-3.219.186c-.093-.186 0-.653.327-.746l.84-.233V9.554L7.82 9.461c-.094-.42.14-1.026.793-1.073l3.453-.233 4.76 7.273v-6.433l-1.213-.14c-.093-.514.28-.886.747-.933l3.453-.233zm-15.5-6.573l16.3-1.493c.7-.093 1.027.233 1.027.7v14.803c0 .793-.234 1.26-1.12 1.353l-16.207.98c-.887.093-1.32-.186-1.32-.886V1.774c0-.607.233-.98 1.32-.84z"/>
      </svg>
    ),
    jira: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.004-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.757a1.001 1.001 0 0 0-1.001-1.000zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0z"/>
      </svg>
    ),
    linear: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M3.18 12.25a8.94 8.94 0 0 1 .03-1.51l.01-.08 8.95 8.95c-.5.03-1 .03-1.51.03-.03 0-.06-.01-.08-.01l-7.4-7.38zm.5-3.15A9 9 0 0 1 18.9 3.68L3.68 18.9a9.03 9.03 0 0 1-.5-3.2V9.1c0-.07.04-.14.1-.14l.4.14zM21 12a9 9 0 0 1-9 9c-.73 0-1.44-.09-2.13-.25L21.13 9.5c.16.68.25 1.4.25 2.13 0 .1-.02.25-.03.37H21zM12 3a9 9 0 0 1 6.36 2.64L5.64 18.36A9 9 0 0 1 12 3z"/>
      </svg>
    ),
    calendar: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    obsidian: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 1L2 6.5v11L12 23l10-5.5v-11L12 1zm0 2.311l7.5 4.125v8.128L12 19.689l-7.5-4.125V7.436L12 3.311z"/>
      </svg>
    ),
  };

  return <>{icons[type]}</>;
};

// Status indicator
const StatusIndicator = ({ status }: { status: IntegrationStatus }) => {
  const config = {
    disconnected: { color: 'bg-gray-400', label: 'Nicht verbunden' },
    connecting: { color: 'bg-yellow-400 animate-pulse', label: 'Verbinde...' },
    connected: { color: 'bg-green-400', label: 'Verbunden' },
    error: { color: 'bg-red-400', label: 'Fehler' },
  };

  const { color, label } = config[status];

  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-xs text-foreground-secondary">{label}</span>
    </div>
  );
};

// Integration card
function IntegrationCard({
  config,
  onConnect,
  onDisconnect,
  onConfigure,
  onSync,
}: {
  config: IntegrationConfig;
  onConnect: () => void;
  onDisconnect: () => void;
  onConfigure: () => void;
  onSync: () => void;
}) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    await onSync();
    setIsSyncing(false);
  };

  return (
    <GlassCard variant="subtle" padding="md" className="mb-3">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-foreground">
            <IntegrationIcon type={config.type} />
          </div>
          <div>
            <h3 className="font-medium text-foreground">{config.name}</h3>
            <p className="text-xs text-foreground-secondary mt-0.5">{config.description}</p>
            <div className="mt-2">
              <StatusIndicator status={config.status} />
            </div>
            {config.lastSync && (
              <p className="text-xs text-foreground-secondary mt-1">
                Letzte Sync: {new Date(config.lastSync).toLocaleString('de-DE')}
              </p>
            )}
            {config.error && (
              <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {config.error}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {config.status === 'connected' && (
            <>
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-foreground-secondary transition-colors hover:bg-white/20 hover:text-foreground disabled:opacity-50"
                title="Synchronisieren"
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={onConfigure}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-foreground-secondary transition-colors hover:bg-white/20 hover:text-foreground"
                title="Einstellungen"
              >
                <Settings className="h-4 w-4" />
              </button>
              <button
                onClick={onDisconnect}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20"
                title="Trennen"
              >
                <Unlink className="h-4 w-4" />
              </button>
            </>
          )}

          {config.status === 'disconnected' && (
            <button
              onClick={onConnect}
              className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/90"
            >
              <Link2 className="h-3.5 w-3.5" />
              Verbinden
            </button>
          )}

          {config.status === 'connecting' && (
            <Loader2 className="h-5 w-5 animate-spin text-foreground-secondary" />
          )}

          {config.status === 'error' && (
            <button
              onClick={onConnect}
              className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Erneut verbinden
            </button>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

// Connection dialog
function ConnectionDialog({
  isOpen,
  onClose,
  integrationType,
  onConnect,
}: {
  isOpen: boolean;
  onClose: () => void;
  integrationType: IntegrationType | null;
  onConnect: (credentials: Record<string, string>) => Promise<boolean>;
}) {
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setCredentials({});
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !integrationType) return null;

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const success = await onConnect(credentials);
      if (success) {
        onClose();
      } else {
        setError('Verbindung fehlgeschlagen. Bitte überprüfe deine Zugangsdaten.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verbindung fehlgeschlagen');
    } finally {
      setIsConnecting(false);
    }
  };

  // Field configurations for each integration
  const fieldConfigs: Record<IntegrationType, Array<{ key: string; label: string; type: string; placeholder: string; required?: boolean }>> = {
    notion: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'secret_...', required: true },
      { key: 'meetingsDatabaseId', label: 'Meetings Database ID', type: 'text', placeholder: 'Optional' },
      { key: 'tasksDatabaseId', label: 'Tasks Database ID', type: 'text', placeholder: 'Optional' },
    ],
    jira: [
      { key: 'domain', label: 'Jira Domain', type: 'text', placeholder: 'your-company.atlassian.net', required: true },
      { key: 'email', label: 'E-Mail', type: 'email', placeholder: 'your@email.com', required: true },
      { key: 'apiToken', label: 'API Token', type: 'password', placeholder: 'Dein Jira API Token', required: true },
      { key: 'defaultProjectKey', label: 'Standard-Projekt', type: 'text', placeholder: 'z.B. AURORA' },
    ],
    linear: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'lin_api_...', required: true },
      { key: 'defaultTeamId', label: 'Standard-Team ID', type: 'text', placeholder: 'Optional' },
    ],
    calendar: [
      { key: 'provider', label: 'Anbieter', type: 'select', placeholder: 'Wähle einen Anbieter', required: true },
      { key: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'OAuth Token', required: true },
      { key: 'refreshToken', label: 'Refresh Token', type: 'password', placeholder: 'Optional' },
    ],
    obsidian: [
      { key: 'vaultPath', label: 'Vault Pfad', type: 'text', placeholder: '/pfad/zu/deinem/vault', required: true },
      { key: 'meetingsFolder', label: 'Meetings Ordner', type: 'text', placeholder: 'Meetings' },
    ],
  };

  const fields = fieldConfigs[integrationType] || [];
  const integrationName = {
    notion: 'Notion',
    jira: 'Jira',
    linear: 'Linear',
    calendar: 'Kalender',
    obsidian: 'Obsidian',
  }[integrationType];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <GlassCard>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IntegrationIcon type={integrationType} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {integrationName} verbinden
              </h2>
              <p className="text-xs text-foreground-secondary">
                Gib deine Zugangsdaten ein
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleConnect();
            }}
            className="space-y-4"
          >
            {fields.map((field) => (
              <div key={field.key}>
                <label className="mb-1.5 block text-sm font-medium text-foreground-secondary">
                  {field.label}
                  {field.required && <span className="text-red-400 ml-1">*</span>}
                </label>
                {field.type === 'select' ? (
                  <select
                    value={credentials[field.key] || ''}
                    onChange={(e) =>
                      setCredentials({ ...credentials, [field.key]: e.target.value })
                    }
                    className="w-full rounded-lg bg-background-secondary px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    required={field.required}
                  >
                    <option value="">Auswählen...</option>
                    <option value="google">Google Calendar</option>
                    <option value="outlook">Outlook</option>
                  </select>
                ) : (
                  <input
                    type={field.type}
                    value={credentials[field.key] || ''}
                    onChange={(e) =>
                      setCredentials({ ...credentials, [field.key]: e.target.value })
                    }
                    placeholder={field.placeholder}
                    className="w-full rounded-lg bg-background-secondary px-3 py-2 text-foreground placeholder:text-foreground-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
                    required={field.required}
                  />
                )}
              </div>
            ))}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-foreground-secondary transition-colors hover:bg-white/5"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={isConnecting}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verbinde...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Verbinden
                  </>
                )}
              </button>
            </div>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  );
}

// Main integrations panel
export function IntegrationsPanel() {
  // Initialize with current status (avoids setState in useEffect)
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>(() =>
    integrationManager.getAllStatuses()
  );
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationType | null>(null);

  // Fix: Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Subscribe to events
  useEffect(() => {
    isMountedRef.current = true;

    // Subscribe to events (Fix: Check mounted state before updating)
    const unsubscribe = integrationRegistry.onEvent(() => {
      if (isMountedRef.current) {
        setIntegrations(integrationManager.getAllStatuses());
      }
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const handleConnect = (type: IntegrationType) => {
    setSelectedIntegration(type);
    setConnectDialogOpen(true);
  };

  const handleConnectSubmit = async (credentials: Record<string, string>): Promise<boolean> => {
    if (!selectedIntegration) return false;
    return integrationManager.connect(selectedIntegration, credentials);
  };

  const handleDisconnect = async (type: IntegrationType) => {
    if (confirm('Möchtest du diese Integration wirklich trennen?')) {
      await integrationManager.disconnect(type);
    }
  };

  const handleSync = async (type: IntegrationType) => {
    await integrationManager.sync(type);
  };

  const handleConfigure = (type: IntegrationType) => {
    // Open configuration dialog (could be extended)
    console.log('Configure:', type);
  };

  // Get all available integrations (including unregistered ones)
  const allIntegrations: IntegrationConfig[] = [
    ...integrations,
    // Add placeholder for integrations not yet registered
    ...(integrations.find(i => i.type === 'obsidian')
      ? []
      : [{
          id: 'obsidian-placeholder',
          type: 'obsidian' as IntegrationType,
          name: 'Obsidian',
          description: 'Export meetings to your Obsidian vault',
          status: 'disconnected' as IntegrationStatus,
          enabled: false,
          settings: {},
        }]),
  ];

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Integrationen</h2>
        <p className="text-sm text-foreground-secondary mt-1">
          Verbinde Aurora mit deinen Lieblingstools
        </p>
      </div>

      <div className="space-y-3">
        {allIntegrations.map((config) => (
          <IntegrationCard
            key={config.id}
            config={config}
            onConnect={() => handleConnect(config.type)}
            onDisconnect={() => handleDisconnect(config.type)}
            onConfigure={() => handleConfigure(config.type)}
            onSync={() => handleSync(config.type)}
          />
        ))}
      </div>

      <ConnectionDialog
        isOpen={connectDialogOpen}
        onClose={() => setConnectDialogOpen(false)}
        integrationType={selectedIntegration}
        onConnect={handleConnectSubmit}
      />
    </div>
  );
}

// Compact version for settings panel
export function IntegrationsCompact() {
  // Initialize with current status (avoids setState in useEffect)
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>(() =>
    integrationManager.getAllStatuses()
  );

  // Fix: Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const unsubscribe = integrationRegistry.onEvent(() => {
      if (isMountedRef.current) {
        setIntegrations(integrationManager.getAllStatuses());
      }
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const connectedCount = integrations.filter(i => i.status === 'connected').length;

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-foreground-secondary" />
        <span className="text-sm text-foreground-secondary">Integrationen</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground">
          {connectedCount} verbunden
        </span>
        <ChevronRight className="h-4 w-4 text-foreground-secondary" />
      </div>
    </div>
  );
}
