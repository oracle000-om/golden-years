/**
 * Structured Logger — Golden Years Club
 *
 * Centralizes logging with context, levels, and structured output.
 * In production: JSON for log aggregation tooling.
 * In development: human-readable colored output.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    context: string;
    message: string;
    data?: Record<string, unknown>;
}

const isProd = process.env.NODE_ENV === 'production';

function formatTimestamp(): string {
    return new Date().toISOString();
}

const COLORS: Record<LogLevel, string> = {
    info: '\x1b[36m',    // cyan
    warn: '\x1b[33m',    // yellow
    error: '\x1b[31m',   // red
    debug: '\x1b[90m',   // gray
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function formatEntry(entry: LogEntry): string {
    if (isProd) {
        return JSON.stringify(entry);
    }

    const color = COLORS[entry.level];
    const time = entry.timestamp.substring(11, 19); // HH:MM:SS
    const prefix = `${color}${BOLD}[${entry.level.toUpperCase()}]${RESET}`;
    const ctx = entry.context ? ` ${BOLD}${entry.context}${RESET}` : '';
    const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    return `${time} ${prefix}${ctx} ${entry.message}${data}`;
}

function log(level: LogLevel, context: string, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
        timestamp: formatTimestamp(),
        level,
        context,
        message,
        ...(data && { data }),
    };

    const formatted = formatEntry(entry);

    switch (level) {
        case 'error':
            console.error(formatted);
            break;
        case 'warn':
            console.warn(formatted);
            break;
        case 'debug':
            if (!isProd) console.debug(formatted);
            break;
        default:
            console.log(formatted);
    }
}

/**
 * Create a scoped logger with a fixed context name.
 * Usage:
 *   const log = createLogger('scraper');
 *   log.info('Starting scrape', { shelter: 'la-county' });
 */
export function createLogger(context: string) {
    return {
        info: (message: string, data?: Record<string, unknown>) => log('info', context, message, data),
        warn: (message: string, data?: Record<string, unknown>) => log('warn', context, message, data),
        error: (message: string, data?: Record<string, unknown>) => log('error', context, message, data),
        debug: (message: string, data?: Record<string, unknown>) => log('debug', context, message, data),
    };
}

export type Logger = ReturnType<typeof createLogger>;
