import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { formatDeathMarker, hoursUntil, getUrgencyLevel, getTrustScoreLevel, formatAge } from '@/lib/utils';
import type { ShelterWithAnimals, Animal } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ShelterDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const shelter: ShelterWithAnimals | null = await prisma.shelter.findUnique({
        where: { id },
        include: {
            animals: {
                where: { status: { in: ['LISTED', 'URGENT'] } },
                orderBy: { euthScheduledAt: 'asc' },
            },
        },
    });

    if (!shelter) {
        notFound();
    }

    const trustLevel = getTrustScoreLevel(shelter.trustScore);

    return (
        <div className="shelter-detail">
            <div className="container">
                <Link href="/listings" className="animal-detail__back">
                    ← Back to Listings
                </Link>

                <div className="shelter-detail__header">
                    <h1 className="shelter-detail__name">
                        {shelter.name}
                        <span className={`trust-badge ${trustLevel}`} style={{ marginLeft: '1rem', verticalAlign: 'middle' }}>
                            {shelter.trustScore !== null ? `${shelter.trustScore}% euthanized` : 'N/A'}
                        </span>
                    </h1>
                    <p className="shelter-detail__location">
                        {shelter.county} County, {shelter.state}
                        {shelter.address && ` · ${shelter.address}`}
                    </p>
                </div>

                <div className="shelter-detail__stats">
                    <div className="shelter-detail__stat">
                        <div className="shelter-detail__stat-label">Total Intake (YTD)</div>
                        <div className="shelter-detail__stat-value">{shelter.totalIntakeYtd.toLocaleString()}</div>
                    </div>
                    <div className="shelter-detail__stat">
                        <div className="shelter-detail__stat-label">Total Euthanized (YTD)</div>
                        <div className="shelter-detail__stat-value">{shelter.totalEuthanizedYtd.toLocaleString()}</div>
                    </div>
                    <div className="shelter-detail__stat">
                        <div className="shelter-detail__stat-label">Euthanasia Rate</div>
                        <div className="shelter-detail__stat-value" style={{ color: `var(--color-trust-${trustLevel})` }}>
                            {shelter.trustScore !== null ? `${shelter.trustScore}%` : 'N/A'}
                        </div>
                    </div>
                    <div className="shelter-detail__stat">
                        <div className="shelter-detail__stat-label">Currently Listed</div>
                        <div className="shelter-detail__stat-value">{shelter.animals.length}</div>
                    </div>
                </div>

                {shelter.phone && (
                    <div className="animal-detail__notes" style={{ marginBottom: '2rem' }}>
                        <h2>Contact</h2>
                        <p>
                            {shelter.phone}
                            {shelter.websiteUrl && (
                                <>
                                    {' · '}
                                    <a href={shelter.websiteUrl} target="_blank" rel="noopener noreferrer">
                                        Website
                                    </a>
                                </>
                            )}
                        </p>
                    </div>
                )}

                <h2 className="shelter-detail__animals-header">
                    Animals on Euthanasia List ({shelter.animals.length})
                </h2>

                {shelter.animals.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">✨</div>
                        <p className="empty-state__text">
                            No animals currently listed for euthanasia at this shelter.
                        </p>
                    </div>
                ) : (
                    <div className="card-grid">
                        {shelter.animals.map((animal: Animal) => {
                            const hours = hoursUntil(animal.euthScheduledAt);
                            const urgency = getUrgencyLevel(hours);
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
