'use client';

import Link from 'next/link';
import Image from 'next/image';
import { SafeImage } from '@/components/SafeImage';
import { useState } from 'react';
import { formatScheduledDate, formatIntakeDate, hoursUntil, getUrgencyLevel, getGoldenYearsConfidence, getSaveRate, formatYearsRemaining } from '@/lib/utils';
import type { AnimalResult } from '@/lib/queries';

function CopyCardLink({ animalId }: { animalId: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const url = `${window.location.origin}/animal/${animalId}`;
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            const input = document.createElement('input');
            input.value = url;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <button
            className="animal-card__copy-link"
            onClick={handleCopy}
            aria-label="Copy link to this animal"
            type="button"
        >
            {copied ? '✓' : '🔗'}
        </button>
    );
}

interface AnimalGridProps {
    animals: AnimalResult[];
    totalCount: number;
    page: number;
    totalPages: number;
}

export function AnimalGrid({ animals, totalCount, page, totalPages }: AnimalGridProps) {
    return (
        <>
            <div className="listings-count">
                {totalPages > 1
                    ? `Showing ${animals.length} of ${totalCount} animals · Page ${page} of ${totalPages}`
                    : `Showing ${totalCount} animal${totalCount !== 1 ? 's' : ''}`
                }
            </div>

            <div className="card-grid">
                {animals.map((animal) => {
                    const hours = hoursUntil(animal.euthScheduledAt);
                    const urgency = getUrgencyLevel(hours);

                    // Shelter public data
                    const saveRate = getSaveRate(
                        animal.shelter?.totalIntakeAnnual ?? 0,
                        animal.shelter?.totalEuthanizedAnnual ?? 0,
                    );

                    const shelterAge = animal.ageKnownYears !== null
                        ? `${animal.ageKnownYears} yr${animal.ageKnownYears !== 1 ? 's' : ''}`
                        : '—';

                    const gyAge = (animal.ageEstimatedLow !== null && animal.ageEstimatedHigh !== null)
                        ? `${animal.ageEstimatedLow}–${animal.ageEstimatedHigh} yrs`
                        : 'Pending';

                    const confidence = getGoldenYearsConfidence(
                        animal.ageSource,
                        animal.ageConfidence,
                        animal.ageKnownYears,
                        animal.ageEstimatedLow,
                        animal.ageEstimatedHigh,
                        animal.lifeExpectancyLow,
                        animal.lifeExpectancyHigh,
                    );

                    const breedLifespan = (animal.lifeExpectancyLow && animal.lifeExpectancyHigh)
                        ? `${animal.lifeExpectancyLow}–${animal.lifeExpectancyHigh} yrs`
                        : '—';

                    // Golden Years remaining: range-against-range (handles near-end-of-life)
                    const goldenYearsRemaining = formatYearsRemaining(
                        animal.ageKnownYears,
                        animal.ageEstimatedLow,
                        animal.ageEstimatedHigh,
                        animal.lifeExpectancyLow,
                        animal.lifeExpectancyHigh,
                        { short: true },
                    );

                    // Days in shelter
                    let daysInShelter: number | null = null;
                    if (animal.intakeDate) {
                        const intake = new Date(animal.intakeDate);
                        const now = new Date();
                        daysInShelter = Math.max(0, Math.floor((now.getTime() - intake.getTime()) / (1000 * 60 * 60 * 24)));
                    }

                    const intakeDisplay = formatIntakeDate(animal.intakeDate);

                    return (
                        <Link
                            key={animal.id}
                            href={`/animal/${animal.id}`}
                            className="animal-card"
                        >
                            <div className="animal-card__image">
                                {animal.photoUrl ? (
                                    <SafeImage src={animal.photoUrl} alt={animal.name || 'Unnamed animal'} fill sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 640px" style={{ objectFit: 'cover' }} />
                                ) : (
                                    <Image src="/no-photo.svg" alt="Photo not available" fill sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 640px" style={{ objectFit: 'cover' }} />
                                )}
                                {/* Only show urgency badge when real euthanasia schedule exists */}
                                {urgency !== 'standard' && (
                                    <span className={`animal-card__urgency-badge ${urgency}`}>
                                        {urgency === 'critical' ? '< 24h' : urgency === 'urgent' ? '< 48h' : '< 72h'}
                                    </span>
                                )}
                                {animal.distance !== undefined && (
                                    <span className="animal-card__distance-badge">
                                        {animal.distance < 1 ? '< 1 mi' : `${Math.round(animal.distance)} mi`}
                                    </span>
                                )}
                                <CopyCardLink animalId={animal.id} />
                            </div>

                            <div className="animal-card__body">
                                <h2 className={`animal-card__name ${!animal.name ? 'unnamed' : ''}`}>
                                    {animal.name || 'Unnamed'}
                                </h2>
                                <p className="animal-card__sex">
                                    {animal.sex ? animal.sex.charAt(0) + animal.sex.slice(1).toLowerCase() : ''}
                                </p>
                                <p className="animal-card__shelter">
                                    {animal.shelter.name}
                                </p>
                                {(animal.shelter.county || animal.shelter.state || animal.shelter.phone) && (
                                    <p className="animal-card__shelter-location">
                                        {[animal.shelter.county, animal.shelter.state].filter(Boolean).join(', ')}
                                        {animal.shelter.phone && <span className="animal-card__shelter-phone"> · {animal.shelter.phone}</span>}
                                    </p>
                                )}

                                <div className="animal-card__details">
                                    <div className="animal-card__detail">
                                        <span className="animal-card__detail-label">Shelter estimate</span>
                                        <span className="animal-card__detail-value">{shelterAge}</span>
                                    </div>
                                    <div className="animal-card__detail">
                                        <span className="animal-card__detail-label animal-card__detail-label--gy">Golden Years estimate</span>
                                        <span className="gy-tooltip">
                                            <span className={`animal-card__detail-value ${gyAge !== 'Pending' ? 'cv-estimated' : ''}`}>{gyAge}</span>
                                            <span className="gy-tooltip__popup">
                                                <span className="gy-tooltip__label">Confidence</span>
                                                <span className="gy-tooltip__pct">{confidence.label} · {confidence.percent}%</span>
                                            </span>
                                        </span>
                                    </div>
                                    <div className="animal-card__detail">
                                        <span className="animal-card__detail-label">Breed life expectancy</span>
                                        <span className="gy-tooltip">
                                            <span className="animal-card__detail-value">{breedLifespan}</span>
                                            <span className="gy-tooltip__popup">
                                                <span className="gy-tooltip__label">Disclaimer</span>
                                                <span className="gy-tooltip__pct">Life expectancy value is based on AI approximations of breed mix</span>
                                            </span>
                                        </span>
                                    </div>
                                    {goldenYearsRemaining && (
                                        <div className="animal-card__golden-remaining">
                                            <span className="animal-card__golden-remaining-label">Golden Years remaining</span>
                                            <span className="animal-card__golden-remaining-value">{goldenYearsRemaining}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="animal-card__footer">
                                <div className="animal-card__death-marker">
                                    {intakeDisplay && (
                                        <>
                                            <span className="animal-card__death-marker-label">Intake</span>
                                            <span className="animal-card__death-marker-time standard">
                                                {intakeDisplay}
                                            </span>
                                        </>
                                    )}
                                    {animal.euthScheduledAt ? (
                                        <>
                                            <span className="animal-card__death-marker-label">Scheduled</span>
                                            <span className={`animal-card__death-marker-time ${urgency}`}>
                                                {formatScheduledDate(animal.euthScheduledAt)}
                                            </span>
                                        </>
                                    ) : saveRate !== null ? (
                                        <div className="animal-card__shelter-stats">
                                            <div className="animal-card__shelter-stats-header">
                                                <span className="gy-tooltip">
                                                    <span className="animal-card__shelter-stats-label">Live release rate</span>
                                                    <span className="gy-tooltip__popup">
                                                        <span className="gy-tooltip__label">What is this?</span>
                                                        <span className="gy-tooltip__pct">The percentage of animals that leave this shelter alive — via adoption, rescue, or transfer — rather than being euthanized. A lower rate means higher euthanasia risk.</span>
                                                    </span>
                                                </span>
                                                <span className={`animal-card__shelter-stats-pct ${saveRate >= 90 ? 'high' : saveRate >= 50 ? 'mid' : 'low'}`}>
                                                    {saveRate}%
                                                </span>
                                            </div>
                                            <div className="animal-card__shelter-stats-bar">
                                                <div
                                                    className={`animal-card__shelter-stats-fill ${saveRate >= 90 ? 'high' : saveRate >= 50 ? 'mid' : 'low'}`}
                                                    style={{ width: `${Math.min(saveRate, 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <span className="animal-card__death-marker-label">Status</span>
                                            <span className="animal-card__death-marker-time standard">
                                                {(animal.shelter as any).shelterType === 'RESCUE' ? 'In Rescue'
                                                    : (animal.shelter as any).shelterType === 'NO_KILL' ? 'In No-Kill Shelter'
                                                        : (animal.shelter as any).shelterType === 'FOSTER_BASED' ? 'In Foster'
                                                            : 'In Shelter'}
                                            </span>
                                        </>
                                    )}
                                    {daysInShelter !== null && (
                                        <div className="animal-card__days-in-shelter">
                                            {daysInShelter === 0 ? 'Arrived today'
                                                : `${daysInShelter} day${daysInShelter !== 1 ? 's' : ''} ${(animal.shelter as any).shelterType === 'RESCUE' ? 'in rescue' : (animal.shelter as any).shelterType === 'NO_KILL' ? 'in no-kill shelter' : (animal.shelter as any).shelterType === 'FOSTER_BASED' ? 'in foster' : 'in shelter'}`}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </>
    );
}
