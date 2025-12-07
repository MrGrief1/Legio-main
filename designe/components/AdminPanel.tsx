import React, { useState, useEffect } from 'react';
import { Button, Input } from './UI';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { Loader2, Trash, Plus, Check, Upload, Search } from 'lucide-react';
import { CATEGORIES } from '../constants';
import { getApiUrl } from '../config';

interface User {
    id: number;
    username: string;
    name?: string;
    role: string;
    points: number;
}

export const AdminPanel: React.FC = () => {
    const { user } = useAuth();
    const { showAlert } = useDialog();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    // Form state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [image, setImage] = useState('');
    const [tags, setTags] = useState('');
    const [category, setCategory] = useState('general');
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState<string[]>(['', '']);
    const [creating, setCreating] = useState(false);

    // User Management State
    const [userSearch, setUserSearch] = useState('');

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await fetch(getApiUrl('/api/admin/users'), {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const changeRole = async (id: number, newRole: string) => {
        try {
            await fetch(getApiUrl(`/api/admin/users/${id}/role`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ role: newRole })
            });
            fetchUsers(); // Refresh list
        } catch (e) {
            console.error(e);
        }
    };

    const handleOptionChange = (index: number, value: string) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const addOption = () => setOptions([...options, '']);
    const removeOption = (index: number) => setOptions(options.filter((_, i) => i !== index));

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
                    showAlert('Upload failed');
                }
            } catch (err) {
                console.error(err);
            }
        }
    };

    const createNews = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        try {
            const payload = {
                title,
                description,
                image,
                category,
                tags: tags.split(',').map(t => t.trim()),
                poll: {
                    question,
                    options: options.filter(o => o.trim() !== '')
                }
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
                showAlert('News created successfully!');
                // Reset form
                setTitle('');
                setDescription('');
                setImage('');
                setTags('');
                setCategory('general');
                setQuestion('');
                setOptions(['', '']);
            } else {
                showAlert('Failed to create news');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setCreating(false);
        }
    };

    if (!user || (user.role !== 'admin' && user.role !== 'creator')) {
        return <div className="p-8 text-center text-white">Access Denied</div>;
    }

    const filteredUsers = users.filter(u =>
        u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.name && u.name.toLowerCase().includes(userSearch.toLowerCase()))
    );

    return (
        <div className="bg-white dark:bg-[#121212] rounded-[32px] p-6 lg:p-8 border border-zinc-200 dark:border-zinc-800">
            <h2 className="text-2xl font-bold mb-6 dark:text-white">Admin Panel</h2>

            {/* Create News Form */}
            <div className="mb-12">
                <h3 className="text-xl font-semibold mb-4 dark:text-white">Create News & Poll</h3>
                <form onSubmit={createNews} className="space-y-4">
                    <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} className="!bg-zinc-100 dark:!bg-zinc-900" required />
                    <textarea
                        placeholder="Description"
                        className="w-full p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                        rows={3}
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        required
                    />

                    {/* Custom Image Upload */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Cover Image</label>
                        <div className="flex items-center gap-4">
                            <div className="relative flex-1">
                                <Input
                                    placeholder="Image URL (or upload file)"
                                    value={image}
                                    onChange={e => setImage(e.target.value)}
                                    className="!bg-zinc-100 dark:!bg-zinc-900 pr-12"
                                    required
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

                    <div className="space-y-2">
                        <Input placeholder="Tags (comma separated, e.g., Auto, Sport)" value={tags} onChange={e => setTags(e.target.value)} className="!bg-zinc-100 dark:!bg-zinc-900" />
                    </div>

                    {/* Custom Category Selector */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Category</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {CATEGORIES.map(cat => (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => setCategory(cat.id)}
                                    className={`flex items-center gap-2 p-3 rounded-xl border transition-all text-left ${category === cat.id
                                            ? 'bg-blue-50 border-blue-500 text-blue-600 dark:bg-blue-500/20 dark:border-blue-500 dark:text-blue-400 shadow-sm ring-1 ring-blue-500/20'
                                            : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-white dark:hover:bg-zinc-900'
                                        }`}
                                >
                                    <span className={category === cat.id ? 'text-blue-500' : 'text-zinc-400'}>
                                        {cat.icon}
                                    </span>
                                    <span className="text-sm font-medium truncate">{cat.name}</span>
                                    {category === cat.id && <Check size={14} className="ml-auto shrink-0" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/20">
                        <h4 className="font-medium mb-3 dark:text-white">Poll Configuration</h4>
                        <Input placeholder="Question" value={question} onChange={e => setQuestion(e.target.value)} className="!bg-zinc-100 dark:!bg-zinc-900 mb-3" required />

                        <div className="space-y-2">
                            {options.map((opt, i) => (
                                <div key={i} className="flex gap-2">
                                    <Input
                                        placeholder={`Option ${i + 1}`}
                                        value={opt}
                                        onChange={e => handleOptionChange(i, e.target.value)}
                                        className="!bg-zinc-100 dark:!bg-zinc-900"
                                        required
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
                            <Plus size={16} className="mr-1" /> Add Option
                        </Button>
                    </div>

                    <Button type="submit" variant="primary" disabled={creating} fullWidth className="!bg-blue-600 text-white hover:!bg-blue-500 !py-4 !text-base shadow-lg shadow-blue-500/20">
                        {creating ? <Loader2 className="animate-spin" /> : 'Publish News'}
                    </Button>
                </form>
            </div>

            {/* User Management (Admin Only) */}
            {user.role === 'admin' && (
                <div>
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-semibold dark:text-white">User Management</h3>
                        <div className="relative w-64">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                placeholder="Search users..."
                                value={userSearch}
                                onChange={e => setUserSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 rounded-full bg-zinc-100 dark:bg-zinc-900 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm dark:text-white placeholder-zinc-400"
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                                    <th className="pb-3 pl-2 dark:text-zinc-400 font-medium text-sm uppercase tracking-wider">User</th>
                                    <th className="pb-3 dark:text-zinc-400 font-medium text-sm uppercase tracking-wider">Points</th>
                                    <th className="pb-3 dark:text-zinc-400 font-medium text-sm uppercase tracking-wider">Role</th>
                                    <th className="pb-3 pr-2 dark:text-zinc-400 font-medium text-sm uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={4} className="text-center py-8 text-zinc-500">Loading users...</td></tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr><td colSpan={4} className="text-center py-8 text-zinc-500">No users found</td></tr>
                                ) : filteredUsers.map(u => (
                                    <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors">
                                        <td className="py-3 pl-2">
                                            <div className="font-medium dark:text-white">{u.name || u.username}</div>
                                            {u.name && u.name !== u.username && <div className="text-xs text-zinc-500">@{u.username}</div>}
                                        </td>
                                        <td className="py-3 dark:text-zinc-400 font-mono">{u.points}</td>
                                        <td className="py-3">
                                            <span className={`px-2 py-1 rounded-md text-xs font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400' :
                                                    u.role === 'creator' ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' :
                                                        'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                                                }`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="py-3 pr-2 text-right">
                                            <select
                                                value={u.role}
                                                onChange={(e) => changeRole(u.id, e.target.value)}
                                                className="bg-zinc-100 dark:bg-zinc-900 border-none rounded-lg px-3 py-1.5 text-sm dark:text-white cursor-pointer focus:ring-2 focus:ring-blue-500 outline-none"
                                            >
                                                <option value="user">User</option>
                                                <option value="creator">Creator</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
