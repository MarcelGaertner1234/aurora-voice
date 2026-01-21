// Calendar Integration for Aurora Meeting Assistant
// Sync meetings with Google Calendar and Outlook

import { format, addMinutes, parseISO } from 'date-fns';
import {
  type Integration,
  type IntegrationConfig,
  type IntegrationCapabilities,
  type SyncResult,
  type ExportOptions,
  createIntegrationConfig,
  integrationRegistry,
} from '../index';
import type { Meeting, AgendaItem } from '@/types/meeting';

// Calendar event types
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  attendees?: CalendarAttendee[];
  htmlLink?: string;
  calendarId?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  recurrence?: string[];
}

export interface CalendarAttendee {
  email: string;
  name?: string;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  optional?: boolean;
}

export interface Calendar {
  id: string;
  name: string;
  primary: boolean;
  color?: string;
}

// Calendar provider type
export type CalendarProvider = 'google' | 'outlook';

// Calendar settings
export interface CalendarSettings {
  provider: CalendarProvider;
  accessToken: string;
  refreshToken?: string;
  tokenExpiry?: Date;
  defaultCalendarId?: string;
  syncEnabled: boolean;
  syncInterval: number; // minutes
  autoCreateMeetings: boolean;
}

// OAuth config
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

// Fix C6: Token refresh callback type
export type TokenRefreshCallback = (provider: CalendarProvider) => Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
} | null>;

// Google Calendar API wrapper
class GoogleCalendarAPI {
  private accessToken: string;
  private baseUrl = 'https://www.googleapis.com/calendar/v3';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
    body?: unknown
  ): Promise<T> {
    // Fix H1: Add 30s timeout for Google Calendar API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch((parseErr) => {
          console.error('Failed to parse Google Calendar API error response:', parseErr);
          return { error: { message: response.statusText } };
        });
        throw new Error(`Google Calendar API error: ${error.error?.message || response.statusText}`);
      }

      if (response.status === 204) return {} as T;
      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    try {
      await this.request('/users/me/calendarList?maxResults=1');
      return true;
    } catch {
      return false;
    }
  }

  // Get calendars
  async getCalendars(): Promise<Calendar[]> {
    const result = await this.request<{ items: Array<{ id: string; summary: string; primary?: boolean; backgroundColor?: string }> }>(
      '/users/me/calendarList'
    );

    return result.items.map(cal => ({
      id: cal.id,
      name: cal.summary,
      primary: cal.primary || false,
      color: cal.backgroundColor,
    }));
  }

  // Get events
  async getEvents(
    calendarId: string = 'primary',
    timeMin?: Date,
    timeMax?: Date,
    maxResults: number = 50
  ): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      maxResults: maxResults.toString(),
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    if (timeMin) params.append('timeMin', timeMin.toISOString());
    if (timeMax) params.append('timeMax', timeMax.toISOString());

    const result = await this.request<{
      items: Array<{
        id: string;
        summary: string;
        description?: string;
        start: { dateTime?: string; date?: string };
        end: { dateTime?: string; date?: string };
        location?: string;
        attendees?: Array<{ email: string; displayName?: string; responseStatus?: string; optional?: boolean }>;
        htmlLink?: string;
        status?: string;
        recurrence?: string[];
      }>;
    }>(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`);

    // Fix H4: Validate date strings before creating Date objects
    return result.items.map(event => {
      const startString = event.start.dateTime || event.start.date;
      const endString = event.end.dateTime || event.end.date;

      // Validate date strings
      const startDate = startString ? new Date(startString) : new Date();
      const endDate = endString ? new Date(endString) : new Date();

      // Check for Invalid Date
      const validStart = !isNaN(startDate.getTime()) ? startDate : new Date();
      const validEnd = !isNaN(endDate.getTime()) ? endDate : new Date();

      return {
        id: event.id,
        title: event.summary,
        description: event.description,
        start: validStart,
        end: validEnd,
        location: event.location,
        attendees: event.attendees?.map(a => ({
          email: a.email,
          name: a.displayName,
          responseStatus: a.responseStatus as CalendarAttendee['responseStatus'],
          optional: a.optional,
        })),
        htmlLink: event.htmlLink,
        calendarId,
        status: event.status as CalendarEvent['status'],
        recurrence: event.recurrence,
      };
    });
  }

  // Create event
  async createEvent(
    calendarId: string,
    event: Omit<CalendarEvent, 'id' | 'htmlLink' | 'calendarId'>
  ): Promise<CalendarEvent> {
    const body = {
      summary: event.title,
      description: event.description,
      start: { dateTime: event.start.toISOString() },
      end: { dateTime: event.end.toISOString() },
      location: event.location,
      attendees: event.attendees?.map(a => ({
        email: a.email,
        displayName: a.name,
        optional: a.optional,
      })),
    };

    const result = await this.request<{
      id: string;
      summary: string;
      description?: string;
      start: { dateTime: string };
      end: { dateTime: string };
      htmlLink: string;
    }>(`/calendars/${encodeURIComponent(calendarId)}/events`, 'POST', body);

    return {
      id: result.id,
      title: result.summary,
      description: result.description,
      start: new Date(result.start.dateTime),
      end: new Date(result.end.dateTime),
      htmlLink: result.htmlLink,
      calendarId,
    };
  }

  // Update event
  async updateEvent(
    calendarId: string,
    eventId: string,
    updates: Partial<Omit<CalendarEvent, 'id' | 'htmlLink' | 'calendarId'>>
  ): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {};

    if (updates.title) body.summary = updates.title;
    if (updates.description !== undefined) body.description = updates.description;
    if (updates.start) body.start = { dateTime: updates.start.toISOString() };
    if (updates.end) body.end = { dateTime: updates.end.toISOString() };
    if (updates.location !== undefined) body.location = updates.location;

    const result = await this.request<{
      id: string;
      summary: string;
      description?: string;
      start: { dateTime: string };
      end: { dateTime: string };
      htmlLink: string;
    }>(`/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, 'PATCH', body);

    return {
      id: result.id,
      title: result.summary,
      description: result.description,
      start: new Date(result.start.dateTime),
      end: new Date(result.end.dateTime),
      htmlLink: result.htmlLink,
      calendarId,
    };
  }

  // Delete event
  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.request(`/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, 'DELETE');
  }
}

// Microsoft Graph API wrapper (Outlook Calendar)
class OutlookCalendarAPI {
  private accessToken: string;
  private baseUrl = 'https://graph.microsoft.com/v1.0';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
    body?: unknown
  ): Promise<T> {
    // Fix H1: Add 30s timeout for Outlook Calendar API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch((parseErr) => {
          console.error('Failed to parse Outlook API error response:', parseErr);
          return { error: { message: response.statusText } };
        });
        throw new Error(`Outlook API error: ${error.error?.message || response.statusText}`);
      }

      if (response.status === 204) return {} as T;
      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    try {
      await this.request('/me');
      return true;
    } catch {
      return false;
    }
  }

  // Get calendars
  async getCalendars(): Promise<Calendar[]> {
    const result = await this.request<{
      value: Array<{ id: string; name: string; isDefaultCalendar?: boolean; color?: string }>;
    }>('/me/calendars');

    return result.value.map(cal => ({
      id: cal.id,
      name: cal.name,
      primary: cal.isDefaultCalendar || false,
      color: cal.color,
    }));
  }

  // Get events
  async getEvents(
    calendarId?: string,
    startDateTime?: Date,
    endDateTime?: Date
  ): Promise<CalendarEvent[]> {
    const endpoint = calendarId
      ? `/me/calendars/${calendarId}/events`
      : '/me/events';

    const params = new URLSearchParams();
    if (startDateTime) {
      // Validate date and use proper OData escaping
      const dateTime = startDateTime instanceof Date && !isNaN(startDateTime.getTime())
        ? startDateTime
        : new Date();
      // OData datetime format - escape single quotes by doubling them (though ISO strings don't contain quotes)
      const isoString = dateTime.toISOString().replace(/'/g, "''");
      params.append('$filter', `start/dateTime ge '${isoString}'`);
    }

    const result = await this.request<{
      value: Array<{
        id: string;
        subject: string;
        bodyPreview?: string;
        start: { dateTime: string; timeZone: string };
        end: { dateTime: string; timeZone: string };
        location?: { displayName?: string };
        attendees?: Array<{
          emailAddress: { address: string; name?: string };
          status?: { response?: string };
          type?: string;
        }>;
        webLink?: string;
        showAs?: string;
      }>;
    }>(`${endpoint}${params.toString() ? '?' + params : ''}`);

    return result.value.map(event => ({
      id: event.id,
      title: event.subject,
      description: event.bodyPreview,
      start: new Date(event.start.dateTime + 'Z'),
      end: new Date(event.end.dateTime + 'Z'),
      location: event.location?.displayName,
      attendees: event.attendees?.map(a => ({
        email: a.emailAddress.address,
        name: a.emailAddress.name,
        responseStatus: this.mapResponseStatus(a.status?.response),
        optional: a.type === 'optional',
      })),
      htmlLink: event.webLink,
      calendarId,
      status: this.mapShowAs(event.showAs),
    }));
  }

  private mapResponseStatus(status?: string): CalendarAttendee['responseStatus'] {
    const map: Record<string, CalendarAttendee['responseStatus']> = {
      'none': 'needsAction',
      'organizer': 'accepted',
      'tentativelyAccepted': 'tentative',
      'accepted': 'accepted',
      'declined': 'declined',
      'notResponded': 'needsAction',
    };
    return map[status || ''] || 'needsAction';
  }

  private mapShowAs(showAs?: string): CalendarEvent['status'] {
    if (showAs === 'free') return 'tentative';
    if (showAs === 'busy' || showAs === 'workingElsewhere') return 'confirmed';
    return 'confirmed';
  }

  // Create event
  async createEvent(
    event: Omit<CalendarEvent, 'id' | 'htmlLink' | 'calendarId'>,
    calendarId?: string
  ): Promise<CalendarEvent> {
    const endpoint = calendarId ? `/me/calendars/${calendarId}/events` : '/me/events';

    // Fix: Use user's timezone instead of hardcoded UTC
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const body = {
      subject: event.title,
      body: event.description ? { contentType: 'text', content: event.description } : undefined,
      start: { dateTime: event.start.toISOString().slice(0, -1), timeZone: userTimeZone },
      end: { dateTime: event.end.toISOString().slice(0, -1), timeZone: userTimeZone },
      location: event.location ? { displayName: event.location } : undefined,
      attendees: event.attendees?.map(a => ({
        emailAddress: { address: a.email, name: a.name },
        type: a.optional ? 'optional' : 'required',
      })),
    };

    const result = await this.request<{
      id: string;
      subject: string;
      bodyPreview?: string;
      start: { dateTime: string };
      end: { dateTime: string };
      webLink?: string;
    }>(endpoint, 'POST', body);

    return {
      id: result.id,
      title: result.subject,
      description: result.bodyPreview,
      start: new Date(result.start.dateTime + 'Z'),
      end: new Date(result.end.dateTime + 'Z'),
      htmlLink: result.webLink,
      calendarId,
    };
  }

  // Update event
  async updateEvent(
    eventId: string,
    updates: Partial<Omit<CalendarEvent, 'id' | 'htmlLink' | 'calendarId'>>
  ): Promise<void> {
    const body: Record<string, unknown> = {};

    // Fix: Use user's timezone instead of hardcoded UTC
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (updates.title) body.subject = updates.title;
    if (updates.description !== undefined) {
      body.body = { contentType: 'text', content: updates.description };
    }
    if (updates.start) {
      body.start = { dateTime: updates.start.toISOString().slice(0, -1), timeZone: userTimeZone };
    }
    if (updates.end) {
      body.end = { dateTime: updates.end.toISOString().slice(0, -1), timeZone: userTimeZone };
    }
    if (updates.location !== undefined) {
      body.location = { displayName: updates.location };
    }

    await this.request(`/me/events/${eventId}`, 'PATCH', body);
  }

  // Delete event
  async deleteEvent(eventId: string): Promise<void> {
    await this.request(`/me/events/${eventId}`, 'DELETE');
  }
}

// Convert meeting to calendar event
function meetingToCalendarEvent(meeting: Meeting, durationMinutes: number = 60): Omit<CalendarEvent, 'id' | 'htmlLink' | 'calendarId'> {
  const description = buildMeetingDescription(meeting);

  return {
    title: meeting.title,
    description,
    start: meeting.startedAt || meeting.createdAt,
    end: meeting.endedAt || addMinutes(meeting.startedAt || meeting.createdAt, durationMinutes),
    status: meeting.status === 'cancelled' ? 'cancelled' : 'confirmed',
  };
}

// Build meeting description for calendar
function buildMeetingDescription(meeting: Meeting): string {
  const parts: string[] = [];

  if (meeting.description) {
    parts.push(meeting.description);
    parts.push('');
  }

  if (meeting.agenda.length > 0) {
    parts.push('Agenda:');
    for (const item of meeting.agenda) {
      const checkbox = item.completed ? '✓' : '○';
      parts.push(`${checkbox} ${item.title}`);
    }
    parts.push('');
  }

  parts.push('---');
  parts.push('Erstellt mit Aurora Meeting Assistant');

  return parts.join('\n');
}

// Calendar Integration class
export class CalendarIntegration implements Integration {
  type = 'calendar' as const;
  config: IntegrationConfig;
  capabilities: IntegrationCapabilities = {
    canExportMeetings: true,
    canExportTasks: false,
    canSyncCalendar: true,
    canCreateTasks: false,
    canUpdateTasks: false,
    canImportData: true,
  };

  private googleApi: GoogleCalendarAPI | null = null;
  private outlookApi: OutlookCalendarAPI | null = null;
  private settings: CalendarSettings | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  // Fix: Promise-based locking to prevent concurrent syncs
  private syncPromise: Promise<SyncResult> | null = null;
  // Fix C6: Token refresh callback
  private tokenRefreshCallback: TokenRefreshCallback | null = null;

  constructor() {
    this.config = createIntegrationConfig(
      'calendar',
      'Calendar',
      'Sync meetings with Google Calendar or Outlook',
      {}
    );
  }

  // Connect to calendar
  async connect(credentials: Record<string, string>): Promise<boolean> {
    const provider = credentials.provider as CalendarProvider;
    const accessToken = credentials.accessToken;

    if (!provider || !accessToken) {
      throw new Error('Calendar provider and access token are required');
    }

    let connected = false;

    if (provider === 'google') {
      this.googleApi = new GoogleCalendarAPI(accessToken);
      connected = await this.googleApi.testConnection();
    } else if (provider === 'outlook') {
      this.outlookApi = new OutlookCalendarAPI(accessToken);
      connected = await this.outlookApi.testConnection();
    }

    if (connected) {
      this.settings = {
        provider,
        accessToken,
        refreshToken: credentials.refreshToken,
        defaultCalendarId: credentials.defaultCalendarId,
        syncEnabled: credentials.syncEnabled === 'true',
        syncInterval: parseInt(credentials.syncInterval) || 15,
        autoCreateMeetings: credentials.autoCreateMeetings === 'true',
      };

      this.config.settings = {
        provider,
        defaultCalendarId: this.settings.defaultCalendarId,
        syncEnabled: this.settings.syncEnabled,
        syncInterval: this.settings.syncInterval,
      };

      // Start sync if enabled
      if (this.settings.syncEnabled) {
        this.startPeriodicSync();
      }
    }

    return connected;
  }

  // Disconnect
  async disconnect(): Promise<void> {
    this.stopPeriodicSync();
    this.googleApi = null;
    this.outlookApi = null;
    this.settings = null;
    this.config.settings = {};
  }

  // Check connection
  isConnected(): boolean {
    return (this.googleApi !== null || this.outlookApi !== null) && this.settings !== null;
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    if (this.googleApi) return this.googleApi.testConnection();
    if (this.outlookApi) return this.outlookApi.testConnection();
    return false;
  }

  // Get calendars
  async getCalendars(): Promise<Calendar[]> {
    // Ensure valid token before making API call
    if (!await this.ensureValidToken()) {
      throw new Error('Calendar token expired and refresh failed');
    }

    if (this.googleApi) return this.googleApi.getCalendars();
    if (this.outlookApi) return this.outlookApi.getCalendars();
    throw new Error('Calendar not connected');
  }

  // Get events - Fix C6: Token refresh handled by ensureValidToken at end of class

  // Create event from meeting
  async createEventFromMeeting(meeting: Meeting, calendarId?: string): Promise<CalendarEvent> {
    // Ensure valid token before making API call
    if (!await this.ensureValidToken()) {
      throw new Error('Calendar token expired and refresh failed');
    }

    const targetCalendarId = calendarId || this.settings?.defaultCalendarId;
    const eventData = meetingToCalendarEvent(meeting);

    if (this.googleApi) {
      return this.googleApi.createEvent(targetCalendarId || 'primary', eventData);
    }
    if (this.outlookApi) {
      return this.outlookApi.createEvent(eventData, targetCalendarId);
    }
    throw new Error('Calendar not connected');
  }

  // Update event
  async updateEvent(
    eventId: string,
    updates: Partial<Omit<CalendarEvent, 'id' | 'htmlLink' | 'calendarId'>>,
    calendarId?: string
  ): Promise<void> {
    // Ensure valid token before making API call
    if (!await this.ensureValidToken()) {
      throw new Error('Calendar token expired and refresh failed');
    }

    const targetCalendarId = calendarId || this.settings?.defaultCalendarId;

    if (this.googleApi && targetCalendarId) {
      await this.googleApi.updateEvent(targetCalendarId, eventId, updates);
      return;
    }
    if (this.outlookApi) {
      await this.outlookApi.updateEvent(eventId, updates);
      return;
    }
    throw new Error('Calendar not connected');
  }

  // Delete event
  async deleteEvent(eventId: string, calendarId?: string): Promise<void> {
    // Ensure valid token before making API call
    if (!await this.ensureValidToken()) {
      throw new Error('Calendar token expired and refresh failed');
    }

    const targetCalendarId = calendarId || this.settings?.defaultCalendarId;

    if (this.googleApi && targetCalendarId) {
      await this.googleApi.deleteEvent(targetCalendarId, eventId);
      return;
    }
    if (this.outlookApi) {
      await this.outlookApi.deleteEvent(eventId);
      return;
    }
    throw new Error('Calendar not connected');
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

  // Sync function (Fix: Promise-based locking to prevent concurrent syncs)
  async sync(): Promise<SyncResult> {
    if (!this.isConnected()) {
      throw new Error('Calendar not connected');
    }

    // Fix: Promise-based locking - return existing promise if sync in progress
    if (this.syncPromise) {
      console.warn('Calendar sync already in progress, returning existing promise');
      return this.syncPromise;
    }

    this.syncPromise = this._doSync();
    try {
      return await this.syncPromise;
    } finally {
      this.syncPromise = null;
    }
  }

  // Internal sync implementation
  private async _doSync(): Promise<SyncResult> {
    // Ensure valid token before syncing
    if (!await this.ensureValidToken()) {
      return {
        success: false,
        itemsSynced: 0,
        errors: ['Token expired and refresh failed'],
        timestamp: new Date(),
      };
    }

    // Get upcoming events and sync with local meetings
    // This would be implemented with actual meeting store integration

    return {
      success: true,
      itemsSynced: 0,
      errors: [],
      timestamp: new Date(),
    };
  }

  // Start periodic sync
  private startPeriodicSync(): void {
    if (!this.settings || !this.settings.syncEnabled) return;

    this.stopPeriodicSync();

    this.syncTimer = setInterval(
      () => this.sync().catch(console.error),
      this.settings.syncInterval * 60 * 1000
    );
  }

  // Stop periodic sync
  private stopPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  // Update settings
  updateSettings(settings: Partial<CalendarSettings>): void {
    if (this.settings) {
      this.settings = { ...this.settings, ...settings };

      // Restart sync if settings changed
      if (settings.syncEnabled !== undefined || settings.syncInterval !== undefined) {
        if (this.settings.syncEnabled) {
          this.startPeriodicSync();
        } else {
          this.stopPeriodicSync();
        }
      }
    }
  }

  // Fix C6: Set token refresh callback
  setTokenRefreshCallback(callback: TokenRefreshCallback): void {
    this.tokenRefreshCallback = callback;
  }

  // Fix C6: Check if token is expired or about to expire (within 5 minutes)
  private isTokenExpired(): boolean {
    if (!this.settings?.tokenExpiry) {
      return false; // No expiry info, assume valid
    }
    const expiryDate = this.settings.tokenExpiry instanceof Date
      ? this.settings.tokenExpiry
      : new Date(this.settings.tokenExpiry);
    const bufferMs = 5 * 60 * 1000; // 5 minute buffer
    return Date.now() >= expiryDate.getTime() - bufferMs;
  }

  // Fix C6: Refresh token if needed
  private async ensureValidToken(): Promise<boolean> {
    if (!this.isTokenExpired()) {
      return true; // Token is still valid
    }

    if (!this.tokenRefreshCallback || !this.settings) {
      console.warn('Token expired but no refresh callback available');
      return false;
    }

    try {
      console.log('Token expired, attempting refresh...');
      const newTokens = await this.tokenRefreshCallback(this.settings.provider);

      if (!newTokens) {
        console.error('Token refresh failed: no new tokens returned');
        return false;
      }

      // Update tokens
      this.settings.accessToken = newTokens.accessToken;
      if (newTokens.refreshToken) {
        this.settings.refreshToken = newTokens.refreshToken;
      }
      if (newTokens.expiresIn) {
        this.settings.tokenExpiry = new Date(Date.now() + newTokens.expiresIn * 1000);
      }

      // Recreate API client with new token
      if (this.settings.provider === 'google') {
        this.googleApi = new GoogleCalendarAPI(newTokens.accessToken);
      } else if (this.settings.provider === 'outlook') {
        this.outlookApi = new OutlookCalendarAPI(newTokens.accessToken);
      }

      console.log('Token refreshed successfully');
      return true;
    } catch (err) {
      console.error('Token refresh failed:', err);
      return false;
    }
  }

  // Fix C6: Override getEvents to check token first
  async getEvents(
    calendarId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<CalendarEvent[]> {
    // Ensure valid token before making API call
    if (!await this.ensureValidToken()) {
      throw new Error('Calendar token expired and refresh failed');
    }

    const targetCalendarId = calendarId || this.settings?.defaultCalendarId;

    if (this.googleApi) {
      return this.googleApi.getEvents(targetCalendarId || 'primary', startDate, endDate);
    }
    if (this.outlookApi) {
      return this.outlookApi.getEvents(targetCalendarId, startDate, endDate);
    }
    throw new Error('Calendar not connected');
  }
}

// Create and register the integration
export const calendarIntegration = new CalendarIntegration();
integrationRegistry.register(calendarIntegration);
