import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { formatDeathMarker, hoursUntil, getUrgencyLevel, getTrustScoreLevel, formatAge } from '@/lib/utils';
import type { AnimalWithShelterAndSources, Source } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AnimalDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const animal: AnimalWithShelterAndSources | null = await prisma.animal.findUnique({
        where: { id },
        include: {
            shelter: true,
            sources: true,
        },
    });

    if (!animal) {
        notFound();
    }

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
        <div className="animal-detail">
            <div className="container">
                <Link href="/listings" className="animal-detail__back">
                    ← Back to Listings
                </Link>

                <div className="animal-detail__hero">
                    <div className="animal-detail__photo">
                        <div className="animal-detail__photo-placeholder">
                            {animal.species === 'DOG' ? '🐕' : animal.species === 'CAT' ? '🐈' : '🐾'}
                        </div>
                    </div>

                    <div className="animal-detail__info">
                        <div>
                            <h1 className={`animal-detail__name ${!animal.name ? 'unnamed' : ''}`}>
                                {animal.name || 'Unnamed'}
                            </h1>
                            <p className="animal-detail__breed">
                                {animal.breed || 'Unknown breed'} · {animal.species.charAt(0) + animal.species.slice(1).toLowerCase()}
                            </p>
                        </div>

                        <div className="animal-detail__meta">
                            <div className="animal-detail__meta-item">
                                <span className="animal-detail__meta-label">Age</span>
                                <span className="animal-detail__meta-value">{ageDisplay}</span>
                            </div>
                            <div className="animal-detail__meta-item">
                                <span className="animal-detail__meta-label">Sex</span>
                                <span className="animal-detail__meta-value">
                                    {animal.sex ? animal.sex.charAt(0) + animal.sex.slice(1).toLowerCase() : 'Unknown'}
                                </span>
                            </div>
                            <div className="animal-detail__meta-item">
                                <span className="animal-detail__meta-label">Size</span>
                                <span className="animal-detail__meta-value">
                                    {animal.size ? animal.size.charAt(0) + animal.size.slice(1).toLowerCase() : 'Unknown'}
                                </span>
                            </div>
                            <div className="animal-detail__meta-item">
                                <span className="animal-detail__meta-label">Intake ID</span>
                                <span className="animal-detail__meta-value">{animal.intakeId || 'N/A'}</span>
                            </div>
                            <div className="animal-detail__meta-item">
                                <span className="animal-detail__meta-label">Intake Date</span>
                                <span className="animal-detail__meta-value">
                                    {animal.intakeDate
                                        ? new Date(animal.intakeDate).toLocaleDateString('en-US', {
                                            month: 'short', day: 'numeric', year: 'numeric',
                                        })
                                        : 'Unknown'}
                                </span>
                            </div>
                            <div className="animal-detail__meta-item">
                                <span className="animal-detail__meta-label">Status</span>
                                <span className="animal-detail__meta-value">
                                    {animal.status.charAt(0) + animal.status.slice(1).toLowerCase()}
                                </span>
                            </div>
                        </div>

                        <div className="animal-detail__death-marker">
                            <div className="animal-detail__death-marker-label">Euthanasia Scheduled</div>
                            <div className={`animal-detail__death-marker-time ${urgency}`}>
                                {formatDeathMarker(animal.euthScheduledAt)}
                            </div>
                            {hours !== null && (
                                <div style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                                    {hours === 0 ? 'Imminent' : `${hours} hour${hours !== 1 ? 's' : ''} remaining`}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {animal.notes && (
                    <div className="animal-detail__notes">
                        <h2>Notes</h2>
                        <p>{animal.notes}</p>
                    </div>
                )}

                {animal.ageSource === 'CV_ESTIMATED' && (
                    <div className="animal-detail__notes" style={{ marginTop: '1rem' }}>
                        <h2>Age Estimation</h2>
                        <p>
                            This animal&apos;s age was estimated using computer vision analysis of their photo.
                            The estimated range is {animal.ageEstimatedLow}–{animal.ageEstimatedHigh} years
                            with a confidence score of {animal.ageConfidenceScore !== null ? `${Math.round(animal.ageConfidenceScore * 100)}%` : 'N/A'}.
                        </p>
                    </div>
                )}

                <Link href={`/shelter/${animal.shelter.id}`} className="animal-detail__shelter-card">
                    <div className="animal-detail__shelter-info">
                        <h3>{animal.shelter.name}</h3>
                        <p>
                            {animal.shelter.county} County, {animal.shelter.state}
                            {animal.shelter.phone && ` · ${animal.shelter.phone}`}
                        </p>
                    </div>
                    <span className={`trust-badge ${trustLevel}`}>
                        {animal.shelter.trustScore !== null ? `${animal.shelter.trustScore}% euthanized` : 'N/A'}
                    </span>
                </Link>

                {animal.sources.length > 0 && (
                    <div className="animal-detail__notes" style={{ marginTop: '1rem' }}>
                        <h2>Sources</h2>
                        {animal.sources.map((source: Source) => (
                            <p key={source.id} style={{ marginBottom: '0.5rem' }}>
                                <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
                                    {source.sourceType.replace('_', ' ').toLowerCase()}
                                </a>
                                {' · '}
                                <span style={{ color: 'var(--color-text-dim)', fontSize: '0.75rem' }}>
                                    scraped {new Date(source.scrapedAt).toLocaleDateString()}
                                </span>
                            </p>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
