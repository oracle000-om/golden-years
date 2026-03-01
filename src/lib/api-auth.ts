/**
 * API Authentication Middleware — API Key + JWT (via jose)
 *
 * Tiered auth for `/api/v1/*` endpoints:
 *   1. API Key: `X-API-Key` header checked against `API_KEYS` env var
 *   2. JWT: `Authorization: Bearer <token>` validated with jose
 *
 * Both paths extract a client identity for rate limiting / audit.
 * Skip auth in development when `API_AUTH_REQUIRED=false`.
 *
 * Usage:
 *   const auth = await validateApiAuth(request);
 *   if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: 401 });
 */

import { jwtVerify, type JWTPayload } from 'jose';

interface AuthResult {
    authenticated: boolean;
    clientId?: string;    // API key name or JWT sub
    error?: string;
}

/**
 * Validate an incoming API request's authentication.
 */
export async function validateApiAuth(request: Request): Promise<AuthResult> {
    // Skip auth in dev mode if explicitly disabled
    if (process.env.API_AUTH_REQUIRED === 'false') {
        return { authenticated: true, clientId: 'dev-bypass' };
    }

    // 1. Try API Key
    const apiKey = request.headers.get('x-api-key');
    if (apiKey) {
        return validateApiKey(apiKey);
    }

    // 2. Try JWT Bearer token
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        return validateJwt(token);
    }

    return { authenticated: false, error: 'Missing authentication. Provide X-API-Key or Authorization: Bearer <token>' };
}

/**
 * Validate an API key against the comma-separated API_KEYS env var.
 * Keys are in the format "name:secret" for audit trail, or just "secret" for simple use.
 */
function validateApiKey(key: string): AuthResult {
    const keysEnv = process.env.API_KEYS;
    if (!keysEnv) {
        return { authenticated: false, error: 'API keys not configured on server' };
    }

    const validKeys = keysEnv.split(',').map(k => k.trim()).filter(Boolean);
    for (const validKey of validKeys) {
        // Support "name:secret" or just "secret"
        const parts = validKey.split(':');
        const [name, secret] = parts.length > 1 ? [parts[0], parts.slice(1).join(':')] : ['api-client', parts[0]];

        if (timingSafeEqual(key, secret)) {
            return { authenticated: true, clientId: name };
        }
    }

    return { authenticated: false, error: 'Invalid API key' };
}

/**
 * Validate a JWT using the API_JWT_SECRET env var.
 */
async function validateJwt(token: string): Promise<AuthResult> {
    const secret = process.env.API_JWT_SECRET;
    if (!secret) {
        return { authenticated: false, error: 'JWT auth not configured on server' };
    }

    try {
        const secretKey = new TextEncoder().encode(secret);
        const { payload } = await jwtVerify(token, secretKey) as { payload: JWTPayload };
        return {
            authenticated: true,
            clientId: (payload.sub || payload.client_id || 'jwt-client') as string,
        };
    } catch {
        return { authenticated: false, error: 'Invalid or expired JWT' };
    }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
        mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
}
