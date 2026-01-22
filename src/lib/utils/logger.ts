// Logger utility for Aurora Voice
// Replaces direct console.* calls with structured, environment-aware logging

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Check if we're in development mode
const isDev = typeof process !== 'undefined'
  ? process.env.NODE_ENV === 'development'
  : typeof window !== 'undefined' && window.location.hostname === 'localhost';

export const logger = {
  /**
   * Debug-level logging - only shown in development
   */
  debug: (message: string, ...data: unknown[]): void => {
    if (isDev) {
      if (data.length > 0) {
        console.debug(`[DEBUG] ${message}`, ...data);
      } else {
        console.debug(`[DEBUG] ${message}`);
      }
    }
  },

  /**
   * Info-level logging - only shown in development
   */
  info: (message: string, ...data: unknown[]): void => {
    if (isDev) {
      if (data.length > 0) {
        console.info(`[INFO] ${message}`, ...data);
      } else {
        console.info(`[INFO] ${message}`);
      }
    }
  },

  /**
   * Warning-level logging - always shown
   */
  warn: (message: string, ...data: unknown[]): void => {
    if (data.length > 0) {
      console.warn(`[WARN] ${message}`, ...data);
    } else {
      console.warn(`[WARN] ${message}`);
    }
  },

  /**
   * Error-level logging - always shown
   */
  error: (message: string, ...data: unknown[]): void => {
    if (data.length > 0) {
      console.error(`[ERROR] ${message}`, ...data);
    } else {
      console.error(`[ERROR] ${message}`);
    }
  },
};

export default logger;
