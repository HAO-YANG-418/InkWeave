// ============================================================
// 日志模块 — GWE v11.0
// 统一的日志输出，支持可配置的日志级别
// 生产环境可设为 'error' 或 'silent'，开发环境默认 'warn'
// ============================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
}

let currentLevel: LogLevel = 'warn'

export function setLogLevel(level: LogLevel): void {
  currentLevel = level
}

export function getLogLevel(): LogLevel {
  return currentLevel
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[currentLevel]
}

export function logDebug(module: string, message: string, ...args: unknown[]): void {
  if (shouldLog('debug')) {
    console.debug(`[GWE:${module}] ${message}`, ...args)
  }
}

export function logInfo(module: string, message: string, ...args: unknown[]): void {
  if (shouldLog('info')) {
    console.info(`[GWE:${module}] ${message}`, ...args)
  }
}

export function logWarn(module: string, message: string, ...args: unknown[]): void {
  if (shouldLog('warn')) {
    console.warn(`[GWE:${module}] ${message}`, ...args)
  }
}

export function logError(module: string, message: string, ...args: unknown[]): void {
  if (shouldLog('error')) {
    console.error(`[GWE:${module}] ${message}`, ...args)
  }
}