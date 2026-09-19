/**
 * Lightweight structured logger for PASCONX LMS.
 * Formats timestamps and log levels with support for debug verbosity.
 */
export const logger = {
  info: (...args) => console.log(`[${new Date().toISOString()}] [INFO]`, ...args),
  warn: (...args) => console.warn(`[${new Date().toISOString()}] [WARN]`, ...args),
  error: (...args) => console.error(`[${new Date().toISOString()}] [ERROR]`, ...args),
  debug: (...args) => {
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      console.log(`[${new Date().toISOString()}] [DEBUG]`, ...args);
    }
  }
};
