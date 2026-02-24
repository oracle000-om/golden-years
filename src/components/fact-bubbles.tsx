'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const CAT_FACTS = [
    "Cats are classified as senior at age 11 and geriatric at 15 by the AAFP.",
    "Indoor cats live an average of 12–18 years, while outdoor cats average 2–5 years.",
    "Siamese and Burmese cats are among the longest-lived breeds, often reaching 18–20 years.",
    "Senior cats sleep 16–20 hours per day, compared to 12–16 for younger cats.",
    "Hyperthyroidism affects approximately 10% of cats over age 10.",
    "Chronic kidney disease is the leading cause of death in cats over 15.",
    "Senior cats lose muscle mass at a rate of about 1–2% per year after age 12.",
    "Cats over 7 years old make up roughly 50% of cats in U.S. shelters.",
    "Senior cats are 2x more likely to be euthanized in shelters than kittens.",
    "Persian cats are genetically predisposed to polycystic kidney disease, detectable via ultrasound.",
    "Wet food helps senior cats stay hydrated — cats get 70–80% of their water from food.",
    "Dental disease affects over 70% of cats by age 3, increasing significantly with age.",
    "A cat's personality is largely set by age 3 and remains stable through their senior years.",
    // --- New facts below ---
    "Cats over 12 should have blood work done every 6 months to catch kidney issues early.",
    "Senior cats may develop high blood pressure, which can cause sudden blindness if untreated.",
    "Arthritis affects up to 90% of cats over age 12, though they rarely show obvious limping.",
    "Older cats often lose their ability to retract claws, causing them to snag on fabrics.",
    "A 15-year-old cat is roughly equivalent to a 76-year-old human in developmental terms.",
    "Cats over 10 are more prone to diabetes, especially if overweight.",
    "Senior cats can develop cognitive dysfunction, showing signs like nighttime vocalization and disorientation.",
    "The oldest recorded domestic cat, Creme Puff, lived to 38 years old in Austin, Texas.",
    "Older cats groom themselves less frequently, which can lead to matted fur and skin issues.",
    "About 30–40% of cats are obese, and excess weight shortens a cat's lifespan by up to 2.5 years.",
    "Maine Coon cats are prone to hypertrophic cardiomyopathy, the most common heart disease in cats.",
    "Senior cats benefit from raised food bowls, which reduce neck strain while eating.",
    "A cat's hearing declines with age — by age 14, many cats experience partial deafness.",
];

const DOG_FACTS = [
    "Dogs are considered senior at age 7 for large breeds and 10 for small breeds.",
    "Large breed dogs (over 50 lbs) have an average lifespan of 8–10 years.",
    "Chihuahuas and Dachshunds frequently live 15–18 years, among the longest of any breed.",
    "Hip dysplasia affects up to 50% of large breed dogs, with symptoms increasing with age.",
    "Dachshunds have a 1 in 4 chance of developing intervertebral disc disease (IVDD).",
    "Boxers have the highest cancer rate of any breed — affecting roughly 40% of individuals.",
    "Hypothyroidism is the most common endocrine disorder in senior dogs, manageable with daily medication.",
    "German Shepherds are predisposed to degenerative myelopathy, a progressive spinal cord disease.",
    "Bulldogs and Pugs are brachycephalic breeds that struggle with heat regulation throughout life.",
    "Senior dogs in shelters are adopted at roughly one-third the rate of puppies.",
    "Pets over 7 make up approximately 25% of U.S. shelter populations.",
    "Cognitive dysfunction syndrome (similar to dementia) affects roughly 30% of dogs over age 11.",
    "Regular dental cleanings can extend a dog's lifespan by an average of 1–3 years.",
    "Senior dogs require 20–30% fewer calories than young adults to maintain healthy weight.",
    // --- New facts below ---
    "Larger dogs age faster — a Great Dane is considered senior by age 5–6.",
    "About 80% of dogs over age 3 have some degree of periodontal disease.",
    "Senior dogs can develop laryngeal paralysis, causing a change in bark and noisy breathing.",
    "Glucosamine and omega-3 supplements are commonly recommended for joint health in aging dogs.",
    "A 10-year-old medium-sized dog is roughly equivalent to a 56-year-old human.",
    "Cavalier King Charles Spaniels are genetically predisposed to mitral valve heart disease.",
    "Golden Retrievers have a cancer rate of approximately 60%, one of the highest of any breed.",
    "Cataracts affect about 50% of dogs over age 9, but surgery has a 90%+ success rate.",
    "Senior dogs may experience sundowner syndrome — increased confusion and anxiety in the evening.",
    "The average shelter stay for a senior dog is 4x longer than for a puppy.",
    "Bernese Mountain Dogs have one of the shortest lifespans at 6–8 years, often due to cancer.",
    "Kidney disease affects about 10% of dogs, with incidence rising sharply after age 10.",
    "Older dogs benefit from orthopedic beds that support aging joints and relieve pressure points.",
    "Small breed dogs are more prone to collapsing trachea and dental issues as they age.",
];

type MascotState = 'idle' | 'hover' | 'active';
type MobileMascotState = 'idle' | 'active';

const DOG_IMAGES: Record<MascotState, string> = {
    idle: '/mascots/dog-idle.png',
    hover: '/mascots/dog-hover.png',
    active: '/mascots/dog-bark.png',
};

const CAT_IMAGES: Record<MascotState, string> = {
    idle: '/mascots/cat-idle.png',
    hover: '/mascots/cat-hover.png',
    active: '/mascots/cat-meow.png',
};

const DOG_MOBILE_IMAGES: Record<MobileMascotState, string> = {
    idle: '/mascots/dog-face-smile.png',
    active: '/mascots/dog-face-bark.png',
};

const CAT_MOBILE_IMAGES: Record<MobileMascotState, string> = {
    idle: '/mascots/cat-face-smile.png',
    active: '/mascots/cat-face-meow.png',
};

function useIsMobile(breakpoint = 768) {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
        setIsMobile(mql.matches);

        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
    }, [breakpoint]);

    return isMobile;
}

interface FloatingFact {
    id: number;
    text: string;
    left: number;
    emoji: string;
}

let factId = 0;

export function FactBubbles() {
    const isMobile = useIsMobile();
    const [dogState, setDogState] = useState<MascotState>('idle');
    const [catState, setCatState] = useState<MascotState>('idle');
    const [floatingFacts, setFloatingFacts] = useState<FloatingFact[]>([]);
    const dogFactIndex = useRef(Math.floor(Math.random() * DOG_FACTS.length));
    const catFactIndex = useRef(Math.floor(Math.random() * CAT_FACTS.length));
    const dogCooldown = useRef(false);
    const catCooldown = useRef(false);

    // Preload all images
    useEffect(() => {
        const srcs = isMobile
            ? [...Object.values(DOG_MOBILE_IMAGES), ...Object.values(CAT_MOBILE_IMAGES)]
            : [...Object.values(DOG_IMAGES), ...Object.values(CAT_IMAGES)];
        srcs.forEach((src) => {
            const img = new Image();
            img.src = src;
        });
    }, [isMobile]);

    const spawnFact = useCallback((side: 'left' | 'right', facts: string[], indexRef: React.MutableRefObject<number>, emoji: string) => {
        const text = facts[indexRef.current];
        indexRef.current = (indexRef.current + 1) % facts.length;

        // Bubbles always spawn BETWEEN the two mascots
        // Desktop: mascots at ~0-12% and ~88-100%, so bubbles go 15–70%
        // Mobile: tighter, 15–55%
        const min = 15;
        const max = isMobile ? 55 : 70;
        const left = min + Math.random() * (max - min);

        const newFact: FloatingFact = { id: factId++, text, left, emoji };
        setFloatingFacts((prev) => [...prev, newFact]);

        setTimeout(() => {
            setFloatingFacts((prev) => prev.filter((f) => f.id !== newFact.id));
        }, 12000);
    }, [isMobile]);

    const handleDogClick = useCallback(() => {
        if (dogCooldown.current) return;
        dogCooldown.current = true;

        setDogState('active');
        spawnFact('left', DOG_FACTS, dogFactIndex, '🐕');

        setTimeout(() => {
            setDogState(isMobile ? 'idle' : 'hover');
            dogCooldown.current = false;
        }, 2000);
    }, [spawnFact, isMobile]);

    const handleCatClick = useCallback(() => {
        if (catCooldown.current) return;
        catCooldown.current = true;

        setCatState('active');
        spawnFact('right', CAT_FACTS, catFactIndex, '🐈');

        setTimeout(() => {
            setCatState(isMobile ? 'idle' : 'hover');
            catCooldown.current = false;
        }, 2000);
    }, [spawnFact, isMobile]);

    const dogImgSrc = isMobile
        ? DOG_MOBILE_IMAGES[dogState === 'hover' ? 'idle' : dogState as MobileMascotState]
        : DOG_IMAGES[dogState];

    const catImgSrc = isMobile
        ? CAT_MOBILE_IMAGES[catState === 'hover' ? 'idle' : catState as MobileMascotState]
        : CAT_IMAGES[catState];

    return (
        <>
            {/* Floating fact bubbles */}
            <div className="fact-float-layer" aria-hidden="true">
                {floatingFacts.map((fact) => (
                    <div
                        key={fact.id}
                        className="fact-float"
                        style={{ left: `${fact.left}%` }}
                    >
                        {fact.emoji} {fact.text}
                    </div>
                ))}
            </div>

            {/* Dog mascot — left side */}
            <button
                className={`mascot mascot--left ${isMobile ? 'mascot--mobile' : ''}`}
                onClick={handleDogClick}
                onMouseEnter={() => { if (!isMobile && dogState === 'idle') setDogState('hover'); }}
                onMouseLeave={() => { if (!isMobile && dogState === 'hover') setDogState('idle'); }}
                aria-label="Click for a dog fact"
                type="button"
            >
                <img
                    src={dogImgSrc}
                    alt=""
                    className="mascot__img"
                    draggable={false}
                />
            </button>

            {/* Cat mascot — right side */}
            <button
                className={`mascot mascot--right ${isMobile ? 'mascot--mobile' : ''}`}
                onClick={handleCatClick}
                onMouseEnter={() => { if (!isMobile && catState === 'idle') setCatState('hover'); }}
                onMouseLeave={() => { if (!isMobile && catState === 'hover') setCatState('idle'); }}
                aria-label="Click for a cat fact"
                type="button"
            >
                <img
                    src={catImgSrc}
                    alt=""
                    className="mascot__img"
                    draggable={false}
                />
            </button>
        </>
    );
}
