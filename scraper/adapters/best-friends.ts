/**
 * Best Friends Pet Lifesaving Dashboard Adapter
 *
 * Scrapes the Best Friends Tableau dashboard to extract shelter-level
 * no-kill status for ~10,000 shelters across all 51 US state pages.
 *
 * Strategy (discovered via reverse-engineering):
 *   1. Navigate to bestfriends.org/no-kill-2025/animal-shelter-statistics/{state}
 *      (this page provides guest auth to the Tableau Cloud instance)
 *   2. Intercept the VizQL bootstrapSession network response (~460KB)
 *   3. Parse Tableau's multi-part response: segment 2 contains
 *      secondaryInfo.presModelMap.dataDictionary with:
 *      - cstring column: shelter labels ("Name | City, ST"), state codes,
 *        no-kill status ("No-Kill", "Nearly No-Kill")
 *      - integer column: organization IDs
 *      - real column: lat/lon coordinates
 *
 * Source: https://bestfriends.org/no-kill-2025/animal-shelter-statistics
 */

import type { Browser, Page, Response } from 'playwright-core';

export interface BestFriendsShelterId {
    shelterName: string;
    city: string;
    state: string;
    saveRate: number;          // 0.0–1.0 (inferred from no-kill status)
    noKillStatus: string;      // 'YES' | 'NEARLY' | 'NO'
    dataYear: number;
    liveIntakes: number | null;
    nonLiveOutcomes: number | null;
}

/**
 * State slugs for bestfriends.org URL paths.
 * Each state slug maps to the URL segment used on bestfriends.org.
 */
const STATE_SLUGS: string[] = [
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
    'connecticut', 'delaware', 'washington-dc', 'florida', 'georgia', 'hawaii',
    'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana',
    'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
    'missouri', 'montana', 'nebraska', 'nevada', 'new-hampshire', 'new-jersey',
    'new-mexico', 'new-york', 'north-carolina', 'north-dakota', 'ohio', 'oklahoma',
    'oregon', 'pennsylvania', 'rhode-island', 'south-carolina', 'south-dakota',
    'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
    'west-virginia', 'wisconsin', 'wyoming',
];

/** Slug → 2-letter state code */
const SLUG_TO_CODE: Record<string, string> = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
    'washington-dc': 'DC', 'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI',
    'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
    'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME',
    'maryland': 'MD', 'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN',
    'mississippi': 'MS', 'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE',
    'nevada': 'NV', 'new-hampshire': 'NH', 'new-jersey': 'NJ', 'new-mexico': 'NM',
    'new-york': 'NY', 'north-carolina': 'NC', 'north-dakota': 'ND', 'ohio': 'OH',
    'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode-island': 'RI',
    'south-carolina': 'SC', 'south-dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX',
    'utah': 'UT', 'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA',
    'west-virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
};

/** All 2-letter state codes */
export const ALL_STATE_CODES = Object.values(SLUG_TO_CODE);

/**
 * Parse the VizQL bootstrapSession response to extract shelter data.
 *
 * The bootstrap response format is multi-part:
 *   "len1;{segment1_json}len2;{segment2_json}"
 *
 * Segment 2 contains:
 *   secondaryInfo.presModelMap.dataDictionary.presModelHolder
 *     .genDataDictionaryPresModel.dataSegments["0"].dataColumns
 *
 * The cstring column has shelter labels ("Name | City, ST"), state codes,
 * and no-kill status categories.
 */
function parseBootstrapResponse(body: string): BestFriendsShelterId[] {
    const records: BestFriendsShelterId[] = [];

    // ── Strategy 1: Parse multi-part Tableau response format ──
    try {
        // Find segment 2 (secondaryInfo with dataDictionary)
        const firstSemi = body.indexOf(';');
        if (firstSemi < 0 || firstSemi > 20) throw new Error('Invalid format');

        const len1 = parseInt(body.substring(0, firstSemi));
        if (isNaN(len1)) throw new Error('Invalid segment 1 length');

        const seg2Start = firstSemi + 1 + len1;
        const remaining = body.substring(seg2Start);
        const secondSemi = remaining.indexOf(';');
        if (secondSemi < 0 || secondSemi > 20) throw new Error('No segment 2');

        const seg2Json = remaining.substring(secondSemi + 1);
        const seg2Data = JSON.parse(seg2Json);

        // Navigate to dataDictionary
        const dataDict = seg2Data?.secondaryInfo?.presModelMap?.dataDictionary
            ?.presModelHolder?.genDataDictionaryPresModel?.dataSegments;

        if (!dataDict) throw new Error('No dataDictionary found');

        // Collect all cstring values from all segments
        const allStrings: string[] = [];
        for (const segKey of Object.keys(dataDict)) {
            const seg = dataDict[segKey];
            for (const col of (seg.dataColumns || [])) {
                if (col.dataType === 'cstring') {
                    allStrings.push(...(col.dataValues || []));
                }
            }
        }

        // Extract shelter labels matching "Name | City, ST"
        const shelterLabels: string[] = [];
        const noKillStatuses = new Set<string>();
        const shelterPattern = /^(.+?)\s*\|\s*(.+?),\s*([A-Z]{2})$/;

        for (const str of allStrings) {
            if (shelterPattern.test(str)) {
                shelterLabels.push(str);
            }
            // Collect no-kill status categories
            if (str.toLowerCase().includes('no-kill') || str.toLowerCase().includes('no kill')) {
                noKillStatuses.add(str);
            }
        }

        // Determine the state code from the data
        const stateCode = allStrings.find(s => /^[A-Z]{2}$/.test(s) && ALL_STATE_CODES.includes(s)) || '';

        // Check for "Shelter Groups" mapping in vizData
        // The vizData presModelMap contains per-shelter no-kill status mappings
        // via the "Shelter Groups" field
        const vizData = seg2Data?.secondaryInfo?.presModelMap?.vizData?.presModelHolder
            ?.genPresModelMapPresModel?.presModelMap;

        // Try to build shelter → no-kill status mapping from the State Map sheet
        const shelterStatuses = new Map<number, string>();
        if (vizData) {
            const mapSheet = vizData['State Map_Desktop'];
            if (mapSheet) {
                const panes = mapSheet.presModelHolder?.genVizDataPresModel
                    ?.paneColumnsData?.paneColumnsList;
                if (panes && panes.length > 0) {
                    // Extract shelter group indices from the pane columns
                    const vizCols = mapSheet.presModelHolder.genVizDataPresModel
                        .paneColumnsData.vizDataColumns;
                    for (const col of vizCols) {
                        if (col.fieldCaption?.includes('Shelter Groups')) {
                            // Find aliasIndices for this column
                            for (const pane of panes) {
                                for (const vpc of pane.vizPaneColumns) {
                                    if (vpc.aliasIndices) {
                                        // These indices map into the cstring array
                                        for (let j = 0; j < vpc.aliasIndices.length; j++) {
                                            const idx = vpc.aliasIndices[j];
                                            if (idx >= 0 && idx < allStrings.length) {
                                                const val = allStrings[idx];
                                                if (val.includes('No-Kill') || val.includes('Nearly')) {
                                                    shelterStatuses.set(j, val);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Build records from shelter labels
        for (let i = 0; i < shelterLabels.length; i++) {
            const match = shelterLabels[i].match(shelterPattern);
            if (!match) continue;

            // Determine no-kill status
            // Default: if "No-Kill" is in the status set for this state, check per-shelter
            let status = 'NO';
            let saveRate = 0;

            const shelterStatus = shelterStatuses.get(i);
            if (shelterStatus) {
                if (shelterStatus.includes('Nearly')) {
                    status = 'NEARLY';
                    saveRate = 0.87; // Midpoint of 85-89%
                } else if (shelterStatus.includes('No-Kill')) {
                    status = 'YES';
                    saveRate = 0.92; // Estimated ≥90%
                }
            }

            records.push({
                shelterName: match[1].trim(),
                city: match[2].trim(),
                state: match[3] || stateCode,
                saveRate,
                noKillStatus: status,
                dataYear: new Date().getFullYear(),
                liveIntakes: null,
                nonLiveOutcomes: null,
            });
        }

        return records;

    } catch {
        // Fall through to regex-based extraction
    }

    // ── Strategy 2: Regex-based extraction of shelter labels ──
    const shelterPattern = /"([^"]{3,80}\s*\|\s*[^"]{2,40},\s*([A-Z]{2}))"/g;
    let match;
    const seen = new Set<string>();

    while ((match = shelterPattern.exec(body)) !== null) {
        const fullLabel = match[1];
        const state = match[2];
        if (seen.has(fullLabel)) continue;
        seen.add(fullLabel);

        const parts = fullLabel.match(/^(.+?)\s*\|\s*(.+?),\s*([A-Z]{2})$/);
        if (!parts) continue;

        records.push({
            shelterName: parts[1].trim(),
            city: parts[2].trim(),
            state: parts[3],
            saveRate: 0,
            noKillStatus: 'NO',
            dataYear: new Date().getFullYear(),
            liveIntakes: null,
            nonLiveOutcomes: null,
        });
    }

    return records;
}

/**
 * Scrape a single state page by navigating through bestfriends.org
 * (which provides guest auth for the Tableau Cloud instance).
 */
export async function scrapeStatePage(
    page: Page,
    stateSlug: string,
): Promise<BestFriendsShelterId[]> {
    const url = `https://bestfriends.org/no-kill-2025/animal-shelter-statistics/${stateSlug}`;

    // Set up response interception BEFORE navigation
    let bootstrapBody: string | null = null;
    const capturePromise = new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 30000);

        page.on('response', async (response: Response) => {
            const respUrl = response.url();
            if (respUrl.includes('bootstrapSession') && !bootstrapBody) {
                try {
                    bootstrapBody = await response.text();
                    if (bootstrapBody.length > 10000) {
                        clearTimeout(timeout);
                        resolve();
                    }
                } catch { /* response not readable */ }
            }
        });
    });

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // Wait for bootstrapSession response to arrive
        await capturePromise;

        if (bootstrapBody) {
            return parseBootstrapResponse(bootstrapBody);
        }

        // Fallback: wait longer and try again
        await page.waitForTimeout(10000);
        if (bootstrapBody) {
            return parseBootstrapResponse(bootstrapBody);
        }
    } catch (err) {
        console.error(`   ❌ Error scraping ${stateSlug}: ${(err as Error).message?.substring(0, 200)}`);
    }

    return [];
}

/**
 * Fetch Best Friends data from the Tableau dashboard.
 */
export async function fetchBestFriendsData(
    browser: Browser,
    stateFilter?: string,
): Promise<BestFriendsShelterId[]> {
    console.log(`   📥 Fetching Best Friends lifesaving data via Tableau dashboard...`);

    // Map state code filter to slug
    let slugsToScrape = STATE_SLUGS;
    if (stateFilter) {
        const code = stateFilter.toUpperCase();
        const slug = Object.entries(SLUG_TO_CODE).find(([, v]) => v === code)?.[0];
        if (!slug) {
            console.error(`   ❌ Unknown state code: ${stateFilter}`);
            return [];
        }
        slugsToScrape = [slug];
    }

    const allRecords: BestFriendsShelterId[] = [];
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });

    for (let i = 0; i < slugsToScrape.length; i++) {
        const slug = slugsToScrape[i];
        const stateCode = SLUG_TO_CODE[slug];
        const label = `[${i + 1}/${slugsToScrape.length}]`;

        try {
            const records = await scrapeStatePage(page, slug);
            allRecords.push(...records);
            const yesCount = records.filter(r => r.noKillStatus === 'YES').length;
            console.log(`   ${label} ${stateCode}: ${records.length} shelters (${yesCount} no-kill)`);
        } catch (err) {
            console.error(`   ${label} ${stateCode}: failed — ${(err as Error).message?.substring(0, 100)}`);
        }

        // Respectful delay between states
        if (i < slugsToScrape.length - 1) {
            await page.waitForTimeout(2000);
        }
    }

    await page.close();

    console.log(`   ✅ Total: ${allRecords.length} shelters from ${slugsToScrape.length} states`);
    const noKillCount = allRecords.filter(r => r.noKillStatus === 'YES').length;
    const nearlyCount = allRecords.filter(r => r.noKillStatus === 'NEARLY').length;
    console.log(`   📊 ${noKillCount} no-kill, ${nearlyCount} nearly no-kill, ${allRecords.length - noKillCount - nearlyCount} not no-kill`);

    return allRecords;
}

/**
 * Parse Best Friends CSV data (manual fallback import path).
 */
export function parseBestFriendsCsv(csvText: string): BestFriendsShelterId[] {
    const lines = csvText.split('\n');
    if (lines.length < 2) return [];

    const records: BestFriendsShelterId[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const fields = line.split(',').map(f => f.trim().replace(/"/g, ''));
        const name = fields[0] || '';
        const city = fields[1] || '';
        const state = fields[2] || '';
        const saveRateStr = fields[3] || '';

        const saveRate = parseFloat(saveRateStr);
        if (isNaN(saveRate) || !name || !state) continue;

        const normalizedRate = saveRate > 1 ? saveRate / 100 : saveRate;
        let noKillStatus = 'NO';
        if (normalizedRate >= 0.90) noKillStatus = 'YES';
        else if (normalizedRate >= 0.85) noKillStatus = 'NEARLY';

        records.push({
            shelterName: name,
            city,
            state: state.toUpperCase(),
            saveRate: normalizedRate,
            noKillStatus,
            dataYear: parseInt(fields[6] || '2024', 10) || 2024,
            liveIntakes: parseInt(fields[4] || '', 10) || null,
            nonLiveOutcomes: parseInt(fields[5] || '', 10) || null,
        });
    }

    return records;
}
