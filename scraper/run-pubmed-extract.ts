/**
 * Run PubMed Extract — Parallel Gemini Extraction from DB
 *
 * Reads articles from VetArticle table (already fetched from PubMed)
 * and runs Gemini extraction in parallel across multiple breeds.
 *
 * Usage:
 *   npx tsx scraper/run-pubmed-extract.ts                     # extract all unenriched breeds
 *   npx tsx scraper/run-pubmed-extract.ts --concurrency=5     # 5 breeds at once
 *   npx tsx scraper/run-pubmed-extract.ts --breed="Labrador"  # single breed
 *   npx tsx scraper/run-pubmed-extract.ts --re-extract        # re-extract already enriched breeds
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { createConditionExtractor, type ComprehensiveExtractionResult } from './adapters/pubmed-extractor';

// ── CLI Args ──

const args = process.argv.slice(2);
const reExtract = args.includes('--re-extract');

function getArgValue(flag: string): string | null {
    const arg = args.find(a => a.startsWith(`${flag}=`));
    return arg ? arg.split('=').slice(1).join('=') : null;
}

const breedFilter = getArgValue('--breed');
const concurrencyStr = getArgValue('--concurrency');
const concurrency = concurrencyStr ? parseInt(concurrencyStr, 10) : 3;

// ── Main ──

async function main() {
    console.log(`🧬 PubMed Extract — Parallel Gemini Extraction`);
    console.log(`   Concurrency: ${concurrency} breeds at once`);
    console.log(`   Mode: ${reExtract ? 'RE-EXTRACT all' : 'unenriched only'}`);
    if (breedFilter) console.log(`   Filter: ${breedFilter}`);
    console.log();

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
        console.error('❌ GEMINI_API_KEY not set');
        process.exit(1);
    }

    const prisma = await createPrismaClient();
    const extractor = createConditionExtractor(geminiKey);

    // Find breeds needing extraction
    const whereClause: Record<string, unknown> = {};
    if (breedFilter) {
        whereClause.name = { contains: breedFilter, mode: 'insensitive' };
    }
    if (!reExtract) {
        whereClause.pubmedLastEnriched = null;
    }

    const breedProfiles = await prisma.breedProfile.findMany({
        where: whereClause,
        orderBy: { name: 'asc' },
    });

    // For each breed, see if we have articles in the DB
    interface BreedWork {
        profile: any;
        cleanName: string;
        articles: { pmid: string; title: string; abstract: string | null }[];
    }

    const work: BreedWork[] = [];

    for (const profile of breedProfiles) {
        const rawName = profile.name as string;
        const cleanName = rawName
            .replace(/\s+Dog Breed Information$/i, '')
            .replace(/\s+Cat Breed Information$/i, '')
            .replace(/\s+Breed Information$/i, '')
            .trim();

        // Find articles for this breed in VetArticle
        const articles = await prisma.vetArticle.findMany({
            where: {
                breeds: { has: cleanName },
            },
            select: { pmid: true, title: true, abstract: true },
        });

        if (articles.length > 0) {
            work.push({ profile, cleanName, articles });
        }
    }

    console.log(`📊 ${work.length} breeds with articles to extract (${breedProfiles.length - work.length} have no articles)\n`);

    if (work.length === 0) {
        console.log('✅ Nothing to extract. All breeds are either enriched or have no articles.');
        process.exit(0);
    }

    // Process with concurrency semaphore
    let completed = 0;
    let totalConditions = 0;
    let errors = 0;

    async function processBreed(item: BreedWork) {
        const { profile, cleanName, articles } = item;
        const species = profile.species as 'DOG' | 'CAT';
        const icon = species === 'DOG' ? '🐕' : '🐱';

        try {
            const extraction = await extractor.extractConditions(cleanName, species, articles);

            const totalItems = extraction.conditions.length + extraction.treatments.length +
                extraction.drugSensitivities.length + extraction.nutrition.length +
                extraction.behavioral.length + extraction.mortality.length + extraction.diagnostics.length;

            if (totalItems > 0) {
                totalConditions += extraction.conditions.length;

                const healthRiskScoreV2 = computeHealthRiskScore(extraction.conditions);
                const estimatedAnnualVetCost = computeEstimatedVetCost(extraction.conditions);

                await prisma.breedProfile.update({
                    where: { name_species: { name: profile.name, species } },
                    data: {
                        pubmedConditions: extraction.conditions as any,
                        pubmedTreatments: extraction.treatments as any,
                        pubmedDrugSensitivities: extraction.drugSensitivities as any,
                        pubmedNutrition: extraction.nutrition as any,
                        pubmedBehavioral: extraction.behavioral as any,
                        pubmedMortality: extraction.mortality as any,
                        pubmedDiagnostics: extraction.diagnostics as any,
                        pubmedArticleCount: articles.length,
                        pubmedLastEnriched: new Date(),
                        healthRiskScoreV2,
                        estimatedAnnualVetCost,
                        commonConditions: mergeConditions(
                            profile.commonConditions || [],
                            extraction.conditions.map((c: any) => c.condition),
                        ),
                    },
                });

                console.log(`   ${icon} ${cleanName}: ${extraction.conditions.length}C ${extraction.treatments.length}T ${extraction.drugSensitivities.length}D ${extraction.nutrition.length}N ${extraction.behavioral.length}B ${extraction.mortality.length}M ${extraction.diagnostics.length}Dx | risk=${healthRiskScoreV2.toFixed(1)} cost=$${estimatedAnnualVetCost}`);
            } else {
                // Mark as enriched even if no items found (no articles had relevant data)
                await prisma.breedProfile.update({
                    where: { name_species: { name: profile.name, species } },
                    data: { pubmedLastEnriched: new Date(), pubmedArticleCount: articles.length },
                });
                console.log(`   ${icon} ${cleanName}: no extractable data (${articles.length} articles)`);
            }
        } catch (err) {
            errors++;
            console.error(`   ❌ ${cleanName}: ${(err as Error).message?.substring(0, 80)}`);
        }

        completed++;
        if (completed % 20 === 0) {
            console.log(`\n   ⏳ Progress: ${completed}/${work.length} breeds\n`);
        }
    }

    // Run with bounded concurrency
    const queue = [...work];
    const running: Promise<void>[] = [];

    while (queue.length > 0 || running.length > 0) {
        // Fill up to concurrency limit
        while (running.length < concurrency && queue.length > 0) {
            const item = queue.shift()!;
            const promise = processBreed(item).then(() => {
                running.splice(running.indexOf(promise), 1);
            });
            running.push(promise);
        }

        // Wait for at least one to finish
        if (running.length > 0) {
            await Promise.race(running);
        }
    }

    console.log(`\n🏁 Done!`);
    console.log(`   Breeds extracted: ${completed}`);
    console.log(`   Total conditions: ${totalConditions}`);
    if (errors > 0) console.log(`   Errors: ${errors}`);

    process.exit(0);
}

// ── Helpers ──

function computeHealthRiskScore(conditions: { prevalence: string; severity: string }[]): number {
    if (conditions.length === 0) return 1;
    const PREVALENCE: Record<string, number> = { common: 3, moderate: 2, rare: 1 };
    const SEVERITY: Record<string, number> = { 'life-threatening': 4, severe: 3, moderate: 2, mild: 1 };
    let rawScore = 0;
    for (const c of conditions) rawScore += (PREVALENCE[c.prevalence] || 1) * (SEVERITY[c.severity] || 1);
    return Math.round(Math.min(10, Math.max(1, rawScore / 10)) * 10) / 10;
}

function computeEstimatedVetCost(conditions: { prevalence: string; severity: string }[]): number {
    if (conditions.length === 0) return 500;
    const COST: Record<string, number> = { 'life-threatening': 5000, severe: 2500, moderate: 800, mild: 200 };
    const PROB: Record<string, number> = { common: 0.25, moderate: 0.10, rare: 0.03 };
    let cost = 500;
    for (const c of conditions) cost += (COST[c.severity] || 500) * (PROB[c.prevalence] || 0.05);
    return Math.round(cost);
}

function mergeConditions(existing: string[], extracted: string[]): string[] {
    const normalized = new Set(existing.map(c => c.toLowerCase().trim()));
    const result = [...existing];
    for (const condition of extracted) {
        const norm = condition.toLowerCase().trim();
        if (!normalized.has(norm)) { result.push(condition); normalized.add(norm); }
    }
    return result;
}

main();
