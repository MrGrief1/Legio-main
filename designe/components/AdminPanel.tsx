import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Search } from 'lucide-react';
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
    const { t } = useLanguage();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

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

    if (!user || user.role !== 'admin') {
        return <div className="p-8 text-center text-white">{t.admin.accessDenied}</div>;
    }

    const filteredUsers = users.filter(u =>
        u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.name && u.name.toLowerCase().includes(userSearch.toLowerCase()))
    );

    return (
        <div className="bg-white dark:bg-[#121212] rounded-2xl lg:rounded-[32px] p-4 lg:p-8 border border-zinc-200 dark:border-zinc-800 w-full">
            <h2 className="text-2xl font-bold mb-6 dark:text-white">{t.admin.title}</h2>

            {/* User Management (Admin Only) */}
            <div>
                <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                    <h3 className="text-xl font-semibold dark:text-white">{t.admin.userManagement}</h3>
                    <div className="relative w-64 max-w-full">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input
                            type="text"
                            placeholder={t.admin.searchUsers}
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
                                <th className="pb-3 pl-2 dark:text-zinc-400 font-medium text-sm uppercase tracking-wider">{t.admin.user}</th>
                                <th className="pb-3 dark:text-zinc-400 font-medium text-sm uppercase tracking-wider">{t.points}</th>
                                <th className="pb-3 dark:text-zinc-400 font-medium text-sm uppercase tracking-wider">{t.admin.role}</th>
                                <th className="pb-3 pr-2 dark:text-zinc-400 font-medium text-sm uppercase tracking-wider text-right">{t.admin.actions}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={4} className="text-center py-8 text-zinc-500">{t.admin.loadingUsers}</td></tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-8 text-zinc-500">{t.admin.noUsers}</td></tr>
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
        </div>
    );
};
