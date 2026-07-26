import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Search, ArrowUp, ArrowDown, ChevronsUpDown, Info } from 'lucide-react';
import { getApiUrl } from '../config';
import { Avatar } from './Avatar';
import { UserDetailsModal, AdminUserRow } from './UserDetailsModal';
import { formatDateTime } from '../utils/date';

// Columns the table can be ordered by. The key is sent to the API, which whitelists it —
// nothing here is interpolated into SQL.
type SortKey = 'created_at' | 'last_seen' | 'points' | 'name' | 'role';
type SortOrder = 'asc' | 'desc';

export const AdminPanel: React.FC = () => {
    const { user } = useAuth();
    const { t } = useLanguage();
    const [users, setUsers] = useState<AdminUserRow[]>([]);
    const [loading, setLoading] = useState(true);

    // User Management State
    const [userSearch, setUserSearch] = useState('');
    // Newest registrations first — the default the admin panel is most often opened for.
    const [sortKey, setSortKey] = useState<SortKey>('created_at');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch(getApiUrl(`/api/admin/users?sort=${sortKey}&order=${sortOrder}`), {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUsers(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [sortKey, sortOrder]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

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

    // Clicking the active column flips the direction; a new column starts on the direction that
    // is useful first (newest date, highest score, A→Z for text).
    const toggleSort = (key: SortKey) => {
        if (key === sortKey) {
            setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
            return;
        }
        setSortKey(key);
        setSortOrder(key === 'name' || key === 'role' ? 'asc' : 'desc');
    };

    const filteredUsers = useMemo(() => {
        const query = userSearch.trim().toLowerCase();
        if (!query) return users;

        return users.filter(u =>
            u.username.toLowerCase().includes(query) ||
            (u.name && u.name.toLowerCase().includes(query))
        );
    }, [users, userSearch]);

    const selectedUser = useMemo(
        () => users.find((u) => u.id === selectedUserId) || null,
        [users, selectedUserId]
    );

    if (!user || user.role !== 'admin') {
        return <div className="p-8 text-center text-white">{t.admin.accessDenied}</div>;
    }

    const SortHeader: React.FC<{ column: SortKey; label: string; className?: string }> = ({ column, label, className = '' }) => {
        const isActive = sortKey === column;
        const Icon = !isActive ? ChevronsUpDown : sortOrder === 'asc' ? ArrowUp : ArrowDown;

        return (
            <th className={`pb-3 font-medium text-sm uppercase tracking-wider ${className}`}>
                <button
                    onClick={() => toggleSort(column)}
                    className={`inline-flex items-center gap-1.5 transition-colors ${isActive
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                        }`}
                    aria-label={`${t.admin.sortBy}: ${label}`}
                >
                    <span>{label}</span>
                    <Icon size={13} className={isActive ? '' : 'opacity-50'} />
                </button>
            </th>
        );
    };

    return (
        <div className="bg-white dark:bg-[#121212] rounded-2xl lg:rounded-[32px] p-4 lg:p-8 border border-zinc-200 dark:border-zinc-800 w-full">
            <h2 className="text-2xl font-bold mb-6 dark:text-white">{t.admin.title}</h2>

            {/* User Management (Admin Only) */}
            <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
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

                <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 mb-5">
                    <Info size={13} className="shrink-0" />
                    {t.admin.openProfileHint}
                </p>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-zinc-200 dark:border-zinc-800">
                                {/* Position in the current ordering — not the user id, so it stays
                                    1..N whichever column the table is sorted by. */}
                                <th className="pb-3 pl-2 pr-1 w-10 text-zinc-500 dark:text-zinc-400 font-medium text-sm uppercase tracking-wider">#</th>
                                <SortHeader column="name" label={t.admin.user} />
                                <SortHeader column="created_at" label={t.admin.registered} />
                                <SortHeader column="last_seen" label={t.admin.lastSeen} className="hidden lg:table-cell" />
                                <SortHeader column="points" label={t.points} />
                                <SortHeader column="role" label={t.admin.role} />
                                <th className="pb-3 pr-2 dark:text-zinc-400 text-zinc-500 font-medium text-sm uppercase tracking-wider text-right">{t.admin.actions}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7} className="text-center py-8 text-zinc-500">{t.admin.loadingUsers}</td></tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr><td colSpan={7} className="text-center py-8 text-zinc-500">{t.admin.noUsers}</td></tr>
                            ) : filteredUsers.map((u, index) => (
                                <tr
                                    key={u.id}
                                    onClick={() => setSelectedUserId(u.id)}
                                    className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors cursor-pointer"
                                >
                                    <td className="py-3 pl-2 pr-1 text-sm font-mono tabular-nums text-zinc-400 dark:text-zinc-500">
                                        {index + 1}
                                    </td>
                                    <td className="py-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Avatar
                                                src={u.avatar || ''}
                                                alt={u.name || u.username}
                                                size={36}
                                                className="shrink-0 rounded-full"
                                                fallbackText={u.name || u.username}
                                            />
                                            <div className="min-w-0">
                                                <div className="font-medium dark:text-white truncate">{u.name || u.username}</div>
                                                {u.name && u.name !== u.username && <div className="text-xs text-zinc-500 truncate">@{u.username}</div>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-3 text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                                        {formatDateTime(u.created_at, '—')}
                                    </td>
                                    <td className="py-3 text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap hidden lg:table-cell">
                                        {u.last_seen ? formatDateTime(u.last_seen, t.admin.never) : t.admin.never}
                                    </td>
                                    <td className="py-3 dark:text-zinc-400 font-mono tabular-nums">{u.points?.toLocaleString() ?? 0}</td>
                                    <td className="py-3">
                                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400' :
                                            u.role === 'creator' ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' :
                                                'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                                            }`}>
                                            {u.role}
                                        </span>
                                    </td>
                                    {/* The row itself opens the profile, so the inline control must not bubble. */}
                                    <td className="py-3 pr-2 text-right" onClick={(e) => e.stopPropagation()}>
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

            <UserDetailsModal
                isOpen={selectedUserId !== null}
                onClose={() => setSelectedUserId(null)}
                userId={selectedUserId}
                fallback={selectedUser}
                onRoleChange={changeRole}
            />
        </div>
    );
};
