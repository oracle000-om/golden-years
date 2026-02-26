'use client';

import { useState } from 'react';
import Link from 'next/link';

export function DidYouKnowCard({ noKillPercent: _noKillPercent }: { noKillPercent: number }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <button
            className={`wof__dyk ${expanded ? 'wof__dyk--open' : ''}`}
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
        >
            <div className="wof__dyk-header">
                <span className="wof__dyk-title"><strong>Why only public shelters?</strong></span>
                <span className="wof__dyk-chevron">{expanded ? '▲' : '▼'}</span>
            </div>

            {expanded && (
                <div className="wof__dyk-body">
                    <p>
                        Most private rescues are no-kill by design. They choose which animals to accept and can limit intake. Publicly-funded shelters (municipal animal services, county shelters) are legally required to accept every animal that comes through their doors. Achieving no-kill status under those conditions is a remarkable accomplishment that reflects progressive shelter policy and strong community programs.
                    </p>
                    <p>
                        &ldquo;No-kill&rdquo; means saving 90% or more of all animals in care. 100% no-kill is extremely rare. Euthanasia may still occur for animals suffering from irremediable medical conditions or severe behavioral issues. Senior animals are disproportionately affected.
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
