import React from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, Trophy, User, Shield, Clock } from 'lucide-react';
import { useMountTransition } from '../hooks/useMountTransition';

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: {
        id: number;
        username: string;
        name: string;
        avatar: string;
        bio?: string;
        birthdate?: string;
        points: number;
        role: string;
        created_at: string;
    } | null;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, user }) => {
    const hasTransitionedIn = useMountTransition(isOpen, 300);

    if (!user) return null;
    if (!hasTransitionedIn && !isOpen) return null;

    return createPortal(
        <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${isOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'}`}>
            <div
                className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ease-out ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            />

            <div
                className={`relative bg-white dark:bg-[#121212] w-full max-w-md rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden will-change-transform transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
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
                            <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
                        </div>

                        <h2 className="mt-3 text-xl font-bold text-zinc-900 dark:text-white">
                            {user.name || user.username}
                        </h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">@{user.username}</p>

                        {user.role !== 'user' && (
                            <span className={`mt-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${user.role === 'admin'
                                    ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                                    : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                                }`}>
                                {user.role}
                            </span>
                        )}
                    </div>

                    {/* Stats / Details */}
                    <div className="mt-6 space-y-4">
                        {user.bio && (
                            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                                <p className="text-sm text-zinc-600 dark:text-zinc-300 italic text-center">
                                    "{user.bio}"
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
                                <div className="p-2 bg-yellow-500/10 text-yellow-500 rounded-xl">
                                    <Trophy size={18} />
                                </div>
                                <div>
                                    <p className="text-xs text-zinc-500">Очки</p>
                                    <p className="font-bold text-zinc-900 dark:text-white">{user.points}</p>
                                </div>
                            </div>

                            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
                                <div className="p-2 bg-blue-500/10 text-blue-500 rounded-xl">
                                    <Calendar size={18} />
                                </div>
                                <div>
                                    <p className="text-xs text-zinc-500">Дата рождения</p>
                                    <p className="font-bold text-zinc-900 dark:text-white">
                                        {user.birthdate ? new Date(user.birthdate).toLocaleDateString() : 'Не указана'}
                                    </p>
                                </div>
                            </div>

                            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex items-center gap-3 col-span-2">
                                <div className="p-2 bg-zinc-500/10 text-zinc-500 rounded-xl">
                                    <Clock size={18} />
                                </div>
                                <div>
                                    <p className="text-xs text-zinc-500">Регистрация</p>
                                    <p className="font-bold text-zinc-900 dark:text-white">
                                        {new Date(user.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
