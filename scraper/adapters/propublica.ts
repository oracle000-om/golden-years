/**
 * ProPublica Nonprofit Explorer API Adapter
 *
 * Wraps ProPublica's free API to search for nonprofits and retrieve
 * IRS Form 990 filing data. Used to cross-reference shelters with
 * their financial filings.
 *
 * API docs: https://projects.propublica.org/nonprofits/api/v2/
 * NTEE code D20 = Animal Protection & Welfare
 */

const API_BASE = 'https://projects.propublica.org/nonprofits/api/v2';
const USER_AGENT = 'GoldenYearsClub/1.0 (animal welfare research)';

// ── Types ──────────────────────────────────────────────

export interface ProPublicaSearchResult {
    ein: number;
    strein: string;
    name: string;
    sub_name: string;
    city: string;
    state: string;
    ntee_code: string;
    score: number;
}

export interface ProPublicaFiling {
    tax_prd_yr: number;
    totrevenue: number;
    totfuncexpns: number;
    totassetsend: number;
    totliabend: number;
    totnetassetend: number;
    totcntrbgfts: number;
    totprgmrevnue: number;
    profndraising: number;
    compnsatncurrofcr: number;
    othrsalwages: number;
    pdf_url: string | null;
}

export interface ProPublicaOrg {
    ein: number;
    name: string;
    address: string;
    city: string;
    state: string;
    zipcode: string;
    ntee_code: string;
    income_amount: number;
    asset_amount: number;
    revenue_amount: number;
}

export interface ProPublicaOrgResponse {
    organization: ProPublicaOrg;
    filings_with_data: ProPublicaFiling[];
    filings_without_data: Array<{ tax_prd_yr: number; pdf_url: string | null }>;
}

export interface MatchedNonprofit {
    ein: string;
    name: string;
    city: string;
    state: string;
    nteeCode: string;
    score: number;
    similarity: number;
}

// ── API Functions ──────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
    const resp = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) throw new Error(`ProPublica API ${resp.status}: ${url}`);
    return resp.json() as Promise<T>;
}

/**
 * Search for nonprofits by name, optionally filtered by state.
 * Uses NTEE subsection 3 (501(c)(3)) to filter to tax-exempt orgs.
 */
export async function searchNonprofits(
    name: string,
    state?: string,
): Promise<ProPublicaSearchResult[]> {
    const params = new URLSearchParams({ q: name });
    if (state) params.set('state[id]', state);
    // subseccd=3 filters to 501(c)(3) organizations
    params.set('ntee[id]', '3');

    const url = `${API_BASE}/search.json?${params.toString()}`;

    // ProPublica returns 404 when zero results are found (instead of an empty array)
    const resp = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
    });
    if (resp.status === 404) return [];
    if (!resp.ok) throw new Error(`ProPublica API ${resp.status}: ${url}`);
    const data = await resp.json() as { organizations: ProPublicaSearchResult[] };
    return data.organizations || [];
}

/**
 * Get full organization details + filing history by EIN.
 */
export async function getOrganization(ein: string | number): Promise<ProPublicaOrgResponse> {
    // Strip hyphens from EIN for the API
    const cleanEin = String(ein).replace(/-/g, '');
    const url = `${API_BASE}/organizations/${cleanEin}.json`;
    return apiFetch<ProPublicaOrgResponse>(url);
}

// ── Fuzzy Matching ─────────────────────────────────────

/** Words to remove when normalizing names for comparison */
const STOP_WORDS = new Set([
    'the', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'llc',
    'ltd', 'of', 'for', 'and', 'a', 'an', 'in', 'at',
    'foundation', 'org', 'organization', 'society',
]);

/**
 * Normalize a name for comparison: lowercase, strip punctuation,
 * remove common legal suffixes, and split into tokens.
 */
export function normalizeNameTokens(name: string): string[] {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 0 && !STOP_WORDS.has(w));
}

/**
 * Compute Jaccard similarity between two sets of tokens.
 * Returns a value 0..1 where 1 = identical sets.
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);
    let intersection = 0;
    for (const token of setA) {
        if (setB.has(token)) intersection++;
    }
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}

/**
 * Match a shelter against ProPublica search results.
 * Returns the best match above the confidence threshold, or null.
 */
export function matchShelterToNonprofit(
    shelterName: string,
    shelterCity: string | null,
    candidates: ProPublicaSearchResult[],
    minSimilarity = 0.6,
): MatchedNonprofit | null {
    if (candidates.length === 0) return null;

    const shelterTokens = normalizeNameTokens(shelterName);
    const normalizedCity = (shelterCity || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

    let bestMatch: MatchedNonprofit | null = null;
    let bestScore = -1;

    for (const candidate of candidates) {
        const candidateTokens = normalizeNameTokens(candidate.name);
        const similarity = jaccardSimilarity(shelterTokens, candidateTokens);

        if (similarity < minSimilarity) continue;

        // Boost score if city matches
        const candidateCity = (candidate.city || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        const cityBoost = normalizedCity && candidateCity &&
            (normalizedCity.includes(candidateCity) || candidateCity.includes(normalizedCity))
            ? 0.15
            : 0;

        const combinedScore = similarity + cityBoost;

        if (combinedScore > bestScore) {
            bestScore = combinedScore;
            bestMatch = {
                ein: candidate.strein,
                name: candidate.name,
                city: candidate.city,
                state: candidate.state,
                nteeCode: candidate.ntee_code,
                score: candidate.score,
                similarity,
            };
        }
    }

    return bestMatch;
}

/**
 * Extract a clean filing history array from ProPublica filings.
 */
export function extractFilingHistory(filings: ProPublicaFiling[]) {
    return filings.map(f => ({
        year: f.tax_prd_yr,
        revenue: f.totrevenue,
        expenses: f.totfuncexpns,
        assets: f.totassetsend,
        liabilities: f.totliabend,
        netAssets: f.totnetassetend,
        contributions: f.totcntrbgfts,
        programRevenue: f.totprgmrevnue,
        fundraising: f.profndraising,
        officerComp: f.compnsatncurrofcr,
        staffWages: f.othrsalwages,
        pdfUrl: f.pdf_url,
    }));
}
