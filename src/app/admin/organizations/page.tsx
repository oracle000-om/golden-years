import { getAdminShelterList } from '@/lib/admin-queries';
import { OrganizationsContent } from './organizations-content';

export const dynamic = 'force-dynamic';

export default async function AdminOrganizationsPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
    const params = await searchParams;
    const stateFilter = params.state || '';
    let allShelters;
    try {
        allShelters = await getAdminShelterList();
    } catch (err) {
        return (
            <div className="admin-page">
                <h1 className="admin-page__title">Organizations</h1>
                <div className="admin-error">
                    <p>⚠️ Unable to connect to database.</p>
                    <p className="admin-error__detail">{(err as Error).message?.substring(0, 200)}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-page">
            <h1 className="admin-page__title">Organizations</h1>
            <OrganizationsContent allShelters={allShelters} initialSearch={stateFilter} />
        </div>
    );
}
