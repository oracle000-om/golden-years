/**
 * Text Sanitizer — Mojibake Cleanup
 *
 * Fixes garbled UTF-8 text commonly seen in shelter listing data.
 * When UTF-8 encoded text (smart quotes, em dashes, etc.) is decoded
 * as Latin-1/Windows-1252, it produces mojibake like:
 *   â€™ → '   â€œ → "   â€" → –   â€¦ → …
 *
 * This module detects and repairs these patterns.
 */

/** Common mojibake patterns: garbled sequence → correct character */
const MOJIBAKE_MAP: [string | RegExp, string][] = [
    // Smart quotes
    ['â\u0080\u0099', '\u2019'],  // ' right single quote
    ['â\u0080\u0098', '\u2018'],  // ' left single quote
    ['â\u0080\u009c', '\u201c'],  // " left double quote
    ['â\u0080\u009d', '\u201d'],  // " right double quote
    // Dashes
    ['â\u0080\u0093', '\u2013'],  // – en dash
    ['â\u0080\u0094', '\u2014'],  // — em dash
    // Ellipsis
    ['â\u0080¦', '\u2026'],      // … ellipsis
    // Bullet
    ['â\u0080¢', '\u2022'],      // • bullet
    // Trademark/copyright
    ['â\u0084¢', '\u2122'],      // ™
    // Degree
    ['Â°', '°'],
    // Non-breaking space
    ['Â ', ' '],
];

/**
 * Additional pass: normalize remaining smart punctuation to ASCII
 * for maximum compatibility.
 */
const SMART_TO_ASCII: [RegExp, string][] = [
    [/[\u2018\u2019\u201A\u201B]/g, "'"],  // smart single quotes → '
    [/[\u201C\u201D\u201E\u201F]/g, '"'],  // smart double quotes → "
    [/\u2013/g, '–'],                       // en dash (keep as-is, it's valid)
    [/\u2014/g, '—'],                       // em dash (keep as-is)
    [/\u2026/g, '...'],                     // ellipsis → ...
];

/**
 * Sanitize a text string by fixing mojibake and normalizing smart punctuation.
 *
 * @param text - Raw text from scraper
 * @returns Cleaned text with proper characters
 */
export function sanitizeText(text: string | null | undefined): string | null {
    if (!text) return null;

    let result = text;

    // Step 0a: Strip HTML tags (convert <br>, <p>, <div> to newlines first)
    result = result.replace(/<\s*(br|\/p|\/div|\/li)\s*\/?>/gi, '\n');
    result = result.replace(/<[^>]+>/g, '');

    // Step 0b: Decode HTML entities
    const ENTITY_MAP: Record<string, string> = {
        '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
        '&quot;': '"', '&apos;': "'", '&#39;': "'", '&mdash;': '—',
        '&ndash;': '–', '&hellip;': '…', '&bull;': '•', '&copy;': '©',
        '&reg;': '®', '&trade;': '™', '&laquo;': '«', '&raquo;': '»',
        '\u0026ldquo;': '\u201C', '\u0026rdquo;': '\u201D', '\u0026lsquo;': '\u2018', '\u0026rsquo;': '\u2019',
    };
    result = result.replace(/&[a-zA-Z]+;/g, (entity) => ENTITY_MAP[entity.toLowerCase()] ?? entity);
    // Decode numeric entities: &#123; and &#x1F;
    result = result.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

    // Step 1: Fix mojibake patterns
    for (const [pattern, replacement] of MOJIBAKE_MAP) {
        if (typeof pattern === 'string') {
            // Use split/join for string replacements (replaces all occurrences)
            result = result.split(pattern).join(replacement);
        } else {
            result = result.replace(pattern, replacement);
        }
    }

    // Step 2: Normalize remaining smart punctuation to ASCII
    for (const [pattern, replacement] of SMART_TO_ASCII) {
        result = result.replace(pattern, replacement);
    }

    // Step 3: Clean up any remaining control characters (except newlines/tabs)
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    // Step 4: Collapse excessive whitespace (but preserve single newlines)
    result = result.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    return result || null;
}
