import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getShelterById, getShelterForMetadata, getStatePolicyForShelter, getShelterStoryInsights } from '@/lib/queries';
import type { AnimalResult } from '@/lib/queries';
import {
    getSaveRate, getPerCapitaIntake, getYoYTrend, getTransferRate, toTitleCase,
} from '@/lib/utils';
import type { ShelterWithAnimals, Animal } from '@/lib/types';
import { CopyLinkButton } from '@/components/copy-link-button';
import { BackButton } from '@/components/back-button';
import { ShelterAnimals } from '@/app/shelter/shelter-animals';
import { SeniorCensus } from '@/app/shelter/senior-census';

export const revalidate = 300;

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
        const displayName = toTitleCase(shelter.name);
        const title = `${displayName} | Golden Years Club`;
        const description = `${displayName} in ${toTitleCase(shelter.county)} County, ${shelter.state}. ${shelter.animals.length} senior animals currently listed.${saveRate !== null ? ` ${saveRate}% live release rate.` : ''}`;

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

/* ── Helpers ── */
const TYPE_LABELS: Record<string, { label: string; icon: string }> = {
    MUNICIPAL: { label: 'Municipal Shelter', icon: '🏛️' },
    RESCUE: { label: 'Rescue Organization', icon: '🤝' },
    NO_KILL: { label: 'No-Kill Shelter', icon: '💛' },
    FOSTER_BASED: { label: 'Foster-Based Rescue', icon: '🏡' },
};

function buildMapUrl(shelter: ShelterWithAnimals): string | null {
    if (shelter.latitude && shelter.longitude) {
        return `https://www.google.com/maps/search/?api=1&query=${shelter.latitude},${shelter.longitude}`;
    }
    if (shelter.address) {
        const q = encodeURIComponent(`${shelter.address}, ${shelter.county} County, ${shelter.state}`);
        return `https://www.google.com/maps/search/?api=1&query=${q}`;
    }
    return null;
}

function computeAvgDaysInShelter(animals: Animal[]): number | null {
    const withDays = animals.filter((a) => a.intakeDate);
    if (withDays.length === 0) return null;
    const now = Date.now();
    const total = withDays.reduce((sum, a) => {
        const days = Math.max(0, Math.floor((now - new Date(a.intakeDate!).getTime()) / 86_400_000));
        return sum + days;
    }, 0);
    return Math.round(total / withDays.length);
}

export default async function ShelterDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ from?: string }>;
}) {
    const { id } = await params;
    const { from: fromAnimalName } = await searchParams;

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
                    <BackButton label={fromAnimalName ? `← Back to ${fromAnimalName}` : undefined} />
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

    // ── Existing computations ──
    const saveRate = getSaveRate(shelter.totalIntakeAnnual, shelter.totalEuthanizedAnnual);
    const hasData = shelter.totalIntakeAnnual > 0;
    const perCapita = getPerCapitaIntake(shelter.totalIntakeAnnual, shelter.countyPopulation);
    const yoyTrend = getYoYTrend(shelter.totalIntakeAnnual, shelter.totalEuthanizedAnnual, shelter.priorYearIntake, shelter.priorYearEuthanized);
    const transferRate = getTransferRate(shelter.totalTransferred, shelter.totalIntakeAnnual);
    const mapUrl = buildMapUrl(shelter);
    const typeInfo = TYPE_LABELS[shelter.shelterType] || TYPE_LABELS.MUNICIPAL;
    const avgDays = computeAvgDaysInShelter(shelter.animals);
    const storyInsights = await getShelterStoryInsights(id);

    // ── Report Card: State policy ──
    const statePolicy = await getStatePolicyForShelter(shelter.state);
    const hasPolicy = statePolicy && (
        statePolicy.holdingPeriodDays !== null ||
        statePolicy.spayNeuterRequired !== null ||
        statePolicy.mandatoryReporting !== null
    );

    return (
        <div className="shelter-detail">
            <div className="container">
                <BackButton label={fromAnimalName ? `← Back to ${fromAnimalName}` : undefined} />

                {/* ═══════════════════ HERO HEADER ═══════════════════ */}
                <div className="shelter-hero">
                    <div className="shelter-hero__top">
                        <div className="shelter-hero__identity">
                            <span className="shelter-hero__type-badge">
                                {typeInfo.icon} {typeInfo.label} ({shelter.animals.length})
                            </span>
                            <h1 className="shelter-hero__name">
                                {toTitleCase(shelter.name)}
                                <CopyLinkButton />
                            </h1>
                            <p className="shelter-hero__location">
                                {toTitleCase(shelter.county)} County, {shelter.state}
                                {shelter.zipCode && ` ${shelter.zipCode}`}
                            </p>
                        </div>
                    </div>

                    {/* Contact row */}
                    <div className="shelter-hero__contact">
                        {shelter.address && (
                            <div className="shelter-hero__contact-item">
                                <span className="shelter-hero__contact-icon">📍</span>
                                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shelter.address + ', ' + shelter.county + ' County, ' + shelter.state)}`}>
                                    {shelter.address}
                                </a>
                            </div>
                        )}
                        {shelter.phone && (
                            <div className="shelter-hero__contact-item">
                                <span className="shelter-hero__contact-icon">📞</span>
                                <span className="shelter-hero__phone-text">{shelter.phone}</span>
                                <a href={`tel:${shelter.phone.replace(/\D/g, '')}`} className="shelter-hero__phone-link">{shelter.phone}</a>
                            </div>
                        )}
                        {shelter.websiteUrl && (
                            <div className="shelter-hero__contact-item">
                                <span className="shelter-hero__contact-icon">🌐</span>
                                <a href={shelter.websiteUrl} target="_blank" rel="noopener noreferrer">
                                    Website
                                </a>
                            </div>
                        )}
                        {shelter.facebookUrl && (
                            <div className="shelter-hero__contact-item">
                                <span className="shelter-hero__contact-icon">📘</span>
                                <a href={shelter.facebookUrl} target="_blank" rel="noopener noreferrer">
                                    Facebook
                                </a>
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══════════════════ REPORT CARD ═══════════════════ */}
                {(hasData || shelter.animals.length > 0 || hasPolicy) && (
                    <div className="report-card">

                        {/* ─── AT A GLANCE: Storytelling Insights ─── */}
                        {storyInsights.length > 0 && (
                            <div className="shelter-story">
                                <h3 className="shelter-story__title">At a Glance</h3>
                                <ul className="shelter-story__list">
                                    {storyInsights.map((insight, i) => (
                                        <li key={i} className="shelter-story__item">{insight}</li>
                                    ))}
                                </ul>
                                {shelter.financials?.proPublicaUrl && (
                                    <p className="shelter-story__attribution">
                                        Financial data via{' '}
                                        <a href={shelter.financials.proPublicaUrl} target="_blank" rel="noopener noreferrer">
                                            ProPublica Nonprofit Explorer ↗
                                        </a>
                                    </p>
                                )}
                            </div>
                        )}

                        {/* ─── SECTION 1: Operations Snapshot ─── */}
                        {hasData && (
                            <details className="report-card__section" open>
                                <summary className="report-card__section-header">
                                    <span className="report-card__section-icon">📊</span>
                                    <span className="report-card__section-title">
                                        Operations Snapshot
                                        {shelter.dataYear && <span className="report-card__section-year"> · {shelter.dataYear}</span>}
                                    </span>
                                    <span className="report-card__chevron">▸</span>
                                </summary>
                                <div className="report-card__section-body">
                                    {shelter.dataSourceName && (
                                        <p className="report-card__source">
                                            Source:{' '}
                                            {shelter.dataSourceUrl ? (
                                                <a href={shelter.dataSourceUrl} target="_blank" rel="noopener noreferrer">
                                                    {shelter.dataSourceName} ↗
                                                </a>
                                            ) : shelter.dataSourceName}
                                        </p>
                                    )}
                                    <div className="report-card__stats-grid">
                                        <div className="report-card__stat">
                                            <span className="report-card__stat-value">{shelter.totalIntakeAnnual.toLocaleString()}</span>
                                            <span className="report-card__stat-label">Intake</span>
                                        </div>
                                        <div className="report-card__stat">
                                            <span className="report-card__stat-value report-card__stat-value--euth">{shelter.totalEuthanizedAnnual.toLocaleString()}</span>
                                            <span className="report-card__stat-label">Euthanized</span>
                                        </div>
                                        {shelter.totalReturnedToOwner !== null && shelter.totalReturnedToOwner > 0 && (
                                            <div className="report-card__stat">
                                                <span className="report-card__stat-value">{shelter.totalReturnedToOwner.toLocaleString()}</span>
                                                <span className="report-card__stat-label">Returned to Owner</span>
                                            </div>
                                        )}
                                        {shelter.totalTransferred !== null && shelter.totalTransferred > 0 && (
                                            <div className="report-card__stat">
                                                <span className="report-card__stat-value">{shelter.totalTransferred.toLocaleString()}</span>
                                                <span className="report-card__stat-label">Transferred</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Secondary Metrics */}
                                    {(perCapita !== null || yoyTrend || transferRate !== null) && (
                                        <div className="report-card__metrics">
                                            {perCapita !== null && (
                                                <div className="report-card__metric">
                                                    <span className="report-card__metric-label">Per Capita Intake</span>
                                                    <span className="report-card__metric-value">
                                                        {perCapita} <small>per 100 residents</small>
                                                    </span>
                                                </div>
                                            )}
                                            {yoyTrend && (
                                                <div className="report-card__metric">
                                                    <span className="report-card__metric-label">
                                                        Save Rate vs. {shelter.priorDataYear}
                                                    </span>
                                                    <span className={`report-card__metric-value report-card__metric-value--${yoyTrend.direction}`}>
                                                        {yoyTrend.direction === 'up' ? '↑' : yoyTrend.direction === 'down' ? '↓' : '→'}
                                                        {' '}{Math.abs(yoyTrend.delta)}%
                                                    </span>
                                                </div>
                                            )}
                                            {transferRate !== null && (
                                                <div className="report-card__metric">
                                                    <span className="report-card__metric-label">Transferred to Rescues</span>
                                                    <span className="report-card__metric-value">{transferRate}%</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </details>
                        )}

                        {/* ─── SECTION 2: Senior Census & Health ─── */}
                        {shelter.animals.length > 0 && (
                            <SeniorCensus animals={shelter.animals} />
                        )}

                        {/* ─── SECTION 3: Live Release Rate Benchmark ─── */}
                        {saveRate !== null && (
                            <details className="report-card__section" open>
                                <summary className="report-card__section-header">
                                    <span className="report-card__section-icon">📈</span>
                                    <span className="report-card__section-title">Live Release Rate</span>
                                    <span className="report-card__chevron">▸</span>
                                </summary>
                                <div className="report-card__section-body">
                                    <p className="report-card__explainer">
                                        The percentage of animals that leave the shelter alive — adopted, transferred, or returned to their owner.
                                    </p>
                                    <div className="report-card__benchmark">
                                        {/* This shelter */}
                                        <div className="report-card__benchmark-row">
                                            <span className="report-card__benchmark-label">This Shelter</span>
                                            <div className="report-card__benchmark-track">
                                                <div
                                                    className={`report-card__benchmark-fill ${saveRate >= 90 ? 'report-card__benchmark-fill--great' : saveRate >= 70 ? 'report-card__benchmark-fill--ok' : 'report-card__benchmark-fill--low'}`}
                                                    style={{ width: `${Math.min(saveRate, 100)}%` }}
                                                />
                                            </div>
                                            <span className="report-card__benchmark-value">{saveRate}%</span>
                                        </div>
                                        {/* National median */}
                                        <div className="report-card__benchmark-row report-card__benchmark-row--ref">
                                            <span className="report-card__benchmark-label">National Median</span>
                                            <div className="report-card__benchmark-track">
                                                <div className="report-card__benchmark-fill report-card__benchmark-fill--ref" style={{ width: '78%' }} />
                                            </div>
                                            <span className="report-card__benchmark-value">~78%</span>
                                        </div>
                                        {/* No-Kill benchmark */}
                                        <div className="report-card__benchmark-row report-card__benchmark-row--ref">
                                            <span className="report-card__benchmark-label">No-Kill Standard</span>
                                            <div className="report-card__benchmark-track">
                                                <div className="report-card__benchmark-fill report-card__benchmark-fill--target" style={{ width: '90%' }} />
                                            </div>
                                            <span className="report-card__benchmark-value">90%</span>
                                        </div>
                                    </div>
                                </div>
                            </details>
                        )}

                        {/* ─── SECTION 4: Know Before You Visit ─── */}
                        {hasPolicy && (
                            <details className="report-card__section">
                                <summary className="report-card__section-header">
                                    <span className="report-card__section-icon">📋</span>
                                    <span className="report-card__section-title">Know Before You Visit</span>
                                    <span className="report-card__chevron">▸</span>
                                </summary>
                                <div className="report-card__section-body">
                                    <ul className="report-card__policy-list">
                                        {statePolicy!.holdingPeriodDays !== null && (
                                            <li className="report-card__policy-item">
                                                <span className="report-card__policy-icon">⏱️</span>
                                                <div>
                                                    <strong>{statePolicy!.holdingPeriodDays}-day hold period</strong>
                                                    <p>Animals must be held at least {statePolicy!.holdingPeriodDays} days before they can be adopted or euthanized.</p>
                                                </div>
                                            </li>
                                        )}
                                        {statePolicy!.spayNeuterRequired !== null && (
                                            <li className="report-card__policy-item">
                                                <span className="report-card__policy-icon">✂️</span>
                                                <div>
                                                    <strong>Spay/neuter {statePolicy!.spayNeuterRequired ? 'required' : 'not required'} before adoption</strong>
                                                    <p>{statePolicy!.spayNeuterRequired
                                                        ? 'This state requires animals to be spayed or neutered before leaving the shelter.'
                                                        : 'This state does not require spay/neuter before adoption — ask the shelter about their policy.'}
                                                    </p>
                                                </div>
                                            </li>
                                        )}
                                        {statePolicy!.mandatoryReporting !== null && (
                                            <li className="report-card__policy-item">
                                                <span className="report-card__policy-icon">📝</span>
                                                <div>
                                                    <strong>
                                                        {statePolicy!.mandatoryReporting
                                                            ? `Reports to ${statePolicy!.reportingBody || 'the state'}`
                                                            : 'No mandatory reporting'}
                                                    </strong>
                                                    <p>{statePolicy!.mandatoryReporting
                                                        ? 'This shelter is required to publicly report intake and outcome data to the state.'
                                                        : 'This state does not require shelters to publicly report their statistics.'}
                                                    </p>
                                                </div>
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            </details>
                        )}
                    </div>
                )}



                {/* ═══════════════════ ANIMALS AT THIS SHELTER ═══════════════════ */}
                <ShelterAnimals
                    animals={shelter.animals.map((a: Animal) => ({ ...a, shelter } as AnimalResult))}
                />

                {/* ═══════════════ FOOTER ═══════════════ */}
                <p className="shelter-detail__updated">
                    Last updated {new Date(shelter.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>

            </div>
        </div>
    );
}
