'use client';

import Image, { type ImageProps } from 'next/image';
import { useState } from 'react';

const FALLBACK_SRC = '/no-photo.svg';

/**
 * Drop-in replacement for next/image that gracefully falls back
 * to a placeholder when the source image fails to load (e.g. 403).
 */
export function SafeImage({ src, alt, onError, ...rest }: ImageProps) {
    const [imgSrc, setImgSrc] = useState(src);

    return (
        <Image
            {...rest}
            src={imgSrc}
            alt={alt}
            onError={(e) => {
                setImgSrc(FALLBACK_SRC);
                onError?.(e);
            }}
        />
    );
}
