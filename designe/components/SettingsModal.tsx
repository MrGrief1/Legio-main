import React, { useState, useRef, useEffect } from 'react';
import { getApiUrl } from '../config';
import { createPortal } from 'react-dom';
import { X, Lock, User as UserIcon, Camera, Loader2, FileText, Globe, Palette } from 'lucide-react';
import { Button, Input } from './UI';
import { Avatar } from './Avatar';
import { DatePicker } from './DatePicker';
import { Select } from './Select';
import { ThemeSelector } from './ThemeSelector';
import { SecuritySettings } from './SecuritySettings';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { Language } from '../translations';
import { useMountTransition } from '../hooks/useMountTransition';
import { useScrollLock } from '../hooks/useScrollLock';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const { user, login, refreshUser } = useAuth();
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

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Read through a ref so the sync effect below can seed itself from the current user without
    // taking `user` as a dependency.
    const userRef = useRef(user);
    userRef.current = user;

    // Seed the form from the account — ON OPEN ONLY.
    //
    // This deliberately does not depend on `user`. The account is re-read on a timer and whenever
    // the window regains focus, which replaces the `user` object; if that re-ran this effect, every
    // refresh would overwrite the fields with the saved values and discard whatever was being typed.
    // Switching windows to copy a bio and coming back would wipe it — the "I filled it in and it
    // reset" failure. The form owns its state from the moment it opens until it is saved or closed.
    useEffect(() => {
        if (!isOpen) return;

        const current = userRef.current;
        if (!current) return;

        setNewName(current.name || current.username || '');
        setBio(current.bio || '');
        setBirthdate(current.birthdate || '');
        setAvatarPreview(current.avatar || '');
        setAvatarFile(null);
    }, [isOpen]);

    // Lock body scroll
    useScrollLock(isOpen);

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
                const uploadRes = await fetch(getApiUrl('/api/upload'), {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                    body: formData
                });
                if (uploadRes.ok) {
                    const data = await uploadRes.json();
                    avatarUrl = data.url;
                }
            }

            const res = await fetch(getApiUrl('/api/user/update'), {
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
                // Push the saved record straight into context, then re-read it from the server so
                // anything the server derived (level, points) is current too. No page reload: the
                // old `window.location.reload()` threw away in-flight state and made a successful
                // save look like the form had been wiped.
                if (data.user) {
                    login(localStorage.getItem('token') || '', data.user);
                }
                await refreshUser();
                setAvatarFile(null);
                showToast(t.settings.profileUpdated, 'success');
                onClose();
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

    if (!hasTransitionedIn && !isOpen) return null;

    return createPortal(
        // p-0 below sm: the panel is already sized h-full/rounded-none for phones, but this
        // wrapper's padding was insetting it on all four sides, so it never actually reached the
        // edges. Padding returns from sm up, where the modal is a centred card again.
        <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-4 transition-all duration-300 ${isOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'}`}>
            {/* Blur Overlay */}
            <div
                className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ease-out ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            />

            {/* Modal Content */}
            <div
                // The scale-in is only applied from sm up: scaling a full-screen sheet leaves a
                // visible gap around it mid-animation, so on phones it just fades.
                className={`relative bg-white dark:bg-[#121212] w-full h-full sm:h-auto sm:max-w-2xl rounded-none sm:rounded-[32px] border-0 sm:border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden sm:max-h-[90vh] overflow-y-auto custom-scrollbar will-change-transform transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? 'opacity-100 sm:scale-100' : 'opacity-0 sm:scale-95'}`}
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
                                        <Avatar src={avatarPreview} alt="Avatar" size={96} fill className="object-cover" fallbackText={user?.name || user?.username} />
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
                                    <label className="text-xs font-medium text-zinc-500 ml-1 mb-1.5 block">{t.settings.bio}</label>
                                    <div className="relative">
                                        <textarea
                                            value={bio}
                                            onChange={e => setBio(e.target.value)}
                                            placeholder={t.settings.bioPlaceholder}
                                            rows={3}
                                            className="w-full bg-zinc-100 dark:bg-zinc-900 border border-transparent focus:border-zinc-400 dark:focus:border-zinc-600 focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700 rounded-2xl py-3 px-5 text-sm text-zinc-900 dark:text-white focus:outline-none transition-all resize-none"
                                        />
                                        <FileText className="absolute right-4 top-3 text-zinc-400" size={16} />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-zinc-500 ml-1 mb-1.5 block">{t.settings.birthdate}</label>
                                    <DatePicker
                                        value={birthdate}
                                        onChange={setBirthdate}
                                        placeholder={t.settings.birthdatePlaceholder}
                                        ariaLabel={t.settings.birthdate}
                                    />
                                </div>
                            </div>

                            {/* Настройки приложения. Отделены от полей профиля: они не про аккаунт,
                                применяются сразу и кнопки «Сохранить» не ждут. */}
                            <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
                                <div>
                                    <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 ml-1 mb-2">
                                        <Palette size={13} /> {t.settings.theme}
                                    </label>
                                    <ThemeSelector />
                                    <p className="text-[11px] text-zinc-400 dark:text-zinc-600 mt-2 ml-1">{t.settings.themeHint}</p>
                                </div>

                                <div>
                                    <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 ml-1 mb-2">
                                        <Globe size={13} /> {t.settings.language}
                                    </label>
                                    <Select<Language>
                                        value={language}
                                        onChange={setLanguage}
                                        ariaLabel={t.settings.language}
                                        options={[
                                            { value: 'ru', label: 'Русский' },
                                            { value: 'en', label: 'English' },
                                        ]}
                                    />
                                </div>
                            </div>

                            <Button type="submit" disabled={loading} fullWidth className="!mt-8">
                                {loading ? <Loader2 className="animate-spin" /> : t.settings.saveChanges}
                            </Button>
                        </form>
                    ) : (
                        <SecuritySettings />
                    )}
                </div>

            </div>
        </div>,
        document.body
    );
};
