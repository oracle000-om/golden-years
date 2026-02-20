import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAnimalById, getAnimalForMetadata } from '@/lib/queries';
import { formatDeathMarker, hoursUntil, getUrgencyLevel, formatAge, formatShelterStats, formatIntakeReason, formatYearsRemaining, getAgeDiscrepancy } from '@/lib/utils';
import { ShareButtons } from '@/components/share-buttons';
import { FavoriteButton } from '@/components/favorite-button';
import type { AnimalWithShelterAndSources, Source } from '@/lib/types';

export const revalidate = 60;

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const { id } = await params;

    try {
        const animal = await getAnimalForMetadata(id);

        if (!animal) {
            return { title: 'Animal Not Found | Golden Years Club' };
        }

        const name = animal.name || 'Unnamed Senior';
        const breed = animal.breed || 'Unknown breed';
        const shelterName = animal.shelter?.name || 'Unknown shelter';
        const title = `${name} — ${breed} | Golden Years Club`;
        const description = `${name} is a senior ${breed.toLowerCase()} at ${shelterName}. ${animal.euthScheduledAt ? `Euthanasia scheduled ${formatDeathMarker(animal.euthScheduledAt)}.` : ''} Help give this senior a second chance.`;

        const metadata: Metadata = {
            title,
            description,
            openGraph: {
                title,
                description,
                type: 'article',
                siteName: 'Golden Years Club',
            },
            twitter: {
                card: animal.photoUrl ? 'summary_large_image' : 'summary',
                title,
                description,
            },
        };

        if (animal.photoUrl) {
            metadata.openGraph!.images = [{ url: animal.photoUrl, alt: name }];
            metadata.twitter!.images = [animal.photoUrl];
        }

        return metadata;
    } catch {
        return { title: 'Golden Years Club' };
    }
}

export default async function AnimalDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    let animal: AnimalWithShelterAndSources | null = null;
    let error = false;

    try {
        animal = await getAnimalById(id);
    } catch (e) {
        console.error('Failed to load animal detail:', e);
        error = true;
    }

    if (error) {
        return (
            <div className="animal-detail">
                <div className="container">
                    <Link href="/" className="animal-detail__back">
                        ← Back to Listings
                    </Link>
                    <div className="error-state">
                        <div className="error-state__icon">⚠️</div>
                        <h2 className="error-state__title">Unable to load animal details</h2>
                        <p className="error-state__text">
                            We&apos;re having trouble connecting to our database right now.
                            Please try again in a few moments.
                        </p>
                        <Link href={`/animal/${id}`} className="error-state__retry">
                            Try Again →
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (!animal) {
        notFound();
    }

    const hours = hoursUntil(animal.euthScheduledAt);
    const urgency = getUrgencyLevel(hours);
    const shelterStatsLine = formatShelterStats(animal.shelter.totalIntakeAnnual, animal.shelter.totalEuthanizedAnnual, animal.shelter.dataYear);
    const ageDisplay = formatAge(
        animal.ageKnownYears,
        animal.ageEstimatedLow,
        animal.ageEstimatedHigh,
        animal.ageConfidence,
        animal.ageSource,
    );
    const intakeReasonDisplay = formatIntakeReason(animal.intakeReason, animal.intakeReasonDetail);
    const yearsRemaining = formatYearsRemaining(
        animal.ageKnownYears,
        animal.ageEstimatedLow,
        animal.ageEstimatedHigh,
        animal.lifeExpectancyLow,
        animal.lifeExpectancyHigh,
    );
    const ageDiscrepancy = getAgeDiscrepancy(
        animal.ageKnownYears,
        animal.ageEstimatedLow,
        animal.ageEstimatedHigh,
        animal.ageConfidence,
    );

    return (
        <div className="animal-detail">
            <div className="container">
                <Link href="/" className="animal-detail__back">
                    ← Back to Listings
                </Link>

                <div className="animal-detail__hero">
                    <div className="animal-detail__photo">
                        {animal.photoUrl ? (
                            <Image src={animal.photoUrl} alt={animal.name || 'Unnamed animal'} fill sizes="(max-width: 768px) 100vw, 50vw" style={{ objectFit: 'cover' }} priority />
                        ) : (
                            <div className="animal-detail__photo-placeholder">
                                {animal.species === 'DOG' ? '🐕' : animal.species === 'CAT' ? '🐈' : '🐾'}
                            </div>
                        )}
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
                                <div className="animal-detail__hours-remaining">
                                    {hours === 0 ? 'Imminent' : `${hours} hour${hours !== 1 ? 's' : ''} remaining`}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="animal-detail__actions">
                    <FavoriteButton animalId={animal.id} animalName={animal.name || 'Unnamed'} />
                    <ShareButtons
                        url={`/animal/${animal.id}`}
                        title={`${animal.name || 'Unnamed senior'} needs a home — ${animal.breed || 'Unknown breed'} at ${animal.shelter.name}`}
                        description={`${animal.name || 'This senior animal'} is on the euthanasia list. Help give them a second chance.`}
                    />
                </div>

                {hours !== null && hours === 0 && (
                    <div className="animal-detail__notes animal-detail__notes--warning">
                        <h2>⚠️ Date Passed</h2>
                        <p>
                            The scheduled euthanasia date for this animal has passed.
                            Their current status may have changed — please contact the shelter directly for the latest information.
                        </p>
                    </div>
                )}

                {animal.notes && (
                    <div className="animal-detail__notes">
                        <h2>Notes</h2>
                        <p>{animal.notes}</p>
                    </div>
                )}

                {yearsRemaining && (
                    <div className="animal-detail__time-left">
                        <div className="animal-detail__time-left-main">
                            <h2>Time Left</h2>
                            <p className="animal-detail__time-left-estimate">
                                {animal.name || 'This animal'} could live <strong>{yearsRemaining}</strong> more.
                            </p>
                            {animal.euthScheduledAt && (
                                <p className="animal-detail__time-left-contrast">
                                    Euthanasia scheduled in <strong>{hoursUntil(animal.euthScheduledAt)} hours</strong>.
                                </p>
                            )}
                        </div>
                        <div className="animal-detail__time-left-details">
                            {animal.detectedBreeds?.length > 0 && (
                                <p>Breed: {animal.detectedBreeds.join(' / ')}</p>
                            )}
                            {animal.lifeExpectancyLow !== null && animal.lifeExpectancyHigh !== null && (
                                <p>Typical lifespan: {animal.lifeExpectancyLow}–{animal.lifeExpectancyHigh} years</p>
                            )}
                        </div>
                    </div>
                )}

                {ageDiscrepancy && (
                    <div className={`age-discrepancy age-discrepancy--${ageDiscrepancy.severity}`}>
                        <div className="age-discrepancy__icon">
                            {ageDiscrepancy.severity === 'major' ? '⚠️' : '📊'}
                        </div>
                        <div className="age-discrepancy__content">
                            <h3 className="age-discrepancy__title">Age Discrepancy Detected</h3>
                            <p className="age-discrepancy__message">{ageDiscrepancy.message}</p>
                            <div className="age-discrepancy__comparison">
                                <span className="age-discrepancy__tag age-discrepancy__tag--shelter">Shelter: {ageDiscrepancy.shelterAge} yrs</span>
                                <span className="age-discrepancy__vs">vs</span>
                                <span className="age-discrepancy__tag age-discrepancy__tag--cv">CV: {ageDiscrepancy.cvRange} yrs</span>
                            </div>
                        </div>
                    </div>
                )}

                {animal.ageEstimatedLow !== null && animal.ageEstimatedHigh !== null && (
                    <div className="animal-detail__notes animal-detail__notes--section">
                        <h2>Photo Age Analysis</h2>
                        <p>
                            Computer vision estimates this animal at {animal.ageEstimatedLow}–{animal.ageEstimatedHigh} years
                            ({animal.ageConfidence === 'HIGH' ? 'high' : animal.ageConfidence === 'MEDIUM' ? 'moderate' : 'low'} confidence).
                        </p>
                        {animal.ageIndicators?.length > 0 && (
                            <p className="animal-detail__notes-secondary">
                                Assessed based on: {animal.ageIndicators?.join(', ')}.
                            </p>
                        )}
                        {animal.detectedBreeds?.length > 0 && (
                            <p className="animal-detail__notes-secondary">
                                Detected breed: {animal.detectedBreeds?.join(' / ')}
                                {animal.breedConfidence !== 'NONE' && ` (${animal.breedConfidence.toLowerCase()} confidence)`}.
                            </p>
                        )}
                    </div>
                )}

                {intakeReasonDisplay && (
                    <div className="animal-detail__notes animal-detail__notes--section">
                        <h2>Why They&apos;re Here</h2>
                        <p>{intakeReasonDisplay}</p>
                    </div>
                )}

                <Link href={`/shelter/${animal.shelter.id}`} className="animal-detail__shelter-card">
                    <div className="animal-detail__shelter-info">
                        <h3>{animal.shelter.name}</h3>
                        <p>
                            {animal.shelter.county} County, {animal.shelter.state}
                            {animal.shelter.phone && ` · ${animal.shelter.phone}`}
                        </p>
                        {shelterStatsLine && (
                            <p className="animal-detail__shelter-stats">
                                {shelterStatsLine}
                            </p>
                        )}
                    </div>
                    <span className="animal-detail__shelter-link-arrow">View Shelter →</span>
                </Link>

                {animal.sources.length > 0 && (
                    <div className="animal-detail__notes animal-detail__notes--section">
                        <h2>Sources</h2>
                        {animal.sources.map((source: Source) => (
                            <p key={source.id} style={{ marginBottom: '0.5rem' }}>
                                <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
                                    {source.sourceType.replace('_', ' ').toLowerCase()}
                                </a>
                                {' · '}
                                <span className="animal-detail__source-scraped">
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

