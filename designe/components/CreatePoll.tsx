import React, { useState, useEffect, useMemo } from 'react';
import { Button, Input } from './UI';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { useLanguage } from '../context/LanguageContext';
import { Loader2, Trash, Plus, Check, Upload, X, ChevronLeft, ChevronRight, Link as LinkIcon, Calendar } from 'lucide-react';
import { CATEGORIES, getCategoryIcon } from '../constants';
import { getApiUrl } from '../config';

type CategoryOption = { id: string; name: string };

// Multi-step "Create poll" wizard (admins + creators).
// Sequence: Category -> Article -> Tags -> Poll -> Review & publish.
// Mirrors the old WordPress post-creation fields (source/istochnik, poll end date/okonchanie_oprosa).
const TOTAL_STEPS = 5;

export const CreatePoll: React.FC = () => {
    const { user } = useAuth();
    const { t } = useLanguage();
    const { showAlert } = useDialog();

    const [step, setStep] = useState(1);

    // Categories shown in the feed sidebar (from real data), merged with the
    // canonical list so the wizard offers exactly what the user sees on the left
    // (plus any not-yet-used categories) with the same icons.
    const [serverCategories, setServerCategories] = useState<CategoryOption[]>([]);

    useEffect(() => {
        fetch(getApiUrl('/api/categories'))
            .then(res => (res.ok ? res.json() : []))
            .then(data => {
                if (Array.isArray(data)) {
                    setServerCategories(
                        data
                            .filter(item => item && item.id)
                            .map(item => ({ id: String(item.id), name: String(item.name || item.id) }))
                    );
                }
            })
            .catch(() => { /* fall back to the canonical list */ });
    }, []);

    const categoryOptions: CategoryOption[] = useMemo(() => {
        const byId = new Map<string, CategoryOption>();
        CATEGORIES.forEach(c => byId.set(c.id, { id: c.id, name: c.name }));
        serverCategories.forEach(c => { if (!byId.has(c.id)) byId.set(c.id, c); });
        return Array.from(byId.values());
    }, [serverCategories]);

    // Article fields
    const [category, setCategory] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [image, setImage] = useState('');
    const [source, setSource] = useState('');

    // Tags
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');

    // Poll fields
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState<string[]>(['', '']);
    const [pollEndDate, setPollEndDate] = useState('');

    const [creating, setCreating] = useState(false);

    const handleOptionChange = (index: number, value: string) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const addOption = () => setOptions([...options, '']);
    const removeOption = (index: number) => setOptions(options.filter((_, i) => i !== index));

    const parseTags = (value: string) =>
        value
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean);

    const addTag = (value: string) => {
        const newTags = parseTags(value);
        if (!newTags.length) return;

        setTags(prevTags => {
            const existing = new Set(prevTags.map(tag => tag.toLowerCase()));
            const toAdd = newTags.filter(tag => !existing.has(tag.toLowerCase()));
            return [...prevTags, ...toAdd];
        });
    };

    const removeTag = (index: number) => {
        setTags(prevTags => prevTags.filter((_, i) => i !== index));
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const formData = new FormData();
            formData.append('image', file);

            try {
                const res = await fetch(getApiUrl('/api/upload'), {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: formData
                });
                if (res.ok) {
                    const data = await res.json();
                    setImage(data.url);
                } else {
                    showAlert(t.admin.uploadFailed);
                }
            } catch (err) {
                console.error(err);
            }
        }
    };

    // Merge the loose tagInput with the committed chips.
    const collectTags = () => {
        const inlineTags = parseTags(tagInput);
        const allTags = [...tags];
        const existing = new Set(allTags.map(tag => tag.toLowerCase()));
        inlineTags.forEach(tag => {
            if (!existing.has(tag.toLowerCase())) {
                allTags.push(tag);
                existing.add(tag.toLowerCase());
            }
        });
        return allTags;
    };

    const filledOptions = options.map(o => o.trim()).filter(Boolean);
    const uniqueFilledCount = new Set(filledOptions.map(o => o.toLowerCase())).size;

    // The backend expects an absolute http(s) URL. Auto-prefix a bare domain so
    // a creator typing "example.com/article" doesn't fail the whole publish.
    const normalizeSourceUrl = (value: string): string => {
        const trimmed = value.trim();
        if (!trimmed) return '';
        if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) return trimmed;
        return `https://${trimmed}`;
    };

    // Per-step validation used both to gate "Next" and to show hints.
    const canProceed = (currentStep: number): boolean => {
        switch (currentStep) {
            case 1:
                return category !== '';
            case 2:
                return title.trim().length >= 5 && description.trim().length >= 10 && image.trim() !== '';
            case 3:
                return true; // tags optional
            case 4:
                return question.trim().length >= 5
                    && filledOptions.length >= 2
                    && uniqueFilledCount === filledOptions.length;
            default:
                return true;
        }
    };

    const stepHint = (currentStep: number): string => {
        switch (currentStep) {
            case 1:
                return t.wizard.validationCategory;
            case 2:
                return t.wizard.validationContent;
            case 4:
                if (question.trim().length < 5 || filledOptions.length < 2) return t.wizard.validationPoll;
                if (uniqueFilledCount !== filledOptions.length) return t.wizard.validationPollUnique;
                return '';
            default:
                return '';
        }
    };

    const goNext = () => {
        if (!canProceed(step)) return;
        setStep(s => Math.min(TOTAL_STEPS, s + 1));
    };
    const goBack = () => setStep(s => Math.max(1, s - 1));

    const resetForm = () => {
        setStep(1);
        setCategory('');
        setTitle('');
        setDescription('');
        setImage('');
        setSource('');
        setTags([]);
        setTagInput('');
        setQuestion('');
        setOptions(['', '']);
        setPollEndDate('');
    };

    const publish = async () => {
        setCreating(true);
        try {
            const payload = {
                title,
                description,
                image,
                category,
                source: normalizeSourceUrl(source),
                tags: collectTags(),
                poll: {
                    question,
                    options: filledOptions,
                    endDate: pollEndDate || undefined,
                },
            };

            const res = await fetch(getApiUrl('/api/news'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                showAlert(t.admin.newsCreated);
                resetForm();
            } else {
                // Surface the server's field-level validation message instead of a generic error.
                const errBody = await res.json().catch(() => null);
                const fieldMessage = errBody?.errors?.[0]?.message || errBody?.message;
                showAlert(fieldMessage || t.admin.newsCreateFailed);
            }
        } catch (e) {
            console.error(e);
            showAlert(t.admin.newsCreateFailed);
        } finally {
            setCreating(false);
        }
    };

    if (!user || (user.role !== 'admin' && user.role !== 'creator')) {
        return <div className="p-8 text-center text-white">{t.admin.accessDenied}</div>;
    }

    const stepTitles = [
        t.wizard.stepCategory,
        t.wizard.stepContent,
        t.wizard.stepTags,
        t.wizard.stepPoll,
        t.wizard.stepReview,
    ];

    const selectedCategory = categoryOptions.find(c => c.id === category);

    return (
        <div className="bg-white dark:bg-[#121212] rounded-2xl lg:rounded-[32px] p-4 lg:p-8 border border-zinc-200 dark:border-zinc-800 w-full">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                <h2 className="text-2xl font-bold dark:text-white">{t.wizard.title}</h2>
                <span className="text-sm text-zinc-500">
                    {t.wizard.stepLabel} {step} {t.wizard.of} {TOTAL_STEPS}
                </span>
            </div>

            {/* Progress stepper */}
            <div className="flex items-center mb-8">
                {stepTitles.map((label, i) => {
                    const index = i + 1;
                    const active = index === step;
                    const done = index < step;
                    return (
                        <React.Fragment key={label}>
                            <div className="flex flex-col items-center gap-1.5 shrink-0">
                                <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border transition-colors ${
                                        done
                                            ? 'bg-blue-600 border-blue-600 text-white'
                                            : active
                                                ? 'bg-blue-50 border-blue-500 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
                                                : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400'
                                    }`}
                                >
                                    {done ? <Check size={16} /> : index}
                                </div>
                                <span className={`text-[10px] lg:text-xs font-medium text-center ${active ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400'}`}>
                                    {label}
                                </span>
                            </div>
                            {index < TOTAL_STEPS && (
                                <div className={`flex-1 h-0.5 mx-1 lg:mx-2 mb-5 rounded ${index < step ? 'bg-blue-500' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Step content */}
            <div className="min-h-[280px]">
                {/* Step 1 — Category */}
                {step === 1 && (
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{t.wizard.selectCategoryHint}</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full">
                            {categoryOptions.map(cat => {
                                const CatIcon = getCategoryIcon(cat.id);
                                const selected = category === cat.id;
                                return (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setCategory(cat.id)}
                                        className={`flex items-center gap-2 p-3 rounded-xl border transition-all text-left ${selected
                                            ? 'bg-blue-50 border-blue-500 text-blue-600 dark:bg-blue-500/20 dark:border-blue-500 dark:text-blue-400 shadow-sm ring-1 ring-blue-500/20'
                                            : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-white dark:hover:bg-zinc-900'
                                            }`}
                                    >
                                        <span className={selected ? 'text-blue-500' : 'text-zinc-400'}>
                                            <CatIcon size={18} />
                                        </span>
                                        <span className="text-sm font-medium truncate">{cat.name}</span>
                                        {selected && <Check size={14} className="ml-auto shrink-0" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Step 2 — Article content */}
                {step === 2 && (
                    <div className="space-y-4">
                        <Input placeholder={t.admin.titlePlaceholder} value={title} onChange={e => setTitle(e.target.value)} className="!bg-zinc-100 dark:!bg-zinc-900" />
                        <textarea
                            placeholder={t.admin.descriptionPlaceholder}
                            className="w-full p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                            rows={4}
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                        />

                        {/* Cover image */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{t.admin.coverImage}</label>
                            <div className="flex items-center gap-4">
                                <div className="relative flex-1">
                                    <Input
                                        placeholder={t.admin.imageUrl}
                                        value={image}
                                        onChange={e => setImage(e.target.value)}
                                        className="!bg-zinc-100 dark:!bg-zinc-900 pr-12"
                                    />
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                        <label className="p-2 cursor-pointer text-zinc-500 hover:text-blue-500 transition-colors">
                                            <Upload size={20} />
                                            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                        </label>
                                    </div>
                                </div>
                                {image && (
                                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-900 shrink-0 border border-zinc-200 dark:border-zinc-800">
                                        <img src={image} alt="Preview" className="w-full h-full object-cover" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Source (istochnik) */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                {t.wizard.sourceLabel} <span className="text-zinc-400 font-normal">({t.wizard.optional})</span>
                            </label>
                            <Input
                                placeholder={t.wizard.sourcePlaceholder}
                                value={source}
                                onChange={e => setSource(e.target.value)}
                                icon={<LinkIcon size={16} />}
                                className="!bg-zinc-100 dark:!bg-zinc-900"
                            />
                        </div>
                    </div>
                )}

                {/* Step 3 — Tags */}
                {step === 3 && (
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                            {t.admin.tags} <span className="text-zinc-400 font-normal">({t.wizard.optional})</span>
                        </label>
                        <div className="space-y-2">
                            <Input
                                placeholder={t.admin.tagsPlaceholder}
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ',') {
                                        e.preventDefault();
                                        addTag(tagInput);
                                        setTagInput('');
                                    }
                                }}
                                className="!bg-zinc-100 dark:!bg-zinc-900"
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                fullWidth
                                onClick={() => {
                                    addTag(tagInput);
                                    setTagInput('');
                                }}
                            >
                                {t.admin.addTag}
                            </Button>
                        </div>
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1">
                                {tags.map((tag, index) => (
                                    <div
                                        key={`${tag}-${index}`}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-sm"
                                    >
                                        <span>{tag}</span>
                                        <button
                                            type="button"
                                            onClick={() => removeTag(index)}
                                            className="text-zinc-500 hover:text-red-500 transition-colors"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Step 4 — Poll */}
                {step === 4 && (
                    <div className="space-y-4">
                        <div className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/20">
                            <h4 className="font-medium mb-3 dark:text-white">{t.admin.pollConfig}</h4>
                            <Input placeholder={t.admin.questionPlaceholder} value={question} onChange={e => setQuestion(e.target.value)} className="!bg-zinc-100 dark:!bg-zinc-900 mb-3" />

                            <div className="space-y-2">
                                {options.map((opt, i) => (
                                    <div key={i} className="flex gap-2">
                                        <Input
                                            placeholder={`${t.admin.optionPlaceholder} ${i + 1}`}
                                            value={opt}
                                            onChange={e => handleOptionChange(i, e.target.value)}
                                            className="!bg-zinc-100 dark:!bg-zinc-900"
                                        />
                                        {options.length > 2 && (
                                            <button type="button" onClick={() => removeOption(i)} className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                                                <Trash size={20} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <Button type="button" onClick={addOption} variant="secondary" className="mt-3 text-sm">
                                <Plus size={16} className="mr-1" /> {t.admin.addOption}
                            </Button>
                        </div>

                        {/* Poll end date (okonchanie_oprosa) */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                                <Calendar size={16} /> {t.wizard.pollEndDateLabel} <span className="text-zinc-400 font-normal">({t.wizard.optional})</span>
                            </label>
                            <input
                                type="date"
                                value={pollEndDate}
                                onChange={e => setPollEndDate(e.target.value)}
                                className="w-full p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                            />
                            <p className="text-xs text-zinc-400">{t.wizard.pollEndDateHint}</p>
                        </div>
                    </div>
                )}

                {/* Step 5 — Review */}
                {step === 5 && (
                    <div className="space-y-4">
                        <h4 className="font-semibold text-lg dark:text-white">{t.wizard.reviewHeading}</h4>
                        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
                            <ReviewRow label={t.wizard.reviewCategory} value={selectedCategory ? selectedCategory.name : category} />
                            <ReviewRow label={t.admin.titleLabel} value={title} />
                            <ReviewRow label={t.admin.descriptionLabel} value={description} />
                            <ReviewRow label={t.wizard.sourceLabel} value={source || t.wizard.reviewNoSource} muted={!source} />
                            <ReviewRow label={t.admin.tags} value={collectTags().join(', ') || t.wizard.reviewNoTags} muted={collectTags().length === 0} />
                            <ReviewRow label={t.admin.question} value={question} />
                            <ReviewRow label={t.admin.option} value={filledOptions.map((o, i) => `${i + 1}. ${o}`).join('  •  ')} />
                            <ReviewRow label={t.wizard.pollEndDateLabel} value={pollEndDate || t.wizard.reviewNoEndDate} muted={!pollEndDate} />
                        </div>
                        {image && (
                            <div className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 max-h-56">
                                <img src={image} alt="Preview" className="w-full h-full object-cover" />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Validation hint */}
            {!canProceed(step) && step !== 5 && (
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-4">{stepHint(step)}</p>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between gap-3 mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                <Button
                    type="button"
                    variant="secondary"
                    onClick={goBack}
                    disabled={step === 1}
                    className={step === 1 ? 'opacity-0 pointer-events-none' : ''}
                >
                    <ChevronLeft size={18} /> {t.wizard.back}
                </Button>

                {step < TOTAL_STEPS ? (
                    <Button
                        type="button"
                        variant="primary"
                        onClick={goNext}
                        disabled={!canProceed(step)}
                        className="!bg-blue-600 text-white hover:!bg-blue-500 disabled:!bg-zinc-300 dark:disabled:!bg-zinc-800 disabled:cursor-not-allowed"
                    >
                        {t.wizard.next} <ChevronRight size={18} />
                    </Button>
                ) : (
                    <Button
                        type="button"
                        variant="primary"
                        onClick={publish}
                        disabled={creating}
                        className="!bg-blue-600 text-white hover:!bg-blue-500 !px-8 shadow-lg shadow-blue-500/20"
                    >
                        {creating ? <Loader2 className="animate-spin" /> : t.admin.publishNews}
                    </Button>
                )}
            </div>
        </div>
    );
};

const ReviewRow: React.FC<{ label: string; value: string; muted?: boolean }> = ({ label, value, muted }) => (
    <div className="flex gap-4 px-4 py-3">
        <span className="text-xs uppercase tracking-wider text-zinc-400 w-28 shrink-0 pt-0.5">{label}</span>
        <span className={`text-sm break-words ${muted ? 'text-zinc-400 italic' : 'text-zinc-800 dark:text-zinc-200'}`}>{value}</span>
    </div>
);
