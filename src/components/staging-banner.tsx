/**
 * Staging environment banner — always visible when ENVIRONMENT=staging.
 * Renders nothing in production (when ENVIRONMENT is unset or "production").
 */
export function StagingBanner() {
    if (process.env.ENVIRONMENT !== 'staging') return null;

    return (
        <div className="staging-banner" role="alert">
            ⚠️ STAGING ENVIRONMENT — data here is not production
        </div>
    );
}
