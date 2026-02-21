import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getShelterById, getShelterForMetadata } from '@/lib/queries';
import { formatDeathMarker, hoursUntil, getUrgencyLevel, getSaveRate, formatAge, getPerCapitaIntake, getYoYTrend, getTransferRate } from '@/lib/utils';
import { EmailAlert } from '@/components/email-alert';
import type { ShelterWithAnimals, Animal } from '@/lib/types';

export const revalidate = 60;

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const { id } = await params;

    try {
        const shelter = await getShelterForMetadata(id);

        if (!shelter) {
            return { title: 'Shelter Not Found | Golden Years Club' };
        }

        const saveRate = getSaveRate(shelter.totalIntakeAnnual, shelter.totalEuthanizedAnnual);
        const title = `${shelter.name} | Golden Years Club`;
        const description = `${shelter.name} in ${shelter.county} County, ${shelter.state}. ${shelter.animals.length} senior animals currently on the euthanasia list.${saveRate !== null ? ` ${saveRate}% live release rate.` : ''}`;

        return {
            title,
            description,
            openGraph: {
                title,
                description,
                type: 'article',
                siteName: 'Golden Years Club',
            },
            twitter: {
                card: 'summary',
                title,
                description,
            },
        };
    } catch {
        return { title: 'Golden Years Club' };
    }
}

export default async function ShelterDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    let shelter: ShelterWithAnimals | null = null;
    let error = false;

    try {
        shelter = await getShelterById(id);
    } catch (e) {
        console.error('Failed to load shelter detail:', e);
        error = true;
    }

    if (error) {
        return (
            <div className="shelter-detail">
                <div className="container">
                    <Link href="/listings" className="animal-detail__back">
                        ← Back to Listings
                    </Link>
                    <div className="error-state">
                        <div className="error-state__icon">⚠️</div>
                        <h2 className="error-state__title">Unable to load shelter details</h2>
                        <p className="error-state__text">
                            We&apos;re having trouble connecting to our database right now.
                            Please try again in a few moments.
                        </p>
                        <Link href={`/shelter/${id}`} className="error-state__retry">
                            Try Again →
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (!shelter) {
        notFound();
    }

    const saveRate = getSaveRate(shelter.totalIntakeAnnual, shelter.totalEuthanizedAnnual);
    const hasData = shelter.totalIntakeAnnual > 0;
    const perCapita = getPerCapitaIntake(shelter.totalIntakeAnnual, shelter.countyPopulation);
    const yoyTrend = getYoYTrend(shelter.totalIntakeAnnual, shelter.totalEuthanizedAnnual, shelter.priorYearIntake, shelter.priorYearEuthanized);
    const transferRate = getTransferRate(shelter.totalTransferred, shelter.totalIntakeAnnual);

    return (
        <div className="shelter-detail">
            <div className="container">
                <Link href="/listings" className="animal-detail__back">
                    ← Back to Listings
                </Link>

                <div className="shelter-detail__header">
                    <h1 className="shelter-detail__name">
                        {shelter.name}
                    </h1>
                    <p className="shelter-detail__location">
                        {shelter.county} County, {shelter.state}
                        {shelter.address && ` · ${shelter.address}`}
                    </p>
                </div>

                {/* Public Shelter Data Card */}
                {hasData ? (
                    <div className="shelter-data-card">
                        <div className="shelter-data-card__header">
                            <span className="shelter-data-card__title">
                                📊 Public Shelter Data
                                {shelter.dataYear && ` · ${shelter.dataYear}`}
                            </span>
                            {shelter.dataSourceName && (
                                <span className="shelter-data-card__source">
                                    Source:{' '}
                                    {shelter.dataSourceUrl ? (
                                        <a href={shelter.dataSourceUrl} target="_blank" rel="noopener noreferrer">
                                            {shelter.dataSourceName} ↗
                                        </a>
                                    ) : (
                                        shelter.dataSourceName
                                    )}
                                </span>
                            )}
                        </div>

                        <div className="shelter-data-card__stats">
                            <div className="shelter-data-card__stat">
                                <div className="shelter-data-card__stat-label">Intake</div>
                                <div className="shelter-data-card__stat-value">
                                    {shelter.totalIntakeAnnual.toLocaleString()}
                                </div>
                            </div>
                            <div className="shelter-data-card__stat">
                                <div className="shelter-data-card__stat-label">Euthanized</div>
                                <div className="shelter-data-card__stat-value shelter-data-card__stat-value--euth">
                                    {shelter.totalEuthanizedAnnual.toLocaleString()}
                                </div>
                            </div>
                            <div className="shelter-data-card__stat">
                                <div className="shelter-data-card__stat-label">Currently Listed</div>
                                <div className="shelter-data-card__stat-value">{shelter.animals.length}</div>
                            </div>
                        </div>

                        {/* Save Rate Bar */}
                        {saveRate !== null && (
                            <div className="shelter-data-card__save-rate">
                                <div className="shelter-data-card__save-rate-header">
                                    <span className="shelter-data-card__save-rate-label">
                                        Live Release Rate
                                    </span>
                                    <span className="shelter-data-card__save-rate-value">
                                        {saveRate}%
                                    </span>
                                </div>
                                <div className="shelter-data-card__bar">
                                    <div
                                        className="shelter-data-card__bar-fill"
                                        style={{ width: `${Math.min(saveRate, 100)}%` }}
                                    />
                                    <div className="shelter-data-card__bar-benchmark" />
                                </div>
                                <div className="shelter-data-card__bar-legend">
                                    <span>0%</span>
                                    <span className="shelter-data-card__bar-benchmark-label">
                                        90% No-Kill Benchmark
                                    </span>
                                    <span>100%</span>
                                </div>
                            </div>
                        )}

                        {/* Secondary Metrics */}
                        {(perCapita !== null || yoyTrend || transferRate !== null) && (
                            <div className="shelter-data-card__metrics">
                                {perCapita !== null && (
                                    <div className="shelter-data-card__metric">
                                        <span className="shelter-data-card__metric-label">Per Capita Intake</span>
                                        <span className="shelter-data-card__metric-value">
                                            {perCapita} <small>per 100 residents</small>
                                        </span>
                                    </div>
                                )}
                                {yoyTrend && (
                                    <div className="shelter-data-card__metric">
                                        <span className="shelter-data-card__metric-label">
                                            Save Rate vs. {shelter.priorDataYear}
                                        </span>
                                        <span className={`shelter-data-card__metric-value shelter-data-card__metric-value--${yoyTrend.direction}`}>
                                            {yoyTrend.direction === 'up' ? '↑' : yoyTrend.direction === 'down' ? '↓' : '→'}
                                            {' '}{Math.abs(yoyTrend.delta)}%
                                        </span>
                                    </div>
                                )}

                                {transferRate !== null && (
                                    <div className="shelter-data-card__metric">
                                        <span className="shelter-data-card__metric-label">Transferred to Rescues</span>
                                        <span className="shelter-data-card__metric-value">{transferRate}%</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="shelter-data-card shelter-data-card--empty">
                        <span className="shelter-data-card__title">📊 Public Shelter Data</span>
                        <p className="shelter-data-card__empty-text">
                            No public statistics available for this shelter yet.
                        </p>
                    </div>
                )}

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
                                animal.ageConfidence,
                                animal.ageSource,
                            );

                            return (
                                <Link
                                    key={animal.id}
                                    href={`/animal/${animal.id}`}
                                    className="animal-card"
                                >
                                    <div className="animal-card__image">
                                        {animal.photoUrl ? (
                                            <Image src={animal.photoUrl} alt={animal.name || 'Unnamed animal'} fill sizes="(max-width: 768px) 100vw, 33vw" style={{ objectFit: 'cover' }} />
                                        ) : (
                                            <Image src="/no-photo.svg" alt="Photo not available" fill sizes="(max-width: 768px) 100vw, 33vw" style={{ objectFit: 'cover' }} />
                                        )}
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
                                            <span className="animal-card__death-marker-label">
                                                {animal.euthScheduledAt ? 'Scheduled' : 'Status'}
                                            </span>
                                            <span className={`animal-card__death-marker-time ${animal.euthScheduledAt ? urgency : 'standard'}`}>
                                                {animal.euthScheduledAt ? formatDeathMarker(animal.euthScheduledAt) : 'In Shelter'}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}

                <EmailAlert />
            </div>
        </div>
    );
}
