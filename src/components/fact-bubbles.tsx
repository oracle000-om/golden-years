'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const CAT_FACTS = [
    "Cats are classified as senior at age 11 and geriatric at 15 by the AAFP.",
    "Indoor cats live an average of 12–18 years, while outdoor cats average 2–5 years.",
    "Siamese and Burmese cats are among the longest-lived breeds, often reaching 18–20 years.",
    "Senior cats sleep 16–20 hours per day, compared to 12–16 for younger cats.",
    "Senior cats lose muscle mass at a rate of about 1–2% per year after age 12.",
    "Cats over 7 years old make up roughly 50% of cats in U.S. shelters.",
    "Black cats are the least adopted and most euthanized color group in U.S. shelters.",
    "Senior cats often adjust to new homes faster than kittens because of their calmer temperament.",
    "Wet food helps senior cats stay hydrated — cats get 70–80% of their water from food.",
    "Dental disease affects over 70% of cats by age 3, increasing significantly with age.",
    "A cat's personality is largely set by age 3 and remains stable through their senior years.",
    "Cats over 12 should have blood work done every 6 months to stay ahead of common age-related changes.",
    "Arthritis affects up to 90% of cats over age 12, though they rarely show obvious limping.",
    "Older cats often lose their ability to retract claws, causing them to snag on fabrics.",
    "A 15-year-old cat is roughly equivalent to a 76-year-old human in developmental terms.",
    "Senior cats can develop cognitive changes, showing signs like nighttime vocalization or mild disorientation.",
    "The oldest recorded domestic cat, Creme Puff, lived to 38 years old in Austin, Texas.",
    "Older cats groom themselves less frequently, so regular brushing keeps their coat healthy.",
    "Senior cats benefit from raised food bowls, which reduce neck strain while eating.",
    "A cat's hearing naturally declines with age — by age 14, many cats experience partial deafness.",
    // --- History & human partnership ---
    "Cats were first domesticated around 10,000 years ago in the Near East, drawn to early grain stores.",
    "Ancient Egyptians revered cats as sacred — killing one, even accidentally, was punishable by death.",
    "The Egyptian goddess Bastet was depicted as a lioness, then later as a domestic cat, symbolizing protection.",
    "Ships' cats were standard crew on sailing vessels for centuries, controlling rats that spoiled food and spread plague.",
    "During the Black Death, the mass killing of cats in Europe likely worsened the plague by letting rat populations surge.",
    "In medieval Japan, cats were kept in silk factories to protect silkworm cocoons from mice.",
    "In the Ottoman Empire, cats roamed freely in mosques and libraries — Istanbul is still called the City of Cats.",
    "In WWI and WWII, cats served on warships and in trenches as mascots and mousers.",
    "Mark Twain adored cats and once said, 'If man could be crossed with the cat, it would improve man.'",
    "The Chinese Li Hua cat is one of the oldest natural breeds, guarding grain stores for over 3,000 years.",
    "Cats' self-cleaning behavior made them ideal companions in ancient cities where sanitation was poor.",
    // --- Training & exercise tips ---
    "Senior cats benefit from short, gentle play sessions — 10 minutes twice a day keeps them mentally sharp.",
    "Puzzle feeders are great for older cats, stimulating their minds and slowing down fast eaters.",
    "Gentle wand toys encourage senior cats to stretch and move without high-impact jumping.",
    "Florence Nightingale kept over 60 cats throughout her life, crediting them with calming hospital patients.",
    "Modern therapy cats are used in hospitals and nursing homes, continuing centuries of comforting human companionship.",
];

const DOG_FACTS = [
    "Dogs are considered senior at age 7 for large breeds and 10 for small breeds.",
    "Large breed dogs (over 50 lbs) have an average lifespan of 8–10 years.",
    "Chihuahuas and Dachshunds frequently live 15–18 years, among the longest of any breed.",
    "Hypothyroidism is the most common endocrine disorder in senior dogs, manageable with daily medication.",
    "Senior dogs in shelters are adopted at roughly one-third the rate of puppies.",
    "Most senior dogs in shelters are already house-trained and know basic commands, making them easy to adopt.",
    "Pets over 7 make up approximately 25% of U.S. shelter populations.",
    "Cognitive changes affect roughly 30% of dogs over age 11, similar to normal aging in humans.",
    "Regular dental cleanings can extend a dog's lifespan by an average of 1–3 years.",
    "Senior dogs require 20–30% fewer calories than young adults to maintain healthy weight.",
    "Larger dogs age faster — a Great Dane is considered senior by age 5–6.",
    "About 80% of dogs over age 3 have some degree of periodontal disease, making dental care essential.",
    "Glucosamine and omega-3 supplements are commonly recommended for joint health in aging dogs.",
    "A 10-year-old medium-sized dog is roughly equivalent to a 56-year-old human.",
    "Cataracts affect about 50% of dogs over age 9, but surgery has a 90%+ success rate.",
    "Senior dogs may experience sundowner syndrome — increased confusion and anxiety in the evening.",
    "The average shelter stay for a senior dog is 4x longer than for a puppy.",
    "Older dogs benefit from orthopedic beds that support aging joints and relieve pressure points.",
    // --- History & human partnership ---
    "Dogs were the first domesticated animal — evidence suggests domestication began 15,000–40,000 years ago.",
    "Ancient hunter-gatherers partnered with wolves, co-evolving into the human-dog bond we know today.",
    "In ancient Rome, 'Cave Canem' (Beware of Dog) mosaics at Pompeii show dogs guarding homes 2,000 years ago.",
    "During WWI, over 20,000 dogs served as messengers, sentries, and Red Cross rescue dogs on the battlefield.",
    "Balto, a sled dog, helped relay life-saving diphtheria antitoxin 674 miles across Alaska in 1925.",
    "Ancient Egyptians mummified their dogs and mourned them — families shaved their heads when a dog died.",
    "Tibetan Mastiffs guarded Himalayan monasteries for centuries, considered sacred protectors by Buddhist monks.",
    "In the 1800s, Saint Bernards rescued over 2,000 travelers stranded in the Swiss Alps.",
    "Dogs' acute sense of smell has been used for centuries — from tracking game to modern cancer detection.",
    "During WWII, dogs parachuted with soldiers behind enemy lines as scouts and mine detectors.",
    "Greyhounds are one of the oldest breeds, depicted in Egyptian tombs dating back 4,000 years.",
    // --- Training & exercise tips ---
    "Senior dogs thrive with two to three short walks per day rather than one long outing.",
    "Nose-work games and snuffle mats give aging dogs mental stimulation without stressing their joints.",
    "Swimming is one of the best exercises for senior dogs — it builds muscle with zero joint impact.",
    "Older dogs can absolutely learn new tricks — short, positive-reinforcement sessions keep their minds engaged.",
    "Today, dogs serve as guide dogs, seizure-alert dogs, and PTSD companions — extending millennia of service to humans.",
];

type MascotState = 'idle' | 'hover' | 'active';

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

function useIsMobile(breakpoint = 768) {
    const [isMobile, setIsMobile] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
    });

    useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
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
        const srcs = [...Object.values(DOG_IMAGES), ...Object.values(CAT_IMAGES)];
        srcs.forEach((src) => {
            const img = new Image();
            img.src = src;
        });
    }, []);

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

    // Desktop: 3 states (idle, hover, active)
    // Mobile: 2 states — same images, CSS zoom-crops into circles (idle + active)
    const dogImgSrc = isMobile
        ? DOG_IMAGES[dogState === 'active' ? 'active' : 'idle']
        : DOG_IMAGES[dogState];

    const catImgSrc = isMobile
        ? CAT_IMAGES[catState === 'active' ? 'active' : 'idle']
        : CAT_IMAGES[catState];

    return (
        <>
            {/* Floating fact bubbles */}
            <div className="fact-float-layer" aria-hidden="true">
                {floatingFacts.map((fact) => (
                    <div
                        key={fact.id}
                        className="fact-float"
                        style={{ left: `${fact.left}%`, cursor: 'pointer', pointerEvents: 'auto' }}
                        onClick={() => {
                            setFloatingFacts((prev) => prev.filter((f) => f.id !== fact.id));
                        }}
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
