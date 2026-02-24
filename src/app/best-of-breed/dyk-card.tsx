'use client';

import { useState } from 'react';
import Link from 'next/link';

export function DidYouKnowCard({ noKillPercent }: { noKillPercent: number }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <button
            className={`wof__dyk ${expanded ? 'wof__dyk--open' : ''}`}
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
        >
            <div className="wof__dyk-header">
                <span className="wof__dyk-title"><strong>Did you know?</strong></span>
                <span className="wof__dyk-chevron">{expanded ? '▲' : '▼'}</span>
            </div>

            {expanded && (
                <div className="wof__dyk-body">
                    <p>
                        Many believe no-kill to mean a shelter does not euthanize at all. No-kill designation is given if a shelter saves 90% or more of all animals in their care. 100% no-kill is rare. Euthanasia may still occur for animals suffering from irremediable medical conditions or severe behavioral issues. Senior animals are disproportionately affected — age-related health conditions are more likely to be deemed untreatable, and longer shelter stays can take a toll on their wellbeing.
                    </p>
                    <p>
                        If this kind of information interests you, check out the{' '}
                        <Link href="/poll" onClick={(e) => e.stopPropagation()}>Public Square</Link> page.
                    </p>
                </div>
            )}
        </button>
    );
}
