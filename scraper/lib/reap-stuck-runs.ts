/**
 * Reap Stuck Runs — marks RUNNING scrape runs older than a threshold as FAILED.
 *
 * Runs that are stuck in RUNNING status indicate a crashed/killed process
 * that never called finishRun() or failRun(). This script cleans them up
 * so they don't pollute the health dashboard.
 *
 * Usage:
 *   npx tsx scraper/lib/reap-stuck-runs.ts              # default: 4 hours
 *   npx tsx scraper/lib/reap-stuck-runs.ts --hours=2     # custom threshold
 */

import pg from 'pg';
import 'dotenv/config';

async function main() {
    const hoursArg = process.argv.find(a => a.startsWith('--hours='))?.split('=')[1];
    const hours = hoursArg ? parseInt(hoursArg, 10) : 4;

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

    const { rows } = await pool.query(`
        UPDATE scrape_runs
        SET status = 'FAILED',
            finished_at = NOW(),
            error_summary = 'Auto-reaped: stuck in RUNNING state for >' || $1 || ' hours'
        WHERE status = 'RUNNING'
          AND started_at < NOW() - INTERVAL '1 hour' * $1
        RETURNING id, pipeline, started_at
    `, [hours]);

    if (rows.length === 0) {
        console.log(`✅ No stuck runs older than ${hours}h found.`);
    } else {
        console.log(`🧹 Reaped ${rows.length} stuck runs:`);
        for (const r of rows) {
            console.log(`   ${r.pipeline} — started ${r.started_at.toISOString()}`);
        }
    }

    await pool.end();
    process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
