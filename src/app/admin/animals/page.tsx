import { getAdminAnimalStats } from '@/lib/admin-queries';
import { AnimalsContent } from './animals-content';

export const dynamic = 'force-dynamic';

export default async function AdminAnimalsPage() {
    let all, dogs, cats;
    try {
        [all, dogs, cats] = await Promise.all([
            getAdminAnimalStats(),
            getAdminAnimalStats('DOG'),
            getAdminAnimalStats('CAT'),
        ]);
    } catch (err) {
        return (
            <div className="admin-page">
                <h1 className="admin-page__title">Animals</h1>
                <div className="admin-error">
                    <p>⚠️ Unable to connect to database.</p>
                    <p className="admin-error__detail">{(err as Error).message?.substring(0, 200)}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-page">
            <h1 className="admin-page__title">Animals</h1>
            <AnimalsContent all={all} dogs={dogs} cats={cats} />
        </div>
    );
}
