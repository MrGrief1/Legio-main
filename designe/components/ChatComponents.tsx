import React from 'react';
import { MessageCircle, Trash2, Check, CheckCheck, FileText } from 'lucide-react';
import { Avatar } from './Avatar';

interface Attachment {
    id: number;
    url: string;
    type: 'image' | 'video' | 'file';
    name: string;
}

export interface Message {
    id: number;
    chat_id: number;
    sender_id: number;
    content: string;
    is_read: number;
    created_at: string;
    name?: string;
    username?: string;
    avatar?: string;
    attachments?: Attachment[];
}

export interface ChatContact {
    id: number;
    type: 'direct' | 'group';
    name: string;
    avatar: string;
    last_message: string;
    last_message_time: string;
    unread_count: number;
    online: boolean;
    otherUserId?: number;
    is_blocked?: boolean;
    bio?: string;
    birthdate?: string;
}

interface ChatContactItemProps {
    contact: ChatContact;
    isActive: boolean;
    onClick: (id: number) => void;
    formatTime: (date: string) => string;
}

export const ChatContactItem = React.memo(({ contact, isActive, onClick, formatTime }: ChatContactItemProps) => {
    return (
        <button
            onClick={() => onClick(contact.id)}
            className={`w-full flex items-center gap-4 p-3.5 rounded-[24px] transition-all duration-200 group relative overflow-hidden ${isActive
                ? 'bg-zinc-100 dark:bg-zinc-900 shadow-sm'
                : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50'
                }`}
        >
            <div className="relative flex-shrink-0">
                <Avatar
                    src={contact.avatar}
                    alt={contact.name}
                    size={56}
                    className="w-14 h-14 rounded-full object-cover ring-2 ring-white dark:ring-zinc-900 shadow-sm"
                    fallbackText={contact.name}
                />
                {contact.online && (
                    <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-white dark:border-zinc-900 rounded-full" />
                )}
            </div>
            <div className="flex-1 min-w-0 text-left">
                <div className="flex justify-between items-baseline mb-1">
                    <span className={`font-semibold text-[15px] truncate ${isActive ? 'text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-200'}`}>
                        {contact.name}
                    </span>
                    <span className="text-[11px] text-zinc-400 font-medium whitespace-nowrap">{formatTime(contact.last_message_time)}</span>
                </div>
                <div className="flex justify-between items-center">
                    <p className={`text-xs truncate max-w-[160px] ${contact.unread_count > 0
                        ? 'text-zinc-900 dark:text-white font-medium'
                        : 'text-zinc-500 dark:text-zinc-400'
                        }`}>
                        {contact.last_message}
                    </p>
                    {contact.unread_count > 0 && (
                        <span className="min-w-[20px] h-[20px] flex items-center justify-center bg-zinc-600 dark:bg-zinc-700 text-white text-[10px] font-bold rounded-full px-1.5 shadow-sm">
                            {contact.unread_count}
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
}, (prev, next) => {
    return (
        prev.isActive === next.isActive &&
        prev.contact.id === next.contact.id &&
        prev.contact.last_message === next.contact.last_message &&
        prev.contact.unread_count === next.contact.unread_count &&
        prev.contact.online === next.contact.online &&
        prev.contact.last_message_time === next.contact.last_message_time
    );
});

interface ChatMessageItemProps {
    msg: Message;
    isMe: boolean;
    onDelete: (id: number) => void;
    formatTime: (date: string) => string;
}

export const ChatMessageItem = React.memo(({ msg, isMe, onDelete, formatTime }: ChatMessageItemProps) => {
    return (
        <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} group animate-in slide-in-from-bottom-2 duration-300`}>
            <div
                className={`max-w-[85%] sm:max-w-[70%] px-5 py-3.5 rounded-[24px] relative shadow-md group-hover:shadow-lg transition-all ${isMe
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-bl-none'
                    }`}
            >
                {isMe && (
                    <button
                        onClick={() => onDelete(msg.id)}
                        className="absolute -left-8 top-1/2 -translate-y-1/2 p-1.5 text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="Удалить"
                    >
                        <Trash2 size={14} />
                    </button>
                )}
                {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mb-2 grid gap-2">
                        {msg.attachments.map(att => (
                            <div key={att.id} className="rounded-lg overflow-hidden">
                                {att.type === 'image' ? (
                                    <img src={att.url} alt="attachment" className="max-w-full rounded-lg" loading="lazy" />
                                ) : att.type === 'video' ? (
                                    <video src={att.url} controls className="max-w-full rounded-lg" />
                                ) : (
                                    <a href={att.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2 bg-black/10 rounded-lg hover:bg-black/20 transition-colors">
                                        <FileText size={16} />
                                        <span className="text-sm underline">{att.name}</span>
                                    </a>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                <div className={`flex items-center justify-end gap-1.5 mt-1.5 text-[10px] font-medium ${isMe ? 'text-blue-200' : 'text-zinc-400 dark:text-zinc-500'}`}>
                    <span>{formatTime(msg.created_at)}</span>
                    {isMe && (
                        !!msg.is_read ? <CheckCheck size={14} /> : <Check size={14} />
                    )}
                </div>
            </div>
        </div>
    );
}, (prev, next) => {
    return (
        prev.msg.id === next.msg.id &&
        prev.msg.is_read === next.msg.is_read &&
        prev.msg.content === next.msg.content &&
        prev.isMe === next.isMe
    );
});
