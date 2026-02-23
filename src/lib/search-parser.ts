/**
 * NLP Search Query Parser
 *
 * Parses natural language search queries into structured intent
 * for building Prisma WHERE clauses.
 *
 * Examples:
 *   "pit bull in texas"        → { breeds: ["pit bull"], state: "TX" }
 *   "female cat over 10"       → { species: "CAT", sex: "FEMALE", minAge: 10 }
 *   "urgent german shepherd"   → { urgency: true, breeds: ["german shepherd"] }
 *   "labrodor"                 → { breeds: ["labrador"] } (typo corrected)
 */

// ─── Types ─────────────────────────────────────────────

export interface SearchIntent {
    species: 'DOG' | 'CAT' | null;
    sex: 'MALE' | 'FEMALE' | null;
    size: 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE' | null;
    minAge: number | null;
    maxAge: number | null;
    urgency: boolean;
    state: string | null;
    breeds: string[];
    textTokens: string[];
}

// ─── Species Keywords ──────────────────────────────────

const SPECIES_MAP: Record<string, 'DOG' | 'CAT'> = {
    dog: 'DOG', dogs: 'DOG', puppy: 'DOG', puppies: 'DOG', pup: 'DOG', canine: 'DOG',
    cat: 'CAT', cats: 'CAT', kitten: 'CAT', kittens: 'CAT', kitty: 'CAT', feline: 'CAT',
};

// ─── Sex Keywords ──────────────────────────────────────

const SEX_MAP: Record<string, 'MALE' | 'FEMALE'> = {
    male: 'MALE', boy: 'MALE', boys: 'MALE', man: 'MALE',
    female: 'FEMALE', girl: 'FEMALE', girls: 'FEMALE', woman: 'FEMALE',
};

// ─── Size Keywords ─────────────────────────────────────

const SIZE_MAP: Record<string, 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE'> = {
    small: 'SMALL', tiny: 'SMALL', little: 'SMALL', mini: 'SMALL', miniature: 'SMALL',
    medium: 'MEDIUM', mid: 'MEDIUM',
    large: 'LARGE', big: 'LARGE',
    xlarge: 'XLARGE', 'extra-large': 'XLARGE', xl: 'XLARGE', giant: 'XLARGE', huge: 'XLARGE',
};

// ─── Urgency Keywords ──────────────────────────────────

const URGENCY_WORDS = new Set([
    'urgent', 'euthanasia', 'euth', 'scheduled', 'at-risk',
    'emergency', 'critical', 'dying', 'deadline',
]);

// ─── Breed Synonyms ────────────────────────────────────
// key = user might type this, value = search substring to match in DB breed field

const BREED_SYNONYMS: [string[], string][] = [
    // Dogs — multi-word first (greedy matching)
    [['german shepherd', 'gsd', 'alsatian'], 'german shepherd'],
    [['golden retriever', 'goldie', 'golden'], 'golden retriever'],
    [['pit bull', 'pitbull', 'pittie', 'pibble', 'pit', 'apbt', 'american pit bull'], 'pit bull'],
    [['labrador', 'labrodor', 'lab'], 'labrador'],
    [['border collie'], 'border collie'],
    [['australian shepherd', 'aussie'], 'australian shepherd'],
    [['great dane'], 'great dane'],
    [['cocker spaniel'], 'cocker spaniel'],
    [['french bulldog', 'frenchie'], 'french bulldog'],
    [['english bulldog', 'bulldog'], 'bulldog'],
    [['shih tzu', 'shitzu'], 'shih tzu'],
    [['yorkshire terrier', 'yorkie'], 'yorkshire'],
    [['jack russell', 'jrt'], 'jack russell'],
    [['siberian husky', 'husky'], 'husky'],
    [['dachshund', 'doxie', 'weiner', 'wiener', 'sausage dog'], 'dachshund'],
    [['rottweiler', 'rottie', 'rott'], 'rottweiler'],
    [['doberman', 'dobie', 'dobermann'], 'doberman'],
    [['chihuahua', 'chi'], 'chihuahua'],
    [['beagle'], 'beagle'],
    [['boxer'], 'boxer'],
    [['poodle'], 'poodle'],
    [['corgi', 'pembroke', 'cardigan'], 'corgi'],
    [['mastiff'], 'mastiff'],
    [['coonhound', 'coon hound'], 'coonhound'],
    [['bloodhound'], 'bloodhound'],
    [['malinois', 'belgian malinois', 'mal'], 'malinois'],
    [['shepherd'], 'shepherd'],
    [['terrier'], 'terrier'],
    [['hound'], 'hound'],
    [['spaniel'], 'spaniel'],
    [['retriever'], 'retriever'],
    // Cats
    [['maine coon'], 'maine coon'],
    [['siamese'], 'siamese'],
    [['persian'], 'persian'],
    [['tabby'], 'tabby'],
    [['calico'], 'calico'],
    [['tuxedo'], 'tuxedo'],
    [['bengal'], 'bengal'],
    [['ragdoll'], 'ragdoll'],
    [['sphynx', 'sphinx'], 'sphynx'],
    [['domestic shorthair', 'dsh'], 'domestic shorthair'],
    [['domestic longhair', 'dlh'], 'domestic longhair'],
];

// ─── US State Names → Codes ───────────────────────────

const STATE_NAMES: Record<string, string> = {
    alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR',
    california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
    florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
    illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
    kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
    massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
    missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
    oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
    vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
    wisconsin: 'WI', wyoming: 'WY',
    // Canadian provinces
    ontario: 'ON', quebec: 'QC', 'british columbia': 'BC', alberta: 'AB',
};

// All 2-letter state/province codes
const STATE_CODES = new Set(Object.values(STATE_NAMES));

// ─── Stop Words (ignored during text matching) ────────

const STOP_WORDS = new Set([
    'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'want', 'need',
    'find', 'show', 'search', 'looking', 'look', 'save', 'adopt',
    'near', 'from', 'that', 'who', 'old', 'years', 'year', 'yrs',
    'yr', 'than', 'about', 'around', 'roughly',
]);

// ─── Levenshtein Distance ─────────────────────────────

function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) d[i][0] = i;
    for (let j = 0; j <= n; j++) d[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(
                d[i - 1][j] + 1,       // deletion
                d[i][j - 1] + 1,       // insertion
                d[i - 1][j - 1] + cost, // substitution
            );
        }
    }
    return d[m][n];
}

// ─── Parser ────────────────────────────────────────────

export function parseSearchQuery(raw: string): SearchIntent {
    const intent: SearchIntent = {
        species: null,
        sex: null,
        size: null,
        minAge: null,
        maxAge: null,
        urgency: false,
        state: null,
        breeds: [],
        textTokens: [],
    };

    if (!raw || !raw.trim()) return intent;

    // Normalize: lowercase, collapse whitespace, remove punctuation except hyphens
    let text = raw.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();

    // ── 1. Extract age patterns (before tokenization) ──────────
    // "over 10", "10+", "older than 10", "above 10"
    const minAgePatterns = [
        /\b(?:over|older\s+than|above|more\s+than|at\s+least)\s+(\d{1,2})\b/,
        /\b(\d{1,2})\s*\+\b/,
    ];
    for (const pat of minAgePatterns) {
        const match = text.match(pat);
        if (match) {
            intent.minAge = parseInt(match[1], 10);
            text = text.replace(match[0], ' ').trim();
        }
    }

    // "under 8", "younger than 8", "below 8", "less than 8"
    const maxAgePatterns = [
        /\b(?:under|younger\s+than|below|less\s+than|at\s+most)\s+(\d{1,2})\b/,
    ];
    for (const pat of maxAgePatterns) {
        const match = text.match(pat);
        if (match) {
            intent.maxAge = parseInt(match[1], 10);
            text = text.replace(match[0], ' ').trim();
        }
    }

    // ── 2. Extract multi-word state names ──────────────────────
    for (const [name, code] of Object.entries(STATE_NAMES)) {
        if (name.includes(' ')) {
            const idx = text.indexOf(name);
            if (idx !== -1) {
                intent.state = code;
                text = text.replace(name, ' ').trim();
                break;
            }
        }
    }

    // ── 3. Extract multi-word breed synonyms (greedy) ──────────
    for (const [aliases, canonical] of BREED_SYNONYMS) {
        for (const alias of aliases) {
            if (alias.includes(' ')) {
                const idx = text.indexOf(alias);
                if (idx !== -1) {
                    if (!intent.breeds.includes(canonical)) {
                        intent.breeds.push(canonical);
                    }
                    text = text.replace(alias, ' ').trim();
                }
            }
        }
    }

    // ── 4. Tokenize remaining text ─────────────────────────────
    const tokens = text.split(/\s+/).filter(Boolean);
    const consumed = new Set<number>();

    // ── 5. Single-word extraction passes ───────────────────────

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];

        // Species
        if (!intent.species && SPECIES_MAP[t]) {
            intent.species = SPECIES_MAP[t];
            consumed.add(i);
            continue;
        }

        // Sex
        if (!intent.sex && SEX_MAP[t]) {
            intent.sex = SEX_MAP[t];
            consumed.add(i);
            continue;
        }

        // Size
        if (!intent.size && SIZE_MAP[t]) {
            intent.size = SIZE_MAP[t];
            consumed.add(i);
            continue;
        }

        // Urgency
        if (URGENCY_WORDS.has(t)) {
            intent.urgency = true;
            consumed.add(i);
            continue;
        }

        // State: 2-letter code
        if (!intent.state && t.length === 2 && STATE_CODES.has(t.toUpperCase())) {
            intent.state = t.toUpperCase();
            consumed.add(i);
            continue;
        }

        // State: single-word full name (e.g. "texas", "california")
        if (!intent.state && STATE_NAMES[t]) {
            intent.state = STATE_NAMES[t];
            consumed.add(i);
            continue;
        }

        // Single-word breed synonym (exact)
        let breedMatched = false;
        for (const [aliases, canonical] of BREED_SYNONYMS) {
            for (const alias of aliases) {
                if (!alias.includes(' ') && alias === t) {
                    if (!intent.breeds.includes(canonical)) {
                        intent.breeds.push(canonical);
                    }
                    consumed.add(i);
                    breedMatched = true;
                    break;
                }
            }
            if (breedMatched) break;
        }
        if (breedMatched) continue;

        // Fuzzy breed match for tokens >= 4 chars (typo tolerance)
        if (t.length >= 4) {
            let bestMatch: string | null = null;
            let bestDist = Infinity;
            for (const [aliases, canonical] of BREED_SYNONYMS) {
                for (const alias of aliases) {
                    if (alias.includes(' ')) continue; // only single-word
                    const dist = levenshtein(t, alias);
                    // Allow distance ≤ 2 for words 4+ chars, ≤ 1 for 4 chars
                    const maxDist = t.length <= 4 ? 1 : 2;
                    if (dist <= maxDist && dist < bestDist) {
                        bestDist = dist;
                        bestMatch = canonical;
                    }
                }
            }
            if (bestMatch && !intent.breeds.includes(bestMatch)) {
                intent.breeds.push(bestMatch);
                consumed.add(i);
                continue;
            }
        }
    }

    // ── 6. Collect remaining tokens (not stop words) ───────────
    for (let i = 0; i < tokens.length; i++) {
        if (!consumed.has(i)) {
            const t = tokens[i];
            // Skip stop words and bare numbers (already handled by age patterns)
            if (!STOP_WORDS.has(t) && !/^\d+$/.test(t)) {
                intent.textTokens.push(t);
            }
        }
    }

    return intent;
}
