'use client';

/**
 * TrendSection — Client wrapper for sparkline charts
 *
 * Receives serialized snapshot data from the server component (page.tsx)
 * and renders SparklineChart components for BCS, stress, and coat trends.
 */

import { SparklineChart, type SparklinePoint } from './sparkline-chart';

interface SnapshotData {
    scrapedAt: string;
    bodyConditionScore: number | null;
    coatCondition: string | null;
    stressLevel: string | null;
}

interface TrendSectionProps {
    snapshots: SnapshotData[];
    animalName: string;
}

const STRESS_MAP: Record<string, number> = { low: 1, moderate: 2, high: 3 };
const STRESS_LABELS: Record<number, string> = { 1: 'Low', 2: 'Moderate', 3: 'High' };

const COAT_MAP: Record<string, number> = { poor: 1, fair: 2, good: 3 };
const COAT_LABELS: Record<number, string> = { 1: 'Poor', 2: 'Fair', 3: 'Good' };

export function TrendSection({ snapshots, animalName }: TrendSectionProps) {
    if (snapshots.length < 2) return null;

    // Build series
    const bcsSeries: SparklinePoint[] = [];
    const stressSeries: SparklinePoint[] = [];
    const coatSeries: SparklinePoint[] = [];

    for (const snap of snapshots) {
        const date = new Date(snap.scrapedAt);

        if (snap.bodyConditionScore !== null) {
            bcsSeries.push({ date, value: snap.bodyConditionScore, label: `${snap.bodyConditionScore}/9` });
        }
        if (snap.stressLevel && STRESS_MAP[snap.stressLevel] !== undefined) {
            const val = STRESS_MAP[snap.stressLevel];
            stressSeries.push({ date, value: val, label: STRESS_LABELS[val] });
        }
        if (snap.coatCondition && COAT_MAP[snap.coatCondition] !== undefined) {
            const val = COAT_MAP[snap.coatCondition];
            coatSeries.push({ date, value: val, label: COAT_LABELS[val] });
        }
    }

    const hasBcs = bcsSeries.length >= 2;
    const hasStress = stressSeries.length >= 2;
    const hasCoat = coatSeries.length >= 2;

    if (!hasBcs && !hasStress && !hasCoat) return null;

    const oldest = new Date(snapshots[snapshots.length - 1].scrapedAt);
    const newest = new Date(snapshots[0].scrapedAt);
    const daysDiff = Math.round((newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24));

    return (
        <div className="animal-detail__report-section">
            <h3>Changes Since Intake</h3>
            <p className="animal-detail__delta-intro">
                Tracking {animalName || 'this animal'}&apos;s condition over
                {daysDiff > 0 ? ` ${daysDiff} day${daysDiff !== 1 ? 's' : ''}` : ' time'}
                {' '}with {snapshots.length} assessments:
            </p>
            <div className="sparkline-grid">
                {hasBcs && (
                    <SparklineChart
                        data={bcsSeries}
                        label="Body Condition (BCS)"
                        domain={[1, 9]}
                        colorDirection="green-high"
                        idealBand={[4, 5]}
                        formatValue={(v) => `${v}/9`}
                    />
                )}
                {hasStress && (
                    <SparklineChart
                        data={stressSeries}
                        label="Shelter Stress"
                        domain={[1, 3]}
                        colorDirection="green-low"
                        formatValue={(v) => STRESS_LABELS[v] || String(v)}
                    />
                )}
                {hasCoat && (
                    <SparklineChart
                        data={coatSeries}
                        label="Coat Condition"
                        domain={[1, 3]}
                        colorDirection="green-high"
                        formatValue={(v) => COAT_LABELS[v] || String(v)}
                    />
                )}
            </div>
        </div>
    );
}
