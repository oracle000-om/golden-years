/**
 * Scraper Alerting Utility
 *
 * Structured logging for critical scraper failures. Output format is
 * designed for Railway's log-based alert triggers.
 *
 * Configure Railway to alert on: [ALERT] pattern in logs.
 */

type Severity = 'CRITICAL' | 'WARNING' | 'INFO';

interface AlertContext {
    pipeline?: string;
    shelterId?: string;
    animalCount?: number;
    errorRate?: number;
    duration?: number;
    [key: string]: unknown;
}

/**
 * Emit a structured alert to stderr.
 *
 * Railway log alerts can trigger on the [ALERT] prefix.
 * Format: [ALERT] [SEVERITY] message | context_json
 */
export function sendAlert(severity: Severity, message: string, context?: AlertContext): void {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` | ${JSON.stringify(context)}` : '';

    const line = `[ALERT] [${severity}] ${timestamp} — ${message}${contextStr}`;

    if (severity === 'CRITICAL') {
        console.error(line);
    } else {
        console.warn(line);
    }
}

/**
 * Check if a scrape run had critical failures and alert accordingly.
 */
export function checkScrapeHealth(
    pipeline: string,
    totalAnimals: number,
    errors: number,
    duration: number,
): void {
    if (totalAnimals === 0) {
        sendAlert('CRITICAL', `${pipeline}: zero animals returned — scrape may be broken`, {
            pipeline, animalCount: 0, duration,
        });
        return;
    }

    const errorRate = errors / totalAnimals;
    if (errorRate > 0.1) {
        sendAlert('WARNING', `${pipeline}: high error rate ${(errorRate * 100).toFixed(1)}%`, {
            pipeline, animalCount: totalAnimals, errorRate, errors, duration,
        });
    }
}
