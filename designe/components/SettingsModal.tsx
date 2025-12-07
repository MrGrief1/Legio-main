import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Lock, User as UserIcon, Mail, Camera, Loader2, ChevronDown, FileText, Calendar } from 'lucide-react';
import { Button, Input } from './UI';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { Language } from '../translations';
import { useMountTransition } from '../hooks/useMountTransition';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const { user, login } = useAuth();
    const { language, setLanguage, t } = useLanguage();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
    const [loading, setLoading] = useState(false);
    const hasTransitionedIn = useMountTransition(isOpen, 300);

    // Profile State
    const [newName, setNewName] = useState(user?.name || user?.username || '');
    const [bio, setBio] = useState(user?.bio || '');
    const [birthdate, setBirthdate] = useState(user?.birthdate || '');
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState(user?.avatar || '');
    const [isLangOpen, setIsLangOpen] = useState(false);
    const langDropdownRef = useRef<HTMLDivElement>(null);

    // Security State
    const [newEmail, setNewEmail] = useState(user?.username || '');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync state with user data when modal opens or user updates
    useEffect(() => {
        if (isOpen && user) {
            setNewName(user.name || user.username || '');
            setBio(user.bio || '');
            setBirthdate(user.birthdate || '');
            setAvatarPreview(user.avatar || '');
            setNewEmail(user.username || '');
            // Reset password fields
            setNewPassword('');
            setConfirmPassword('');
        }
    }, [isOpen, user]);

    // Lock body scroll
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; }
    }, [isOpen]);

    // Close language dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
                setIsLangOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!user) return null;

    // ... (handlers remain the same, only return changes)

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
        }
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            let avatarUrl = user.avatar;

            // Upload avatar if changed
            if (avatarFile) {
                const formData = new FormData();
                formData.append('image', avatarFile);
                const uploadRes = await fetch('http://localhost:3001/api/upload', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                    body: formData
                });
                if (uploadRes.ok) {
                    const data = await uploadRes.json();
                    avatarUrl = data.url;
                }
            }

            const res = await fetch('http://localhost:3001/api/user/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    avatar: avatarUrl,
                    name: newName,
                    bio,
                    birthdate
                })
            });

            if (res.ok) {
                const data = await res.json();
                // Update context
                login(localStorage.getItem('token') || '', data.user);
                showToast(t.settings.profileUpdated, 'success');
                setTimeout(() => window.location.reload(), 1000);
            } else {
                const data = await res.json();
                showToast(data.message || t.settings.updateFailed, 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('An error occurred', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateSecurity = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword && newPassword !== confirmPassword) {
            showToast(t.settings.passwordMismatch, 'error');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/user/security', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    username: newEmail !== user.username ? newEmail : undefined,
                    password: newPassword || undefined
                })
            });

            if (res.ok) {
                showToast(t.settings.securityUpdated, 'success');
                // Logout or just close? Better to logout if email/password changed
                window.location.reload();
            } else {
                const data = await res.json();
                showToast(data.message || t.settings.updateFailed, 'error');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (!hasTransitionedIn && !isOpen) return null;

    return createPortal(
        <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${isOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'}`}>
            {/* Blur Overlay */}
            <div
                className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ease-out ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            />

            {/* Modal Content */}
            <div
                className={`relative bg-white dark:bg-[#121212] w-full h-full sm:h-auto sm:max-w-2xl rounded-none sm:rounded-[32px] border-0 sm:border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden sm:max-h-[90vh] overflow-y-auto custom-scrollbar will-change-transform transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
            >

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-zinc-100 dark:border-zinc-800 sticky top-0 bg-white dark:bg-[#121212] z-10">
                    <h2 className="text-xl font-bold dark:text-white">{t.settings.title}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                        <X size={20} className="text-zinc-500 dark:text-zinc-400" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 sticky top-[73px] z-10">
                    <div className="relative flex p-1 bg-zinc-200/50 dark:bg-zinc-800 rounded-full">
                        <div
                            className="absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/2)] bg-white dark:bg-zinc-600 rounded-full shadow-sm transition-transform duration-300 ease-in-out"
                            style={{
                                transform: `translateX(${activeTab === 'security' ? '100%' : '0%'})`
                            }}
                        />
                        <button
                            onClick={() => setActiveTab('profile')}
                            className={`relative z-10 flex-1 py-2 text-sm font-medium rounded-full transition-colors duration-200 flex items-center justify-center gap-2 ${activeTab === 'profile'
                                ? 'text-zinc-900 dark:text-white'
                                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
                                }`}
                        >
                            <UserIcon size={16} /> {t.settings.profile}
                        </button>
                        <button
                            onClick={() => setActiveTab('security')}
                            className={`relative z-10 flex-1 py-2 text-sm font-medium rounded-full transition-colors duration-200 flex items-center justify-center gap-2 ${activeTab === 'security'
                                ? 'text-zinc-900 dark:text-white'
                                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
                                }`}
                        >
                            <Lock size={16} /> {t.settings.security}
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6">
                    {activeTab === 'profile' ? (
                        <form onSubmit={handleUpdateProfile} className="space-y-6">
                            {/* Avatar Upload */}
                            <div className="flex flex-col items-center gap-4">
                                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                    <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-zinc-100 dark:ring-zinc-800">
                                        <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                                    </div>
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                                        <Camera className="text-white" size={24} />
                                    </div>
                                </div>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleAvatarChange}
                                />
                                <p className="text-xs text-zinc-500">{t.settings.changeAvatar}</p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-medium text-zinc-500 ml-1 mb-1.5 block">{t.settings.displayName}</label>
                                    <Input
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        placeholder={t.settings.displayNamePlaceholder}
                                        className="!bg-zinc-100 dark:!bg-zinc-900"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-zinc-500 ml-1 mb-1.5 block">О себе (Bio)</label>
                                    <div className="relative">
                                        <textarea
                                            value={bio}
                                            onChange={e => setBio(e.target.value)}
                                            placeholder="Расскажите о себе..."
                                            rows={3}
                                            className="w-full bg-zinc-100 dark:bg-zinc-900 border border-transparent focus:border-zinc-400 dark:focus:border-zinc-600 focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700 rounded-2xl py-3 px-5 text-sm text-zinc-900 dark:text-white focus:outline-none transition-all resize-none"
                                        />
                                        <FileText className="absolute right-4 top-3 text-zinc-400" size={16} />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-zinc-500 ml-1 mb-1.5 block">День рождения</label>
                                    <Input
                                        type="date"
                                        value={birthdate}
                                        onChange={e => setBirthdate(e.target.value)}
                                        className="!bg-zinc-100 dark:!bg-zinc-900"
                                        icon={<Calendar size={16} className="!text-zinc-500 dark:!text-zinc-400" />}
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-zinc-500 ml-1 mb-1.5 block">{t.settings.language}</label>
                                    <div className="relative" ref={langDropdownRef}>
                                        <button
                                            type="button"
                                            onClick={() => setIsLangOpen(!isLangOpen)}
                                            className="w-full flex items-center justify-between bg-zinc-100 dark:bg-zinc-900 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-600 focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700 rounded-3xl py-3 px-5 text-sm text-zinc-900 dark:text-white focus:outline-none transition-all duration-200"
                                        >
                                            <span>{language === 'ru' ? 'Русский' : 'English'}</span>
                                            <ChevronDown
                                                size={16}
                                                className={`transition-transform duration-200 ${isLangOpen ? 'rotate-180' : ''}`}
                                            />
                                        </button>

                                        {isLangOpen && (
                                            <div className="absolute top-full mt-2 left-0 right-0 flex flex-col gap-1 bg-zinc-800 dark:bg-zinc-900 p-2 rounded-3xl border border-zinc-700 dark:border-zinc-800 z-10 animate-in fade-in slide-in-from-top-2 duration-200 shadow-xl">
                                                {[
                                                    { value: 'ru', label: 'Русский' },
                                                    { value: 'en', label: 'English' }
                                                ].map((lang) => (
                                                    <button
                                                        key={lang.value}
                                                        type="button"
                                                        onClick={() => {
                                                            setLanguage(lang.value as Language);
                                                            setIsLangOpen(false);
                                                        }}
                                                        className={`px-3 py-2 text-sm font-medium rounded-2xl transition-all text-left flex items-center justify-between ${language === lang.value
                                                            ? 'bg-blue-500 text-white'
                                                            : 'text-zinc-300 hover:text-white hover:bg-zinc-700'
                                                            }`}
                                                    >
                                                        <span>{lang.label}</span>
                                                        {language === lang.value && (
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <Button type="submit" disabled={loading} fullWidth className="!mt-8">
                                {loading ? <Loader2 className="animate-spin" /> : t.settings.saveChanges}
                            </Button>
                        </form>
                    ) : (
                        <form onSubmit={handleUpdateSecurity} className="space-y-6">
                            <div>
                                <label className="text-xs font-medium text-zinc-500 ml-1 mb-1.5 block">{t.settings.emailUsername}</label>
                                <Input
                                    value={newEmail}
                                    onChange={e => setNewEmail(e.target.value)}
                                    placeholder={t.settings.emailPlaceholder}
                                    className="!bg-zinc-100 dark:!bg-zinc-900"
                                    icon={<Mail size={16} />}
                                />
                            </div>

                            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                <label className="text-xs font-medium text-zinc-500 ml-1 mb-1.5 block">{t.settings.newPassword}</label>
                                <div className="mb-3">
                                    <Input
                                        type="password"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder={t.settings.passwordPlaceholder}
                                        className="!bg-zinc-100 dark:!bg-zinc-900"
                                        icon={<Lock size={16} />}
                                    />
                                </div>
                                <Input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder={t.settings.confirmPasswordPlaceholder}
                                    className="!bg-zinc-100 dark:!bg-zinc-900"
                                    icon={<Lock size={16} />}
                                />
                            </div>

                            <Button type="submit" disabled={loading} fullWidth className="!mt-8">
                                {loading ? <Loader2 className="animate-spin" /> : t.settings.updateCredentials}
                            </Button>
                        </form>
                    )}
                </div>

            </div>
        </div>,
        document.body
    );
};
