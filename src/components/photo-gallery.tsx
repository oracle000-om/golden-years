'use client';

import { useState, useEffect, useCallback } from 'react';
import { SafeImage } from '@/components/SafeImage';

interface PhotoGalleryProps {
    photos: string[];
    name: string;
    videoUrl?: string | null;
}

export function PhotoGallery({ photos, name, videoUrl }: PhotoGalleryProps) {
    // Video is slide 0 if present, photos follow
    const hasVideo = !!videoUrl;
    const totalSlides = photos.length + (hasVideo ? 1 : 0);
    const [activeIndex, setActiveIndex] = useState(0);
    const [lightboxOpen, setLightboxOpen] = useState(false);

    if (totalSlides <= 1 && !hasVideo) return null;

    const isVideoSlide = hasVideo && activeIndex === 0;
    const photoIndex = hasVideo ? activeIndex - 1 : activeIndex;

    const openLightbox = () => setLightboxOpen(true);
    const closeLightbox = () => setLightboxOpen(false);

    return (
        <>
            <div className="photo-gallery">
                <div className="photo-gallery__main" onClick={openLightbox} role="button" tabIndex={0} aria-label="Expand media">
                    {isVideoSlide ? (
                        <video
                            className="photo-gallery__video"
                            src={videoUrl!}
                            controls
                            muted
                            playsInline
                            poster={photos[0]}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <SafeImage
                            key={photoIndex}
                            src={photos[photoIndex]}
                            alt={`${name} — photo ${photoIndex + 1}`}
                            fill
                            sizes="(max-width: 768px) 100vw, 50vw"
                            style={{ objectFit: 'contain' }}
                            priority={activeIndex === 0}
                        />
                    )}
                    {/* Expand hint */}
                    <span className="photo-gallery__expand-hint" aria-hidden="true">⤢</span>
                    {totalSlides > 1 && (
                        <>
                            <button
                                className="photo-gallery__arrow photo-gallery__arrow--prev"
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setActiveIndex(i => (i - 1 + totalSlides) % totalSlides); }}
                                aria-label="Previous"
                            >
                                ‹
                            </button>
                            <button
                                className="photo-gallery__arrow photo-gallery__arrow--next"
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setActiveIndex(i => (i + 1) % totalSlides); }}
                                aria-label="Next"
                            >
                                ›
                            </button>
                            <span className="photo-gallery__counter">
                                {activeIndex + 1} / {totalSlides}
                            </span>
                        </>
                    )}
                </div>
                <div className="photo-gallery__thumbs">
                    {hasVideo && (
                        <button
                            className={`photo-gallery__thumb ${activeIndex === 0 ? 'photo-gallery__thumb--active' : ''}`}
                            onClick={(e) => { e.preventDefault(); setActiveIndex(0); }}
                            aria-label="View video"
                        >
                            <span className="photo-gallery__thumb-video">▶</span>
                        </button>
                    )}
                    {photos.map((url, i) => (
                        <button
                            key={i}
                            className={`photo-gallery__thumb ${(hasVideo ? i + 1 : i) === activeIndex ? 'photo-gallery__thumb--active' : ''}`}
                            onClick={(e) => { e.preventDefault(); setActiveIndex(hasVideo ? i + 1 : i); }}
                            aria-label={`View photo ${i + 1}`}
                        >
                            <SafeImage
                                src={url}
                                alt={`${name} — thumbnail ${i + 1}`}
                                fill
                                sizes="80px"
                                style={{ objectFit: 'cover' }}
                            />
                        </button>
                    ))}
                </div>
            </div>

            {/* Lightbox — viewport-fit overlay */}
            {lightboxOpen && (
                <Lightbox
                    isVideo={isVideoSlide}
                    videoUrl={videoUrl}
                    photoUrl={!isVideoSlide ? photos[photoIndex] : undefined}
                    poster={photos[0]}
                    name={name}
                    photoIndex={photoIndex}
                    activeIndex={activeIndex}
                    totalSlides={totalSlides}
                    onPrev={() => setActiveIndex(i => (i - 1 + totalSlides) % totalSlides)}
                    onNext={() => setActiveIndex(i => (i + 1) % totalSlides)}
                    onClose={closeLightbox}
                />
            )}
        </>
    );
}

/* ── Lightbox sub-component (uses useEffect for Escape key) ── */
function Lightbox({
    isVideo, videoUrl, photoUrl, poster, name, photoIndex,
    activeIndex, totalSlides, onPrev, onNext, onClose,
}: {
    isVideo: boolean;
    videoUrl?: string | null;
    photoUrl?: string;
    poster?: string;
    name: string;
    photoIndex: number;
    activeIndex: number;
    totalSlides: number;
    onPrev: () => void;
    onNext: () => void;
    onClose: () => void;
}) {
    const handleKey = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowLeft') onPrev();
        if (e.key === 'ArrowRight') onNext();
    }, [onClose, onPrev, onNext]);

    useEffect(() => {
        document.addEventListener('keydown', handleKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKey);
            document.body.style.overflow = '';
        };
    }, [handleKey]);

    return (
        <div className="photo-lightbox" onClick={onClose}>
            <div className="photo-lightbox__content" onClick={(e) => e.stopPropagation()}>
                {isVideo && videoUrl ? (
                    <video
                        className="photo-lightbox__video"
                        src={videoUrl}
                        controls
                        autoPlay
                        playsInline
                        poster={poster}
                    />
                ) : photoUrl ? (
                    <img
                        className="photo-lightbox__image"
                        src={photoUrl}
                        alt={`${name} — photo ${photoIndex + 1}`}
                    />
                ) : null}
            </div>
            <button className="photo-lightbox__close" onClick={onClose} aria-label="Close">✕</button>
            {totalSlides > 1 && (
                <>
                    <button
                        className="photo-lightbox__arrow photo-lightbox__arrow--prev"
                        onClick={(e) => { e.stopPropagation(); onPrev(); }}
                        aria-label="Previous"
                    >‹</button>
                    <button
                        className="photo-lightbox__arrow photo-lightbox__arrow--next"
                        onClick={(e) => { e.stopPropagation(); onNext(); }}
                        aria-label="Next"
                    >›</button>
                </>
            )}
            <span className="photo-lightbox__counter">{activeIndex + 1} / {totalSlides}</span>
        </div>
    );
}
