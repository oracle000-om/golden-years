/**
 * PubMed E-utilities Adapter
 *
 * Queries NCBI PubMed for veterinary literature using the E-utilities API.
 * Supports breed-specific searches with MeSH terms for species and disease.
 *
 * API docs: https://www.ncbi.nlm.nih.gov/books/NBK25500/
 *
 * Rate limits:
 *   - Without API key: 3 requests/second
 *   - With NCBI_API_KEY: 10 requests/second
 */

const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const USER_AGENT = 'GoldenYearsClub/1.0';

/** Delay between requests to respect NCBI rate limits */
const DELAY_MS_NO_KEY = 340;   // ~3 req/s
const DELAY_MS_WITH_KEY = 110; // ~10 req/s

/** Maximum articles to fetch per breed query */
const MAX_RESULTS_PER_QUERY = 100;

/** Batch size for efetch (NCBI recommends ≤200 IDs per request) */
const EFETCH_BATCH_SIZE = 50;

// ── Types ──

export interface PubMedArticle {
    pmid: string;
    title: string;
    abstract: string | null;
    authors: string[];
    journal: string | null;
    pubDate: Date | null;
    meshTerms: string[];
    keywords: string[];
}

export interface PubMedSearchResult {
    query: string;
    totalCount: number;
    articles: PubMedArticle[];
}

interface ESearchResult {
    esearchresult: {
        count: string;
        retmax: string;
        retstart: string;
        idlist: string[];
    };
}

// ── Query Builder ──

/**
 * Build a PubMed search query for a specific breed.
 *
 * Strategy:
 *   - Search breed name in Title/Abstract
 *   - Filter by species-appropriate MeSH terms (Dog Diseases / Cat Diseases)
 *   - Include aging/geriatric/senior terms for senior-relevant articles
 *   - Limit to English, recent articles (2015+)
 *   - Also search without aging filter but with disease focus for broader coverage
 */
export function buildBreedQuery(breed: string, species: 'DOG' | 'CAT'): string {
    const speciesMesh = species === 'DOG'
        ? '("Dog Diseases"[MESH] OR "Dogs"[MESH])'
        : '("Cat Diseases"[MESH] OR "Cats"[MESH])';

    // Escape breed name for PubMed query
    const breedTerm = `"${breed}"[TIAB]`;

    // Focus on health-relevant articles
    const healthTerms = [
        '"disease"[TIAB]',
        '"health"[TIAB]',
        '"condition"[TIAB]',
        '"prevalence"[TIAB]',
        '"predisposition"[TIAB]',
        '"morbidity"[TIAB]',
        '"diagnosis"[TIAB]',
        '"clinical"[TIAB]',
    ].join(' OR ');

    return `${breedTerm} AND ${speciesMesh} AND (${healthTerms}) AND ("2015"[PDAT] : "3000"[PDAT]) AND English[LANG]`;
}

/**
 * Build a senior-focused query for a breed.
 * Narrower but more relevant for GYC's senior animal focus.
 */
export function buildSeniorBreedQuery(breed: string, species: 'DOG' | 'CAT'): string {
    const speciesMesh = species === 'DOG'
        ? '("Dog Diseases"[MESH] OR "Dogs"[MESH])'
        : '("Cat Diseases"[MESH] OR "Cats"[MESH])';

    const breedTerm = `"${breed}"[TIAB]`;
    const agingTerms = '("Aging"[MESH] OR "Geriatrics"[MESH] OR "senior"[TIAB] OR "elderly"[TIAB] OR "geriatric"[TIAB] OR "aged"[TIAB])';

    return `${breedTerm} AND ${speciesMesh} AND ${agingTerms} AND ("2015"[PDAT] : "3000"[PDAT]) AND English[LANG]`;
}

// ── API Client ──

function getApiKey(): string | null {
    return process.env.NCBI_API_KEY || null;
}

function getDelay(): number {
    return getApiKey() ? DELAY_MS_WITH_KEY : DELAY_MS_NO_KEY;
}

async function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

function buildUrl(endpoint: string, params: Record<string, string>): string {
    const apiKey = getApiKey();
    if (apiKey) params['api_key'] = apiKey;
    const qs = new URLSearchParams(params).toString();
    return `${EUTILS_BASE}/${endpoint}?${qs}`;
}

/** Fetch with retry on 429 (rate limit) — exponential backoff */
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        const resp = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
        });

        if (resp.status === 429 && attempt < retries) {
            const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
            console.log(`      ⏳ Rate limited (429), retrying in ${delay / 1000}s...`);
            await sleep(delay);
            continue;
        }

        return resp;
    }

    throw new Error('PubMed: max retries exceeded');
}

/**
 * Search PubMed and return matching PMIDs.
 */
export async function searchPubMed(query: string, retmax = MAX_RESULTS_PER_QUERY): Promise<{ pmids: string[]; totalCount: number }> {
    const url = buildUrl('esearch.fcgi', {
        db: 'pubmed',
        term: query,
        retmax: String(retmax),
        retmode: 'json',
        usehistory: 'n',
    });

    const resp = await fetchWithRetry(url);

    if (!resp.ok) {
        throw new Error(`PubMed esearch failed: ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json() as ESearchResult;
    return {
        pmids: data.esearchresult.idlist || [],
        totalCount: parseInt(data.esearchresult.count, 10) || 0,
    };
}

/**
 * Fetch article details (title, abstract, MeSH terms) for a batch of PMIDs.
 * Uses efetch XML endpoint and regex parsing.
 */
export async function fetchArticles(pmids: string[]): Promise<PubMedArticle[]> {
    if (pmids.length === 0) return [];

    const articles: PubMedArticle[] = [];

    // Process in batches
    for (let i = 0; i < pmids.length; i += EFETCH_BATCH_SIZE) {
        const batch = pmids.slice(i, i + EFETCH_BATCH_SIZE);
        const url = buildUrl('efetch.fcgi', {
            db: 'pubmed',
            id: batch.join(','),
            rettype: 'abstract',
            retmode: 'xml',
        });

        const resp = await fetchWithRetry(url);

        if (!resp.ok) {
            console.error(`   ⚠ PubMed efetch failed for batch ${i}: ${resp.status}`);
            continue;
        }

        const xml = await resp.text();
        const parsed = parseArticlesXml(xml);
        articles.push(...parsed);

        if (i + EFETCH_BATCH_SIZE < pmids.length) {
            await sleep(getDelay());
        }
    }

    return articles;
}

/**
 * Full search-and-fetch pipeline for a breed.
 * Returns the articles and a summary.
 */
export async function searchBreedArticles(
    breed: string,
    species: 'DOG' | 'CAT',
    options: { maxResults?: number; seniorOnly?: boolean } = {},
): Promise<PubMedSearchResult> {
    const maxResults = options.maxResults ?? MAX_RESULTS_PER_QUERY;
    const query = options.seniorOnly
        ? buildSeniorBreedQuery(breed, species)
        : buildBreedQuery(breed, species);

    // Step 1: Search for PMIDs
    const { pmids, totalCount } = await searchPubMed(query, maxResults);

    if (pmids.length === 0) {
        return { query, totalCount, articles: [] };
    }

    await sleep(getDelay());

    // Step 2: Fetch full article details
    const articles = await fetchArticles(pmids);

    return { query, totalCount, articles };
}

// ── XML Parsing ──

/**
 * Parse PubMed efetch XML into structured articles.
 * Uses regex extraction — PubMed XML is extremely consistent.
 */
function parseArticlesXml(xml: string): PubMedArticle[] {
    const articles: PubMedArticle[] = [];

    // Split by <PubmedArticle> blocks
    const articleBlocks = xml.split(/<PubmedArticle>/g).slice(1);

    for (const block of articleBlocks) {
        try {
            const article = parseSingleArticle(block);
            if (article) articles.push(article);
        } catch {
            // Skip malformed articles
        }
    }

    return articles;
}

function parseSingleArticle(xml: string): PubMedArticle | null {
    // PMID
    const pmidMatch = xml.match(/<PMID[^>]*>(\d+)<\/PMID>/);
    if (!pmidMatch) return null;
    const pmid = pmidMatch[1];

    // Title
    const titleMatch = xml.match(/<ArticleTitle>([\s\S]+?)<\/ArticleTitle>/);
    const title = titleMatch ? cleanXml(titleMatch[1]) : 'Untitled';

    // Abstract — may have multiple labeled sections
    let abstract: string | null = null;
    const abstractBlockMatch = xml.match(/<Abstract>([\s\S]*?)<\/Abstract>/);
    if (abstractBlockMatch) {
        const abstractTexts = abstractBlockMatch[1].match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g);
        if (abstractTexts) {
            abstract = abstractTexts
                .map(t => {
                    // Extract label if present
                    const labelMatch = t.match(/Label="([^"]+)"/);
                    const contentMatch = t.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/);
                    const content = contentMatch ? cleanXml(contentMatch[1]) : '';
                    return labelMatch ? `${labelMatch[1]}: ${content}` : content;
                })
                .join(' ')
                .trim();
        }
    }

    // Authors
    const authors: string[] = [];
    const authorMatches = xml.matchAll(/<Author[^>]*>[\s\S]*?<LastName>([^<]+)<\/LastName>[\s\S]*?<ForeName>([^<]+)<\/ForeName>[\s\S]*?<\/Author>/g);
    for (const m of authorMatches) {
        authors.push(`${cleanXml(m[2])} ${cleanXml(m[1])}`);
    }

    // Journal
    const journalMatch = xml.match(/<ISOAbbreviation>([^<]+)<\/ISOAbbreviation>/);
    const journal = journalMatch ? cleanXml(journalMatch[1]) : null;

    // Publication date
    let pubDate: Date | null = null;
    const pubDateMatch = xml.match(/<PubDate>\s*<Year>(\d{4})<\/Year>(?:\s*<Month>([^<]+)<\/Month>)?/);
    if (pubDateMatch) {
        const year = parseInt(pubDateMatch[1], 10);
        const monthStr = pubDateMatch[2];
        const month = monthStr ? parseMonth(monthStr) : 0;
        pubDate = new Date(year, month, 1);
    }

    // MeSH terms
    const meshTerms: string[] = [];
    const meshMatches = xml.matchAll(/<DescriptorName[^>]*>([^<]+)<\/DescriptorName>/g);
    for (const m of meshMatches) {
        meshTerms.push(cleanXml(m[1]));
    }

    // Keywords
    const keywords: string[] = [];
    const kwMatches = xml.matchAll(/<Keyword[^>]*>([^<]+)<\/Keyword>/g);
    for (const m of kwMatches) {
        keywords.push(cleanXml(m[1]));
    }

    return { pmid, title, abstract, authors, journal, pubDate, meshTerms, keywords };
}

/** Clean XML entities and tags from a string */
function cleanXml(text: string): string {
    return text
        .replace(/<[^>]+>/g, '')         // Strip HTML/XML tags
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/** Parse a month string (number or abbreviation) to 0-indexed month */
function parseMonth(month: string): number {
    const num = parseInt(month, 10);
    if (!isNaN(num)) return num - 1;

    const abbrevs: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    return abbrevs[month.toLowerCase().substring(0, 3)] ?? 0;
}
