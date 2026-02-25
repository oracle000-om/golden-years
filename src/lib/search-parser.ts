/**
 * NLP Search Query Parser v2
 *
 * Parses natural language search queries into structured intent
 * for building Prisma WHERE clauses.
 *
 * Features:
 *   - Species, sex, size detection
 *   - Breed synonyms with fuzzy Levenshtein matching
 *   - Multi-breed OR ("pit bull or labrador")
 *   - State/city name detection
 *   - Age range parsing ("over 10", "under 8")
 *   - Urgency keywords
 *   - Color/coat keywords ("black cat", "brindle")
 *   - Breed group keywords ("herding", "sporting")
 *   - "Near me" / zip code detection
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
    city: string | null;
    breeds: string[];
    breedGroups: string[];
    colors: string[];
    nearMe: boolean;
    zip: string | null;
    radiusMiles: number | null;
    careLevel: 'low' | 'moderate' | 'high' | null;
    sortByWait: boolean;
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

// ─── Color/Coat Keywords ───────────────────────────────

const COLOR_KEYWORDS = new Set([
    'black', 'white', 'brown', 'tan', 'orange', 'grey', 'gray',
    'red', 'brindle', 'merle', 'spotted', 'tricolor', 'tri-color',
    'blonde', 'cream', 'fawn', 'sable', 'chocolate', 'blue',
    'golden', 'silver', 'copper', 'rust', 'apricot', 'buff',
    'tuxedo', 'calico', 'tabby', 'tortoiseshell', 'tortie',
]);

// Note: some of these overlap with breed terms (tabby, calico, tuxedo).
// When they overlap, they get added to BOTH colors and breeds.

// ─── Breed Group Keywords ──────────────────────────────

const BREED_GROUP_MAP: Record<string, string> = {
    sporting: 'Sporting',
    herding: 'Herding',
    working: 'Working',
    hound: 'Hound',
    toy: 'Toy',
    'non-sporting': 'Non-Sporting',
    nonsporting: 'Non-Sporting',
    foundation: 'Foundation Stock Service',
    miscellaneous: 'Miscellaneous',
};

// ─── Breed Synonyms ────────────────────────────────────

const BREED_SYNONYMS: [string[], string][] = [
    // Dogs — multi-word first (greedy matching)
    [['german shepherd', 'gsd', 'alsatian'], 'german shepherd'],
    [['golden retriever', 'goldie'], 'golden retriever'],
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
    [['spaniel'], 'spaniel'],
    [['retriever'], 'retriever'],
    // Cats
    [['maine coon'], 'maine coon'],
    [['siamese'], 'siamese'],
    [['persian'], 'persian'],
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

const STATE_CODES = new Set(Object.values(STATE_NAMES));

// ─── City Names (major US cities) ─────────────────────

const CITY_NAMES: Record<string, string> = {
    // Multi-word cities (checked first)
    'los angeles': 'Los Angeles',
    'new york city': 'New York',
    'new york': 'New York',
    'san francisco': 'San Francisco',
    'san antonio': 'San Antonio',
    'san diego': 'San Diego',
    'san jose': 'San Jose',
    'fort worth': 'Fort Worth',
    'el paso': 'El Paso',
    'las vegas': 'Las Vegas',
    'oklahoma city': 'Oklahoma City',
    'kansas city': 'Kansas City',
    'salt lake city': 'Salt Lake',
    'st louis': 'St. Louis',
    'saint louis': 'St. Louis',
    'st paul': 'St. Paul',
    'baton rouge': 'Baton Rouge',
    'virginia beach': 'Virginia Beach',
    'long beach': 'Long Beach',
    'little rock': 'Little Rock',
    'north charleston': 'North Charleston',
    // Single-word cities
    houston: 'Houston',
    chicago: 'Chicago',
    phoenix: 'Phoenix',
    philadelphia: 'Philadelphia',
    dallas: 'Dallas',
    austin: 'Austin',
    jacksonville: 'Jacksonville',
    columbus: 'Columbus',
    charlotte: 'Charlotte',
    indianapolis: 'Indianapolis',
    seattle: 'Seattle',
    denver: 'Denver',
    nashville: 'Nashville',
    baltimore: 'Baltimore',
    louisville: 'Louisville',
    milwaukee: 'Milwaukee',
    portland: 'Portland',
    tucson: 'Tucson',
    fresno: 'Fresno',
    sacramento: 'Sacramento',
    mesa: 'Mesa',
    atlanta: 'Atlanta',
    omaha: 'Omaha',
    raleigh: 'Raleigh',
    miami: 'Miami',
    oakland: 'Oakland',
    minneapolis: 'Minneapolis',
    tampa: 'Tampa',
    arlington: 'Arlington',
    tulsa: 'Tulsa',
    bakersfield: 'Bakersfield',
    aurora: 'Aurora',
    anaheim: 'Anaheim',
    pittsburgh: 'Pittsburgh',
    cincinnati: 'Cincinnati',
    stockton: 'Stockton',
    detroit: 'Detroit',
    memphis: 'Memphis',
    cleveland: 'Cleveland',
    richmond: 'Richmond',
    orlando: 'Orlando',
    riverside: 'Riverside',
    durham: 'Durham',
    dublin: 'Dublin',
    albuquerque: 'Albuquerque',
};

// ─── "Near Me" Phrases ─────────────────────────────────

const NEAR_ME_PHRASES = [
    'near me', 'nearby', 'close to me', 'close by', 'around me',
    'in my area', 'local', 'closest',
];

// ─── Stop Words ────────────────────────────────────────

const STOP_WORDS = new Set([
    'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'and', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'want', 'need',
    'find', 'show', 'search', 'looking', 'look', 'save', 'adopt',
    'from', 'that', 'who', 'old', 'years', 'year', 'yrs',
    'yr', 'than', 'about', 'around', 'roughly',
    'type', 'breed', 'color', 'colour', 'colored', 'coloured',
    'senior', 'seniors', 'elderly', 'older',
    'maintenance', 'wait', 'waiting',
]);

// Note: "or" and "near" are NOT stop words — they have special meaning now.

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
                d[i - 1][j] + 1,
                d[i][j - 1] + 1,
                d[i - 1][j - 1] + cost,
            );
        }
    }
    return d[m][n];
}

// ─── Intent Label Helpers (for chips UI) ───────────────

export function getIntentLabels(intent: SearchIntent): { emoji: string; label: string; field: string }[] {
    const labels: { emoji: string; label: string; field: string }[] = [];

    if (intent.species) {
        labels.push({ emoji: intent.species === 'DOG' ? '🐕' : '🐈', label: intent.species === 'DOG' ? 'Dog' : 'Cat', field: 'species' });
    }
    if (intent.sex) {
        labels.push({ emoji: intent.sex === 'MALE' ? '♂' : '♀', label: intent.sex === 'MALE' ? 'Male' : 'Female', field: 'sex' });
    }
    if (intent.size) {
        const sizeLabel = { SMALL: 'Small', MEDIUM: 'Medium', LARGE: 'Large', XLARGE: 'X-Large' }[intent.size];
        labels.push({ emoji: '📏', label: sizeLabel, field: 'size' });
    }
    if (intent.minAge !== null) {
        labels.push({ emoji: '🎂', label: `${intent.minAge}+ yrs`, field: 'minAge' });
    }
    if (intent.maxAge !== null) {
        labels.push({ emoji: '🎂', label: `Under ${intent.maxAge} yrs`, field: 'maxAge' });
    }
    if (intent.urgency) {
        labels.push({ emoji: '🚨', label: 'Urgent', field: 'urgency' });
    }
    if (intent.state) {
        labels.push({ emoji: '📍', label: intent.state, field: 'state' });
    }
    if (intent.city) {
        labels.push({ emoji: '🏙️', label: intent.city, field: 'city' });
    }
    for (const breed of intent.breeds) {
        labels.push({ emoji: '🏷️', label: breed, field: 'breed' });
    }
    for (const group of intent.breedGroups) {
        labels.push({ emoji: '🏷️', label: `${group} group`, field: 'breedGroup' });
    }
    for (const color of intent.colors) {
        labels.push({ emoji: '🎨', label: color, field: 'color' });
    }
    if (intent.nearMe) {
        labels.push({ emoji: '📍', label: 'Near me', field: 'nearMe' });
    }
    if (intent.zip) {
        labels.push({ emoji: '📮', label: intent.zip, field: 'zip' });
    }
    if (intent.radiusMiles) {
        labels.push({ emoji: '📏', label: `${intent.radiusMiles} mi`, field: 'radius' });
    }
    if (intent.careLevel) {
        const careLevelLabel = { low: 'Low-maintenance', moderate: 'Moderate care', high: 'High care' }[intent.careLevel];
        labels.push({ emoji: '🛋️', label: careLevelLabel, field: 'careLevel' });
    }
    if (intent.sortByWait) {
        labels.push({ emoji: '⏳', label: 'Longest wait', field: 'sortByWait' });
    }
    for (const token of intent.textTokens) {
        labels.push({ emoji: '🔤', label: token, field: 'text' });
    }

    return labels;
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
        city: null,
        breeds: [],
        breedGroups: [],
        colors: [],
        nearMe: false,
        zip: null,
        radiusMiles: null,
        careLevel: null,
        sortByWait: false,
        textTokens: [],
    };

    if (!raw || !raw.trim()) return intent;

    // Normalize: lowercase, collapse whitespace, remove punctuation except hyphens
    let text = raw.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();

    // ── 0. Extract radius phrases ──────────────────────────
    const radiusPatterns = [
        /\bwithin\s+(\d+)\s*(?:mi|miles?)\b/,
        /\b(\d+)\s*(?:mi|miles?)\s*(?:radius|away)?\b/,
    ];
    for (const pat of radiusPatterns) {
        const match = text.match(pat);
        if (match) {
            intent.radiusMiles = parseInt(match[1], 10);
            text = text.replace(match[0], ' ').trim();
            break;
        }
    }

    // ── 0.5. Extract zip codes (5-digit) ───────────────────
    const zipMatch = text.match(/\b(\d{5})\b/);
    if (zipMatch) {
        intent.zip = zipMatch[1];
        text = text.replace(zipMatch[0], ' ').trim();
    }

    // ── 0.5. Detect "near me" phrases ──────────────────────
    for (const phrase of NEAR_ME_PHRASES) {
        if (text.includes(phrase)) {
            intent.nearMe = true;
            text = text.replace(phrase, ' ').trim();
            break;
        }
    }

    // ── 0.7. Detect care level phrases ─────────────────────
    const CARE_LEVEL_PHRASES: [string[], 'low' | 'moderate' | 'high'][] = [
        [['low maintenance', 'low-maintenance', 'easy care', 'easy-care', 'easy going', 'easy-going', 'easygoing', 'laid back', 'laid-back', 'chill'], 'low'],
        [['moderate care', 'some care', 'moderate maintenance'], 'moderate'],
        [['high maintenance', 'high-maintenance', 'special needs', 'high care'], 'high'],
    ];
    for (const [phrases, level] of CARE_LEVEL_PHRASES) {
        for (const phrase of phrases) {
            if (text.includes(phrase)) {
                intent.careLevel = level;
                text = text.replace(phrase, ' ').trim();
                break;
            }
        }
        if (intent.careLevel) break;
    }

    // ── 0.8. Detect "longest wait" / sort-by-wait phrases ──
    const WAIT_PHRASES = [
        'longest wait', 'waiting the longest', 'waiting longest',
        'longest in shelter', 'most overlooked', 'most time',
    ];
    for (const phrase of WAIT_PHRASES) {
        if (text.includes(phrase)) {
            intent.sortByWait = true;
            text = text.replace(phrase, ' ').trim();
            break;
        }
    }

    // ── 1. Extract age patterns ────────────────────────────
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

    // ── 2. Multi-word state names ──────────────────────────
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

    // ── 2.5. Multi-word city names ─────────────────────────
    for (const [name, canonical] of Object.entries(CITY_NAMES)) {
        if (name.includes(' ')) {
            const idx = text.indexOf(name);
            if (idx !== -1) {
                intent.city = canonical;
                text = text.replace(name, ' ').trim();
                break;
            }
        }
    }

    // ── 3. Multi-word breed synonyms (greedy) ──────────────
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

    // ── 3.5. Multi-breed OR: detect "X or Y" in text ───────
    // Handles patterns like "pit bull or labrador" where one or both
    // may already have been consumed as multi-word breeds.
    // At this point, if multi-word breeds were consumed, remaining
    // text might be "or labrador" or just "or Y".
    // We scan pre-tokenization to catch remaining breed-or-breed patterns.
    const orPattern = /\bor\s+(\S+)/g;
    let orMatch;
    while ((orMatch = orPattern.exec(text)) !== null) {
        const rightToken = orMatch[1];
        const rightBreed = findBreedMatch(rightToken);
        if (rightBreed && intent.breeds.length > 0) {
            // "or" follows a previously matched breed — add the right side too
            if (!intent.breeds.includes(rightBreed)) {
                intent.breeds.push(rightBreed);
            }
            text = text.replace(orMatch[0], ' ').trim();
        }
    }

    // ── 4. Tokenize remaining text ─────────────────────────
    const tokens = text.split(/\s+/).filter(Boolean);
    const consumed = new Set<number>();

    // ── 4.5. Multi-breed OR: detect "X or Y" patterns ──────
    for (let i = 0; i < tokens.length - 2; i++) {
        if (tokens[i + 1] === 'or') {
            const left = tokens[i];
            const right = tokens[i + 2];
            const leftBreed = findBreedMatch(left);
            const rightBreed = findBreedMatch(right);
            if (leftBreed && rightBreed) {
                if (!intent.breeds.includes(leftBreed)) intent.breeds.push(leftBreed);
                if (!intent.breeds.includes(rightBreed)) intent.breeds.push(rightBreed);
                consumed.add(i);
                consumed.add(i + 1);
                consumed.add(i + 2);
            }
        }
    }

    // ── 5. Single-word extraction ──────────────────────────

    for (let i = 0; i < tokens.length; i++) {
        if (consumed.has(i)) continue;
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

        // State: 2-letter code (but NOT "or" — that's the logical operator)
        if (!intent.state && t.length === 2 && t !== 'or' && STATE_CODES.has(t.toUpperCase())) {
            intent.state = t.toUpperCase();
            consumed.add(i);
            continue;
        }

        // State: single-word full name
        if (!intent.state && STATE_NAMES[t]) {
            intent.state = STATE_NAMES[t];
            consumed.add(i);
            continue;
        }

        // City: single-word
        if (!intent.city && CITY_NAMES[t]) {
            intent.city = CITY_NAMES[t];
            consumed.add(i);
            continue;
        }

        // Breed group
        if (BREED_GROUP_MAP[t] && !intent.breedGroups.includes(BREED_GROUP_MAP[t])) {
            intent.breedGroups.push(BREED_GROUP_MAP[t]);
            consumed.add(i);
            continue;
        }

        // Color keywords — check before breed synonyms since some overlap
        if (COLOR_KEYWORDS.has(t)) {
            if (!intent.colors.includes(t)) {
                intent.colors.push(t);
            }
            // Don't consume — let it also try breed match below (for "tabby", "calico", etc.)
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

        // If it was a color keyword, consume it now even if not a breed
        if (COLOR_KEYWORDS.has(t)) {
            consumed.add(i);
            continue;
        }

        // Fuzzy breed match for tokens >= 4 chars
        if (t.length >= 4) {
            const fuzzyMatch = findFuzzyBreedMatch(t);
            if (fuzzyMatch && !intent.breeds.includes(fuzzyMatch)) {
                intent.breeds.push(fuzzyMatch);
                consumed.add(i);
                continue;
            }
        }
    }

    // ── 6. Collect remaining tokens ────────────────────────
    for (let i = 0; i < tokens.length; i++) {
        if (!consumed.has(i)) {
            const t = tokens[i];
            if (!STOP_WORDS.has(t) && !/^\d+$/.test(t) && t !== 'or') {
                intent.textTokens.push(t);
            }
        }
    }

    return intent;
}

// ─── Helpers ───────────────────────────────────────────

function findBreedMatch(token: string): string | null {
    for (const [aliases, canonical] of BREED_SYNONYMS) {
        for (const alias of aliases) {
            if (!alias.includes(' ') && alias === token) {
                return canonical;
            }
        }
    }
    // Also try fuzzy
    return findFuzzyBreedMatch(token);
}

function findFuzzyBreedMatch(token: string): string | null {
    if (token.length < 4) return null;
    let bestMatch: string | null = null;
    let bestDist = Infinity;
    for (const [aliases, canonical] of BREED_SYNONYMS) {
        for (const alias of aliases) {
            if (alias.includes(' ')) continue;
            const dist = levenshtein(token, alias);
            const maxDist = token.length <= 4 ? 1 : 2;
            if (dist <= maxDist && dist < bestDist) {
                bestDist = dist;
                bestMatch = canonical;
            }
        }
    }
    return bestMatch;
}
