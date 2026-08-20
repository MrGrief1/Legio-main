import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useMountTransition } from '../hooks/useMountTransition';
import { useScrollLock } from '../hooks/useScrollLock';
import { Avatar } from './Avatar';
import { getLevel } from '../constants';
import { ProfileStatsGrid, ProfileUser, useProfileData } from './ProfileStats';

// Оставлено экспортом: тип профиля исторически брали отсюда.
export type { ProfileUser };

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    // Either hand over a row you already have (the feed's voter chips do) or just an id and let
    // the modal fetch it (the leaderboard does).
    user?: ProfileUser | null;
    userId?: number | null;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, user, userId }) => {
    const hasTransitionedIn = useMountTransition(isOpen, 300);
    useScrollLock(isOpen);

    const targetId = userId ?? user?.id ?? null;
    const { user: freshUser, stats, loading } = useProfileData(targetId, isOpen, user);

    const displayUser = freshUser || user;

    if (!displayUser) return null;
    if (!hasTransitionedIn && !isOpen) return null;

    const displayName = displayUser.name || displayUser.username;
    const levelName = getLevel(displayUser.points || 0).name;

    return createPortal(
        <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${isOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'}`}>
            <div
                className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ease-out ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            />

            <div
                className={`relative bg-white dark:bg-[#121212] w-full max-w-md max-h-[90vh] overflow-y-auto rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-2xl will-change-transform transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
            >

                {/* Header / Cover */}
                <div className="h-32 bg-gradient-to-r from-blue-500 to-purple-600 relative">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors backdrop-blur-md"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Avatar & Basic Info */}
                <div className="px-6 pb-6 -mt-12 relative">
                    <div className="flex flex-col items-center">
                        <div className="w-24 h-24 rounded-full border-4 border-white dark:border-[#121212] overflow-hidden shadow-lg bg-zinc-100 dark:bg-zinc-800">
                            <Avatar src={displayUser.avatar} alt={displayUser.username} size={96} fill className="object-cover" fallbackText={displayName} />
                        </div>

                        <h2 className="mt-3 text-xl font-bold text-zinc-900 dark:text-white text-center">
                            {displayName}
                        </h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">@{displayUser.username}</p>

                        <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                {levelName}
                            </span>
                            {displayUser.role !== 'user' && (
                                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${displayUser.role === 'admin'
                                    ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                                    : 'bg-purple-500/10 text-purple-500 border border-purple-500/20'
                                    }`}>
                                    {displayUser.role}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Stats / Details */}
                    <div className="mt-6 space-y-3">
                        {displayUser.bio && (
                            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                                <p className="text-sm text-zinc-600 dark:text-zinc-300 italic text-center">
                                    "{displayUser.bio}"
                                </p>
                            </div>
                        )}

                        <ProfileStatsGrid user={displayUser} stats={stats} loading={loading} />
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
