import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAnimalById, getAnimalForMetadata } from '@/lib/queries';
import { formatDeathMarker, hoursUntil, getUrgencyLevel, formatAge, formatShelterStats, formatIntakeReason, formatYearsRemaining, getAgeDiscrepancy, getGoldenYearsConfidence, computeHealthScore } from '@/lib/utils';
import { CopyLinkButton } from '@/components/copy-link-button';
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
                        ← Back to the list
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

    const confidence = getGoldenYearsConfidence(
        animal.ageSource,
        animal.ageConfidence,
        animal.ageKnownYears,
        animal.ageEstimatedLow,
        animal.ageEstimatedHigh,
        animal.lifeExpectancyLow,
        animal.lifeExpectancyHigh,
    );

    // Derived display values (mirroring card logic)
    const shelterAge = animal.ageKnownYears !== null
        ? `${animal.ageKnownYears} yr${animal.ageKnownYears !== 1 ? 's' : ''}`
        : '—';
    const gyAge = (animal.ageEstimatedLow !== null && animal.ageEstimatedHigh !== null)
        ? `${animal.ageEstimatedLow}–${animal.ageEstimatedHigh} yrs`
        : 'Pending';
    const shelterBreed = animal.breed || '—';
    const gyBreed = animal.detectedBreeds?.length > 0
        ? animal.detectedBreeds.join(' / ')
        : 'Pending';

    return (
        <div className="animal-detail">
            <div className="container">
                <Link href="/" className="animal-detail__back">
                    ← Back to the list
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
                        <h1 className={`animal-detail__name ${!animal.name ? 'unnamed' : ''}`}>
                            {animal.name || 'Unnamed'}
                        </h1>
                        <p className="animal-detail__gender-species">
                            {animal.sex ? animal.sex.charAt(0) + animal.sex.slice(1).toLowerCase() : 'Unknown'} · {animal.species.charAt(0) + animal.species.slice(1).toLowerCase()}
                        </p>
                        <Link href={`/shelter/${animal.shelter.id}`} className="animal-detail__shelter-link">
                            {animal.shelter.name}
                            {animal.shelter.phone && <span className="animal-detail__shelter-phone"> · {animal.shelter.phone}</span>}
                        </Link>

                        <div className="animal-detail__detail-grid">
                            <div className="animal-detail__detail-row">
                                <span className="animal-detail__detail-label">Shelter age estimate</span>
                                <span className="animal-detail__detail-value">{shelterAge}</span>
                            </div>
                            <div className="animal-detail__detail-row">
                                <span className="animal-detail__detail-label">Golden Years estimate</span>
                                <span className="gy-tooltip">
                                    <span className={`animal-detail__detail-value ${gyAge !== 'Pending' ? 'cv-estimated' : ''}`}>{gyAge}</span>
                                    <span className="gy-tooltip__popup">
                                        <span className="gy-tooltip__label">Confidence</span>
                                        <span className="gy-tooltip__pct">{confidence.label} · {confidence.percent}%</span>
                                    </span>
                                </span>
                            </div>
                            <div className="animal-detail__detail-row">
                                <span className="animal-detail__detail-label">Shelter breed</span>
                                <span className="animal-detail__detail-value">{shelterBreed}</span>
                            </div>
                            {animal.species !== 'CAT' && (
                                <div className="animal-detail__detail-row">
                                    <span className="animal-detail__detail-label">Golden Years breed</span>
                                    <span className={`animal-detail__detail-value ${gyBreed !== 'Pending' ? 'cv-estimated' : ''}`}>{gyBreed}</span>
                                </div>
                            )}
                            <div className="animal-detail__detail-row">
                                <span className="animal-detail__detail-label">Intake ID</span>
                                <span className="animal-detail__detail-value">{animal.intakeId || 'N/A'}</span>
                            </div>
                            {animal.intakeDate && (
                                <div className="animal-detail__detail-row">
                                    <span className="animal-detail__detail-label">Intake date</span>
                                    <span className="animal-detail__detail-value">
                                        {new Date(animal.intakeDate).toLocaleDateString('en-US', {
                                            month: 'short', day: 'numeric', year: 'numeric',
                                        })}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Only show urgency badge when real euthanasia schedule exists */}
                        {urgency !== 'standard' && (
                            <div className="animal-detail__ers-badge-row">
                                <span className={`animal-detail__ers-badge ${urgency}`}>
                                    {urgency === 'critical' ? '< 24h' : urgency === 'urgent' ? '< 48h' : '< 72h'}
                                </span>
                            </div>
                        )}

                        <div className="animal-detail__actions">
                            <CopyLinkButton />
                        </div>

                    </div>
                </div>

                {/* --- Consolidated Report Card --- */}
                <div className="animal-detail__report">
                    <h2 className="animal-detail__report-title">Report</h2>

                    {hours !== null && hours === 0 && (
                        <div className="animal-detail__report-section animal-detail__report-section--warning">
                            <h3>⚠️ Date Passed</h3>
                            <p>
                                The scheduled euthanasia date for this animal has passed.
                                Their current status may have changed — contact the shelter directly.
                            </p>
                        </div>
                    )}

                    {yearsRemaining && (
                        <div className="animal-detail__report-section">
                            <h3>Time Left</h3>
                            <p>
                                {animal.name || 'This animal'} could live <strong>{yearsRemaining}</strong> more.
                            </p>
                            {animal.euthScheduledAt && (
                                <p className="animal-detail__report-contrast">
                                    Euthanasia scheduled in <strong>{hoursUntil(animal.euthScheduledAt)} hours</strong>.
                                </p>
                            )}
                            {animal.lifeExpectancyLow !== null && animal.lifeExpectancyHigh !== null && (
                                <p className="animal-detail__report-detail">
                                    Typical lifespan: {animal.lifeExpectancyLow}–{animal.lifeExpectancyHigh} years
                                    {animal.detectedBreeds?.length > 0 && ` · Breed: ${animal.detectedBreeds.join(' / ')}`}
                                </p>
                            )}
                        </div>
                    )}

                    {(ageDiscrepancy || (animal.ageEstimatedLow !== null && animal.ageEstimatedHigh !== null)) && (
                        <div className="animal-detail__report-section">
                            <h3>Age Analysis</h3>
                            {animal.ageEstimatedLow !== null && animal.ageEstimatedHigh !== null && (
                                <p>
                                    Computer vision estimates {animal.ageEstimatedLow}–{animal.ageEstimatedHigh} years
                                    ({animal.ageConfidence === 'HIGH' ? 'high' : animal.ageConfidence === 'MEDIUM' ? 'moderate' : 'low'} confidence).
                                    {animal.ageIndicators?.length > 0 && ` Based on: ${animal.ageIndicators.join(', ')}.`}
                                </p>
                            )}
                            {ageDiscrepancy && (
                                <p className="animal-detail__report-detail">
                                    ⚠ Shelter reports {ageDiscrepancy.shelterAge} yrs vs. CV estimate of {ageDiscrepancy.cvRange} yrs — {ageDiscrepancy.message}
                                </p>
                            )}
                        </div>
                    )}

                    {intakeReasonDisplay && (
                        <div className="animal-detail__report-section">
                            <h3>Why They&apos;re Here</h3>
                            <p>{intakeReasonDisplay}</p>
                        </div>
                    )}

                    {animal.notes && (
                        <div className="animal-detail__report-section">
                            <h3>Notes</h3>
                            <p>{animal.notes}</p>
                        </div>
                    )}

                    {/* --- Health Assessment --- */}
                    {(() => {
                        const health = computeHealthScore(
                            animal.bodyConditionScore,
                            animal.coatCondition,
                            animal.visibleConditions,
                            animal.stressLevel,
                            animal.fearIndicators,
                            animal.estimatedCareLevel,
                        );
                        if (!health) return null;
                        return (
                            <div className="animal-detail__report-section">
                                <h3>Health Assessment</h3>
                                <div className="animal-detail__health-score">
                                    <div className="animal-detail__health-score-bar">
                                        <div
                                            className={`animal-detail__health-score-fill ${health.score >= 85 ? 'excellent' : health.score >= 70 ? 'good' : health.score >= 50 ? 'fair' : 'concerning'}`}
                                            style={{ width: `${health.score}%` }}
                                        />
                                    </div>
                                    <span className="animal-detail__health-score-value">
                                        {health.score}/100 · {health.label}
                                    </span>
                                </div>
                                <ul className="animal-detail__health-factors">
                                    {health.factors.map((f, i) => (
                                        <li key={i}>{f}</li>
                                    ))}
                                </ul>
                                {animal.visibleConditions.length > 0 && (
                                    <div className="animal-detail__report-tags">
                                        {animal.visibleConditions.map((c, i) => (
                                            <span key={i} className="animal-detail__report-tag">{c}</span>
                                        ))}
                                    </div>
                                )}
                                <p className="animal-detail__report-disclaimer">
                                    Assessed via AI analysis of the animal&apos;s photo and adoption listing. This is not a veterinary diagnosis.
                                </p>
                            </div>
                        );
                    })()}
                </div>

                {/* --- Shelter Card --- */}
                <div className="animal-detail__shelter-card">
                    <div className="animal-detail__shelter-header">
                        <h2 className="animal-detail__shelter-name">{animal.shelter.name}</h2>
                    </div>
                    <div className="animal-detail__shelter-contact">
                        {animal.shelter.address && (
                            <p>{animal.shelter.address}</p>
                        )}
                        <p>
                            {animal.shelter.county} County, {animal.shelter.state}
                            {animal.shelter.zipCode && ` ${animal.shelter.zipCode}`}
                        </p>
                        <p className="animal-detail__shelter-phone-line">
                            📞 {animal.shelter.phone || 'Phone not available'}
                        </p>
                    </div>
                    {shelterStatsLine && (
                        <div className="animal-detail__shelter-stats">
                            <p>{shelterStatsLine}</p>
                        </div>
                    )}
                    <div className="animal-detail__shelter-cta">
                        {(() => {
                            const adoptUrl = animal.shelter.websiteUrl
                                || (animal.sources.length > 0 ? animal.sources[0].sourceUrl : null);
                            return adoptUrl ? (
                                <a
                                    href={adoptUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="animal-detail__adopt-btn"
                                >
                                    View on Shelter Site →
                                </a>
                            ) : animal.shelter.phone ? (
                                <p className="animal-detail__shelter-fallback">Contact shelter by phone to inquire about adoption</p>
                            ) : null;
                        })()}
                    </div>
                </div>

                <p className="animal-detail__updated">
                    Last updated {new Date(animal.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
            </div>
        </div>
    );
}

