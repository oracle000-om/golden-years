/**
 * Alert Module Unit Tests
 */
import { describe, test, expect, vi } from 'vitest';
import { sendAlert, checkScrapeHealth } from '../../scraper/lib/alert';

describe('sendAlert', () => {
    test('CRITICAL severity logs to stderr', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
        sendAlert('CRITICAL', 'DB connection failed', { pipeline: 'petfinder' });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toContain('[ALERT]');
        expect(spy.mock.calls[0][0]).toContain('[CRITICAL]');
        expect(spy.mock.calls[0][0]).toContain('DB connection failed');
        spy.mockRestore();
    });

    test('WARNING severity logs to stderr via console.warn', () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => { });
        sendAlert('WARNING', 'High error rate', { errorRate: 0.15 });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toContain('[WARNING]');
        spy.mockRestore();
    });
});

describe('checkScrapeHealth', () => {
    test('emits CRITICAL alert when zero animals', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
        checkScrapeHealth('petfinder', 0, 0, 1000);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toContain('zero animals');
        spy.mockRestore();
    });

    test('emits WARNING when error rate exceeds 10%', () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => { });
        checkScrapeHealth('shelterluv', 100, 15, 1000);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toContain('high error rate');
        spy.mockRestore();
    });

    test('does not alert when error rate is acceptable', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
        checkScrapeHealth('shelterluv', 1000, 5, 1000);
        expect(errorSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
        warnSpy.mockRestore();
    });
});
