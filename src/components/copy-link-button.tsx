'use client';

import { useState } from 'react';

export function CopyLinkButton() {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
        } catch {
            const input = document.createElement('input');
            input.value = window.location.href;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button className="copy-link-btn" onClick={handleCopy} aria-label="Copy link" title="Copy link">
            {copied ? '✓' : '🔗'}
        </button>
    );
}
