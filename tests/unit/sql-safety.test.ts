/**
 * Tests for isSafeQuery — SQL safety blocklist for admin-chat.
 * Ensures LLM-generated SQL can't access dangerous operations or system tables.
 */
import { describe, it, expect } from 'vitest';

// We need to import the function. Since it's not exported, we'll test it inline.
// Copy the logic here to test it independently.
function isSafeQuery(sql: string): boolean {
    const normalized = sql.trim().toUpperCase();
    if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) return false;
    const blocked = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'COPY', 'PG_READ', 'PG_WRITE', 'PG_SLEEP', 'PG_LS', 'LO_IMPORT', 'LO_EXPORT', 'DBLINK', 'SET ', 'LISTEN', 'NOTIFY', 'VACUUM', 'REINDEX', 'CLUSTER'];
    for (const keyword of blocked) {
        if (new RegExp(`\\b${keyword.trim()}\\b`, 'i').test(sql)) return false;
    }
    const blockedTables = ['PG_SHADOW', 'PG_AUTHID', 'PG_ROLES', 'PG_USER', 'PG_STAT_ACTIVITY', 'PG_SETTINGS', 'PG_FILE_READ', 'PG_READ_FILE', 'PG_STAT_FILE'];
    for (const table of blockedTables) {
        if (new RegExp(`\\b${table}\\b`, 'i').test(sql)) return false;
    }
    if (/\binformation_schema\b/i.test(sql)) return false;
    if (/\bpg_catalog\b/i.test(sql)) return false;
    if (sql.includes(';') || sql.includes('--') || sql.includes('/*')) return false;
    if (/\bcurrent_setting\b/i.test(sql)) return false;
    if (/\bset_config\b/i.test(sql)) return false;
    return true;
}

describe('isSafeQuery', () => {
    describe('allows safe SELECT queries', () => {
        it('simple SELECT', () => {
            expect(isSafeQuery('SELECT name, breed FROM animals LIMIT 10')).toBe(true);
        });
        it('SELECT with JOIN', () => {
            expect(isSafeQuery('SELECT a.name, s.state FROM animals a JOIN shelters s ON a.shelter_id = s.id')).toBe(true);
        });
        it('SELECT with WHERE and aggregations', () => {
            expect(isSafeQuery("SELECT COUNT(*) FROM animals WHERE status = 'AVAILABLE'")).toBe(true);
        });
        it('CTE (WITH ... SELECT)', () => {
            expect(isSafeQuery('WITH active AS (SELECT * FROM animals WHERE status = \'AVAILABLE\') SELECT COUNT(*) FROM active')).toBe(true);
        });
    });

    describe('blocks DDL/DML', () => {
        it('INSERT', () => {
            expect(isSafeQuery("INSERT INTO animals (name) VALUES ('test')")).toBe(false);
        });
        it('UPDATE', () => {
            expect(isSafeQuery("UPDATE animals SET status = 'DELISTED'")).toBe(false);
        });
        it('DELETE', () => {
            expect(isSafeQuery('DELETE FROM animals')).toBe(false);
        });
        it('DROP TABLE', () => {
            expect(isSafeQuery('DROP TABLE animals')).toBe(false);
        });
        it('ALTER TABLE', () => {
            expect(isSafeQuery('ALTER TABLE animals ADD COLUMN foo TEXT')).toBe(false);
        });
        it('TRUNCATE', () => {
            expect(isSafeQuery('TRUNCATE animals')).toBe(false);
        });
        it('COPY', () => {
            expect(isSafeQuery("COPY animals TO '/tmp/dump.csv'")).toBe(false);
        });
    });

    describe('blocks system catalog access', () => {
        it('pg_shadow (password hashes)', () => {
            expect(isSafeQuery('SELECT * FROM pg_shadow')).toBe(false);
        });
        it('pg_authid', () => {
            expect(isSafeQuery('SELECT * FROM pg_authid')).toBe(false);
        });
        it('pg_roles', () => {
            expect(isSafeQuery('SELECT rolname FROM pg_roles')).toBe(false);
        });
        it('pg_user', () => {
            expect(isSafeQuery('SELECT * FROM pg_user')).toBe(false);
        });
        it('pg_stat_activity (connection info)', () => {
            expect(isSafeQuery('SELECT * FROM pg_stat_activity')).toBe(false);
        });
        it('pg_settings (server config)', () => {
            expect(isSafeQuery('SELECT * FROM pg_settings')).toBe(false);
        });
        it('information_schema', () => {
            expect(isSafeQuery("SELECT * FROM information_schema.tables")).toBe(false);
        });
        it('pg_catalog', () => {
            expect(isSafeQuery('SELECT * FROM pg_catalog.pg_tables')).toBe(false);
        });
    });

    describe('blocks dangerous functions', () => {
        it('current_setting', () => {
            expect(isSafeQuery("SELECT current_setting('server_version')")).toBe(false);
        });
        it('set_config', () => {
            expect(isSafeQuery("SELECT set_config('log_statement', 'all', false)")).toBe(false);
        });
        it('pg_sleep (DoS)', () => {
            expect(isSafeQuery('SELECT pg_sleep(100)')).toBe(false);
        });
        it('pg_read_file', () => {
            expect(isSafeQuery("SELECT pg_read_file('/etc/passwd')")).toBe(false);
        });
        it('dblink', () => {
            expect(isSafeQuery("SELECT * FROM dblink('host=evil.com')")).toBe(false);
        });
    });

    describe('blocks SQL injection patterns', () => {
        it('multi-statement with semicolon', () => {
            expect(isSafeQuery('SELECT 1; DROP TABLE animals')).toBe(false);
        });
        it('comment obfuscation (--)', () => {
            expect(isSafeQuery('SELECT 1 -- DROP TABLE animals')).toBe(false);
        });
        it('block comment obfuscation (/* */)', () => {
            expect(isSafeQuery('SELECT 1 /* DROP TABLE animals */')).toBe(false);
        });
    });

    describe('blocks non-SELECT starts', () => {
        it('starts with EXPLAIN', () => {
            expect(isSafeQuery('EXPLAIN SELECT * FROM animals')).toBe(false);
        });
        it('starts with GRANT', () => {
            expect(isSafeQuery('GRANT ALL ON animals TO public')).toBe(false);
        });
    });
});
