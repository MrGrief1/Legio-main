import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Search, Send, MoreVertical, Paperclip, Smile, ChevronLeft, Info as InfoIcon, Shield, Image as ImageIcon, Film, Calendar, User, ArrowUp, MessageCircle, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useDialog } from '../context/DialogContext';
import { ChatContactItem, ChatMessageItem, Message, ChatContact } from './ChatComponents';
import { useMountTransition } from '../hooks/useMountTransition';

interface ChatModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ChatModal: React.FC<ChatModalProps> = React.memo(({ isOpen, onClose }) => {
    const { user } = useAuth();
    const { t } = useLanguage();
    const { showAlert, showConfirm } = useDialog();
    const hasTransitionedIn = useMountTransition(isOpen, 300);
    const [activeChatId, setActiveChatId] = useState<number | null>(null);
    const [contacts, setContacts] = useState<ChatContact[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [showMobileChat, setShowMobileChat] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [showContactInfo, setShowContactInfo] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const prevMessagesLength = useRef(0);
    const lastMessageIdRef = useRef(0);

    const activeContact = contacts.find(c => c.id === activeChatId);

    // Keep track of last message ID
    useEffect(() => {
        if (messages.length > 0) {
            lastMessageIdRef.current = messages[messages.length - 1].id;
        } else {
            lastMessageIdRef.current = 0;
        }
    }, [messages]);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
        if (isOpen || user) {
            fetchChats();
        }
    }, [isOpen, user]);

    // Optimized polling with visibility check
    useEffect(() => {
        let timeoutId: NodeJS.Timeout;

        const pollMessages = async () => {
            if (!activeChatId || !isOpen) return;

            if (document.hidden) {
                timeoutId = setTimeout(pollMessages, 5000);
                return;
            }

            try {
                const token = localStorage.getItem('token');
                const lastId = lastMessageIdRef.current;
                const response = await fetch(`http://localhost:3001/api/chats/${activeChatId}/messages?afterId=${lastId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.length > 0) {
                        setMessages(prev => {
                            // Avoid duplicates if any
                            const newMsgs = data.filter((m: Message) => !prev.some(p => p.id === m.id));
                            if (newMsgs.length === 0) return prev;
                            return [...prev, ...newMsgs];
                        });
                    }

                    if (activeContact?.unread_count && activeContact.unread_count > 0) {
                        markMessagesAsRead(activeChatId);
                    }
                }
            } catch (error) {
                console.error('Error fetching messages:', error);
            }

            timeoutId = setTimeout(pollMessages, 4000);
        };

        if (activeChatId && isOpen) {
            // Initial fetch
            fetchMessages(activeChatId);
            if (activeContact?.unread_count) markMessagesAsRead(activeChatId);
            // Start polling
            timeoutId = setTimeout(pollMessages, 4000);
        }

        return () => clearTimeout(timeoutId);
    }, [activeChatId, isOpen]);

    useEffect(() => {
        let timeoutId: NodeJS.Timeout;

        const pollChats = async () => {
            if (!isOpen) return;

            if (document.hidden) {
                timeoutId = setTimeout(pollChats, 10000);
                return;
            }

            await fetchChats();
            timeoutId = setTimeout(pollChats, 10000); // Increase to 10s
        };

        if (isOpen) {
            fetchChats(); // Initial
            timeoutId = setTimeout(pollChats, 10000);
        }
        return () => clearTimeout(timeoutId);
    }, [isOpen]);

    useEffect(() => {
        if (messages.length > prevMessagesLength.current) {
            scrollToBottom();
        }
        prevMessagesLength.current = messages.length;
    }, [messages, scrollToBottom]);

    useEffect(() => {
        if (files.length > 0) scrollToBottom();
    }, [files, scrollToBottom]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen]);

    const fetchChats = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:3001/api/chats', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                let data = await response.json();
                if (activeChatId) {
                    data = data.map((c: ChatContact) => c.id === activeChatId ? { ...c, unread_count: 0 } : c);
                }
                setContacts(prev => {
                    if (JSON.stringify(prev) !== JSON.stringify(data)) return data;
                    return prev;
                });
            }
        } catch (error) {
            console.error('Error fetching chats:', error);
        }
    };

    const handleDeleteMessage = useCallback(async (messageId: number) => {
        // @ts-ignore
        const confirmed = await showConfirm(t.deleteConfirm);
        if (!confirmed) return;

        setMessages(prev => prev.filter(m => m.id !== messageId));

        try {
            const token = localStorage.getItem('token');
            await fetch(`http://localhost:3001/api/chats/${activeChatId}/messages/${messageId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchChats();
        } catch (error) {
            console.error('Error deleting message:', error);
            fetchMessages(activeChatId!);
        }
    }, [activeChatId, showConfirm, t.deleteConfirm]);

    const fetchMessages = async (chatId: number) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`http://localhost:3001/api/chats/${chatId}/messages`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setMessages(data);
                if (activeContact?.unread_count && activeContact.unread_count > 0) {
                    markMessagesAsRead(chatId);
                }
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    };

    const markMessagesAsRead = async (chatId: number) => {
        try {
            const token = localStorage.getItem('token');
            await fetch(`http://localhost:3001/api/chats/${chatId}/read`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            setContacts(prev => prev.map(c => c.id === chatId ? { ...c, unread_count: 0 } : c));
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            setFiles(prev => [...prev, ...newFiles]);
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if ((!inputValue.trim() && files.length === 0) || !activeChatId) return;

        if (activeContact?.is_blocked) {
            showAlert("Вы заблокировали этого пользователя и не можете отправлять сообщения.");
            return;
        }

        const tempId = Date.now();
        const optimisticMessage: Message = {
            id: tempId,
            chat_id: activeChatId,
            sender_id: user?.id || 0,
            content: inputValue,
            is_read: 0,
            created_at: new Date().toISOString(),
            attachments: files.map((f, i) => ({
                id: i,
                url: URL.createObjectURL(f),
                type: f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : 'file',
                name: f.name
            }))
        };

        setMessages(prev => [...prev, optimisticMessage]);
        setInputValue('');
        setFiles([]);
        setShowEmojiPicker(false);

        try {
            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('content', optimisticMessage.content);
            files.forEach(file => {
                formData.append('files', file);
            });

            const response = await fetch(`http://localhost:3001/api/chats/${activeChatId}/messages`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });

            if (response.ok) {
                const savedMessage = await response.json();
                setMessages(prev => prev.map(m => m.id === tempId ? savedMessage : m));
                fetchChats();
            } else {
                const errData = await response.json().catch(() => ({}));
                setMessages(prev => prev.filter(m => m.id !== tempId));
                showAlert(errData.message || t.error || "Не удалось отправить сообщение");
            }
        } catch (error) {
            console.error('Error sending message:', error);
            setMessages(prev => prev.filter(m => m.id !== tempId));
            showAlert("Ошибка сети");
        }
    };

    const handleContactClick = useCallback((id: number) => {
        setActiveChatId(id);
        setShowMobileChat(true);
        setShowContactInfo(false);
    }, []);

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.length < 2) {
            setSearchResults([]);
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`http://localhost:3001/api/users/search?query=${encodeURIComponent(query)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setSearchResults(data);
            }
        } catch (error) {
            console.error('Search error:', error);
        }
    };

    const startChat = async (targetUserId: number) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:3001/api/chats', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ targetUserId })
            });

            if (response.ok) {
                const data = await response.json();
                await fetchChats();
                setActiveChatId(data.id);
                setShowMobileChat(true);
                setSearchQuery('');
                setSearchResults([]);
            }
        } catch (error) {
            console.error('Error starting chat:', error);
        }
    };

    const formatTime = useCallback((dateString: string) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }, []);

    const toggleBlockUser = async () => {
        if (!activeContact?.otherUserId) return;

        const isBlocked = activeContact.is_blocked;
        const url = isBlocked
            ? `http://localhost:3001/api/users/block/${activeContact.otherUserId}`
            : 'http://localhost:3001/api/users/block';

        const method = isBlocked ? 'DELETE' : 'POST';
        const body = isBlocked ? undefined : JSON.stringify({ userId: activeContact.otherUserId });

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body
            });

            if (response.ok) {
                setContacts(prev => prev.map(c => c.id === activeChatId ? { ...c, is_blocked: !isBlocked } : c));
            }
        } catch (error) {
            console.error('Error blocking/unblocking user:', error);
        }
    };

    if (!hasTransitionedIn && !isOpen) return null;

    return (
        <div className={`fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-6 lg:p-8 text-zinc-900 dark:text-white font-sans transition-all duration-300 ${isOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'}`}>
            <div
                className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ease-out ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            />

            <div className={`relative w-full max-w-6xl h-full sm:h-[85vh] bg-white dark:bg-black sm:rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col sm:flex-row transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'}`}>
                {/* Left Sidebar */}
                <div className={`
                    absolute inset-0 z-20 sm:static w-full sm:w-80 md:w-96 flex flex-col border-r border-zinc-200 dark:border-zinc-800 transition-transform duration-300 bg-white dark:bg-zinc-950
                    ${showMobileChat ? '-translate-x-full sm:translate-x-0' : 'translate-x-0'}
                `}>
                    <div className="p-6 pb-4 flex items-center justify-between">
                        <h2 className="text-3xl font-bold text-zinc-900 dark:text-white font-serif italic tracking-wide drop-shadow-sm">{t.sidebar.chats || 'Чаты'}</h2>
                        <button onClick={onClose} className="sm:hidden p-2 text-zinc-500 hover:text-black dark:hover:text-white transition-colors">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="px-6 pb-4">
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-blue-500 transition-colors" size={18} />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                                placeholder={t.admin.searchUsers || "Поиск..."}
                                className="w-full bg-zinc-100 dark:bg-zinc-900 border border-transparent focus:border-blue-500/30 rounded-2xl py-3 pl-11 pr-4 text-sm outline-none text-zinc-900 dark:text-white placeholder-zinc-500 transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1 custom-scrollbar">
                        {searchResults.length > 0 || searchQuery.length >= 2 ? (
                            <div className="space-y-1">
                                {searchResults.length === 0 ? (
                                    <div className="text-center text-zinc-500 dark:text-zinc-400 py-8">
                                        Пользователи не найдены
                                    </div>
                                ) : (
                                    searchResults.map(user => (
                                        <button
                                            key={user.id}
                                            onClick={() => startChat(user.id)}
                                            className="w-full flex items-center gap-4 p-3 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 cursor-pointer rounded-[24px] transition-all group text-left"
                                        >
                                            <div className="relative">
                                                <img
                                                    src={user.avatar}
                                                    alt={user.username}
                                                    className="w-12 h-12 rounded-full object-cover ring-2 ring-white dark:ring-zinc-800 group-hover:ring-blue-500 transition-all shadow-sm"
                                                    loading="lazy"
                                                />
                                            </div>
                                            <div className="flex flex-col flex-1 min-w-0">
                                                <span className="font-bold text-base text-zinc-900 dark:text-white truncate group-hover:text-blue-500 transition-colors">
                                                    {user.name || user.username}
                                                </span>
                                                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate">
                                                    @{user.username}
                                                </span>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        ) : (
                            contacts.map(contact => (
                                <ChatContactItem
                                    key={contact.id}
                                    contact={contact}
                                    isActive={activeChatId === contact.id}
                                    onClick={handleContactClick}
                                    formatTime={formatTime}
                                />
                            ))
                        )}
                    </div>
                </div>

                {/* Right Side */}
                <div className={`
                    absolute inset-0 z-10 sm:static flex-1 flex flex-col bg-transparent transition-transform duration-300
                    ${showMobileChat ? 'translate-x-0' : 'translate-x-full sm:translate-x-0'}
                `}>
                    {activeChatId && activeContact ? (
                        <>
                            <div className="h-20 flex items-center justify-between px-6 border-b border-zinc-200/50 dark:border-zinc-800/50 bg-white dark:bg-zinc-950 sticky top-0 z-20">
                                <div className="flex items-center gap-4 cursor-pointer" onClick={() => setShowContactInfo(true)}>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowMobileChat(false); }}
                                        className="sm:hidden p-2 -ml-2 text-zinc-500 hover:text-black dark:hover:text-white"
                                    >
                                        <ChevronLeft size={24} />
                                    </button>
                                    <div className="relative">
                                        <img src={activeContact.avatar} alt={activeContact.name} className="w-10 h-10 rounded-full ring-2 ring-white dark:ring-zinc-900 shadow-sm" loading="lazy" />
                                        {activeContact.online && (
                                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-zinc-900 rounded-full" />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-zinc-900 dark:text-white text-base">{activeContact.name}</h3>
                                        <p className={`text-xs font-bold ${activeContact.online ? 'text-green-600 dark:text-green-400' : 'text-blue-500 dark:text-blue-400'}`}>
                                            {activeContact.online ? 'В сети' : 'Был(а) недавно'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-zinc-400">
                                    <button
                                        onClick={() => setShowContactInfo(!showContactInfo)}
                                        className={`p-2.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all ${showContactInfo ? 'text-blue-600 bg-blue-50 dark:bg-blue-500/10' : 'hover:text-zinc-900 dark:hover:text-white'}`}
                                    >
                                        <MoreVertical size={20} />
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="hidden sm:block ml-2 p-2.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-white transition-all"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 relative overflow-hidden flex bg-transparent">
                                <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${showContactInfo ? 'mr-0 lg:mr-80' : ''}`}>
                                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">
                                        {messages.map((msg) => (
                                            <ChatMessageItem
                                                key={msg.id}
                                                msg={msg}
                                                isMe={msg.sender_id === user?.id}
                                                onDelete={handleDeleteMessage}
                                                formatTime={formatTime}
                                            />
                                        ))}
                                        <div ref={messagesEndRef} />
                                    </div>

                                    {/* Input Area */}
                                    {!activeContact.is_blocked ? (
                                        <div className="p-4 sm:p-5 bg-white dark:bg-zinc-950 border-t border-zinc-200/50 dark:border-zinc-800/50">
                                            {/* File Previews */}
                                            {files.length > 0 && (
                                                <div className="flex gap-3 mb-3 overflow-x-auto pb-2">
                                                    {files.map((file, idx) => (
                                                        <div key={idx} className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 group">
                                                            {file.type.startsWith('image/') ? (
                                                                <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" alt="preview" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-zinc-500">
                                                                    <FileText size={24} />
                                                                </div>
                                                            )}
                                                            <button
                                                                onClick={() => removeFile(idx)}
                                                                className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                                                <div className="flex-1 relative">
                                                    <input
                                                        type="text"
                                                        value={inputValue}
                                                        onChange={(e) => setInputValue(e.target.value)}
                                                        placeholder="Напишите сообщение..."
                                                        className="w-full bg-zinc-100 dark:bg-zinc-900 border-0 rounded-full py-3 pl-5 pr-12 text-zinc-900 dark:text-white placeholder-zinc-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                                    />
                                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => document.getElementById('file-input')?.click()}
                                                            className="p-2 text-zinc-400 hover:text-blue-500 transition-colors rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800"
                                                        >
                                                            <Paperclip size={20} />
                                                        </button>
                                                        <input
                                                            type="file"
                                                            id="file-input"
                                                            className="hidden"
                                                            multiple
                                                            onChange={handleFileSelect}
                                                        />
                                                    </div>
                                                </div>
                                                <button
                                                    type="submit"
                                                    disabled={!inputValue.trim() && files.length === 0}
                                                    className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30"
                                                >
                                                    <Send size={20} />
                                                </button>
                                            </form>
                                        </div>
                                    ) : (
                                        <div className="p-4 text-center text-red-500 bg-red-50 dark:bg-red-900/10">
                                            Вы заблокировали этого пользователя
                                        </div>
                                    )}
                                </div>

                                {/* Info Sidebar */}
                                <div className={`
                                    absolute inset-y-0 right-0 w-full lg:w-80 bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 transition-transform duration-300 z-30
                                    ${showContactInfo ? 'translate-x-0' : 'translate-x-full'}
                                `}>
                                    <div className="h-full overflow-y-auto p-6">
                                        <div className="flex items-center justify-between mb-6">
                                            <h3 className="font-bold text-lg text-zinc-900 dark:text-white">Информация</h3>
                                            <button onClick={() => setShowContactInfo(false)} className="p-2 text-zinc-500 hover:text-black dark:hover:text-white">
                                                <X size={24} />
                                            </button>
                                        </div>

                                        <div className="flex flex-col items-center mb-8">
                                            <img src={activeContact.avatar} alt={activeContact.name} className="w-24 h-24 rounded-full object-cover mb-4 ring-4 ring-zinc-100 dark:ring-zinc-800" loading="lazy" />
                                            <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-1">{activeContact.name}</h2>
                                            <p className="text-zinc-500 dark:text-zinc-400">@{activeContact.username || 'user'}</p>
                                        </div>

                                        <div className="space-y-6">
                                            <div>
                                                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Био</h4>
                                                <p className="text-sm text-zinc-700 dark:text-zinc-300">{activeContact.bio || 'Нет информации'}</p>
                                            </div>

                                            <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
                                                <button
                                                    onClick={toggleBlockUser}
                                                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${activeContact.is_blocked
                                                        ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400'}`}
                                                >
                                                    <Shield size={18} />
                                                    {activeContact.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
                            <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-4">
                                <MessageCircle size={40} className="opacity-50" />
                            </div>
                            <p>Выберите чат, чтобы начать общение</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}, (prev, next) => prev.isOpen === next.isOpen);
