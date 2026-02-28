/**
 * Run PubMed — Veterinary Knowledge Pipeline
 *
 * Scrapes PubMed for breed-specific veterinary literature,
 * extracts structured health conditions via Gemini, and
 * enriches BreedProfile records with evidence-backed data.
 *
 * Usage:
 *   npx tsx scraper/run-pubmed.ts                        # full run
 *   npx tsx scraper/run-pubmed.ts --dry-run               # preview only
 *   npx tsx scraper/run-pubmed.ts --breed="Golden Retriever"  # single breed
 *   npx tsx scraper/run-pubmed.ts --skip-gemini           # fetch only, no extraction
 *   npx tsx scraper/run-pubmed.ts --limit=10              # process first N breeds
 *   npx tsx scraper/run-pubmed.ts --senior-only           # only senior-relevant articles
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { searchBreedArticles, type PubMedArticle } from './adapters/pubmed';
import { createConditionExtractor, type ComprehensiveExtractionResult } from './adapters/pubmed-extractor';

// ── CLI Args ──

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipGemini = args.includes('--skip-gemini');
const seniorOnly = args.includes('--senior-only');

function getArgValue(flag: string): string | null {
    const arg = args.find(a => a.startsWith(`${flag}=`));
    return arg ? arg.split('=').slice(1).join('=') : null;
}

const breedFilter = getArgValue('--breed');
const limitStr = getArgValue('--limit');
const limit = limitStr ? parseInt(limitStr, 10) : undefined;

// ── Main ──

async function main() {
    console.log(`🔬 Golden Years Club — PubMed Veterinary Knowledge Pipeline`);
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}${skipGemini ? ' (skip Gemini)' : ''}`);
    console.log(`   Scope: ${breedFilter || 'all breeds'}${seniorOnly ? ' (senior-focused)' : ''}`);
    if (limit) console.log(`   Limit: ${limit} breeds`);
    console.log();

    // ── Step 1: Load breed profiles ──
    const prisma = await createPrismaClient();

    const whereClause: Record<string, unknown> = {};
    if (breedFilter) {
        whereClause.name = { contains: breedFilter, mode: 'insensitive' };
    }
    if (args.includes('--skip-enriched')) {
        whereClause.pubmedLastEnriched = null;
    }

    const breedProfiles = await (prisma as any).breedProfile.findMany({
        where: whereClause,
        orderBy: { name: 'asc' },
        ...(limit ? { take: limit } : {}),
    });

    console.log(`📊 Found ${breedProfiles.length} breed profiles to process\n`);

    if (breedProfiles.length === 0) {
        console.log('⚠ No breed profiles found. Run the breed-db scraper first:');
        console.log('   npx tsx scraper/run-breed-db.ts');
        process.exit(1);
    }

    // ── Step 2: Initialize Gemini extractor ──
    let extractor: ReturnType<typeof createConditionExtractor> | null = null;
    if (!skipGemini && !dryRun) {
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            console.warn('⚠ GEMINI_API_KEY not set — running in fetch-only mode');
        } else {
            extractor = createConditionExtractor(geminiKey);
        }
    }

    // ── Step 3: Process each breed ──
    let totalArticles = 0;
    let totalConditions = 0;
    let breedsProcessed = 0;
    let breedsWithArticles = 0;
    let errors = 0;

    for (const profile of breedProfiles) {
        const rawBreed = profile.name as string;
        const breed = cleanBreedName(rawBreed);
        const species = profile.species as 'DOG' | 'CAT';
        const icon = species === 'DOG' ? '🐕' : '🐱';

        try {
            // Search PubMed (using cleaned breed name)
            const result = await searchBreedArticles(breed, species, {
                maxResults: 100,
                seniorOnly,
            });

            breedsProcessed++;

            if (result.articles.length === 0) {
                console.log(`   ${icon} ${breed}: 0 articles (${result.totalCount} total in PubMed)`);
                continue;
            }

            breedsWithArticles++;
            totalArticles += result.articles.length;

            console.log(`   ${icon} ${breed}: ${result.articles.length} articles fetched (${result.totalCount} total)`);

            if (dryRun) {
                // Show first 3 titles
                for (const a of result.articles.slice(0, 3)) {
                    console.log(`      📄 [PMID:${a.pmid}] ${a.title.substring(0, 80)}...`);
                }
                continue;
            }

            // Upsert articles to DB
            for (const article of result.articles) {
                const speciesTags = extractSpeciesTags(article);
                const breedTags = extractBreedTags(article, breed);

                await (prisma as any).vetArticle.upsert({
                    where: { pmid: article.pmid },
                    update: {
                        title: article.title,
                        abstract: article.abstract,
                        authors: article.authors,
                        journal: article.journal,
                        pubDate: article.pubDate,
                        meshTerms: article.meshTerms,
                        species: speciesTags,
                        breeds: breedTags,
                        sourceQuery: result.query,
                        lastFetchedAt: new Date(),
                    },
                    create: {
                        pmid: article.pmid,
                        title: article.title,
                        abstract: article.abstract,
                        authors: article.authors,
                        journal: article.journal,
                        pubDate: article.pubDate,
                        meshTerms: article.meshTerms,
                        species: speciesTags,
                        breeds: breedTags,
                        sourceQuery: result.query,
                    },
                });
            }

            // Extract ALL data via Gemini (conditions, treatments, drugs, nutrition, behavioral, mortality, diagnostics)
            if (extractor) {
                const extraction = await extractor.extractConditions(breed, species, result.articles);

                const totalItems = extraction.conditions.length + extraction.treatments.length +
                    extraction.drugSensitivities.length + extraction.nutrition.length +
                    extraction.behavioral.length + extraction.mortality.length + extraction.diagnostics.length;

                if (totalItems > 0) {
                    totalConditions += extraction.conditions.length;

                    // Update VetArticle records with extracted condition names
                    for (const condition of extraction.conditions) {
                        for (const pmid of condition.citationPmids) {
                            await (prisma as any).vetArticle.update({
                                where: { pmid },
                                data: { conditions: { push: condition.condition } },
                            }).catch(() => { });
                        }
                    }

                    // Compute evidence-backed health risk score (1-10)
                    const healthRiskScoreV2 = computeHealthRiskScore(extraction.conditions);

                    // Compute estimated annual vet cost
                    const estimatedAnnualVetCost = computeEstimatedVetCost(extraction.conditions);

                    // Update BreedProfile with ALL extracted data
                    await (prisma as any).breedProfile.update({
                        where: { name_species: { name: rawBreed, species } },
                        data: {
                            pubmedConditions: extraction.conditions,
                            pubmedTreatments: extraction.treatments,
                            pubmedDrugSensitivities: extraction.drugSensitivities,
                            pubmedNutrition: extraction.nutrition,
                            pubmedBehavioral: extraction.behavioral,
                            pubmedMortality: extraction.mortality,
                            pubmedDiagnostics: extraction.diagnostics,
                            pubmedArticleCount: result.articles.length,
                            pubmedLastEnriched: new Date(),
                            healthRiskScoreV2,
                            estimatedAnnualVetCost,
                            commonConditions: mergeConditions(
                                profile.commonConditions as string[] || [],
                                extraction.conditions.map((c: any) => c.condition),
                            ),
                        },
                    });

                    // Summary log
                    console.log(`      🧬 ${extraction.conditions.length}C ${extraction.treatments.length}T ${extraction.drugSensitivities.length}D ${extraction.nutrition.length}N ${extraction.behavioral.length}B ${extraction.mortality.length}M ${extraction.diagnostics.length}Dx | risk=${healthRiskScoreV2.toFixed(1)} cost=$${estimatedAnnualVetCost}`);
                    for (const c of extraction.conditions.slice(0, 3)) {
                        console.log(`         • ${c.condition} (${c.prevalence}, ${c.severity})${c.seniorRelevant ? ' 👴' : ''}`);
                    }
                }
            }

        } catch (err) {
            errors++;
            console.error(`   ❌ ${breed}: ${(err as Error).message?.substring(0, 100)}`);
        }

        // Progress log every 20 breeds
        if (breedsProcessed % 20 === 0) {
            console.log(`\n   ⏳ Progress: ${breedsProcessed}/${breedProfiles.length} breeds, ${totalArticles} articles\n`);
        }
    }

    // ── Summary ──
    console.log(`\n🏁 Done!`);
    console.log(`   Breeds processed: ${breedsProcessed}`);
    console.log(`   Breeds with articles: ${breedsWithArticles}`);
    console.log(`   Total articles: ${totalArticles}`);
    if (!skipGemini && !dryRun) {
        console.log(`   Conditions extracted: ${totalConditions}`);
    }
    if (errors > 0) console.log(`   Errors: ${errors}`);

    process.exit(0);
}

// ── Helpers ──

/**
 * Clean AKC-style breed names for PubMed queries.
 * "Golden Retriever Dog Breed Information" → "Golden Retriever"
 * "Australian Cattle Dog Dog Breed Information" → "Australian Cattle Dog"
 */
function cleanBreedName(name: string): string {
    return name
        .replace(/\s+Dog Breed Information$/i, '')
        .replace(/\s+Cat Breed Information$/i, '')
        .replace(/\s+Breed Information$/i, '')
        .trim();
}

/** Extract species tags from MeSH terms */
function extractSpeciesTags(article: PubMedArticle): string[] {
    const tags: string[] = [];
    const meshStr = article.meshTerms.join(' ').toLowerCase();

    if (meshStr.includes('dogs') || meshStr.includes('dog diseases')) tags.push('DOG');
    if (meshStr.includes('cats') || meshStr.includes('cat diseases')) tags.push('CAT');

    return tags;
}

/** Extract breed mentions from article title/abstract */
function extractBreedTags(article: PubMedArticle, primaryBreed: string): string[] {
    const breeds = new Set<string>([primaryBreed]);

    // Could be extended with a breed name list for cross-breed article tagging
    return [...breeds];
}

/** Merge existing commonConditions with new PubMed-sourced conditions (deduplicated) */
function mergeConditions(existing: string[], extracted: string[]): string[] {
    const normalized = new Set(existing.map(c => c.toLowerCase().trim()));
    const result = [...existing];

    for (const condition of extracted) {
        const norm = condition.toLowerCase().trim();
        if (!normalized.has(norm)) {
            result.push(condition);
            normalized.add(norm);
        }
    }

    return result;
}

/**
 * Compute evidence-backed health risk score (1-10) from PubMed conditions.
 * Score = sum(prevalence_weight * severity_weight) normalized to 1-10 scale.
 */
function computeHealthRiskScore(conditions: { prevalence: string; severity: string }[]): number {
    if (conditions.length === 0) return 1;

    const PREVALENCE: Record<string, number> = { common: 3, moderate: 2, rare: 1 };
    const SEVERITY: Record<string, number> = { 'life-threatening': 4, severe: 3, moderate: 2, mild: 1 };

    let rawScore = 0;
    for (const c of conditions) {
        rawScore += (PREVALENCE[c.prevalence] || 1) * (SEVERITY[c.severity] || 1);
    }

    // Normalize: 0-12 per condition → scale to 1-10 based on typical ranges
    // Most breeds have 3-20 conditions, raw score range ~10-150
    const normalized = Math.min(10, Math.max(1, rawScore / 10));
    return Math.round(normalized * 10) / 10;
}

/**
 * Estimate annual vet cost based on breed predispositions.
 * Uses condition prevalence × average treatment cost estimates.
 *
 * Cost tiers (rough AVMA/ASPCA averages):
 *   - life-threatening: $3,000-$8,000 (surgery, chemo, ICU)
 *   - severe: $1,500-$4,000 (major surgery, specialist)
 *   - moderate: $500-$1,500 (medication, diagnostics)
 *   - mild: $100-$400 (management, OTC)
 *
 * P(needing treatment) by prevalence:
 *   - common: 25%  (>20% incidence, likely annual encounter)
 *   - moderate: 10% (5-20% incidence)
 *   - rare: 3%     (<5% incidence)
 */
function computeEstimatedVetCost(conditions: { prevalence: string; severity: string }[]): number {
    if (conditions.length === 0) return 500; // Baseline wellness cost

    const COST_PER_SEVERITY: Record<string, number> = {
        'life-threatening': 5000,
        severe: 2500,
        moderate: 800,
        mild: 200,
    };
    const PROBABILITY: Record<string, number> = {
        common: 0.25,
        moderate: 0.10,
        rare: 0.03,
    };

    let expectedCost = 500; // Baseline annual wellness (exam, vaccines, preventatives)

    for (const c of conditions) {
        const cost = COST_PER_SEVERITY[c.severity] || 500;
        const prob = PROBABILITY[c.prevalence] || 0.05;
        expectedCost += cost * prob;
    }

    return Math.round(expectedCost);
}

main();
