import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { prisma } from '@/lib/db';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const chatLimiter = createRateLimiter('admin-chat', 10); // 10 req/min per IP

const DB_SCHEMA = `
Tables and columns (PostgreSQL):

shelters (
  id UUID PK,
  name TEXT,
  county TEXT,
  state TEXT,
  shelter_type TEXT ('MUNICIPAL','RESCUE','NO_KILL','FOSTER_BASED'),
  address TEXT,
  zip_code TEXT,
  phone TEXT,
  website_url TEXT,
  total_intake_annual INT,
  total_euthanized_annual INT,
  data_year INT,
  data_source_name TEXT,
  county_population INT,
  total_returned_to_owner INT,
  total_transferred INT,
  prior_year_intake INT,
  prior_year_euthanized INT,
  prior_data_year INT,
  latitude FLOAT,
  longitude FLOAT,
  last_scraped_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

animals (
  id UUID PK,
  shelter_id UUID FK -> shelters.id,
  intake_id TEXT,
  name TEXT,
  species TEXT ('DOG','CAT','OTHER'),
  breed TEXT,
  sex TEXT ('MALE','FEMALE','UNKNOWN'),
  size TEXT ('SMALL','MEDIUM','LARGE','XLARGE'),
  photo_url TEXT,
  status TEXT ('AVAILABLE','URGENT','RESCUE_PULL','ADOPTED','TRANSFERRED','RETURNED_OWNER','EUTHANIZED','DELISTED'),
  age_known_years INT,
  age_estimated_low INT,
  age_estimated_high INT,
  age_confidence TEXT ('HIGH','MEDIUM','LOW','NONE'),
  age_indicators TEXT[],
  age_source TEXT ('SHELTER_REPORTED','CV_ESTIMATED','UNKNOWN'),
  detected_breeds TEXT[],
  breed_confidence TEXT,
  life_expectancy_low INT,
  life_expectancy_high INT,
  body_condition_score INT,
  coat_condition TEXT,
  visible_conditions TEXT[],
  health_notes TEXT,
  stress_level TEXT,
  fear_indicators TEXT[],
  likely_care_needs TEXT[],
  estimated_care_level TEXT,
  intake_reason TEXT ('OWNER_SURRENDER','STRAY','OWNER_DECEASED','CONFISCATE','RETURN','TRANSFER','INJURED','OTHER','UNKNOWN'),
  intake_reason_detail TEXT,
  notes TEXT,
  intake_date TIMESTAMP,
  euth_scheduled_at TIMESTAMP,
  first_seen_at TIMESTAMP,
  last_seen_at TIMESTAMP,
  days_in_shelter INT,
  delisted_at TIMESTAMP,
  shelter_entry_count INT DEFAULT 1,
  outcome_date TIMESTAMP,
  outcome_notes TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

sources (
  id UUID PK,
  animal_id UUID FK -> animals.id,
  source_type TEXT ('SHELTER_WEBSITE','FACEBOOK_CROSSPOST','MANUAL_ENTRY','OTHER'),
  source_url TEXT,
  scraped_at TIMESTAMP
)

animal_snapshots (
  id UUID PK,
  animal_id UUID FK -> animals.id,
  scraped_at TIMESTAMP,
  listing_source TEXT,
  status TEXT,
  name TEXT,
  photo_url TEXT,
  notes TEXT,
  euth_scheduled_at TIMESTAMP,
  body_condition_score INT,
  coat_condition TEXT,
  aggression_risk INT,
  stress_level TEXT,
  photo_quality TEXT,
  raw_assessment JSONB
)

breed_profiles (
  id TEXT PK,
  name TEXT,
  species TEXT ('DOG','CAT'),
  breed_group TEXT,
  life_expectancy_low INT,
  life_expectancy_high INT,
  temperament TEXT,
  health_risk_score INT (1-10, higher = more health risks),
  common_conditions TEXT[],
  senior_age_threshold INT,
  care_notes TEXT,
  source_api TEXT
)

shelter_financials (
  id UUID PK,
  shelter_id UUID FK -> shelters.id (UNIQUE — one row per shelter),
  ein TEXT (IRS Employer Identification Number, e.g. '59-0624410'),
  ntee_code TEXT (NTEE classification, e.g. 'D200' = Animal Protection),
  tax_period INT (most recent tax year, e.g. 2023),
  total_revenue INT,
  total_expenses INT,
  total_assets INT,
  total_liabilities INT,
  net_assets INT,
  contributions INT (donations/grants received),
  program_revenue INT (revenue from programs like adoptions, clinics),
  fundraising_expense INT,
  officer_compensation INT (top officer pay),
  filing_history JSONB (array of {year, revenue, expenses, assets, liabilities, netAssets, contributions, programRevenue, fundraising, officerComp, staffWages, pdfUrl}),
  propublica_url TEXT,
  last_scraped_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

state_policies (
  id UUID PK,
  state TEXT UNIQUE (2-letter code),
  state_name TEXT,
  aldf_rank INT (1-50, Animal Legal Defense Fund ranking),
  aldf_tier TEXT ('Top Tier','Middle Tier','Bottom Tier'),
  aldf_year INT,
  aldf_url TEXT,
  mandatory_reporting BOOLEAN,
  reporting_body TEXT,
  holding_period_days INT,
  spay_neuter_required BOOLEAN,
  breed_specific_legislation BOOLEAN,
  vet_cruelty_reporting BOOLEAN,
  cross_reporting BOOLEAN,
  cat_declawing_ban BOOLEAN,
  policy_notes TEXT,
  last_scraped_at TIMESTAMP
)

scrape_runs (
  id UUID PK,
  pipeline TEXT (e.g. 'petfinder', 'socrata', 'shelterluv', 'petango', 'adoptapet', 'rescuegroups'),
  status TEXT ('RUNNING','SUCCESS','PARTIAL','FAILED'),
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  duration_ms INT,
  animals_created INT,
  animals_updated INT,
  errors INT,
  error_summary TEXT,
  metadata JSONB
)
`;

const SQL_SYSTEM_PROMPT = `You are an elite SQL engineer and statistician. Given a natural language question about animal shelter data, generate a single PostgreSQL SELECT query to answer it with ABSOLUTE mathematical precision.

${DB_SCHEMA}

Rules:
- Output ONLY the SQL query, nothing else. No markdown, no explanation.
- Only SELECT queries. Never UPDATE, DELETE, INSERT, DROP, ALTER, TRUNCATE, or any DDL/DML.
- Use actual column names (snake_case) not Prisma names (camelCase).
- ALWAYS write complete queries with explicit FROM clauses. Never reference a table alias without defining it in FROM or JOIN.
- For "active" animals, filter: status IN ('AVAILABLE','URGENT','RESCUE_PULL')
- LIMIT results to 100 rows max unless the user asks for a count/aggregate.
- If the question mentions a shelter by name, use ILIKE for fuzzy matching.
- MATHEMATICAL PRECISION IS CRITICAL:
  - ALWAYS use NULLIF(denominator, 0) to prevent division-by-zero.
  - ALWAYS use ROUND(..., 1) or ROUND(..., 2) for percentages and ratios.
  - Use COALESCE for nullable fields in calculations.
  - Use CAST(... AS NUMERIC) before division to avoid integer truncation.
  - For percentages: ROUND(CAST(x AS NUMERIC) * 100.0 / NULLIF(y, 0), 1)
  - For averages: ROUND(AVG(CAST(x AS NUMERIC)), 2)
  - Double-check every arithmetic expression for correctness before outputting.

Query Templates (use these patterns):
-- Animals with shelter info:
SELECT a.name, a.breed, s.name AS shelter_name, s.state
FROM animals a
JOIN shelters s ON a.shelter_id = s.id
WHERE a.status IN ('AVAILABLE','URGENT')

-- With breed profiles:
SELECT a.name, bp.health_risk_score, bp.common_conditions
FROM animals a
JOIN breed_profiles bp ON bp.name = ANY(a.detected_breeds) AND bp.species = a.species
WHERE a.status IN ('AVAILABLE','URGENT')

-- With snapshots:
SELECT a.name, snap.body_condition_score, snap.scraped_at
FROM animal_snapshots snap
JOIN animals a ON snap.animal_id = a.id

-- With shelter financials (IRS Form 990 data):
SELECT s.name, sf.total_revenue, sf.total_expenses, sf.net_assets, sf.tax_period
FROM shelters s
JOIN shelter_financials sf ON sf.shelter_id = s.id
WHERE sf.total_revenue IS NOT NULL
ORDER BY sf.total_revenue DESC

-- With state policies / ALDF rankings:
SELECT sp.state_name, sp.aldf_rank, sp.aldf_tier, sp.holding_period_days
FROM state_policies sp
ORDER BY sp.aldf_rank

-- Scraper run history:
SELECT pipeline, status, started_at, duration_ms, animals_created, animals_updated, errors
FROM scrape_runs
ORDER BY started_at DESC

-- Location-based queries (use shelter state or county):
-- "Southern California" → s.state = 'CA' AND s.county ILIKE '%los angeles%' (or similar SoCal counties)
-- State names → use 2-letter abbreviation in s.state
-- City/region names → match against s.county or s.name with ILIKE

Financial Data Tips:
- shelter_financials contains IRS Form 990 data from ProPublica. Only non-municipal shelters (RESCUE, NO_KILL, FOSTER_BASED) have this data.
- "program spending ratio" = ROUND(CAST(program_revenue AS NUMERIC) * 100.0 / NULLIF(total_expenses, 0), 1)
- "fundraising efficiency" = ROUND(CAST(fundraising_expense AS NUMERIC) * 100.0 / NULLIF(total_revenue, 0), 1) — lower is better
- officer_compensation = top officer pay. Compare to total_expenses to see if it's reasonable.
- filing_history is a JSONB array of past years' data — use jsonb_array_elements() to unnest.

Health & Veterinary Tips:
- body_condition_score: 1-9 scale (1=emaciated, 5=ideal, 9=obese). Scores 1-3 or 7-9 are concerning.
- estimated_care_level: 'low', 'moderate', 'high' — reflects overall care needs.
- visible_conditions: array of detected issues like 'dental disease', 'cataracts', 'skin issues'.
- health_risk_score in breed_profiles: 1-10, higher = more breed-specific health risks.
- "remaining lifespan" can be approximated as life_expectancy_high - age_estimated_high.
- coat_condition values: 'healthy', 'fair', 'poor', 'matted'.
- stress_level values: 'low', 'moderate', 'high'.
- aggression_risk: 1-5 scale (1=very calm, 5=high risk).
- size values: 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'.
`;

const ANSWER_SYSTEM_PROMPT = `You are a senior data analyst for Golden Years Club, an animal shelter platform. You are obsessively precise about factual accuracy and mathematical correctness.

Given a user's question and query results, provide a clear, data-backed answer. Follow these rules absolutely:
- ONLY state facts directly supported by the data. NEVER guess, infer, or extrapolate beyond what the numbers show.
- When presenting numbers, use exact values from the results. Format large numbers with commas (e.g., 1,234,567). Use dollar signs for financial data.
- When computing percentages or ratios, show your math: "X out of Y (Z%)". Double-check the arithmetic.
- If a result is empty or null, say so explicitly — do not fabricate an answer.
- If the data is insufficient to fully answer the question, state what the data DOES show and what it CANNOT answer.
- Do not mention SQL, databases, queries, or tables. Speak as if you simply know the data.
- Be concise: 1-4 sentences. Lead with the key finding.`;

function isSafeQuery(sql: string): boolean {
    const normalized = sql.trim().toUpperCase();
    // Must start with SELECT or WITH (for CTEs)
    if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) return false;
    // Block dangerous DDL/DML keywords
    const blocked = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'COPY', 'PG_READ', 'PG_WRITE', 'PG_SLEEP', 'PG_LS', 'LO_IMPORT', 'LO_EXPORT', 'DBLINK', 'SET ', 'LISTEN', 'NOTIFY', 'VACUUM', 'REINDEX', 'CLUSTER'];
    for (const keyword of blocked) {
        if (new RegExp(`\\b${keyword.trim()}\\b`, 'i').test(sql)) return false;
    }
    // Block access to PostgreSQL system catalogs (credential/config exposure)
    const blockedTables = ['PG_SHADOW', 'PG_AUTHID', 'PG_ROLES', 'PG_USER', 'PG_STAT_ACTIVITY', 'PG_SETTINGS', 'PG_FILE_READ', 'PG_READ_FILE', 'PG_STAT_FILE'];
    for (const table of blockedTables) {
        if (new RegExp(`\\b${table}\\b`, 'i').test(sql)) return false;
    }
    // Block information_schema and pg_catalog schema access
    if (/\binformation_schema\b/i.test(sql)) return false;
    if (/\bpg_catalog\b/i.test(sql)) return false;
    // Block semicolons (multi-statement) and comments (obfuscation)
    if (sql.includes(';') || sql.includes('--') || sql.includes('/*')) return false;
    // Block current_setting / set_config (can read/write server config)
    if (/\bcurrent_setting\b/i.test(sql)) return false;
    if (/\bset_config\b/i.test(sql)) return false;
    return true;
}

export async function POST(request: NextRequest) {
    try {
        // Rate limit
        const ip = getClientIp(request);
        const rlResult = await chatLimiter.check(ip);
        if (!rlResult.allowed) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const { question } = await request.json();

        if (!question || typeof question !== 'string' || question.trim().length === 0) {
            return NextResponse.json({ error: 'Question is required' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
        }

        const ai = new GoogleGenAI({ apiKey });

        // Step 1: Generate SQL from natural language
        const sqlResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: question }] }],
            config: {
                systemInstruction: SQL_SYSTEM_PROMPT,
                temperature: 0,
                maxOutputTokens: 1024,
            },
        });

        let sql = (sqlResponse.text ?? '').trim();
        // Strip markdown code fences if present
        sql = sql.replace(/^```(?:sql)?\s*/i, '').replace(/\s*```$/i, '').trim();

        if (!sql) {
            return NextResponse.json({ error: 'Could not generate a query for that question' }, { status: 400 });
        }

        if (!isSafeQuery(sql)) {
            return NextResponse.json({ error: 'Generated query was not a safe SELECT statement' }, { status: 400 });
        }

        // Step 2: Execute the query
        let rows: any[];
        try {
            rows = await prisma.$queryRawUnsafe(sql) as any[];
        } catch (_dbError) {
            return NextResponse.json({
                error: 'Query execution failed. The generated SQL may be invalid for this question.',
                sql,
            }, { status: 400 });
        }

        // Serialize BigInt values
        const serializedRows = JSON.parse(JSON.stringify(rows, (_, v) =>
            typeof v === 'bigint' ? Number(v) : v
        ));

        // Step 3: Generate natural language answer
        const answerPrompt = `Question: "${question}"\n\nQuery results (${serializedRows.length} rows):\n${JSON.stringify(serializedRows.slice(0, 50), null, 2)}`;

        const answerResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: answerPrompt }] }],
            config: {
                systemInstruction: ANSWER_SYSTEM_PROMPT,
                temperature: 0.3,
                maxOutputTokens: 512,
            },
        });

        const answer = (answerResponse.text ?? '').trim();

        return NextResponse.json({
            answer,
            sql,
            rowCount: serializedRows.length,
            rows: serializedRows.slice(0, 20),
        });

    } catch (_err) {
        console.error('Admin chat error:', _err);
        return NextResponse.json({
            error: 'An internal error occurred. Please try again.',
        }, { status: 500 });
    }
}
