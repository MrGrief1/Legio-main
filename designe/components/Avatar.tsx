import React, { useState, useEffect } from 'react';

interface AvatarProps {
    src?: string | null;
    alt?: string;
    size?: number; // size in px (width/height); ignored when `fill` is set
    className?: string;
    fallbackText?: string; // e.g. "Иван Петров" — initials are derived from it
    // Stretch to the parent instead of using `size`. Use this whenever the avatar sits in a box
    // that already has its own dimensions (especially a responsive one like `w-16 lg:w-20`):
    // hard-coding px there makes the avatar larger than its container, and `overflow-hidden` then
    // crops it off-centre so it looks shifted.
    fill?: boolean;
}

// Telegram-style palette. Solid, pleasant backgrounds that read well with white
// text in both light and dark themes.
const AVATAR_COLORS = [
    '#e17076', // red
    '#eda86c', // orange
    '#a695e7', // purple
    '#7bc862', // green
    '#6ec9cb', // teal
    '#65aadd', // blue
    '#ee7aae', // pink
    '#f2921f', // amber
];

// Deterministic color from a name so a given user always gets the same one.
const colorForKey = (key: string): string => {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = (hash + key.charCodeAt(i)) % AVATAR_COLORS.length;
    }
    return AVATAR_COLORS[hash];
};

// Two letters "like in Telegram": first letters of the first two words, or the
// first two characters of a single word.
const initialsForName = (name: string): string => {
    const cleaned = (name || '').trim();
    if (!cleaned) return '?';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return cleaned.substring(0, 2).toUpperCase();
};

// Auto-generated cartoon avatars (dicebear) count as "no real photo" — we show
// initials instead, per the Telegram-style requirement.
const isRealImage = (src?: string | null): boolean => {
    if (!src) return false;
    if (src.includes('dicebear')) return false;
    return true;
};

export const Avatar: React.FC<AvatarProps> = ({
    src,
    alt = "User",
    size = 40,
    className = "",
    fallbackText,
    fill = false
}) => {
    const [hasError, setHasError] = useState(false);
    const [imageSrc, setImageSrc] = useState<string | null>(isRealImage(src) ? src! : null);

    useEffect(() => {
        setImageSrc(isRealImage(src) ? src! : null);
        setHasError(false);
    }, [src]);

    const handleError = () => {
        setHasError(true);
    };

    // In fill mode the parent owns the dimensions, so no px are written at all — otherwise the
    // minWidth/minHeight floor would keep forcing the old size and defeat the point.
    // flexShrink: 0 stops a flex row from squashing the circle into an oval.
    const sizeStyle: React.CSSProperties = fill
        ? { width: '100%', height: '100%', flexShrink: 0 }
        : { width: size, height: size, minWidth: size, minHeight: size, flexShrink: 0 };

    if (!imageSrc || hasError) {
        const label = (fallbackText && fallbackText.trim()) || (alt && alt !== 'User' ? alt : '');
        const initials = initialsForName(label);
        const bg = colorForKey(label || initials);
        return (
            <div
                className={`rounded-full flex items-center justify-center text-white font-semibold overflow-hidden select-none ${className}`}
                style={{ ...sizeStyle, backgroundColor: bg }}
            >
                {/* The box is sized by the parent in fill mode, but the initials still need a
                    concrete font size — so `size` keeps serving as the typography hint. Callers
                    pass the box's nominal size, and a small mismatch only shifts the glyph weight,
                    never the layout. */}
                <span style={{ fontSize: size * 0.4, lineHeight: 1 }}>{initials}</span>
            </div>
        );
    }

    return (
        <img
            src={imageSrc}
            alt={alt}
            className={`rounded-full object-cover ${className}`}
            style={sizeStyle}
            onError={handleError}
            loading="lazy"
        />
    );
};
