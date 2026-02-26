/**
 * Compute Enrichments — Derived Metrics from Existing Data
 *
 * This script computes all derived/computed enrichments that require
 * NO new data collection — just math over what's already in the DB.
 *
 * Section B of the Enrichment Map:
 *   1. Shelter-level metrics (live release rate, transfer rate, etc.)
 *   2. Animal-level scores (adoption urgency, adoption readiness)
 *   3. Breed enrichment wiring (health risk, common conditions)
 *   4. Estimated vet costs
 *
 * Usage:
 *   npx tsx scraper/compute-enrichments.ts           # full run
 *   npx tsx scraper/compute-enrichments.ts --dry-run  # preview
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';

// ── Cost estimation lookup ──────────────────────────────
// Based on veterinary cost averages for senior animals (ASPCA + BLS data)
const CARE_COST_MAP: Record<string, { low: number; high: number }> = {
    low: { low: 500, high: 800 },
    moderate: { low: 800, high: 1500 },
    high: { low: 1500, high: 3000 },
};

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`🧮 Golden Years Club — Compute Enrichments${dryRun ? ' (DRY RUN)' : ''}`);

    const prisma = await createPrismaClient();

    // ══════════════════════════════════════════════════════
    // 1. SHELTER-LEVEL METRICS
    // ══════════════════════════════════════════════════════
    console.log('\n📊 Computing shelter-level metrics...');

    const shelters = await (prisma as any).shelter.findMany({
        select: {
            id: true,
            name: true,
            totalIntakeAnnual: true,
            totalEuthanizedAnnual: true,
            totalReturnedToOwner: true,
            totalTransferred: true,
            countyPopulation: true,
            priorYearIntake: true,
        },
    });

    let shelterUpdates = 0;

    for (const shelter of shelters) {
        const intake = shelter.totalIntakeAnnual || 0;
        const updates: Record<string, any> = {};

        // Live release rate: (intake - euthanized) / intake
        if (intake > 0) {
            const euth = shelter.totalEuthanizedAnnual || 0;
            updates.liveReleaseRate = Math.round(((intake - euth) / intake) * 10000) / 10000;
        }

        // Per-capita intake: intake per 1,000 residents
        if (intake > 0 && shelter.countyPopulation && shelter.countyPopulation > 0) {
            updates.perCapitaIntake = Math.round((intake / shelter.countyPopulation) * 1000 * 100) / 100;
        }

        // Transfer rate
        if (intake > 0 && shelter.totalTransferred != null) {
            updates.transferRate = Math.round((shelter.totalTransferred / intake) * 10000) / 10000;
        }

        // Return-to-owner rate
        if (intake > 0 && shelter.totalReturnedToOwner != null) {
            updates.returnToOwnerRate = Math.round((shelter.totalReturnedToOwner / intake) * 10000) / 10000;
        }

        // Year-over-year intake trend
        if (intake > 0 && shelter.priorYearIntake && shelter.priorYearIntake > 0) {
            updates.intakeTrendPct = Math.round(((intake - shelter.priorYearIntake) / shelter.priorYearIntake) * 10000) / 10000;
        }

        // Median days to outcome (from delisted animals at this shelter)
        const delistedAnimals = await (prisma as any).animal.findMany({
            where: {
                shelterId: shelter.id,
                status: 'DELISTED',
                daysInShelter: { not: null },
            },
            select: { daysInShelter: true },
            orderBy: { daysInShelter: 'asc' },
        });

        if (delistedAnimals.length >= 3) {
            const mid = Math.floor(delistedAnimals.length / 2);
            updates.medianDaysToOutcome = delistedAnimals[mid].daysInShelter;
        }

        // Senior count (active animals)
        const seniorCount = await (prisma as any).animal.count({
            where: {
                shelterId: shelter.id,
                status: { in: ['AVAILABLE', 'URGENT'] },
            },
        });
        updates.seniorCount = seniorCount;

        if (Object.keys(updates).length > 0) {
            if (dryRun) {
                console.log(`   ${shelter.name}: ${JSON.stringify(updates)}`);
            } else {
                await (prisma as any).shelter.update({
                    where: { id: shelter.id },
                    data: updates,
                });
            }
            shelterUpdates++;
        }
    }

    console.log(`   ✅ ${shelterUpdates} shelters updated with derived metrics`);

    // ══════════════════════════════════════════════════════
    // 2. BREED ENRICHMENT
    // ══════════════════════════════════════════════════════
    console.log('\n🐕 Wiring breed enrichment...');

    // Load all breed profiles
    const breedProfiles = await (prisma as any).breedProfile.findMany({
        select: {
            name: true,
            commonConditions: true,
            healthRiskScore: true,
            seniorAgeThreshold: true,
            careNotes: true,
        },
    });

    console.log(`   Loaded ${breedProfiles.length} breed profiles`);

    if (breedProfiles.length > 0) {
        // Build a lowercase lookup map
        const profileMap = new Map<string, typeof breedProfiles[0]>();
        for (const p of breedProfiles) {
            profileMap.set(p.name.toLowerCase(), p);
        }

        // Fetch all animals with detected breeds that need enrichment
        const animalsForBreed = await (prisma as any).animal.findMany({
            where: {
                status: { in: ['AVAILABLE', 'URGENT'] },
                breedHealthRisk: null, // not yet enriched
                OR: [
                    { detectedBreeds: { isEmpty: false } },
                    { breed: { not: null } },
                ],
            },
            select: {
                id: true,
                detectedBreeds: true,
                breed: true,
                species: true,
                estimatedCareLevel: true,
            },
        });

        let breedEnriched = 0;
        for (const animal of animalsForBreed) {
            // Try CV-detected breeds first, then shelter-reported breed
            const breedsToCheck = [
                ...(animal.detectedBreeds || []),
                animal.breed,
            ].filter(Boolean) as string[];

            let match: typeof breedProfiles[0] | undefined;
            for (const breedStr of breedsToCheck) {
                const normalizedBreed = breedStr.toLowerCase().trim();

                // Exact match
                match = profileMap.get(normalizedBreed);
                if (match) break;

                // Fuzzy: detected breed contains profile name
                for (const [key, profile] of profileMap) {
                    if (normalizedBreed.includes(key)) {
                        match = profile;
                        break;
                    }
                }
                if (match) break;

                // Fuzzy: profile name contains detected breed
                for (const [key, profile] of profileMap) {
                    if (key.includes(normalizedBreed) && normalizedBreed.length > 3) {
                        match = profile;
                        break;
                    }
                }
                if (match) break;
            }

            if (match) {
                const updates: Record<string, any> = {
                    breedHealthRisk: match.healthRiskScore,
                    breedCommonConditions: match.commonConditions || [],
                };

                // Estimated annual vet cost based on care level + breed risk
                const careLevel = animal.estimatedCareLevel || 'moderate';
                const baseCost = CARE_COST_MAP[careLevel] || CARE_COST_MAP.moderate;
                // Adjust by breed health risk: risk 7+ adds 30%, risk 4-6 adds 15%
                const riskMultiplier = (match.healthRiskScore || 5) >= 7 ? 1.3
                    : (match.healthRiskScore || 5) >= 4 ? 1.15
                        : 1.0;
                const adjLow = Math.round(baseCost.low * riskMultiplier / 50) * 50;
                const adjHigh = Math.round(baseCost.high * riskMultiplier / 50) * 50;
                updates.estimatedAnnualCost = `$${adjLow}–$${adjHigh}`;

                if (!dryRun) {
                    await (prisma as any).animal.update({
                        where: { id: animal.id },
                        data: updates,
                    });
                }
                breedEnriched++;
            }
        }

        console.log(`   ✅ ${breedEnriched} animals enriched with breed health data`);
    } else {
        console.log('   ⚠ No breed profiles in DB — skipping breed enrichment');
    }

    // ══════════════════════════════════════════════════════
    // 3. ADOPTION URGENCY SCORE
    // ══════════════════════════════════════════════════════
    console.log('\n⏱️  Computing adoption urgency scores...');

    const activeAnimals = await (prisma as any).animal.findMany({
        where: {
            status: { in: ['AVAILABLE', 'URGENT'] },
        },
        select: {
            id: true,
            daysInShelter: true,
            species: true,
            status: true,
            euthScheduledAt: true,
            shelter: {
                select: { shelterType: true },
            },
        },
    });

    let urgencyUpdated = 0;
    for (const animal of activeAnimals) {
        const days = animal.daysInShelter || 0;
        const isMunicipal = animal.shelter?.shelterType === 'MUNICIPAL';

        let urgency: string;
        if (animal.euthScheduledAt) {
            urgency = 'CRITICAL';
        } else if (animal.status === 'URGENT') {
            urgency = 'CRITICAL';
        } else if (isMunicipal && days >= 30) {
            urgency = 'HIGH';
        } else if (days >= 60) {
            urgency = 'HIGH';
        } else if (days >= 14) {
            urgency = 'MODERATE';
        } else {
            urgency = 'LOW';
        }

        if (!dryRun) {
            await (prisma as any).animal.update({
                where: { id: animal.id },
                data: { adoptionUrgency: urgency },
            });
        }
        urgencyUpdated++;
    }

    console.log(`   ✅ ${urgencyUpdated} animals scored for adoption urgency`);

    // ══════════════════════════════════════════════════════
    // 4. ADOPTION READINESS SCORE
    // ══════════════════════════════════════════════════════
    console.log('\n🏠 Computing adoption readiness scores...');

    const animalsForReadiness = await (prisma as any).animal.findMany({
        where: {
            status: { in: ['AVAILABLE', 'URGENT'] },
        },
        select: {
            id: true,
            houseTrained: true,
            goodWithCats: true,
            goodWithDogs: true,
            goodWithChildren: true,
            specialNeeds: true,
            stressLevel: true,
            aggressionRisk: true,
            estimatedCareLevel: true,
            isAltered: true,
            isVaccinated: true,
            isMicrochipped: true,
        },
    });

    let readinessUpdated = 0;
    for (const animal of animalsForReadiness) {
        // Positive signals — each counts toward readiness
        let score = 0;
        let signals = 0;

        if (animal.houseTrained === true) { score += 2; signals++; }
        if (animal.goodWithDogs === true) { score += 1; signals++; }
        if (animal.goodWithCats === true) { score += 1; signals++; }
        if (animal.goodWithChildren === true) { score += 1; signals++; }
        if (animal.isAltered === true) { score += 1; signals++; }
        if (animal.isVaccinated === true) { score += 1; signals++; }
        if (animal.isMicrochipped === true) { score += 1; signals++; }

        // Negative signals
        if (animal.specialNeeds === true) { score -= 2; signals++; }
        if (animal.stressLevel === 'high') { score -= 1; signals++; }
        if (animal.aggressionRisk && animal.aggressionRisk >= 3) { score -= 2; signals++; }
        if (animal.estimatedCareLevel === 'high') { score -= 1; signals++; }

        // Negative behavioral flags
        if (animal.goodWithDogs === false) { score -= 1; signals++; }
        if (animal.goodWithCats === false) { score -= 1; signals++; }
        if (animal.goodWithChildren === false) { score -= 1; signals++; }

        // Only score if we have enough signals
        let readiness: string | null = null;
        if (signals >= 2) {
            if (score >= 5) readiness = 'GREAT';
            else if (score >= 2) readiness = 'GOOD';
            else if (score >= 0) readiness = 'NEEDS_WORK';
            else readiness = 'CHALLENGING';
        }

        if (readiness) {
            if (!dryRun) {
                await (prisma as any).animal.update({
                    where: { id: animal.id },
                    data: { adoptionReadiness: readiness },
                });
            }
            readinessUpdated++;
        }
    }

    console.log(`   ✅ ${readinessUpdated} animals scored for adoption readiness`);

    // ══════════════════════════════════════════════════════
    // 5. VET COST ESTIMATE (for animals without breed match)
    // ══════════════════════════════════════════════════════
    console.log('\n💰 Estimating annual vet costs...');

    const animalsNeedingCost = await (prisma as any).animal.findMany({
        where: {
            status: { in: ['AVAILABLE', 'URGENT'] },
            estimatedAnnualCost: null,
            estimatedCareLevel: { not: null },
        },
        select: {
            id: true,
            estimatedCareLevel: true,
        },
    });

    let costUpdated = 0;
    for (const animal of animalsNeedingCost) {
        const costs = CARE_COST_MAP[animal.estimatedCareLevel] || CARE_COST_MAP.moderate;
        const costStr = `$${costs.low}–$${costs.high}`;

        if (!dryRun) {
            await (prisma as any).animal.update({
                where: { id: animal.id },
                data: { estimatedAnnualCost: costStr },
            });
        }
        costUpdated++;
    }

    console.log(`   ✅ ${costUpdated} animals updated with estimated vet costs`);

    // ══════════════════════════════════════════════════════
    // 6. TEMPORAL TREND ANALYSIS (Section D)
    // ══════════════════════════════════════════════════════
    console.log('\n📈 Computing temporal trends from snapshots...');

    // Find animals with 2+ snapshots for BCS and stress analysis
    const animalsWithSnapshots = await (prisma as any).animal.findMany({
        where: {
            status: { in: ['AVAILABLE', 'URGENT'] },
            snapshots: { some: {} },
        },
        select: {
            id: true,
            name: true,
            snapshots: {
                select: {
                    bodyConditionScore: true,
                    stressLevel: true,
                    scrapedAt: true,
                },
                orderBy: { scrapedAt: 'asc' },
            },
        },
    });

    let trendsComputed = 0;
    const STRESS_MAP: Record<string, number> = { low: 1, moderate: 2, high: 3 };

    for (const animal of animalsWithSnapshots) {
        const snaps = animal.snapshots;
        if (snaps.length < 2) continue;

        const bcsTrend: string[] = [];
        const stressTrend: string[] = [];

        // BCS trend: compare first and last snapshots
        const bcsValues = snaps.filter((s: any) => s.bodyConditionScore != null).map((s: any) => s.bodyConditionScore);
        if (bcsValues.length >= 2) {
            const first = bcsValues[0];
            const last = bcsValues[bcsValues.length - 1];
            const delta = last - first;
            if (delta <= -2) {
                bcsTrend.push(`BCS declining (${first}→${last}): potential weight loss concern`);
            } else if (delta >= 2) {
                bcsTrend.push(`BCS improving (${first}→${last}): gaining weight`);
            } else if (last <= 3) {
                bcsTrend.push(`BCS consistently low (${last}/9): underweight`);
            } else if (last >= 8) {
                bcsTrend.push(`BCS consistently high (${last}/9): overweight`);
            }
        }

        // Stress trend: compare first and last
        const stressValues = snaps
            .filter((s: any) => s.stressLevel != null)
            .map((s: any) => ({ level: s.stressLevel, num: STRESS_MAP[s.stressLevel] || 0 }));
        if (stressValues.length >= 2) {
            const first = stressValues[0];
            const last = stressValues[stressValues.length - 1];
            if (last.num > first.num) {
                stressTrend.push(`Stress escalating (${first.level}→${last.level}): shelter environment impact`);
            } else if (last.num < first.num) {
                stressTrend.push(`Stress improving (${first.level}→${last.level}): adjusting to shelter`);
            }
        }

        // Write trends to healthNotes (append, don't overwrite)
        const trendNotes = [...bcsTrend, ...stressTrend].join('; ');
        if (trendNotes && !dryRun) {
            const existing = await (prisma as any).animal.findUnique({
                where: { id: animal.id },
                select: { healthNotes: true },
            });
            const currentNotes = existing?.healthNotes || '';
            // Only add if not already present
            if (!currentNotes.includes('BCS declining') && !currentNotes.includes('BCS improving') &&
                !currentNotes.includes('Stress escalating') && !currentNotes.includes('Stress improving')) {
                const updated = currentNotes
                    ? `${currentNotes} | Trends: ${trendNotes}`
                    : `Trends: ${trendNotes}`;
                await (prisma as any).animal.update({
                    where: { id: animal.id },
                    data: { healthNotes: updated },
                });
            }
            trendsComputed++;
        } else if (trendNotes) {
            trendsComputed++;
        }
    }

    console.log(`   ✅ ${trendsComputed} animals analyzed for BCS/stress trends`);

    // ══════════════════════════════════════════════════════
    // 7. SHELTER QUALITY INDEX (Section F — Cross-Source)
    // ══════════════════════════════════════════════════════
    console.log('\n🏆 Computing shelter quality index...');

    // Re-fetch shelters with computed metrics
    const sheltersForQuality = await (prisma as any).shelter.findMany({
        select: {
            id: true,
            name: true,
            liveReleaseRate: true,
            transferRate: true,
            returnToOwnerRate: true,
            perCapitaIntake: true,
            medianDaysToOutcome: true,
            seniorCount: true,
        },
    });

    // Compute per-shelter quality index (0-100)
    // Weights: LRR (40%), transfer rate (15%), RTO (15%), low per-capita (15%), fast outcomes (15%)
    let qualityUpdated = 0;

    // Gather population stats for normalization
    const allPerCapita = sheltersForQuality
        .filter((s: any) => s.perCapitaIntake != null)
        .map((s: any) => s.perCapitaIntake as number);
    const allMedianDays = sheltersForQuality
        .filter((s: any) => s.medianDaysToOutcome != null)
        .map((s: any) => s.medianDaysToOutcome as number);

    const maxPerCapita = allPerCapita.length > 0 ? Math.max(...allPerCapita) : 50;
    const maxMedianDays = allMedianDays.length > 0 ? Math.max(...allMedianDays) : 90;

    for (const shelter of sheltersForQuality) {
        const hasMetrics = shelter.liveReleaseRate != null;
        if (!hasMetrics) continue;

        // Each component scores 0–100, then weighted
        const lrrScore = Math.min(100, (shelter.liveReleaseRate || 0) * 100);
        const transferScore = Math.min(100, (shelter.transferRate || 0) * 100);
        const rtoScore = Math.min(100, (shelter.returnToOwnerRate || 0) * 100);

        // Lower per-capita = better (inverse)
        const pcScore = shelter.perCapitaIntake != null && maxPerCapita > 0
            ? Math.max(0, 100 - (shelter.perCapitaIntake / maxPerCapita) * 100)
            : 50; // neutral if unknown

        // Lower median days = better (inverse, capped at 90 days)
        const daysScore = shelter.medianDaysToOutcome != null && maxMedianDays > 0
            ? Math.max(0, 100 - (shelter.medianDaysToOutcome / maxMedianDays) * 100)
            : 50;

        const qualityIndex = Math.round(
            lrrScore * 0.40 +
            transferScore * 0.15 +
            rtoScore * 0.15 +
            pcScore * 0.15 +
            daysScore * 0.15
        );

        if (dryRun) {
            console.log(`   ${shelter.name}: quality=${qualityIndex} (LRR=${lrrScore.toFixed(0)}, xfer=${transferScore.toFixed(0)}, RTO=${rtoScore.toFixed(0)})`);
        }

        // Store as data source name annotation (no new column needed — it's computed on-the-fly)
        // For now, log it for audit purposes
        qualityUpdated++;
    }

    console.log(`   ✅ ${qualityUpdated} shelters scored (quality index computed in-memory for analytics)`);

    // ══════════════════════════════════════════════════════
    // 8. DATA CONFLICT SURFACING (Section F — Cross-Source)
    // ══════════════════════════════════════════════════════
    console.log('\n⚡ Surfacing data conflicts...');

    const animalsWithConflicts = await (prisma as any).animal.count({
        where: {
            status: { in: ['AVAILABLE', 'URGENT'] },
            dataConflicts: { isEmpty: false },
        },
    });

    const totalActive = await (prisma as any).animal.count({
        where: { status: { in: ['AVAILABLE', 'URGENT'] } },
    });

    console.log(`   📋 ${animalsWithConflicts}/${totalActive} active animals have CV↔shelter data conflicts`);

    if (animalsWithConflicts > 0) {
        // Sample top conflicts for reporting
        const sampleConflicts = await (prisma as any).animal.findMany({
            where: {
                status: { in: ['AVAILABLE', 'URGENT'] },
                dataConflicts: { isEmpty: false },
            },
            select: { name: true, dataConflicts: true, intakeId: true },
            take: 5,
        });
        for (const a of sampleConflicts) {
            console.log(`      ${a.name || a.intakeId}: ${(a.dataConflicts as string[]).join(' | ')}`);
        }
    }

    // ══════════════════════════════════════════════════════
    // 9. RE-ENTRY RATE PER SHELTER
    // ══════════════════════════════════════════════════════
    console.log('\n🔄 Computing re-entry rates...');

    const sheltersForReentry = await (prisma as any).shelter.findMany({
        select: { id: true, name: true },
    });

    let reentryComputed = 0;
    for (const shelter of sheltersForReentry) {
        const total = await (prisma as any).animal.count({
            where: { shelterId: shelter.id },
        });
        if (total < 5) continue;

        const repeats = await (prisma as any).animal.count({
            where: {
                shelterId: shelter.id,
                shelterEntryCount: { gte: 2 },
            },
        });

        const rate = Math.round((repeats / total) * 1000) / 10;
        if (rate > 0) {
            if (dryRun) {
                console.log(`   ${shelter.name}: ${rate}% re-entry rate (${repeats}/${total})`);
            }
            reentryComputed++;
        }
    }

    console.log(`   ✅ ${reentryComputed} shelters have non-zero re-entry rates`);

    // ══════════════════════════════════════════════════════
    // 10. PHOTO FRESHNESS FROM SNAPSHOTS
    // ══════════════════════════════════════════════════════
    console.log('\n📸 Detecting photo updates...');

    const animalsWithPhotoSnapshots = await (prisma as any).animal.findMany({
        where: {
            status: { in: ['AVAILABLE', 'URGENT'] },
            snapshots: { some: {} },
        },
        select: {
            id: true,
            snapshots: {
                select: { photoUrl: true, scrapedAt: true },
                orderBy: { scrapedAt: 'desc' },
                take: 5,
            },
        },
    });

    let photoUpdates = 0;
    for (const animal of animalsWithPhotoSnapshots) {
        const snaps = animal.snapshots;
        if (snaps.length < 2) continue;

        // Check if photo URL changed between any snapshots
        const uniquePhotos = new Set(snaps.map((s: any) => s.photoUrl).filter(Boolean));
        if (uniquePhotos.size > 1) {
            photoUpdates++;
        }
    }

    console.log(`   ✅ ${photoUpdates} animals have had photo updates across snapshots`);

    // ══════════════════════════════════════════════════════
    // 11. ADOPTION FEE EXTRACTION FROM DESCRIPTIONS
    // ══════════════════════════════════════════════════════
    console.log('\n💲 Extracting adoption fees from descriptions...');

    const animalsNeedingFee = await (prisma as any).animal.findMany({
        where: {
            status: { in: ['AVAILABLE', 'URGENT'] },
            adoptionFee: null,
            OR: [
                { description: { not: null } },
                { notes: { not: null } },
            ],
        },
        select: {
            id: true,
            description: true,
            notes: true,
        },
    });

    // Regex patterns for adoption fees
    const feePatterns = [
        /adoption\s*fee[:\s]*\$?([\d,]+(?:\.\d{2})?)/i,
        /fee[:\s]*\$?([\d,]+(?:\.\d{2})?)/i,
        /\$([\d,]+(?:\.\d{2})?)\s*(?:adoption|fee)/i,
        /adopt(?:ion)?\s*(?:for|fee|price)[:\s]*\$?([\d,]+)/i,
    ];

    let feesExtracted = 0;
    for (const animal of animalsNeedingFee) {
        const text = `${animal.description || ''} ${animal.notes || ''}`;
        if (!text.trim()) continue;

        let fee: string | null = null;
        for (const pattern of feePatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                const amount = parseFloat(match[1].replace(',', ''));
                if (amount > 0 && amount < 5000) { // sanity check
                    fee = `$${amount}`;
                    break;
                }
            }
        }

        // Check for fee waived/sponsored
        if (!fee) {
            if (/fee\s*(?:is\s*)?waived/i.test(text) || /no\s*(?:adoption\s*)?fee/i.test(text)) {
                fee = 'Waived';
            } else if (/sponsored/i.test(text)) {
                fee = 'Sponsored';
            }
        }

        if (fee && !dryRun) {
            await (prisma as any).animal.update({
                where: { id: animal.id },
                data: { adoptionFee: fee },
            });
            feesExtracted++;
        } else if (fee) {
            feesExtracted++;
        }
    }

    console.log(`   ✅ ${feesExtracted} adoption fees extracted from descriptions`);

    // ══════════════════════════════════════════════════════
    // 12. REGIONAL COMPARISON (State Averages)
    // ══════════════════════════════════════════════════════
    console.log('\n🗺️  Computing regional comparisons...');

    const sheltersWithState = await (prisma as any).shelter.findMany({
        where: { liveReleaseRate: { not: null } },
        select: {
            id: true,
            name: true,
            state: true,
            liveReleaseRate: true,
        },
    });

    // Group by state
    const stateGroups: Record<string, { lrrs: number[]; shelterIds: string[] }> = {};
    for (const s of sheltersWithState) {
        if (!s.state) continue;
        if (!stateGroups[s.state]) stateGroups[s.state] = { lrrs: [], shelterIds: [] };
        stateGroups[s.state].lrrs.push(s.liveReleaseRate);
        stateGroups[s.state].shelterIds.push(s.id);
    }

    let regionalComputed = 0;
    for (const [state, group] of Object.entries(stateGroups)) {
        if (group.lrrs.length < 2) continue; // need at least 2 shelters to compare
        const avg = group.lrrs.reduce((a: number, b: number) => a + b, 0) / group.lrrs.length;
        const stateAvgPct = Math.round(avg * 10000) / 100;
        if (dryRun) {
            console.log(`   ${state}: avg LRR = ${stateAvgPct}% (${group.lrrs.length} shelters)`);
        }
        regionalComputed++;
    }

    console.log(`   ✅ ${regionalComputed} states with regional comparison data`);

    // ══════════════════════════════════════════════════════
    // 13. SEASONAL INTAKE PATTERNS
    // ══════════════════════════════════════════════════════
    console.log('\n📅 Analyzing seasonal intake patterns...');

    const animalsWithIntake = await (prisma as any).animal.findMany({
        where: {
            intakeDate: { not: null },
        },
        select: {
            intakeDate: true,
            species: true,
        },
    });

    const monthlyIntake: Record<number, { dogs: number; cats: number; total: number }> = {};
    for (let m = 0; m < 12; m++) {
        monthlyIntake[m] = { dogs: 0, cats: 0, total: 0 };
    }

    for (const animal of animalsWithIntake) {
        const month = new Date(animal.intakeDate).getMonth();
        monthlyIntake[month].total++;
        if (animal.species === 'DOG') monthlyIntake[month].dogs++;
        else if (animal.species === 'CAT') monthlyIntake[month].cats++;
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const seasonalData = Object.entries(monthlyIntake)
        .filter(([_, data]) => data.total > 0)
        .map(([month, data]) => `${monthNames[parseInt(month)]}: ${data.total} (${data.dogs}D/${data.cats}C)`);

    if (seasonalData.length > 0) {
        console.log(`   📊 ${seasonalData.join(' | ')}`);
    }
    console.log(`   ✅ ${animalsWithIntake.length} animals analyzed for seasonal patterns`);

    // ══════════════════════════════════════════════════════
    // SUMMARY
    // ══════════════════════════════════════════════════════
    console.log('\n🏁 Enrichment computation complete!');
    console.log(`   Shelters: ${shelterUpdates} metrics, ${qualityUpdated} quality indexed, ${reentryComputed} re-entry, ${regionalComputed} states compared`);
    console.log(`   Animals: urgency=${urgencyUpdated}, readiness=${readinessUpdated}, costs=${costUpdated}, trends=${trendsComputed}, fees=${feesExtracted}`);
    console.log(`   Photos: ${photoUpdates} with updates | Conflicts: ${animalsWithConflicts}/${totalActive} flagged`);
    console.log(`   Seasonal: ${animalsWithIntake.length} intake records analyzed`);

    if (dryRun) {
        console.log('   (DRY RUN — no data was written)');
    }

    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
