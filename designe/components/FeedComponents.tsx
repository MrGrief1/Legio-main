import React, { useState, useEffect } from 'react';
import { Button } from './UI';
import { Heart, Share2, AlertTriangle, Circle, CheckCircle2, Loader2, Check, Trash2 } from 'lucide-react';
import { PollData, NewsItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { NewsModal } from './NewsModal';
import { ReportModal } from './ReportModal';
import { UserProfileModal } from './UserProfileModal';
import { Avatar } from './Avatar';
import { getApiUrl } from '../config';

interface PollProps {
  data: PollData;
  onVoteSuccess?: () => void;
}

export const Poll: React.FC<PollProps> = React.memo(({ data, onVoteSuccess }) => {
  const { user } = useAuth();
  const { showAlert, showConfirm } = useDialog();
  const [selectedOption, setSelectedOption] = useState<number | null>(data.user_voted_option_id || null);
  const [hasVoted, setHasVoted] = useState(!!data.user_voted_option_id);
  const [isVoting, setIsVoting] = useState(false);
  const [pollData, setPollData] = useState<PollData>(data);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showVoters, setShowVoters] = useState(false);

  useEffect(() => {
    setPollData(data);
    setSelectedOption(data.user_voted_option_id || null);
    setHasVoted(!!data.user_voted_option_id);
  }, [data]);

  const handleVote = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (selectedOption === null || !user) return;
    setIsVoting(true);

    try {
      const res = await fetch(getApiUrl(`/api/polls/${data.id}/vote`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ optionId: selectedOption })
      });

      if (!res.ok) throw new Error('Vote failed');

      setHasVoted(true);

      const updatedOptions = pollData.options.map(opt => {
        if (opt.id === selectedOption) {
          return { ...opt, vote_count: (opt as any).vote_count + 1, total_votes: (opt as any).total_votes + 1 };
        }
        return opt;
      });
      setPollData({ ...pollData, options: updatedOptions });

      if (onVoteSuccess) {
        setTimeout(() => onVoteSuccess(), 500);
      }

    } catch (error) {
      console.error(error);
      showAlert('Failed to vote. Make sure you are logged in and havent voted yet.');
    } finally {
      setIsVoting(false);
    }
  };

  const handleResolve = async (optionId: number) => {
    const confirmed = await showConfirm("Вы уверены, что это правильный ответ? Это действие нельзя отменить.");
    if (!confirmed) return;

    try {
      const res = await fetch(getApiUrl(`/api/polls/${data.id}/resolve`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ correctOptionId: optionId })
      });

      if (res.ok) {
        showAlert("Опрос завершен!");
        window.location.reload();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const canResolve = user && (user.role === 'admin' || user.role === 'creator') && !pollData.is_resolved;
  const isAdmin = user && user.role === 'admin';

  return (
    <div
      className={`bg-zinc-50 dark:bg-zinc-900/50 rounded-[24px] p-5 lg:p-6 mb-6 border ${pollData.is_resolved ? 'border-green-500/20 dark:border-green-500/20' : 'border-zinc-100 dark:border-zinc-800'}`}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <h4 className="font-semibold text-zinc-900 dark:text-white text-[15px] mb-5 leading-snug">
        {pollData.question}
        {pollData.is_resolved === 1 && <span className="ml-2 text-xs text-green-500 font-bold uppercase border border-green-500 rounded px-1">Завершен</span>}
      </h4>

      <div className="space-y-3 mb-6">
        {pollData.options.map((option) => {
          const isCorrect = pollData.is_resolved === 1 && pollData.correct_option_id === option.id;

          return (
            <div key={option.id} className="space-y-2">
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (!hasVoted && !pollData.is_resolved) {
                    setSelectedOption(option.id);
                  }
                }}
                className={`relative group/option cursor-pointer rounded-xl transition-all duration-300 overflow-hidden ${hasVoted || pollData.is_resolved ? 'cursor-default' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                  } ${isCorrect ? 'ring-2 ring-green-500' : ''}`}
              >
                {(hasVoted || !!pollData.is_resolved) && (
                  <div
                    className={`absolute inset-0 ${isCorrect ? 'bg-green-500/20' : 'bg-blue-100/50 dark:bg-blue-900/20'} transition-transform duration-1000 ease-out origin-left will-change-transform`}
                    style={{ transform: `scaleX(${option.percent / 100})` }}
                  />
                )}

                <div className="relative z-10 flex items-start gap-3 p-3">
                  <div className={`mt-0.5 transition-colors duration-200 ${selectedOption === option.id
                    ? 'text-blue-500 scale-110'
                    : (hasVoted || !!pollData.is_resolved)
                      ? 'text-zinc-300 dark:text-zinc-600'
                      : 'text-zinc-400 group-hover/option:text-blue-500'
                    }`}>
                    {isCorrect ? (
                      <CheckCircle2 size={20} className="text-green-500" />
                    ) : selectedOption === option.id ? (
                      <div className="relative">
                        <div className="absolute inset-0 bg-blue-500 blur-sm opacity-20 rounded-full" />
                        <CheckCircle2 size={20} className="fill-blue-500 text-white dark:text-black" />
                      </div>
                    ) : (
                      <Circle size={20} />
                    )}
                  </div>

                  <div className="flex-1 flex justify-between items-center">
                    <span className={`text-sm leading-relaxed transition-colors duration-200 ${selectedOption === option.id || isCorrect
                      ? 'text-zinc-900 dark:text-white font-medium'
                      : 'text-zinc-600 dark:text-zinc-300 group-hover/option:text-zinc-900 dark:group-hover/option:text-zinc-200'
                      }`}>
                      {option.text}
                    </span>

                    {canResolve && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleResolve(option.id); }}
                        className="text-xs bg-zinc-200 dark:bg-zinc-800 hover:bg-green-500 hover:text-white px-2 py-1 rounded transition-colors ml-2"
                      >
                        Выбрать
                      </button>
                    )}
                  </div>

                  {(hasVoted || !!pollData.is_resolved) && option.percent > 0 && (
                    <div className="text-sm font-bold text-blue-600 dark:text-blue-400 animate-in fade-in slide-in-from-right-4 duration-700">
                      {option.percent}%
                    </div>
                  )}
                </div>
              </div>

              {showVoters && isAdmin && option.voters && option.voters.length > 0 && (
                <div className="pl-10 pr-2 py-2 flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-2">
                  {option.voters.map((voter) => (
                    <div
                      key={voter.id}
                      className="flex items-center gap-2 bg-white dark:bg-zinc-800 px-2 py-1 rounded-full border border-zinc-100 dark:border-zinc-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedUser(voter);
                      }}
                    >
                      <Avatar
                        src={voter.avatar}
                        alt={voter.username}
                        size={20}
                        fallbackText={voter.name || voter.username}
                      />
                      <span className="text-xs text-zinc-600 dark:text-zinc-300 font-medium max-w-[100px] truncate">
                        {voter.name || voter.username}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex justify-between items-center h-10">
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowVoters(!showVoters); }}
            className="text-xs text-zinc-400 hover:text-blue-500 transition-colors flex items-center gap-1"
          >
            {showVoters ? 'Скрыть голоса' : 'Показать голоса'}
          </button>
        )}

        <div className="flex-1 flex justify-end">
          {!hasVoted && !pollData.is_resolved ? (
            <Button
              onClick={handleVote}
              disabled={selectedOption === null || isVoting || !user}
              className={`transition-all duration-300 ${selectedOption !== null && user
                ? '!bg-[#38bdf8] hover:!bg-[#0ea5e9] !text-black !font-semibold shadow-lg shadow-blue-500/20 scale-100'
                : '!bg-zinc-200 dark:!bg-zinc-800 !text-zinc-400 cursor-not-allowed scale-95 opacity-70'
                } !px-8 !py-2 !text-sm rounded-full w-full sm:w-auto`}
            >
              {isVoting ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                !user ? 'Войдите чтобы голосовать' : 'Голосовать'
              )}
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-sm font-medium animate-in fade-in duration-500">
              {hasVoted && <span className="w-2 h-2 rounded-full bg-green-500" />}
              {hasVoted ? 'Ваш голос учтен' : 'Голосование завершено'}
            </div>
          )}
        </div>
      </div>

      <UserProfileModal
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        user={selectedUser}
      />
    </div>
  );
});

export const NewsCard: React.FC<{ item: NewsItem; onRefresh?: () => void }> = React.memo(({ item, onRefresh }) => {
  const [isLiked, setIsLiked] = useState(item.isLiked || false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const { user } = useAuth();
  const { showAlert, showConfirm } = useDialog();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await showConfirm('Вы уверены, что хотите удалить эту новость?');
    if (!confirmed) return;

    try {
      const res = await fetch(getApiUrl(`/api/news/${item.id}`), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleLike = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (likeLoading) return;
    const token = localStorage.getItem('token');
    if (!token) {
      showAlert('Please login to like posts');
      return;
    }

    setLikeLoading(true);
    const previousState = isLiked;
    setIsLiked(!isLiked);

    try {
      const res = await fetch(getApiUrl(`/api/news/${item.id}/like`), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        setIsLiked(previousState);
      }
    } catch (e) {
      console.error(e);
      setIsLiked(previousState);
    } finally {
      setLikeLoading(false);
    }
  };

  return (
    <>
      <div className="bg-transparent">
        <div
          className="bg-white dark:bg-[#121212] rounded-[32px] border border-zinc-200 dark:border-zinc-800/50 overflow-hidden hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-500 group cursor-pointer animate-in fade-in slide-in-from-bottom-4"
          onClick={() => setIsModalOpen(true)}
        >
          <div className="relative h-64 lg:h-96 w-full overflow-hidden">
            <img
              src={item.image}
              alt={item.title}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/5 dark:bg-black/20" />
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white via-white/80 to-transparent dark:from-[#121212] dark:via-[#121212]/90 dark:to-transparent" />

            <div className="absolute bottom-4 left-6 flex flex-wrap gap-2 z-10">
              {item.tags.map((tag, i) => (
                <span key={i} className="px-4 py-1.5 bg-zinc-100/95 dark:bg-zinc-900/95 rounded-full text-xs font-medium text-zinc-900 dark:text-zinc-200 border border-white/40 dark:border-white/10 shadow-sm">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="px-6 pb-6 pt-2 lg:px-8 lg:pb-8">
            <h3 className="text-xl lg:text-2xl font-bold text-zinc-900 dark:text-white mb-3 leading-tight hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
              {item.title}
            </h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed mb-6 line-clamp-3">
              {item.description}
            </p>

            {item.poll && (
              <div
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
              >
                <Poll data={item.poll} onVoteSuccess={onRefresh} />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2" onClick={e => e.stopPropagation()}>
              <button
                onClick={handleLike}
                disabled={likeLoading}
                className={`p-2.5 rounded-full transition-colors duration-200 group/btn relative ${isLiked
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-500'
                  : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-red-500'
                  }`}
              >
                <Heart size={22} className={`${isLiked ? 'fill-current' : ''}`} />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const url = `${window.location.origin}/?news=${item.id}`;
                  const button = e.currentTarget as HTMLButtonElement;
                  const originalHTML = button.innerHTML;

                  navigator.clipboard.writeText(url).then(() => {
                    button.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                    button.classList.add('!text-green-500', '!bg-green-50', 'dark:!bg-green-900/20');

                    setTimeout(() => {
                      button.innerHTML = originalHTML;
                      button.classList.remove('!text-green-500', '!bg-green-50', 'dark:!bg-green-900/20');
                    }, 1500);
                  }).catch(err => {
                    console.error('Failed to copy:', err);
                    showAlert('Не удалось скопировать ссылку');
                  });
                }}
                className="p-2.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full group/btn"
              >
                <Share2 size={22} className="group-hover/btn:scale-110 transition-transform" />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!user) {
                    showAlert('Пожалуйста, войдите, чтобы сообщить об ошибке');
                    return;
                  }
                  setIsReportModalOpen(true);
                }}
                className="p-2.5 text-zinc-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/10 rounded-full transition-all group/btn"
              >
                <AlertTriangle size={22} className="group-hover/btn:scale-110 transition-transform" />
              </button>

              {user && (user.role === 'admin' || user.role === 'creator') && (
                <button
                  onClick={handleDelete}
                  className="p-2.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all group/btn"
                >
                  <Trash2 size={22} className="group-hover/btn:scale-110 transition-transform" />
                </button>
              )}
            </div>

          </div>
        </div >
      </div >

      <NewsModal item={item} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onRefresh={onRefresh}>
        {item.poll && <Poll data={item.poll} onVoteSuccess={onRefresh} />}
      </NewsModal>

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        newsId={item.id}
        newsTitle={item.title}
      />
    </>
  );
});
