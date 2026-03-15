/**
 * Quick health check — raw SQL against scrape_runs table
 */
import pg from 'pg';
import 'dotenv/config';

async function main() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

    // ── 1. Last 14 days of runs, grouped by pipeline ──
    const { rows: runs } = await pool.query(`
        SELECT pipeline, status, started_at, finished_at, duration_ms,
               animals_created, animals_updated, errors, error_summary
        FROM scrape_runs
        WHERE started_at >= NOW() - INTERVAL '14 days'
        ORDER BY started_at DESC
    `);

    const byPipeline = new Map<string, any[]>();
    for (const r of runs) {
        const arr = byPipeline.get(r.pipeline) || [];
        arr.push(r);
        byPipeline.set(r.pipeline, arr);
    }

    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    console.log(`\n${'═'.repeat(110)}`);
    console.log(`SCRAPER HEALTH REPORT — Last 14 days (since ${twoWeeksAgo.toISOString().split('T')[0]})`);
    console.log(`${'═'.repeat(110)}\n`);

    console.log(
        'Pipeline'.padEnd(25) +
        'Runs'.padStart(5) +
        '   OK'.padStart(6) +
        '  Prt'.padStart(6) +
        ' Fail'.padStart(6) +
        '  Run'.padStart(6) +
        '  Created'.padStart(10) +
        '  Updated'.padStart(10) +
        '  Errors'.padStart(8) +
        '  Last Run'.padStart(22) +
        '  Avg Dur'.padStart(10)
    );
    console.log('─'.repeat(110));

    const sorted = [...byPipeline.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [pipeline, pRuns] of sorted) {
        const success = pRuns.filter((r: any) => r.status === 'SUCCESS').length;
        const partial = pRuns.filter((r: any) => r.status === 'PARTIAL').length;
        const failed = pRuns.filter((r: any) => r.status === 'FAILED').length;
        const running = pRuns.filter((r: any) => r.status === 'RUNNING').length;
        const totalCreated = pRuns.reduce((s: number, r: any) => s + (r.animals_created || 0), 0);
        const totalUpdated = pRuns.reduce((s: number, r: any) => s + (r.animals_updated || 0), 0);
        const totalErrors = pRuns.reduce((s: number, r: any) => s + (r.errors || 0), 0);
        const lastRun = pRuns[0];
        const lastRunDate = new Date(lastRun.started_at).toISOString().replace('T', ' ').substring(0, 16);
        const withDur = pRuns.filter((r: any) => r.duration_ms);
        const avgDur = withDur.length > 0
            ? withDur.reduce((s: number, r: any) => s + r.duration_ms, 0) / withDur.length
            : 0;
        const durStr = avgDur > 0 ? `${(avgDur / 1000 / 60).toFixed(1)}m` : '—';

        console.log(
            pipeline.padEnd(25) +
            String(pRuns.length).padStart(5) +
            String(success).padStart(6) +
            String(partial).padStart(6) +
            String(failed).padStart(6) +
            String(running).padStart(6) +
            String(totalCreated).padStart(10) +
            String(totalUpdated).padStart(10) +
            String(totalErrors).padStart(8) +
            lastRunDate.padStart(22) +
            durStr.padStart(10)
        );
    }

    // ── 2. Stuck runs ──
    const stuckRuns = runs.filter((r: any) =>
        r.status === 'RUNNING' &&
        new Date(r.started_at) < new Date(Date.now() - 4 * 60 * 60 * 1000)
    );
    if (stuckRuns.length > 0) {
        console.log(`\n⚠️  STUCK RUNS (started > 4 hours ago, still "RUNNING"):`);
        for (const r of stuckRuns) {
            console.log(`   ${r.pipeline} — started ${new Date(r.started_at).toISOString()}`);
        }
    }

    // ── 3. Recent failures ──
    const recentFailures = runs.filter((r: any) => r.status === 'FAILED').slice(0, 10);
    if (recentFailures.length > 0) {
        console.log(`\n❌ RECENT FAILURES (last 10):`);
        for (const r of recentFailures) {
            console.log(`   ${r.pipeline} — ${new Date(r.started_at).toISOString().substring(0, 16)} — ${r.error_summary?.substring(0, 120) || 'no error summary'}`);
        }
    }

    // ── 4. Missing pipelines ──
    const expected = ['shelters', 'rescuegroups', 'petfinder', 'petango', 'shelterluv', 'adoptapet', 'opendata', 'socrata-listings'];
    const missing = expected.filter(p => !byPipeline.has(p));
    if (missing.length > 0) {
        console.log(`\n🚫 EXPECTED PIPELINES WITH ZERO RUNS IN 14 DAYS: ${missing.join(', ')}`);
    }

    // ── 5. Totals ──
    const totalSuccess = runs.filter((r: any) => r.status === 'SUCCESS').length;
    const totalFailed = runs.filter((r: any) => r.status === 'FAILED').length;
    const totalPartial = runs.filter((r: any) => r.status === 'PARTIAL').length;
    console.log(`\n${'═'.repeat(110)}`);
    console.log(`TOTALS: ${runs.length} runs | ${totalSuccess} success | ${totalPartial} partial | ${totalFailed} failed | ${stuckRuns.length} stuck`);
    console.log(`${'═'.repeat(110)}\n`);

    // ── 6. Failure queue ──
    const { rows: [fq] } = await pool.query(`
        SELECT COUNT(*) FILTER (WHERE resolved_at IS NULL) AS unresolved,
               COUNT(*) AS total
        FROM scrape_failures
    `);
    console.log(`📋 Failure queue: ${fq.unresolved} unresolved / ${fq.total} total`);

    // ── 7. Animal stats ──
    const { rows: [stats] } = await pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'AVAILABLE') AS available,
               COUNT(*) FILTER (WHERE status = 'URGENT') AS urgent
        FROM animals
    `);
    const { rows: [sh] } = await pool.query(`SELECT COUNT(*) AS total FROM shelters`);
    console.log(`🐾 Animals: ${Number(stats.available).toLocaleString()} available | ${Number(stats.urgent).toLocaleString()} urgent | ${Number(stats.total).toLocaleString()} total`);
    console.log(`🏠 Shelters: ${Number(sh.total).toLocaleString()} total\n`);

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
