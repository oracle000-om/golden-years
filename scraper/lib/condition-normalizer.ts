/**
 * Condition Name Normalizer
 *
 * Maps variant spellings, abbreviations, and alternative names to canonical
 * condition names. Apply at write time in all breed enrichment pipelines
 * to enable cross-source querying (PubMed vs FDA vs Nationwide vs Trupanion).
 *
 * Usage:
 *   import { normalizeCondition } from '../lib/condition-normalizer';
 *   const canonical = normalizeCondition('CHD');
 *   // → 'Hip Dysplasia'
 */

/** Map of lowercase variant → canonical name */
const CONDITION_MAP: Record<string, string> = {
    // ── Orthopedic ──
    'hip dysplasia': 'Hip Dysplasia',
    'canine hip dysplasia': 'Hip Dysplasia',
    'coxofemoral dysplasia': 'Hip Dysplasia',
    'coxofemoral joint dysplasia': 'Hip Dysplasia',
    'chd': 'Hip Dysplasia',
    'elbow dysplasia': 'Elbow Dysplasia',
    'patellar luxation': 'Patellar Luxation',
    'luxating patella': 'Patellar Luxation',
    'patella luxation': 'Patellar Luxation',
    'cruciate ligament disease': 'Cranial Cruciate Ligament Disease',
    'acl tear': 'Cranial Cruciate Ligament Disease',
    'ccl rupture': 'Cranial Cruciate Ligament Disease',
    'cranial cruciate ligament rupture': 'Cranial Cruciate Ligament Disease',
    'cranial cruciate ligament disease': 'Cranial Cruciate Ligament Disease',
    'intervertebral disc disease': 'Intervertebral Disc Disease',
    'ivdd': 'Intervertebral Disc Disease',
    'intervertebral disk disease': 'Intervertebral Disc Disease',
    'degenerative myelopathy': 'Degenerative Myelopathy',
    'dm': 'Degenerative Myelopathy',
    'legg-calve-perthes': 'Legg-Calvé-Perthes Disease',
    'legg-calvé-perthes disease': 'Legg-Calvé-Perthes Disease',
    'legg calve perthes': 'Legg-Calvé-Perthes Disease',
    'osteochondritis dissecans': 'Osteochondritis Dissecans',
    'ocd': 'Osteochondritis Dissecans',

    // ── Cardiac ──
    'dilated cardiomyopathy': 'Dilated Cardiomyopathy',
    'dcm': 'Dilated Cardiomyopathy',
    'hypertrophic cardiomyopathy': 'Hypertrophic Cardiomyopathy',
    'hcm': 'Hypertrophic Cardiomyopathy',
    'mitral valve disease': 'Mitral Valve Disease',
    'myxomatous mitral valve disease': 'Mitral Valve Disease',
    'mmvd': 'Mitral Valve Disease',
    'mvd': 'Mitral Valve Disease',
    'subaortic stenosis': 'Subaortic Stenosis',
    'sas': 'Subaortic Stenosis',
    'pulmonic stenosis': 'Pulmonic Stenosis',
    'patent ductus arteriosus': 'Patent Ductus Arteriosus',
    'pda': 'Patent Ductus Arteriosus',

    // ── Ocular ──
    'progressive retinal atrophy': 'Progressive Retinal Atrophy',
    'pra': 'Progressive Retinal Atrophy',
    'cataracts': 'Cataracts',
    'cataract': 'Cataracts',
    'glaucoma': 'Glaucoma',
    'cherry eye': 'Cherry Eye',
    'entropion': 'Entropion',
    'ectropion': 'Ectropion',
    'keratoconjunctivitis sicca': 'Dry Eye (KCS)',
    'kcs': 'Dry Eye (KCS)',
    'dry eye': 'Dry Eye (KCS)',

    // ── Endocrine ──
    'hypothyroidism': 'Hypothyroidism',
    'hyperthyroidism': 'Hyperthyroidism',
    'diabetes mellitus': 'Diabetes Mellitus',
    'diabetes': 'Diabetes Mellitus',
    'cushing\'s disease': 'Hyperadrenocorticism',
    'cushings disease': 'Hyperadrenocorticism',
    'hyperadrenocorticism': 'Hyperadrenocorticism',
    'cushing\'s syndrome': 'Hyperadrenocorticism',
    'addison\'s disease': 'Hypoadrenocorticism',
    'addisons disease': 'Hypoadrenocorticism',
    'hypoadrenocorticism': 'Hypoadrenocorticism',

    // ── Renal ──
    'chronic kidney disease': 'Chronic Kidney Disease',
    'ckd': 'Chronic Kidney Disease',
    'chronic renal failure': 'Chronic Kidney Disease',
    'crf': 'Chronic Kidney Disease',
    'polycystic kidney disease': 'Polycystic Kidney Disease',
    'pkd': 'Polycystic Kidney Disease',

    // ── Dermatologic ──
    'atopic dermatitis': 'Atopic Dermatitis',
    'atopy': 'Atopic Dermatitis',
    'allergic dermatitis': 'Atopic Dermatitis',
    'pyoderma': 'Pyoderma',
    'demodectic mange': 'Demodicosis',
    'demodex': 'Demodicosis',
    'demodicosis': 'Demodicosis',

    // ── Gastric ──
    'gastric dilatation-volvulus': 'Bloat (GDV)',
    'gdv': 'Bloat (GDV)',
    'bloat': 'Bloat (GDV)',
    'gastric dilation volvulus': 'Bloat (GDV)',
    'gastric torsion': 'Bloat (GDV)',
    'inflammatory bowel disease': 'Inflammatory Bowel Disease',
    'ibd': 'Inflammatory Bowel Disease',
    'exocrine pancreatic insufficiency': 'Exocrine Pancreatic Insufficiency',
    'epi': 'Exocrine Pancreatic Insufficiency',
    'pancreatitis': 'Pancreatitis',

    // ── Neurologic ──
    'epilepsy': 'Epilepsy',
    'idiopathic epilepsy': 'Epilepsy',
    'seizures': 'Epilepsy',
    'cognitive dysfunction syndrome': 'Cognitive Dysfunction Syndrome',
    'cognitive dysfunction': 'Cognitive Dysfunction Syndrome',
    'cds': 'Cognitive Dysfunction Syndrome',
    'canine dementia': 'Cognitive Dysfunction Syndrome',

    // ── Oncologic ──
    'lymphoma': 'Lymphoma',
    'lymphosarcoma': 'Lymphoma',
    'mast cell tumor': 'Mast Cell Tumor',
    'mast cell tumour': 'Mast Cell Tumor',
    'mct': 'Mast Cell Tumor',
    'hemangiosarcoma': 'Hemangiosarcoma',
    'hsa': 'Hemangiosarcoma',
    'osteosarcoma': 'Osteosarcoma',
    'osa': 'Osteosarcoma',
    'melanoma': 'Melanoma',
    'squamous cell carcinoma': 'Squamous Cell Carcinoma',
    'scc': 'Squamous Cell Carcinoma',

    // ── Respiratory ──
    'brachycephalic obstructive airway syndrome': 'Brachycephalic Airway Syndrome',
    'brachycephalic airway syndrome': 'Brachycephalic Airway Syndrome',
    'boas': 'Brachycephalic Airway Syndrome',
    'tracheal collapse': 'Tracheal Collapse',
    'laryngeal paralysis': 'Laryngeal Paralysis',
    'lar par': 'Laryngeal Paralysis',

    // ── Hepatic ──
    'portosystemic shunt': 'Portosystemic Shunt',
    'liver shunt': 'Portosystemic Shunt',
    'pss': 'Portosystemic Shunt',
    'hepatic lipidosis': 'Hepatic Lipidosis',
    'fatty liver disease': 'Hepatic Lipidosis',

    // ── Hematologic ──
    'von willebrand disease': 'Von Willebrand Disease',
    'vwd': 'Von Willebrand Disease',
    'von willebrand\'s disease': 'Von Willebrand Disease',
    'immune-mediated hemolytic anemia': 'Immune-Mediated Hemolytic Anemia',
    'imha': 'Immune-Mediated Hemolytic Anemia',
    'autoimmune hemolytic anemia': 'Immune-Mediated Hemolytic Anemia',

    // ── Dental ──
    'periodontal disease': 'Periodontal Disease',
    'dental disease': 'Periodontal Disease',
    'tooth resorption': 'Feline Tooth Resorption',
    'feline tooth resorption': 'Feline Tooth Resorption',
    'forl': 'Feline Tooth Resorption',

    // ── Other ──
    'obesity': 'Obesity',
    'allergies': 'Allergies',
    'food allergies': 'Food Allergies',
    'ear infections': 'Otitis',
    'otitis externa': 'Otitis',
    'otitis': 'Otitis',
    'urinary tract infection': 'Urinary Tract Infection',
    'uti': 'Urinary Tract Infection',
    'feline lower urinary tract disease': 'Feline Lower Urinary Tract Disease',
    'flutd': 'Feline Lower Urinary Tract Disease',
    'feline asthma': 'Feline Asthma',
    'asthma': 'Feline Asthma',
};

/**
 * Normalize a condition name to its canonical form.
 * Returns the canonical name if a mapping exists, otherwise returns
 * the input in Title Case for consistency.
 */
function normalizeCondition(condition: string): string {
    if (!condition) return condition;
    const key = condition.toLowerCase().trim();
    if (CONDITION_MAP[key]) return CONDITION_MAP[key];
    // No mapping found — return as Title Case for consistency
    return condition
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Normalize an array of condition names, deduplicating after normalization.
 */
function normalizeConditions(conditions: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const c of conditions) {
        const normalized = normalizeCondition(c);
        if (!seen.has(normalized)) {
            seen.add(normalized);
            result.push(normalized);
        }
    }
    return result;
}
