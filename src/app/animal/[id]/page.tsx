import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAnimalById, getAnimalForMetadata, getAnimalSnapshots, getBreedCommonConditions, getShelterInsights } from '@/lib/queries';
import { formatDeathMarker, hoursUntil, getUrgencyLevel, formatAge, formatShelterStats, formatIntakeReason, formatYearsRemaining, getAgeDiscrepancy, getGoldenYearsConfidence, computeHealthScore, getSaveRate, getBestAge } from '@/lib/utils';
import { CopyLinkButton } from '@/components/copy-link-button';
import { PhotoGallery } from '@/components/photo-gallery';
import { ShelterStatsCharts } from '@/components/shelter-stats-charts';
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
    const saveRate = getSaveRate(animal.shelter.totalIntakeAnnual, animal.shelter.totalEuthanizedAnnual);
    const shelterInsights = await getShelterInsights(animal.shelterId);
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
        ? animal.detectedBreeds.slice(0, 3).join(' / ')
        : 'Pending';
    const sizeLabels: Record<string, string> = { SMALL: 'Small', MEDIUM: 'Medium', LARGE: 'Large', XLARGE: 'Extra Large' };
    const sizeDisplay = (() => {
        if (animal.size) return { text: sizeLabels[animal.size], inferred: false };
        // Infer from detected breeds when size is missing
        const breedSizes: Record<string, string> = {
            'chihuahua': 'Small', 'yorkshire': 'Small', 'pomeranian': 'Small', 'maltese': 'Small',
            'shih tzu': 'Small', 'dachshund': 'Small', 'miniature': 'Small', 'toy': 'Small',
            'beagle': 'Medium', 'cocker spaniel': 'Medium', 'corgi': 'Medium', 'bulldog': 'Medium',
            'australian shepherd': 'Medium', 'border collie': 'Medium', 'springer': 'Medium',
            'labrador': 'Large', 'golden retriever': 'Large', 'german shepherd': 'Large',
            'rottweiler': 'Large', 'boxer': 'Large', 'husky': 'Large', 'doberman': 'Large',
            'pit bull': 'Large', 'american staffordshire': 'Large', 'belgian': 'Large', 'collie': 'Large',
            'great dane': 'Extra Large', 'mastiff': 'Extra Large', 'saint bernard': 'Extra Large',
            'newfoundland': 'Extra Large', 'great pyrenees': 'Extra Large', 'bernese': 'Extra Large',
            'irish wolfhound': 'Extra Large', 'cane corso': 'Extra Large',
        };
        const breeds = [...(animal.detectedBreeds || []), animal.breed || ''].map(b => b.toLowerCase());
        for (const breed of breeds) {
            for (const [key, size] of Object.entries(breedSizes)) {
                if (breed.includes(key)) return { text: `Likely ${size.toLowerCase()}`, inferred: true };
            }
        }
        return null;
    })();

    return (
        <div className="animal-detail">
            <div className="container">
                <Link href="/" className="animal-detail__back">
                    ← Back to the list
                </Link>

                {/* --- Status Banners --- */}
                {animal.status === 'ADOPTED' && (
                    <div className="animal-detail__status-banner animal-detail__status-banner--positive">
                        🎉 Great news — {animal.name || 'This animal'} has been adopted!
                        {animal.outcomeDate && <span className="animal-detail__status-banner-date">Confirmed {new Date(animal.outcomeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                    </div>
                )}
                {animal.status === 'RESCUE_PULL' && (
                    <div className="animal-detail__status-banner animal-detail__status-banner--positive">
                        🎉 {animal.name || 'This animal'} was pulled by a rescue!
                    </div>
                )}
                {animal.status === 'TRANSFERRED' && (
                    <div className="animal-detail__status-banner animal-detail__status-banner--neutral">
                        {animal.name || 'This animal'} was transferred to another facility.
                    </div>
                )}
                {animal.status === 'RETURNED_OWNER' && (
                    <div className="animal-detail__status-banner animal-detail__status-banner--positive">
                        🏠 {animal.name || 'This animal'} was returned to their owner!
                    </div>
                )}
                {animal.status === 'DELISTED' && (
                    <div className="animal-detail__status-banner animal-detail__status-banner--neutral">
                        <strong>ℹ️ {animal.name || 'This animal'} is no longer listed</strong>
                        <span>This usually means the animal was adopted, transferred, or pulled by a rescue.</span>
                        {animal.lastSeenAt && <span className="animal-detail__status-banner-date">Last seen on shelter site {new Date(animal.lastSeenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                    </div>
                )}
                {animal.status === 'EUTHANIZED' && (
                    <div className="animal-detail__status-banner animal-detail__status-banner--memorial">
                        🕊️ {animal.name || 'This animal'} has passed. We honor their memory.
                        {animal.outcomeDate && <span className="animal-detail__status-banner-date">{new Date(animal.outcomeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                    </div>
                )}

                <div className="animal-detail__hero">
                    <div className="animal-detail__photo">
                        {(() => {
                            const allPhotos = [animal.photoUrl, ...(animal.photoUrls || [])].filter(Boolean) as string[];
                            if (allPhotos.length > 1) {
                                return <PhotoGallery photos={allPhotos} name={animal.name || 'Unnamed animal'} />;
                            }
                            return animal.photoUrl ? (
                                <Image src={animal.photoUrl} alt={animal.name || 'Unnamed animal'} fill sizes="(max-width: 768px) 100vw, 50vw" style={{ objectFit: 'cover' }} priority />
                            ) : (
                                <div className="animal-detail__photo-placeholder">
                                    {animal.species === 'DOG' ? '🐕' : animal.species === 'CAT' ? '🐈' : '🐾'}
                                </div>
                            );
                        })()}
                    </div>

                    <div className="animal-detail__info">
                        <h1 className={`animal-detail__name ${!animal.name ? 'unnamed' : ''}`}>
                            {animal.name || 'Unnamed'}
                            <CopyLinkButton />
                        </h1>
                        <p className="animal-detail__gender-species">
                            {animal.sex ? animal.sex.charAt(0) + animal.sex.slice(1).toLowerCase() : 'Unknown'} · {animal.species.charAt(0) + animal.species.slice(1).toLowerCase()}
                        </p>
                        <Link href={`/shelter/${animal.shelter.id}`} className="animal-detail__shelter-link">
                            {animal.shelter.name}
                        </Link>
                        <p className="animal-detail__location-phone">
                            {animal.shelter.county} County, {animal.shelter.state}
                            {animal.shelter.phone && <span className="animal-detail__inline-phone"> · 📞 <a href={`tel:${animal.shelter.phone.replace(/\D/g, '')}`}>{animal.shelter.phone}</a></span>}
                        </p>

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
                                        <span className="gy-tooltip__pct">{confidence.label}</span>
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
                                    <span className="gy-tooltip">
                                        <span className={`animal-detail__detail-value ${gyBreed !== 'Pending' ? 'cv-estimated' : ''}`}>{gyBreed}</span>
                                        <span className="gy-tooltip__popup">
                                            <span className="gy-tooltip__label">Confidence</span>
                                            <span className="gy-tooltip__pct">{animal.breedConfidence === 'HIGH' ? 'High' : animal.breedConfidence === 'MEDIUM' ? 'Moderate' : animal.breedConfidence === 'LOW' ? 'Low' : 'Pending'}</span>
                                        </span>
                                    </span>
                                </div>
                            )}
                            {sizeDisplay && (
                                <div className="animal-detail__detail-row">
                                    <span className="animal-detail__detail-label">Size</span>
                                    <span className={`animal-detail__detail-value ${sizeDisplay.inferred ? 'cv-estimated' : ''}`}>{sizeDisplay.text}</span>
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



                    </div>
                </div>

                {/* --- Consolidated Report Card --- */}
                <div className="animal-detail__report">
                    <h2 className="animal-detail__report-title">Report Card</h2>

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
                                {yearsRemaining === 'near end of life'
                                    ? <>{animal.name || 'This animal'} is estimated to be <strong>near end of life</strong>.{' '}</>
                                    : <>{animal.name || 'This animal'} could live <strong>{yearsRemaining}</strong> more.{' '}</>}
                            </p>
                            {animal.euthScheduledAt && (
                                <p className="animal-detail__report-contrast">
                                    Euthanasia scheduled in <strong>{hoursUntil(animal.euthScheduledAt)} hours</strong>.
                                </p>
                            )}
                            {animal.lifeExpectancyLow !== null && animal.lifeExpectancyHigh !== null && (
                                <p className="animal-detail__report-detail">
                                    Typical lifespan: {animal.lifeExpectancyLow}–{animal.lifeExpectancyHigh} years
                                    {animal.detectedBreeds?.length > 0 && ` · Breed: ${animal.detectedBreeds.slice(0, 3).join(' / ')}`}
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
                                </p>
                            )}
                            {animal.ageIndicators?.length > 0 && (
                                <div className="animal-detail__report-tags">
                                    {animal.ageIndicators.map((ind: string, i: number) => (
                                        <span key={i} className="animal-detail__report-tag">{ind}</span>
                                    ))}
                                </div>
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
                            <h3>Notes from listing</h3>
                            <p>{animal.notes}</p>
                        </div>
                    )}

                    {/* --- Health Assessment --- */}
                    {await (async () => {
                        const bestAge = getBestAge(animal.ageKnownYears, animal.ageEstimatedLow, animal.ageEstimatedHigh, animal.ageSource);
                        const breedConditions = await getBreedCommonConditions(animal.detectedBreeds || []);
                        const health = computeHealthScore(
                            animal.bodyConditionScore,
                            animal.coatCondition,
                            animal.visibleConditions,
                            animal.stressLevel,
                            animal.fearIndicators,
                            animal.estimatedCareLevel,
                            {
                                notes: animal.notes,
                                healthNotes: animal.healthNotes,
                                ageYears: bestAge?.age ?? null,
                                breedCommonConditions: breedConditions,
                            },
                        );
                        if (!health) return null;
                        const { physical, medical, comfort } = health.subScores;
                        return (
                            <div className="animal-detail__report-section">
                                <h3>Health Assessment</h3>
                                <div className="animal-detail__sub-scores">
                                    <div className="animal-detail__sub-score">
                                        <div className="animal-detail__sub-score-header">
                                            <span className="animal-detail__sub-score-label">Physical</span>
                                            <span className="animal-detail__sub-score-value">{physical.score}/{physical.max} · {physical.label}</span>
                                        </div>
                                        <div className="animal-detail__sub-score-bar">
                                            <div
                                                className={`animal-detail__sub-score-fill ${physical.score / physical.max >= 0.85 ? 'excellent' : physical.score / physical.max >= 0.6 ? 'good' : physical.score / physical.max >= 0.4 ? 'fair' : 'concerning'}`}
                                                style={{ width: `${(physical.score / physical.max) * 100}%` }}
                                            />
                                        </div>
                                        {physical.factors.length > 0 && (
                                            <ul className="animal-detail__sub-score-factors">
                                                {physical.factors.map((f, i) => <li key={i}>{f}</li>)}
                                            </ul>
                                        )}
                                    </div>
                                    <div className="animal-detail__sub-score">
                                        <div className="animal-detail__sub-score-header">
                                            <span className="animal-detail__sub-score-label">Medical</span>
                                            <span className="animal-detail__sub-score-value">{medical.score}/{medical.max} · {medical.label}</span>
                                        </div>
                                        <div className="animal-detail__sub-score-bar">
                                            <div
                                                className={`animal-detail__sub-score-fill ${medical.score / medical.max >= 0.85 ? 'excellent' : medical.score / medical.max >= 0.6 ? 'good' : medical.score / medical.max >= 0.4 ? 'fair' : 'concerning'}`}
                                                style={{ width: `${(medical.score / medical.max) * 100}%` }}
                                            />
                                        </div>
                                        {medical.factors.length > 0 && (
                                            <ul className="animal-detail__sub-score-factors">
                                                {medical.factors.map((f, i) => <li key={i}>{f}</li>)}
                                            </ul>
                                        )}
                                    </div>
                                    <div className="animal-detail__sub-score">
                                        <div className="animal-detail__sub-score-header">
                                            <span className="animal-detail__sub-score-label">Comfort</span>
                                            <span className="animal-detail__sub-score-value">{comfort.score}/{comfort.max} · {comfort.label}</span>
                                        </div>
                                        <div className="animal-detail__sub-score-bar">
                                            <div
                                                className={`animal-detail__sub-score-fill ${comfort.score / comfort.max >= 0.85 ? 'excellent' : comfort.score / comfort.max >= 0.6 ? 'good' : comfort.score / comfort.max >= 0.4 ? 'fair' : 'concerning'}`}
                                                style={{ width: `${(comfort.score / comfort.max) * 100}%` }}
                                            />
                                        </div>
                                        {comfort.factors.length > 0 && (
                                            <ul className="animal-detail__sub-score-factors">
                                                {comfort.factors.map((f, i) => <li key={i}>{f}</li>)}
                                            </ul>
                                        )}

                                    </div>
                                </div>
                                <div className="animal-detail__health-overall">
                                    <span className="animal-detail__health-overall-label">Overall</span>
                                    <span className="animal-detail__health-overall-value">{health.score}/100 · {health.label}</span>
                                </div>

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
                            📞 <a href={`tel:${(animal.shelter.phone || '').replace(/\D/g, '')}`}>{animal.shelter.phone || 'Phone not available'}</a>
                        </p>
                    </div>
                    {(saveRate !== null || shelterInsights.length > 0) && (
                        <div className="animal-detail__shelter-stats">
                            <div className="animal-detail__shelter-stats-row">
                                {saveRate !== null && (
                                    <ShelterStatsCharts
                                        intake={animal.shelter.totalIntakeAnnual}
                                        euthanized={animal.shelter.totalEuthanizedAnnual}
                                        dataYear={animal.shelter.dataYear}
                                    />
                                )}
                                {shelterInsights.length > 0 && (
                                    <div className="animal-detail__noteworthy">
                                        <h3 className="animal-detail__noteworthy-title">Noteworthy</h3>
                                        <ul className="animal-detail__noteworthy-list">
                                            {shelterInsights.map((insight, i) => (
                                                <li key={i}>{insight}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    <div className="animal-detail__shelter-cta">
                        {(() => {
                            const adoptUrl = animal.shelter.websiteUrl
                                || (animal.sources.length > 0 ? animal.sources[0].sourceUrl : null);
                            const isRescue = animal.shelter.shelterType === 'RESCUE' || animal.shelter.shelterType === 'FOSTER_BASED';
                            const ctaLabel = isRescue ? 'Go to rescue website →' : 'Go to shelter website →';
                            return adoptUrl ? (
                                <a
                                    href={adoptUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="animal-detail__adopt-btn"
                                >
                                    {ctaLabel}
                                </a>
                            ) : animal.shelter.phone ? (
                                <p className="animal-detail__shelter-fallback">Contact shelter by phone to inquire about adoption</p>
                            ) : null;
                        })()}
                    </div>
                </div>

                {/* --- Delta Since Intake --- */}
                {await (async () => {
                    const snapshots = await getAnimalSnapshots(animal.id);
                    if (snapshots.length < 2) return null;

                    const oldest = snapshots[snapshots.length - 1];
                    const newest = snapshots[0];

                    const changes: { label: string; from: string; to: string; direction: 'improved' | 'declined' | 'stable' }[] = [];

                    // BCS change
                    if (oldest.bodyConditionScore !== null && newest.bodyConditionScore !== null && oldest.bodyConditionScore !== newest.bodyConditionScore) {
                        const diff = newest.bodyConditionScore - oldest.bodyConditionScore;
                        // BCS closer to 4-5 = improvement
                        const oldDist = Math.min(Math.abs(oldest.bodyConditionScore - 4), Math.abs(oldest.bodyConditionScore - 5));
                        const newDist = Math.min(Math.abs(newest.bodyConditionScore - 4), Math.abs(newest.bodyConditionScore - 5));
                        changes.push({
                            label: 'Body condition',
                            from: `${oldest.bodyConditionScore}/9`,
                            to: `${newest.bodyConditionScore}/9`,
                            direction: newDist < oldDist ? 'improved' : newDist > oldDist ? 'declined' : diff > 0 ? 'improved' : 'declined',
                        });
                    }

                    // Coat change
                    if (oldest.coatCondition && newest.coatCondition && oldest.coatCondition !== newest.coatCondition) {
                        const coatRank: Record<string, number> = { poor: 0, fair: 1, good: 2 };
                        changes.push({
                            label: 'Coat condition',
                            from: oldest.coatCondition,
                            to: newest.coatCondition,
                            direction: (coatRank[newest.coatCondition] ?? 0) > (coatRank[oldest.coatCondition] ?? 0) ? 'improved' : 'declined',
                        });
                    }

                    // Stress change
                    if (oldest.stressLevel && newest.stressLevel && oldest.stressLevel !== newest.stressLevel) {
                        const stressRank: Record<string, number> = { low: 2, moderate: 1, high: 0 };
                        changes.push({
                            label: 'Stress level',
                            from: oldest.stressLevel,
                            to: newest.stressLevel,
                            direction: (stressRank[newest.stressLevel] ?? 0) > (stressRank[oldest.stressLevel] ?? 0) ? 'improved' : 'declined',
                        });
                    }

                    // Status change
                    if (oldest.status !== newest.status) {
                        changes.push({
                            label: 'Status',
                            from: oldest.status.charAt(0) + oldest.status.slice(1).toLowerCase(),
                            to: newest.status.charAt(0) + newest.status.slice(1).toLowerCase(),
                            direction: newest.status === 'URGENT' ? 'declined' : oldest.status === 'URGENT' ? 'improved' : 'stable',
                        });
                    }

                    if (changes.length === 0) return null;

                    const daysDiff = Math.round((new Date(newest.scrapedAt).getTime() - new Date(oldest.scrapedAt).getTime()) / (1000 * 60 * 60 * 24));

                    return (
                        <div className="animal-detail__delta">
                            <h2 className="animal-detail__delta-title">Changes Since Intake</h2>
                            <p className="animal-detail__delta-intro">
                                Since entering the shelter{daysDiff > 0 ? ` (${daysDiff} day${daysDiff !== 1 ? 's' : ''} ago)` : ''}, {animal.name || 'this animal'} has experienced:
                            </p>
                            <div className="animal-detail__delta-list">
                                {changes.map((c, i) => (
                                    <div key={i} className={`animal-detail__delta-item animal-detail__delta-item--${c.direction}`}>
                                        <span className="animal-detail__delta-label">{c.label}</span>
                                        <span className="animal-detail__delta-change">
                                            {c.from} → {c.to}
                                            <span className="animal-detail__delta-badge">
                                                {c.direction === 'improved' ? '↑ Improved' : c.direction === 'declined' ? '↓ Declined' : '— Changed'}
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })()}

                <p className="animal-detail__updated">
                    Last updated {new Date(animal.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
            </div>
        </div >
    );
}

