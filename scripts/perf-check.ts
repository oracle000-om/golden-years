/**
 * Performance Anti-Pattern Scanner — Golden Years Club
 *
 * Scans source files for known performance anti-patterns and exits
 * with a non-zero code if any are found. Run in CI after build.
 *
 * Usage: npx tsx scripts/perf-check.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, relative, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __scriptDir = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__scriptDir, '..');
let failures = 0;

function fail(file: string, message: string) {
    const rel = relative(ROOT, file);
    console.error(`❌ ${rel}: ${message}`);
    failures++;
}

function pass(label: string) {
    console.log(`✅ ${label}`);
}

// ── 1. No force-dynamic on public pages ─────────────────────
const publicPages = execSync(
    `find src/app -name "page.tsx" -not -path "*/admin/*" -not -path "*/login/*"`,
    { cwd: ROOT, encoding: 'utf-8' },
).trim().split('\n').filter(Boolean);

let foundForceDynamic = false;
for (const rel of publicPages) {
    const file = resolve(ROOT, rel);
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf-8');
    if (
        (content.includes("dynamic = 'force-dynamic'") || content.includes('dynamic = "force-dynamic"'))
        && !content.includes('// perf-ok: force-dynamic')
    ) {
        fail(file, 'Uses force-dynamic — disables all caching. Use revalidate instead. (Suppress with // perf-ok: force-dynamic)');
        foundForceDynamic = true;
    }
}
if (!foundForceDynamic) pass('No force-dynamic on public pages');

// ── 2. Image optimization enabled ──────────────────────────
const nextConfig = resolve(ROOT, 'next.config.ts');
if (existsSync(nextConfig)) {
    const content = readFileSync(nextConfig, 'utf-8');
    if (content.includes('unoptimized: true')) {
        fail(nextConfig, 'Image optimization is disabled (unoptimized: true)');
    } else {
        pass('Image optimization enabled');
    }
}

// ── 3. No render-blocking @import in CSS ────────────────────
const cssFiles = execSync(
    `find src -name "*.css"`,
    { cwd: ROOT, encoding: 'utf-8' },
).trim().split('\n').filter(Boolean);

let foundBlockingImport = false;
for (const rel of cssFiles) {
    const file = resolve(ROOT, rel);
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf-8');
    // Match @import url( but not @import within comments
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('@import url(') && !line.startsWith('/*')) {
            fail(file, `Line ${i + 1}: Render-blocking @import url() — use <link> in layout.tsx instead`);
            foundBlockingImport = true;
        }
    }
}
if (!foundBlockingImport) pass('No render-blocking @import in CSS');

// ── 4. No route-specific CSS in root layout ─────────────────
const rootLayout = resolve(ROOT, 'src/app/layout.tsx');
if (existsSync(rootLayout)) {
    const content = readFileSync(rootLayout, 'utf-8');
    // These CSS files should only be imported in their own route's layout/page
    const routeSpecificCSS = ['admin.css'];
    let foundRouteCSS = false;
    for (const css of routeSpecificCSS) {
        if (content.includes(`"${css}"`) || content.includes(`"./${css}"`) || content.includes(`'${css}'`) || content.includes(`'./${css}'`)) {
            fail(rootLayout, `Imports route-specific ${css} — move to the route's own layout`);
            foundRouteCSS = true;
        }
    }
    if (!foundRouteCSS) pass('No route-specific CSS in root layout');
}

// ── Summary ─────────────────────────────────────────────────
console.log('');
if (failures > 0) {
    console.error(`\n🚨 ${failures} performance issue${failures > 1 ? 's' : ''} found. Fix before merging.\n`);
    process.exit(1);
} else {
    console.log('🎉 All performance checks passed.\n');
}
