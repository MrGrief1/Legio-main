import React, { useState } from 'react';

type TabType = 'about' | 'rules' | 'privacy';

export const Information: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabType>('about');

    const tabs: { id: TabType; label: string }[] = [
        { id: 'about', label: 'О проекте' },
        { id: 'rules', label: 'Правила' },
        { id: 'privacy', label: 'Политика' },
    ];

    return (
        <div className="w-full max-w-4xl mx-auto bg-white dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            {/* Header with tabs */}
            <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <div className="flex items-center gap-3 px-6 py-6">
                     <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M36 19C36 28.5 28 36 19 36C16.5 36 14 35.5 12 34.5L4 37L6.5 29C4.5 26.5 4 23 4 19C4 10 11 3 20 3C29 3 36 10 36 19Z" stroke="currentColor" strokeWidth="2.5" className="text-black dark:text-white" strokeLinecap="round" strokeLinejoin="round" />
                        <rect x="12" y="19" width="4" height="8" rx="1.5" className="fill-black dark:fill-white" />
                        <rect x="18" y="12" width="4" height="15" rx="1.5" fill="#06b6d4" />
                        <rect x="24" y="16" width="4" height="11" rx="1.5" className="fill-black dark:fill-white" />
                    </svg>
                    <h2 className="text-2xl font-serif italic font-medium text-zinc-900 dark:text-white">Информация</h2>
                </div>

                {/* Tabs */}
                <div className="px-6 pb-6">
                    <div className="relative flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-full">
                        {/* Sliding Background */}
                        <div
                            className="absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/3)] bg-white dark:bg-zinc-600 rounded-full shadow-sm transition-transform duration-300 ease-in-out"
                            style={{
                                transform: `translateX(${tabs.findIndex(t => t.id === activeTab) * 100}%)`
                            }}
                        />
                        
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                                    relative z-10 flex-1 py-2 text-sm font-medium transition-colors duration-200 rounded-full
                                    ${activeTab === tab.id
                                        ? 'text-zinc-900 dark:text-white'
                                        : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
                                    }
                                `}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-6 lg:p-8 text-zinc-900 dark:text-white">
                {activeTab === 'about' && (
                    <div className="space-y-8 animate-in fade-in duration-500">
                        <div className="text-center mb-8">
                            <h1 className="text-3xl lg:text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400">Новости, которые ты можешь предсказать!</h1>
                            <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed">
                                Добро пожаловать на Legio.news — платформу, где новости становятся увлекательной игрой! Мы предлагаем вам уникальную возможность участвовать в новостных опросах, угадывать исходы событий и проверять свою интуицию.
                            </p>
                        </div>

                        <div className="grid gap-8 md:grid-cols-2">
                            <section className="bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-xl border border-zinc-100 dark:border-zinc-800">
                                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                    <span className="text-2xl">🎯</span> Как это работает?
                                </h2>
                                <ul className="space-y-3">
                                    <li className="flex gap-3">
                                        <span className="text-cyan-500 font-bold">🞄</span>
                                        <span className="text-zinc-600 dark:text-zinc-300">Выбирайте актуальные опросы по мировым новостям.</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="text-cyan-500 font-bold">🞄</span>
                                        <span className="text-zinc-600 dark:text-zinc-300">Прогнозируйте исходы и соревнуйтесь с другими.</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="text-cyan-500 font-bold">🞄</span>
                                        <span className="text-zinc-600 dark:text-zinc-300">Получайте баллы за точные прогнозы.</span>
                                    </li>
                                </ul>
                            </section>

                            <section className="bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-xl border border-zinc-100 dark:border-zinc-800">
                                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                    <span className="text-2xl">🏆</span> Соревнуйтесь!
                                </h2>
                                <ul className="space-y-3">
                                    <li className="flex gap-3">
                                        <span className="text-cyan-500 font-bold">🞄</span>
                                        <span className="text-zinc-600 dark:text-zinc-300">Участвуйте в турнирах.</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="text-cyan-500 font-bold">🞄</span>
                                        <span className="text-zinc-600 dark:text-zinc-300">Открывайте новые уровни и призы.</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="text-cyan-500 font-bold">🞄</span>
                                        <span className="text-zinc-600 dark:text-zinc-300">Следите за прогрессом в личном кабинете.</span>
                                    </li>
                                </ul>
                            </section>
                        </div>

                         <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 dark:from-cyan-500/5 dark:to-blue-500/5 p-8 rounded-xl border border-cyan-500/20 text-center">
                            <p className="text-xl font-semibold mb-4">
                                <span className="text-2xl mr-2">🚀</span>
                                Присоединяйтесь к «Легио» уже сегодня!
                            </p>
                            <p className="text-zinc-600 dark:text-zinc-400 max-w-3xl mx-auto">
                                Legio — это сообщество единомышленников, где каждый голос имеет значение. Присоединяйтесь к нам, чтобы быть в центре событий и развивать аналитическое мышление.
                            </p>
                            <p className="mt-6 font-medium text-cyan-600 dark:text-cyan-400">
                                А еще мы разыгрываем подарки и эксклюзивные призы! 😊
                            </p>
                        </div>

                        <div className="text-center pt-8 border-t border-zinc-200 dark:border-zinc-800">
                            <p className="text-sm text-zinc-500">
                                Почта для связи с нами: <a href="mailto:info@legio.news" className="text-cyan-500 hover:underline">info@legio.news</a>
                            </p>
                        </div>
                    </div>
                )}

                {activeTab === 'rules' && (
                    <div className="space-y-8 prose dark:prose-invert max-w-none animate-in fade-in duration-500">
                        <div className="text-center mb-8">
                             <h1 className="text-3xl font-bold mb-4">Правила участия</h1>
                             <p className="text-zinc-600 dark:text-zinc-400">
                                Добро пожаловать на наш сайт прогнозов! Ознакомьтесь с правилами для комфортного участия.
                            </p>
                        </div>

                        <section className="bg-zinc-50 dark:bg-zinc-800/30 p-6 rounded-xl">
                            <h2 className="text-xl font-bold mb-3 text-zinc-900 dark:text-white">1. Регистрация</h2>
                            <p className="text-zinc-600 dark:text-zinc-400">Для участия в прогнозах необходимо пройти регистрацию. Указывайте достоверные данные. Вы несете ответственность за сохранность учетных данных.</p>
                        </section>

                        <section className="bg-zinc-50 dark:bg-zinc-800/30 p-6 rounded-xl">
                            <h2 className="text-xl font-bold mb-3 text-zinc-900 dark:text-white">2. Участие в прогнозах (легосах)</h2>
                            <ul className="list-disc ml-6 space-y-2 text-zinc-600 dark:text-zinc-400">
                                <li>«Легос» — форма опроса с прогнозированием.</li>
                                <li>Участвуйте в легосах, которые регулярно обновляются.</li>
                                <li>Делайте прогнозы до истечения срока.</li>
                            </ul>
                        </section>

                         <section className="bg-zinc-50 dark:bg-zinc-800/30 p-6 rounded-xl">
                            <h2 className="text-xl font-bold mb-3 text-zinc-900 dark:text-white">3. Набор баллов</h2>
                            <ul className="list-disc ml-6 space-y-2 text-zinc-600 dark:text-zinc-400">
                                <li>Получайте баллы за верные прогнозы.</li>
                                <li>Баллы зависят от точности и редкости ответа.</li>
                            </ul>
                        </section>

                        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                             <table className="w-full text-left text-sm">
                                <thead className="bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-bold">
                                    <tr>
                                        <th className="px-6 py-3">Уровень</th>
                                        <th className="px-6 py-3">Название</th>
                                        <th className="px-6 py-3">Баллы</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900/50 text-zinc-600 dark:text-zinc-300">
                                    <tr><td className="px-6 py-3">1</td><td className="px-6 py-3">Стартовый</td><td className="px-6 py-3">0</td></tr>
                                    <tr><td className="px-6 py-3">2</td><td className="px-6 py-3">Бронзовый</td><td className="px-6 py-3">1 000</td></tr>
                                    <tr><td className="px-6 py-3">3</td><td className="px-6 py-3">Серебряный</td><td className="px-6 py-3">3 000</td></tr>
                                    <tr><td className="px-6 py-3">4</td><td className="px-6 py-3">Золотой</td><td className="px-6 py-3">9 000</td></tr>
                                    <tr><td className="px-6 py-3">5</td><td className="px-6 py-3">Платиновый</td><td className="px-6 py-3">30 000</td></tr>
                                    <tr><td className="px-6 py-3">6</td><td className="px-6 py-3">Алмазный</td><td className="px-6 py-3">50 000</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'privacy' && (
                    <div className="space-y-8 prose dark:prose-invert max-w-none animate-in fade-in duration-500">
                        <div className="text-center mb-8">
                            <h1 className="text-3xl font-bold mb-4">Политика конфиденциальности</h1>
                            <p className="text-zinc-600 dark:text-zinc-400">
                                Мы ценим ваше доверие и обеспечиваем защиту ваших данных.
                            </p>
                        </div>

                        <div className="bg-yellow-50 dark:bg-yellow-900/10 p-6 rounded-xl border border-yellow-200 dark:border-yellow-800 text-sm">
                            <p className="font-semibold text-yellow-800 dark:text-yellow-200">Использование сайта означает согласие с Политикой обработки персональных данных.</p>
                        </div>

                        <div className="space-y-6">
                            <section>
                                <h2 className="text-xl font-bold mb-3 text-zinc-900 dark:text-white">1. Сбор данных</h2>
                                <p className="text-zinc-600 dark:text-zinc-400">Мы собираем данные, которые вы предоставляете (ответы, комментарии, регистрация) и технические данные (IP, cookies).</p>
                            </section>

                             <section>
                                <h2 className="text-xl font-bold mb-3 text-zinc-900 dark:text-white">2. Использование данных</h2>
                                <p className="text-zinc-600 dark:text-zinc-400">Для проведения опросов, улучшения сайта, безопасности и информирования.</p>
                            </section>

                            <section>
                                <h2 className="text-xl font-bold mb-3 text-zinc-900 dark:text-white">3. Защита</h2>
                                <p className="text-zinc-600 dark:text-zinc-400">Мы используем современные технологии шифрования для защиты ваших данных.</p>
                            </section>
                        </div>
                        
                         <div className="text-center pt-8 mt-8 border-t border-zinc-200 dark:border-zinc-800">
                            <p className="text-sm text-zinc-500">
                                Вопросы? Пишите: <a href="mailto:info@legio.news" className="text-cyan-500 hover:underline">info@legio.news</a>
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
