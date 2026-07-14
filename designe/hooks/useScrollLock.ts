import { useEffect } from 'react';

// Cross-platform, reference-counted body scroll lock.
//
// `document.body.style.overflow = 'hidden'` is unreliable here: on mobile Safari/Chrome it
// does NOT stop touch-scrolling the page behind a modal, and on desktop it only works via a
// fragile body -> viewport overflow-propagation quirk (this app's real scroller is <html>,
// whose overflow stays `visible`). Pinning the body with `position: fixed` freezes the page
// on every platform. We remember the scroll offset and restore it on release so nothing jumps.
//
// Several overlays can be open at once (a modal can open a nested dialog, the mobile menu can
// sit under a modal, etc.), so we count active locks and only touch/restore the body when the
// count crosses zero. Otherwise closing an inner dialog would unlock the page while an outer
// modal is still open.

let lockCount = 0;
let savedScrollY = 0;
let savedStyles: Record<string, string> | null = null;

const STYLE_KEYS = ['position', 'top', 'left', 'right', 'width', 'overflow'] as const;

const applyLock = () => {
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    const { style } = document.body;

    savedStyles = {};
    STYLE_KEYS.forEach((key) => { savedStyles![key] = style.getPropertyValue(key); });

    style.position = 'fixed';
    style.top = `-${savedScrollY}px`;
    style.left = '0';
    style.right = '0';
    style.width = '100%';
    style.overflow = 'hidden';
};

const releaseLock = () => {
    const { style } = document.body;

    STYLE_KEYS.forEach((key) => {
        const value = savedStyles ? savedStyles[key] : '';
        if (value) style.setProperty(key, value);
        else style.removeProperty(key);
    });
    savedStyles = null;

    // Restore the scroll position the page had before it was pinned.
    window.scrollTo(0, savedScrollY);
};

export const lockBodyScroll = () => {
    lockCount += 1;
    if (lockCount === 1) applyLock();
};

export const unlockBodyScroll = () => {
    if (lockCount === 0) return;
    lockCount -= 1;
    if (lockCount === 0) releaseLock();
};

// Freeze the page while `active` is true. Safe to use from many components simultaneously.
export const useScrollLock = (active: boolean) => {
    useEffect(() => {
        if (!active) return;
        lockBodyScroll();
        return () => unlockBodyScroll();
    }, [active]);
};
