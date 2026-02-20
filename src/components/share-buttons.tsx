'use client';

import { useState } from 'react';

interface ShareButtonsProps {
    url: string;
    title: string;
    description: string;
}

export function ShareButtons({ url, title, description }: ShareButtonsProps) {
    const [copied, setCopied] = useState(false);

    const fullUrl = typeof window !== 'undefined'
        ? `${window.location.origin}${url}`
        : url;

    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(fullUrl)}`;
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fullUrl)}&quote=${encodeURIComponent(description)}`;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(fullUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for non-HTTPS
            const input = document.createElement('input');
            input.value = fullUrl;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="share-buttons">
            <span className="share-buttons__label">Share</span>
            <a
                href={twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="share-buttons__btn share-buttons__btn--twitter"
                aria-label="Share on X (Twitter)"
            >
                𝕏
            </a>
            <a
                href={facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="share-buttons__btn share-buttons__btn--facebook"
                aria-label="Share on Facebook"
            >
                f
            </a>
            <button
                onClick={handleCopy}
                className="share-buttons__btn share-buttons__btn--copy"
                aria-label="Copy link"
            >
                {copied ? '✓' : '🔗'}
            </button>
        </div>
    );
}
