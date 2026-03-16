import Link from 'next/link';
import { SafeImage } from '@/components/SafeImage';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAnimalById, getAnimalForMetadata, getBreedCommonConditions, getShelterInsights } from '@/lib/queries';
import { formatDeathMarker, hoursUntil, getUrgencyLevel, formatIntakeReason, formatYearsRemaining, getAgeDiscrepancy, getGoldenYearsConfidence, computeHealthScore, getSaveRate, getBestAge, cleanDisplayText, getRecommendedMinSqft, formatShelterLocation } from '@/lib/utils';
import { getMatchProfiles } from '@/lib/match-profiles';
import { trackPageView } from '@/lib/track';
import { CopyLinkButton } from '@/components/copy-link-button';
import { BackButton } from '@/components/back-button';
import { PhotoGallery } from '@/components/photo-gallery';
import { ShelterStatsCharts } from '@/components/shelter-stats-charts';

import type { AnimalWithShelterAndSources } from '@/lib/types';

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

    // Fire-and-forget analytics
    if (animal) {
        trackPageView({ path: `/animal/${id}`, animalId: id, shelterId: animal.shelterId });
    }

    if (error) {
        return (
            <div className="animal-detail">
                <div className="container">
                    <BackButton />
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
    const saveRate = getSaveRate(animal.shelter.totalIntakeAnnual, animal.shelter.totalEuthanizedAnnual);
    const shelterInsights = await getShelterInsights(animal.shelterId);
    const intakeReasonDisplay = formatIntakeReason(animal.intakeReason, animal.intakeReasonDetail);
    const a = animal.assessment;
    const l = animal.listing;
    const e = animal.enrichment;
    const yearsRemainingShort = formatYearsRemaining(
        animal.ageKnownYears,
        a?.ageEstimatedLow ?? null,
        a?.ageEstimatedHigh ?? null,
        a?.lifeExpectancyLow ?? null,
        a?.lifeExpectancyHigh ?? null,
        { short: true },
    );
    const yearsRemaining = formatYearsRemaining(
        animal.ageKnownYears,
        a?.ageEstimatedLow ?? null,
        a?.ageEstimatedHigh ?? null,
        a?.lifeExpectancyLow ?? null,
        a?.lifeExpectancyHigh ?? null,
    );
    const ageDiscrepancy = getAgeDiscrepancy(
        animal.ageKnownYears,
        a?.ageEstimatedLow ?? null,
        a?.ageEstimatedHigh ?? null,
        a?.ageConfidence ?? 'NONE',
    );

    const confidence = getGoldenYearsConfidence(
        animal.ageSource,
        a?.ageConfidence ?? 'NONE',
        animal.ageKnownYears,
        a?.ageEstimatedLow ?? null,
        a?.ageEstimatedHigh ?? null,
        a?.lifeExpectancyLow ?? null,
        a?.lifeExpectancyHigh ?? null,
    );

    // Derived display values (mirroring card logic)
    const shelterAge = animal.ageKnownYears !== null
        ? `${animal.ageKnownYears} yr${animal.ageKnownYears !== 1 ? 's' : ''}`
        : '—';
    const gyAge = (a?.ageEstimatedLow != null && a?.ageEstimatedHigh != null)
        ? `${a.ageEstimatedLow}–${a.ageEstimatedHigh} yrs`
        : 'Pending';
    const shelterBreed = animal.breed || '—';
    const gyBreed = (a?.detectedBreeds?.length ?? 0) > 0
        ? a!.detectedBreeds.slice(0, 3).join(' / ')
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
        const breeds = [...(a?.detectedBreeds || []), animal.breed || ''].map(b => b.toLowerCase());
        for (const breed of breeds) {
            for (const [key, size] of Object.entries(breedSizes)) {
                if (breed.includes(key)) return { text: `Likely ${size.toLowerCase()}`, inferred: true };
            }
        }
        return null;
    })();

    const breedLifespan = (a?.lifeExpectancyLow && a?.lifeExpectancyHigh)
        ? `${a.lifeExpectancyLow}–${a.lifeExpectancyHigh} yrs`
        : '—';

    return (
        <div className="animal-detail">
            <div className="container">
                <BackButton />

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
                        <span>This could mean the animal was adopted, transferred, pulled by a rescue, or euthanized.</span>
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
                            const allPhotos = [...new Set([animal.photoUrl, ...(animal.photoUrls || [])].filter(Boolean))] as string[];
                            if (allPhotos.length > 1 || animal.videoUrl) {
                                return <PhotoGallery photos={allPhotos} name={animal.name || 'Unnamed animal'} videoUrl={animal.videoUrl} />;
                            }
                            return animal.photoUrl ? (
                                <SafeImage src={animal.photoUrl} alt={animal.name || 'Unnamed animal'} fill sizes="(max-width: 768px) 100vw, 50vw" style={{ objectFit: 'contain' }} priority />
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
                        {(() => {
                            const locationStr = formatShelterLocation(animal.shelter);
                            if (!locationStr && !animal.shelter.phone) return null;
                            return (
                                <p className="animal-detail__location-phone">
                                    {locationStr}
                                    {animal.shelter.phone && <span className="animal-detail__inline-phone">{locationStr ? ' · ' : ''}📞 <a href={`tel:${animal.shelter.phone.replace(/\D/g, '')}`}>{animal.shelter.phone}</a></span>}
                                </p>
                            );
                        })()}

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
                                            <span className="gy-tooltip__pct">{a?.breedConfidence === 'HIGH' ? 'High' : a?.breedConfidence === 'MEDIUM' ? 'Moderate' : a?.breedConfidence === 'LOW' ? 'Low' : 'Pending'}</span>
                                        </span>
                                    </span>
                                </div>
                            )}
                            {breedLifespan !== '—' && (
                                <div className="animal-detail__detail-row">
                                    <span className="animal-detail__detail-label">Breed life expectancy</span>
                                    <span className="animal-detail__detail-value">{breedLifespan}</span>
                                </div>
                            )}
                            {yearsRemainingShort && (
                                <div className="animal-detail__detail-row">
                                    <span className="animal-detail__detail-label">Golden Years remaining</span>
                                    <span className="animal-detail__detail-value cv-estimated">{yearsRemainingShort}</span>
                                </div>
                            )}
                            {sizeDisplay && (
                                <div className="animal-detail__detail-row">
                                    <span className="animal-detail__detail-label">Size</span>
                                    <span className={`animal-detail__detail-value ${sizeDisplay.inferred ? 'cv-estimated' : ''}`}>{sizeDisplay.text}</span>
                                </div>
                            )}
                            {l?.weight && (
                                <div className="animal-detail__detail-row">
                                    <span className="animal-detail__detail-label">Weight</span>
                                    <span className="animal-detail__detail-value">{l.weight}</span>
                                </div>
                            )}
                            {!l?.weight && a?.estimatedWeightLbs && (
                                <div className="animal-detail__detail-row">
                                    <span className="animal-detail__detail-label">Est. weight</span>
                                    <span className="animal-detail__detail-value cv-estimated">~{a.estimatedWeightLbs} lbs</span>
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
                            {animal.shelterEntryCount > 1 && (
                                <div className="animal-detail__detail-row" style={{ gridColumn: '1 / -1' }}>
                                    <span className="animal-detail__detail-label">Shelter re-entry</span>
                                    <span className="animal-detail__detail-value cv-estimated">🔄 Entry #{animal.shelterEntryCount} in the shelter system</span>
                                </div>
                            )}
                        </div>

                        {/* Match Profile Badges (exclude families badge — shown in report card) */}
                        {(() => {
                            const badges = getMatchProfiles(a).filter(b => b.label !== 'Good with families');
                            if (badges.length === 0) return null;
                            return (
                                <div className="animal-detail__match-badges">
                                    {badges.map(b => (
                                        <span key={b.label} className="animal-detail__match-badge">
                                            {b.icon} {b.label}
                                        </span>
                                    ))}
                                </div>
                            );
                        })()}

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

                    {/* Good with families — individual compatibility chips */}
                    {(() => {
                        const familiesBadge = getMatchProfiles(a).find(b => b.label === 'Good with families');
                        if (!familiesBadge) return null;
                        const chips: { icon: string; label: string }[] = [];
                        if (l?.goodWithChildren) chips.push({ icon: '👶', label: 'Good with children' });
                        if (l?.goodWithDogs) chips.push({ icon: '🐕', label: 'Good with dogs' });
                        if (l?.goodWithCats) chips.push({ icon: '🐈', label: 'Good with cats' });
                        if (a?.aggressionRisk != null && a.aggressionRisk <= 2) chips.push({ icon: '🤝', label: 'Low aggression' });
                        if (a?.stressLevel === 'low') chips.push({ icon: '😌', label: 'Low stress' });
                        if (a?.energyLevel === 'moderate' || a?.energyLevel === 'low') chips.push({ icon: '🧘', label: 'Calm energy' });
                        if (chips.length === 0) chips.push({ icon: '👨‍👩‍👧', label: 'Good with families' });
                        return (
                            <div className="animal-detail__report-section animal-detail__report-section--highlight">
                                <h3>👨‍👩‍👧 Family Friendly</h3>
                                <div className="animal-detail__match-chips">
                                    {chips.map(c => (
                                        <span key={c.label} className="animal-detail__match-chip">
                                            {c.icon} {c.label}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

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
                            {a?.lifeExpectancyLow != null && a?.lifeExpectancyHigh != null && (
                                <p className="animal-detail__report-detail">
                                    Typical lifespan: {a.lifeExpectancyLow}–{a.lifeExpectancyHigh} years
                                    {(a?.detectedBreeds?.length ?? 0) > 0 && ` · Breed: ${a!.detectedBreeds.slice(0, 3).join(' / ')}`}
                                </p>
                            )}
                        </div>
                    )}

                    {(ageDiscrepancy || (a?.ageEstimatedLow != null && a?.ageEstimatedHigh != null)) && (
                        <div className="animal-detail__report-section">
                            <h3>Age Analysis</h3>
                            {a?.ageEstimatedLow != null && a?.ageEstimatedHigh != null && (
                                <p>
                                    Computer vision estimates {a.ageEstimatedLow}–{a.ageEstimatedHigh} years
                                    ({a.ageConfidence === 'HIGH' ? 'high' : a.ageConfidence === 'MEDIUM' ? 'moderate' : 'low'} confidence).
                                </p>
                            )}
                            {(a?.ageIndicators?.length ?? 0) > 0 && (
                                <div className="animal-detail__report-tags">
                                    {a!.ageIndicators.map((ind: string, i: number) => (
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

                    {cleanDisplayText(animal.notes) && (
                        <div className="animal-detail__report-section">
                            <h3>Notes from listing</h3>
                            <p>{cleanDisplayText(animal.notes)}</p>
                        </div>
                    )}

                    {/* --- Health Assessment --- */}
                    {await (async () => {
                        const bestAge = getBestAge(animal.ageKnownYears, a?.ageEstimatedLow ?? null, a?.ageEstimatedHigh ?? null, animal.ageSource);
                        const breedConditions = await getBreedCommonConditions(a?.detectedBreeds || []);
                        const health = computeHealthScore(
                            a?.bodyConditionScore ?? null,
                            a?.coatCondition ?? null,
                            a?.visibleConditions ?? [],
                            a?.stressLevel ?? null,
                            a?.fearIndicators ?? [],
                            a?.estimatedCareLevel ?? null,
                            {
                                notes: animal.notes,
                                healthNotes: a?.healthNotes ?? null,
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
                    {/* --- Dental & Eye Health (from close-up assessment) --- */}
                    {(a?.dentalGrade || a?.cataractStage) && (
                        <div className="animal-detail__report-section">
                            <h3>Dental &amp; Eye Health</h3>
                            {a?.dentalGrade && (
                                <p>
                                    <strong>Dental Grade: {a.dentalGrade}/4</strong>
                                    {a.tartarSeverity && ` · Tartar: ${a.tartarSeverity}`}
                                    {a.dentalNotes && <><br /><span style={{ color: 'var(--color-text-dim)', fontSize: 'var(--font-size-xs)' }}>{a.dentalNotes}</span></>}
                                </p>
                            )}
                            {a?.cataractStage && a.cataractStage !== 'none' && (
                                <p>
                                    <strong>Cataracts: {a.cataractStage}</strong>
                                    {a.eyeNotes && <><br /><span style={{ color: 'var(--color-text-dim)', fontSize: 'var(--font-size-xs)' }}>{a.eyeNotes}</span></>}
                                </p>
                            )}
                            {a?.cataractStage === 'none' && (
                                <p>Eyes: Clear, no cataracts detected</p>
                            )}
                        </div>
                    )}

                    {/* --- Up to Shelter / Rescue Discretion --- */}
                    {(() => {
                        const homeSizeRec = getRecommendedMinSqft(a?.estimatedWeightLbs ?? null, a?.energyLevel ?? null, a?.mobilityAssessment ?? null);
                        if (!homeSizeRec) return null;
                        return (
                            <div className="animal-detail__report-section animal-detail__report-section--discretion">
                                <h3>Shelter / Rescue Discretion</h3>
                                <p className="animal-detail__report-detail">
                                    Recommended minimum home size: <strong>~{homeSizeRec.sqft} sqft</strong> ({homeSizeRec.label})
                                </p>
                                <p className="animal-detail__report-disclaimer">
                                    Based on estimated weight, energy level, and mobility. Actual requirements are up to the shelter or rescue&apos;s application process.
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
                        {(() => {
                            const locationStr = formatShelterLocation(animal.shelter, { includeZip: true });
                            return locationStr ? <p>{locationStr}</p> : null;
                        })()}
                        {animal.shelter.phone ? (
                            <p className="animal-detail__shelter-phone-line">
                                📞 <a href={`tel:${animal.shelter.phone.replace(/\D/g, '')}`}>{animal.shelter.phone}</a>
                            </p>
                        ) : (
                            <p className="animal-detail__shelter-phone-line">📞 Phone not available</p>
                        )}
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
                            const isRescue = animal.shelter.shelterType === 'RESCUE' || animal.shelter.shelterType === 'NO_KILL' || animal.shelter.shelterType === 'FOSTER_BASED';
                            const ctaLabel = isRescue ? 'Go to rescue website →' : 'Go to shelter website →';
                            return (
                                <div className="animal-detail__shelter-cta-row">
                                    {adoptUrl ? (
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
                                    ) : (
                                        <p className="animal-detail__shelter-fallback">
                                            Search for &ldquo;{animal.shelter.name}&rdquo; online to find their contact information and adoption process
                                        </p>
                                    )}
                                    <Link
                                        href={`/shelter/${animal.shelter.id}?from=${encodeURIComponent(animal.name || 'Unnamed')}`}
                                        className="animal-detail__adopt-btn animal-detail__report-card-btn"
                                    >
                                        Go to Report Card →
                                    </Link>
                                </div>
                            );
                        })()}
                    </div>
                </div>

                <p className="animal-detail__updated">
                    Last updated {new Date(animal.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
            </div>
        </div >
    );
}

