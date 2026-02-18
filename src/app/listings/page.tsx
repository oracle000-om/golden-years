import Link from 'next/link';
import { prisma } from '@/lib/db';
import { formatDeathMarker, hoursUntil, getUrgencyLevel, getTrustScoreLevel, formatAge } from '@/lib/utils';
import { FilterBar } from './filter-bar';
import type { AnimalWithShelter } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface SearchParams {
    species?: string;
    time?: string;
    state?: string;
}

export default async function ListingsPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const params = await searchParams;

    // Build filters
    const where: Record<string, unknown> = {
        status: { in: ['LISTED', 'URGENT'] },
    };

    if (params.species && params.species !== 'all') {
        where.species = params.species.toUpperCase();
    }

    if (params.state && params.state !== 'all') {
        where.shelter = { state: params.state };
    }

    if (params.time && params.time !== 'all') {
        const hoursMap: Record<string, number> = {
            '24': 24, '48': 48, '72': 72, '168': 168,
        };
        const hours = hoursMap[params.time];
        if (hours) {
            where.euthScheduledAt = {
                lte: new Date(Date.now() + hours * 60 * 60 * 1000),
                gte: new Date(),
            };
        }
    }

    const animals: AnimalWithShelter[] = await prisma.animal.findMany({
        where,
        include: { shelter: true },
        orderBy: { euthScheduledAt: 'asc' },
    });

    // Get distinct states for filter
    const shelters: { state: string }[] = await prisma.shelter.findMany({
        select: { state: true },
        distinct: ['state'],
        orderBy: { state: 'asc' },
    });
    const states = shelters.map((s) => s.state);

    return (
        <div className="listings-page">
            <div className="container">
                <div className="listings-page__header">
                    <h1>Euthanasia Listings</h1>
                    <p className="listings-page__count">
                        {animals.length} animal{animals.length !== 1 ? 's' : ''} currently listed
                    </p>
                </div>

                <FilterBar
                    currentSpecies={params.species || 'all'}
                    currentTime={params.time || 'all'}
                    currentState={params.state || 'all'}
                    states={states}
                />

                {animals.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">🔍</div>
                        <p className="empty-state__text">
                            No animals match your current filters. Try adjusting your search criteria.
                        </p>
                    </div>
                ) : (
                    <div className="card-grid">
                        {animals.map((animal) => {
                            const hours = hoursUntil(animal.euthScheduledAt);
                            const urgency = getUrgencyLevel(hours);
                            const trustLevel = getTrustScoreLevel(animal.shelter.trustScore);
                            const ageDisplay = formatAge(
                                animal.ageKnownYears,
                                animal.ageEstimatedLow,
                                animal.ageEstimatedHigh,
                                animal.ageConfidenceScore,
                                animal.ageSource,
                            );

                            return (
                                <Link
                                    key={animal.id}
                                    href={`/animal/${animal.id}`}
                                    className="animal-card"
                                >
                                    <div className="animal-card__image">
                                        <div className="animal-card__image-placeholder">
                                            {animal.species === 'DOG' ? '🐕' : animal.species === 'CAT' ? '🐈' : '🐾'}
                                        </div>
                                        {urgency !== 'standard' && (
                                            <span className={`animal-card__urgency-badge ${urgency}`}>
                                                {urgency === 'critical' ? '< 24h' : urgency === 'urgent' ? '< 48h' : '< 72h'}
                                            </span>
                                        )}
                                    </div>

                                    <div className="animal-card__body">
                                        <h2 className={`animal-card__name ${!animal.name ? 'unnamed' : ''}`}>
                                            {animal.name || 'Unnamed'}
                                        </h2>
                                        <p className="animal-card__breed">
                                            {animal.breed || 'Unknown breed'} · {animal.sex ? animal.sex.charAt(0) + animal.sex.slice(1).toLowerCase() : ''}
                                        </p>

                                        <div className="animal-card__details">
                                            <div className="animal-card__detail">
                                                <span className="animal-card__detail-label">Age</span>
                                                <span className={`animal-card__detail-value ${animal.ageSource === 'CV_ESTIMATED' ? 'cv-estimated' : ''}`}>
                                                    {ageDisplay}
                                                </span>
                                            </div>
                                            <div className="animal-card__detail">
                                                <span className="animal-card__detail-label">Shelter</span>
                                                <span className="animal-card__detail-value">{animal.shelter.name}</span>
                                            </div>
                                            <div className="animal-card__detail">
                                                <span className="animal-card__detail-label">Trust</span>
                                                <span className={`trust-badge ${trustLevel}`}>
                                                    {animal.shelter.trustScore !== null ? `${animal.shelter.trustScore}% euth.` : 'N/A'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="animal-card__footer">
                                        <div className="animal-card__death-marker">
                                            <span className="animal-card__death-marker-label">Scheduled</span>
                                            <span className={`animal-card__death-marker-time ${urgency}`}>
                                                {formatDeathMarker(animal.euthScheduledAt)}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
