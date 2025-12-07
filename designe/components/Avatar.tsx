import React, { useState, useEffect } from 'react';
import { User as UserIcon } from 'lucide-react';

interface AvatarProps {
    src?: string | null;
    alt?: string;
    size?: number; // size in px (width/height)
    className?: string;
    fallbackText?: string; // e.g. "AB" for Initials
}

export const Avatar: React.FC<AvatarProps> = ({
    src,
    alt = "User",
    size = 40,
    className = "",
    fallbackText
}) => {
    const [hasError, setHasError] = useState(false);
    const [imageSrc, setImageSrc] = useState<string | null>(src || null);

    useEffect(() => {
        setImageSrc(src || null);
        setHasError(false);
    }, [src]);

    const handleError = () => {
        setHasError(true);
    };

    if (!imageSrc || hasError) {
        return (
            <div
                className={`bg-zinc-200 dark:bg-zinc-700 rounded-full flex items-center justify-center text-zinc-500 dark:text-zinc-400 font-bold overflow-hidden ${className}`}
                style={{ width: size, height: size, minWidth: size, minHeight: size }}
            >
                {fallbackText ? (
                    <span style={{ fontSize: size * 0.4 }}>{fallbackText.substring(0, 2).toUpperCase()}</span>
                ) : (
                    <UserIcon size={size * 0.6} />
                )}
            </div>
        );
    }

    return (
        <img
            src={imageSrc}
            alt={alt}
            className={`rounded-full object-cover ${className}`}
            style={{ width: size, height: size, minWidth: size, minHeight: size }}
            onError={handleError}
            loading="lazy"
        />
    );
};
