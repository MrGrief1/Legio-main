import React, { useState } from 'react';
import {
    Sparkles, ScrollText, ShieldCheck, Target, Trophy, Wand2, Lightbulb, Rocket, Gift,
    Mail, ChevronDown, Check, X as XIcon, Medal, Coins, Calculator, FileText,
} from 'lucide-react';

type TabId = 'about' | 'rules' | 'privacy';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'about', label: 'О проекте', icon: <Sparkles size={15} /> },
    { id: 'rules', label: 'Правила', icon: <ScrollText size={15} /> },
    { id: 'privacy', label: 'Политика', icon: <ShieldCheck size={15} /> },
];

// ---------------------------------------------------------------------------
// Building blocks. The page is long, so it is assembled from a handful of shapes
// rather than bespoke markup per paragraph — that is what keeps the rhythm even
// from the first screen to the fourth appendix.
// ---------------------------------------------------------------------------

// A titled block with an accent icon. Used for every top-level section.
const Section: React.FC<{
    icon?: React.ReactNode;
    title: string;
    tone?: 'cyan' | 'amber' | 'violet' | 'emerald' | 'zinc';
    children: React.ReactNode;
}> = ({ icon, title, tone = 'zinc', children }) => {
    const tones = {
        cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
        amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
        emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        zinc: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
    };

    return (
        <section className="rounded-[24px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-5 lg:p-6">
            <h3 className="flex items-center gap-2.5 text-lg font-bold text-zinc-900 dark:text-white mb-4">
                {icon && <span className={`grid place-items-center w-9 h-9 rounded-xl shrink-0 ${tones[tone]}`}>{icon}</span>}
                <span className="min-w-0">{title}</span>
            </h3>
            <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {children}
            </div>
        </section>
    );
};

// Bulleted list with the site's cyan marker instead of a browser disc.
const Bullets: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
    <ul className="space-y-2.5">
        {items.map((item, index) => (
            <li key={index} className="flex gap-3">
                <span className="mt-[7px] shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-500" />
                <span className="min-w-0">{item}</span>
            </li>
        ))}
    </ul>
);

// Numbered rule. The number is the anchor the reader scans for.
const Rule: React.FC<{ number: number; title: string; children: React.ReactNode }> = ({ number, title, children }) => (
    <section className="rounded-[24px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-5 lg:p-6">
        <h3 className="flex items-baseline gap-3 text-base lg:text-lg font-bold text-zinc-900 dark:text-white mb-3">
            <span className="grid place-items-center shrink-0 w-7 h-7 rounded-lg bg-cyan-500 text-white text-sm tabular-nums">
                {number}
            </span>
            <span className="min-w-0">{title}</span>
        </h3>
        <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed pl-0 sm:pl-10">
            {children}
        </div>
    </section>
);

// Appendices are long and most readers want one of them, not all four — so they
// collapse. Open by default would push the rules themselves off the screen.
const Appendix: React.FC<{
    label: string;
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
}> = ({ label, title, icon, children }) => {
    const [open, setOpen] = useState(false);

    return (
        <section className="rounded-[24px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 overflow-hidden">
            <button
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                className="w-full flex items-center gap-3 p-5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
            >
                <span className="grid place-items-center w-9 h-9 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
                    {icon}
                </span>
                <span className="flex-1 min-w-0">
                    <span className="block text-[11px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                        {label}
                    </span>
                    <span className="block font-bold text-zinc-900 dark:text-white leading-tight">{title}</span>
                </span>
                <ChevronDown
                    size={18}
                    className={`shrink-0 text-zinc-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>
            {open && (
                <div className="px-5 pb-5 pt-1 space-y-4 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed border-t border-zinc-100 dark:border-zinc-800">
                    {children}
                </div>
            )}
        </section>
    );
};

// One expertise level: requirements on the left, privileges beneath.
const Level: React.FC<{
    number: number;
    name: string;
    color: string;
    requirements: string;
    privileges: string[];
}> = ({ number, name, color, requirements, privileges }) => (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-4">
        <div className="flex items-center gap-2.5 mb-2.5">
            <span className={`grid place-items-center w-8 h-8 rounded-full text-white text-sm font-bold shadow-sm ${color}`}>
                {number}
            </span>
            <span className="font-bold text-zinc-900 dark:text-white">{name}</span>
        </div>
        <p className="text-sm mb-2">
            <span className="font-semibold text-zinc-700 dark:text-zinc-200">Требования: </span>
            {requirements}
        </p>
        <div className="text-sm">
            <span className="font-semibold text-zinc-700 dark:text-zinc-200">Привилегии:</span>
            <ul className="mt-1.5 space-y-1.5">
                {privileges.map((item, index) => (
                    <li key={index} className="flex gap-2.5">
                        <span className="mt-[7px] shrink-0 w-1.5 h-1.5 rounded-full bg-violet-500" />
                        <span className="min-w-0">{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    </div>
);

const Callout: React.FC<{ tone?: 'cyan' | 'amber'; children: React.ReactNode }> = ({ tone = 'cyan', children }) => (
    <div className={`rounded-2xl p-4 border text-sm leading-relaxed ${tone === 'amber'
        ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-900 dark:text-amber-200'
        : 'bg-cyan-50 dark:bg-cyan-500/10 border-cyan-200 dark:border-cyan-500/20 text-cyan-900 dark:text-cyan-200'
        }`}>
        {children}
    </div>
);

const MailLink: React.FC<{ address: string }> = ({ address }) => (
    <a href={`mailto:${address}`} className="text-cyan-600 dark:text-cyan-400 font-medium hover:underline break-all">
        {address}
    </a>
);

// ---------------------------------------------------------------------------

export const Information: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabId>('about');

    return (
        <div className="w-full max-w-4xl mx-auto">
            {/* Header + tabs sit in the normal flow, with no panel behind them.
                They used to be sticky, which required an opaque backdrop so the page didn't show
                through while scrolling — and that backdrop read as a pale rectangle sitting on top
                of the page background. Dropping the sticky positioning removes the need for it. */}
            <div className="pt-1 pb-3">
                <div className="flex items-center gap-3 mb-4 px-1">
                    <svg width="34" height="34" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                        <path d="M36 19C36 28.5 28 36 19 36C16.5 36 14 35.5 12 34.5L4 37L6.5 29C4.5 26.5 4 23 4 19C4 10 11 3 20 3C29 3 36 10 36 19Z" stroke="currentColor" strokeWidth="2.5" className="text-black dark:text-white" strokeLinecap="round" strokeLinejoin="round" />
                        <rect x="12" y="19" width="4" height="8" rx="1.5" className="fill-black dark:fill-white" />
                        <rect x="18" y="12" width="4" height="15" rx="1.5" fill="#06b6d4" />
                        <rect x="24" y="16" width="4" height="11" rx="1.5" className="fill-black dark:fill-white" />
                    </svg>
                    <h2 className="text-2xl lg:text-3xl font-serif italic font-medium text-zinc-900 dark:text-white leading-normal">
                        Информация
                    </h2>
                </div>

                <div className="relative flex p-1 bg-zinc-200/60 dark:bg-zinc-800/80 rounded-full">
                    <div
                        className="absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/3)] bg-white dark:bg-zinc-700 rounded-full shadow-sm transition-transform duration-300 ease-out"
                        style={{ transform: `translateX(${TABS.findIndex((tab) => tab.id === activeTab) * 100}%)` }}
                    />
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs sm:text-sm font-semibold rounded-full transition-colors duration-200 ${activeTab === tab.id
                                ? 'text-zinc-900 dark:text-white'
                                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                                }`}
                        >
                            <span className="shrink-0">{tab.icon}</span>
                            <span className="truncate">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="pt-5 pb-10">
                {/* ------------------------------- О ПРОЕКТЕ ------------------------------- */}
                {activeTab === 'about' && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                        <div className="rounded-[28px] border border-cyan-200/60 dark:border-cyan-500/20 bg-gradient-to-br from-cyan-50 via-white to-blue-50 dark:from-cyan-500/10 dark:via-zinc-900/40 dark:to-blue-500/10 p-6 lg:p-8 text-center">
                            <h1 className="text-2xl lg:text-4xl font-bold mb-4 text-zinc-900 dark:text-white leading-tight">
                                Новости, которые ты можешь предсказать!
                            </h1>
                            <p className="text-sm lg:text-base text-zinc-600 dark:text-zinc-300 max-w-2xl mx-auto leading-relaxed">
                                Добро пожаловать на Legio.news — платформу, где новости становятся увлекательной игрой!
                                Мы предлагаем вам уникальную возможность участвовать в новостных опросах, угадывать
                                исходы событий и проверять свою интуицию. Наш проект объединяет тех, кто любит
                                анализировать, прогнозировать и быть в курсе актуальных событий.
                            </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <Section icon={<Target size={18} />} title="Как это работает?" tone="cyan">
                                <Bullets items={[
                                    'Выбирайте актуальные опросы, связанные с мировыми новостями, политикой, спортом, культурой и другими событиями.',
                                    'Прогнозируйте исходы и соревнуйтесь с другими участниками.',
                                    'Получайте баллы за точные прогнозы и поднимайтесь в рейтинге лучших предсказателей.',
                                ]} />
                            </Section>

                            <Section icon={<Trophy size={18} />} title="Соревнуйтесь и побеждайте!" tone="amber">
                                <Bullets items={[
                                    'Участвуйте в проводимых турнирах.',
                                    'Зарабатывайте баллы, открывайте новые уровни и получайте крутые призы.',
                                    'Следите за своим прогрессом в личном кабинете и делитесь достижениями с друзьями.',
                                ]} />
                            </Section>
                        </div>

                        <Callout>
                            Каждый опрос на «Легио» — это шанс повысить свой рейтинг и доказать, что Вы — лучший
                            прогнозист. Мы охватываем самые разные темы: от политики и экономики до культуры и
                            технологий. Участвуйте, соревнуйтесь и узнавайте, насколько точно Вы можете предсказать
                            будущее.
                        </Callout>

                        <div className="grid gap-4 md:grid-cols-2">
                            <Section icon={<Wand2 size={18} />} title="Проверьте свою интуицию!" tone="violet">
                                <Bullets items={[
                                    'Насколько хорошо вы чувствуете тренды и можете предсказать будущее?',
                                    'Сможете ли Вы обойти других участников и стать лучшим предсказателем?',
                                ]} />
                            </Section>

                            <Section icon={<Lightbulb size={18} />} title="Почему это интересно?" tone="emerald">
                                <Bullets items={[
                                    'Узнавайте больше о мире через актуальные новости и события.',
                                    'Развивайте аналитическое мышление и интуицию.',
                                    'Получайте удовольствие от соревнований с единомышленниками.',
                                ]} />
                            </Section>
                        </div>

                        <div className="rounded-[28px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-6 lg:p-8 text-center">
                            <div className="inline-grid place-items-center w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 text-white mb-4">
                                <Rocket size={22} />
                            </div>
                            <p className="text-lg lg:text-xl font-bold text-zinc-900 dark:text-white mb-3">
                                Присоединяйтесь к «Легио» уже сегодня и докажите, что Ваша интуиция — самая точная!
                            </p>
                            <p className="text-sm text-zinc-600 dark:text-zinc-300 max-w-2xl mx-auto leading-relaxed">
                                Legio — это не просто сайт, это сообщество единомышленников, где каждый голос имеет
                                значение. Присоединяйтесь к нам, чтобы быть в центре событий, развивать аналитическое
                                мышление и получать удовольствие от процесса. Вместе мы создаем новый формат
                                взаимодействия с новостями!
                            </p>
                            <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
                                <Gift size={16} />
                                А еще мы разыгрываем подарки и эксклюзивные призы! 😊
                            </p>
                        </div>

                        <div className="flex items-center justify-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 pt-2">
                            <Mail size={15} className="shrink-0" />
                            <span>Почта для связи с нами</span>
                            <MailLink address="info@legio.news" />
                        </div>
                    </div>
                )}

                {/* -------------------------------- ПРАВИЛА -------------------------------- */}
                {activeTab === 'rules' && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                        <div className="rounded-[28px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-6 lg:p-8">
                            <h1 className="text-xl lg:text-2xl font-bold text-zinc-900 dark:text-white mb-3">
                                Правила участия в прогнозах на платформе Legio.news
                            </h1>
                            <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                                Добро пожаловать на наш сайт прогнозов новостей! Мы рады, что Вы решили присоединиться
                                к нашему сообществу. Пожалуйста, ознакомьтесь с правилами участия, чтобы сделать Ваше
                                взаимодействие с платформой максимально комфортным и продуктивным!
                            </p>
                        </div>

                        <Rule number={1} title="Регистрация">
                            <p>
                                Для участия в прогнозах необходимо пройти процедуру регистрации на сайте. Пользователь
                                обязан предоставить достоверную информацию о себе, включая имя, электронную почту, а
                                также установив пароль для личного аккаунта. Использование недостоверных данных является
                                нарушением Правил.
                            </p>
                            <Bullets items={[
                                'При регистрации укажите действующий адрес электронной почты и создайте надежный пароль или воспользуйтесь паролем, созданным автоматически.',
                                'Пользователь несет ответственность за сохранность своих учетных данных и не должен передавать их третьим лицам.',
                            ]} />
                        </Rule>

                        <Rule number={2} title="Участие в прогнозах (легосах)">
                            <Bullets items={[
                                <>Здесь и далее под <span className="font-semibold text-zinc-800 dark:text-zinc-100">«легосом»</span> понимается непосредственно сама форма опроса с прогнозированием новостных сообщений.</>,
                                'После регистрации вы сможете участвовать в различных легосах, которые будут регулярно обновляться на сайте.',
                                'Каждый легос будет содержать описание события, ссылку на первоисточники, временные рамки и варианты ответов.',
                                'Участники могут делать свои прогнозы до истечения установленного для каждого легоса срока.',
                            ]} />
                        </Rule>

                        <Rule number={3} title="Набор баллов">
                            <Bullets items={[
                                'В случае верного прогноза вы получите баллы, которые будут зачислены на ваш аккаунт.',
                                'Количество баллов за правильный прогноз будет зависеть от верности прогноза и редкости ответа.',
                                'Формулы расчета баллов приведены в Приложении 3.',
                            ]} />
                        </Rule>

                        <Rule number={4} title="Уровни экспертности">
                            <Bullets items={[
                                'На сайте предусмотрена система уровней экспертности. Каждый пользователь начинает с начального уровня и может повышать его, набирая баллы.',
                                'Повышение уровня дает доступ к новым возможностям, включая участие в эксклюзивных прогнозах и конкурсах, а также получение права создания собственных легосов.',
                                'Подробнее об уровнях экспертности, требованиях к экспертам и привилегиях для экспертов — в Приложении 1.',
                            ]} />
                        </Rule>

                        <Rule number={5} title="Бонусы">
                            <Bullets items={[
                                'По достижении определенного уровня экспертности пользователи получают бонусы, которые могут быть представлены в виде сертификатов от партнеров проекта или денежных средств.',
                                'Сертификат может быть использован для приобретения товаров или услуг соответствующих партнеров проекта.',
                                'Гарантированное получение сертификата или денежного бонуса возможно при достижении соответствующего уровня экспертности и выполнении всех условий, указанных на сайте.',
                                'Администрация оставляет за собой право отказать участнику в получении бонуса в случае нарушения правил сайта или обнаружения недобросовестных действий.',
                                'С правилами получения бонусов можно ознакомиться в Приложении 2.',
                            ]} />
                        </Rule>

                        <Rule number={6} title="Правила поведения и участия">
                            <Bullets items={[
                                'Участники должны уважать друг друга и соблюдать правила доброжелательного общения.',
                                'Запрещается размещение оскорбительных, ненавистнических или неприемлемых комментариев на сайте и в официальных аккаунтах проекта в социальных сетях.',
                                'Участникам запрещается использовать автоматические программы («боты») для повышения своего рейтинга. Подобные действия ведут к немедленной блокировке аккаунта.',
                                'Администрация оставляет за собой право блокировать пользователей за нарушение правил поведения, а также в случае нарушения действующего законодательства Российской Федерации.',
                            ]} />
                        </Rule>

                        <Rule number={7} title="Обнуление баллов">
                            <p>
                                Если участник нарушает правила сайта (например, использование ботов), его аккаунт
                                блокируется, а накопленные баллы аннулируются.
                            </p>
                        </Rule>

                        <Rule number={8} title="Изменения в правилах">
                            <p>
                                Администрация сайта оставляет за собой право вносить изменения в правила участия. Все
                                изменения будут опубликованы на сайте, и пользователи будут уведомлены об этом.
                            </p>
                        </Rule>

                        <Rule number={9} title="Поддержка пользователей">
                            <p>
                                Если у вас возникли вопросы или проблемы, пожалуйста, обратитесь в службу поддержки
                                через электронную почту <MailLink address="info@legio.news" />
                            </p>
                            <p>
                                Регистрируясь на сайте участник соглашается соблюдать настоящие правила и обязуется
                                действовать добросовестно и честно.
                            </p>
                        </Rule>

                        <Callout tone="amber">
                            Спасибо за участие! Желаем удачи в ваших прогнозах!
                        </Callout>

                        <h2 className="pt-4 px-1 text-[11px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                            Приложения к Правилам участия
                        </h2>

                        <Appendix label="Приложение 1" title="Уровни экспертности пользователей" icon={<Medal size={18} />}>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Level
                                    number={1}
                                    name="Стартовый"
                                    color="bg-zinc-400"
                                    requirements="зарегистрироваться на сайте и сделать первый прогноз."
                                    privileges={['Получение 100 бонусных баллов.']}
                                />
                                <Level
                                    number={2}
                                    name="Бронзовый"
                                    color="bg-amber-700"
                                    requirements="поучаствовать минимум в 50 прогнозах и набрать суммарно 1 000 баллов."
                                    privileges={['Возможность получения бонуса за лидерство.']}
                                />
                                <Level
                                    number={3}
                                    name="Серебряный"
                                    color="bg-zinc-400"
                                    requirements="принять участие минимум в 100 прогнозах и набрать суммарно 3 000 баллов."
                                    privileges={[
                                        'Возможность предлагать собственные легосы для публикации на сайте (после предварительного одобрения и модерации редколлегией).',
                                        'Получение бонуса (сертификата или денежного вознаграждения) в размере 300 рублей за каждый опубликованный легос.',
                                    ]}
                                />
                                <Level
                                    number={4}
                                    name="Золотой"
                                    color="bg-yellow-500"
                                    requirements="принять участие минимум в 300 прогнозах и набрать суммарно 9 000 баллов."
                                    privileges={[
                                        'Возможность предлагать собственные легосы для публикации на сайте (после предварительного одобрения и модерации редколлегией).',
                                        'Получение бонуса (сертификата или денежного вознаграждения) в размере 500 рублей за каждый опубликованный легос.',
                                    ]}
                                />
                                <Level
                                    number={5}
                                    name="Платиновый"
                                    color="bg-sky-500"
                                    requirements="общий баланс баллов свыше 30 000, а точность прогнозов стабильно держится на уровне 60% и выше."
                                    privileges={[
                                        'Возможность предлагать собственные легосы для публикации на сайте (без предварительного одобрения и модерации редколлегией).',
                                        'Получение бонуса (сертификата или денежного вознаграждения) в размере 800 рублей за каждый опубликованный легос.',
                                    ]}
                                />
                                <Level
                                    number={6}
                                    name="Алмазный"
                                    color="bg-violet-500"
                                    requirements="общий объем набранных баллов превышает 50 000, а точность прогнозов стабильно держится на уровне 70% и выше."
                                    privileges={[
                                        'Возможность предлагать собственные легосы для публикации на сайте (без предварительного одобрения и модерации редколлегией).',
                                        'Получение сертификата или денежного вознаграждения в размере 1 000 рублей за каждый опубликованный легос.',
                                        'Получение ежемесячного гарантированного бонуса (сертификат или денежный эквивалент в размере 1 000 рублей).',
                                    ]}
                                />
                            </div>

                            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-4">
                                <p className="font-bold text-zinc-900 dark:text-white mb-3">
                                    Дополнительные условия продвижения между уровнями
                                </p>
                                <Bullets items={[
                                    <><span className="font-semibold text-zinc-800 dark:text-zinc-100">Активное участие:</span> пользователи должны регулярно участвовать в прогнозах, чтобы накапливать баллы и повышать уровень экспертности.</>,
                                    <><span className="font-semibold text-zinc-800 dark:text-zinc-100">Качество прогнозов:</span> чем больше правильных прогнозов, тем быстрее пользователи смогут повысить свой уровень.</>,
                                    <><span className="font-semibold text-zinc-800 dark:text-zinc-100">Сообщество:</span> участие в обсуждениях и помощь другим пользователям также может способствовать повышению уровня путем получения дополнительных баллов за активность.</>,
                                    'Переход на следующий уровень возможен только после набора необходимого количества баллов.',
                                    'Нарушение правил сайта ведет к понижению уровня или полной блокировке аккаунта.',
                                    'Система учета показателей автоматически отслеживает активность каждого участника и выводит общую статистику раз в месяц.',
                                ]} />
                            </div>
                        </Appendix>

                        <Appendix label="Приложение 2" title="Правила получения бонусов" icon={<Coins size={18} />}>
                            <Bullets items={[
                                'Бонус за публикацию легоса для экспертов уровней «Серебряный» и «Золотой» отправляется автору на следующий день после публикации легоса.',
                                <>Бонус за публикацию легоса для экспертов уровней «Платиновый» и «Алмазный» отправляется автору на следующий день после оповещения редколлегии сайта о публикации легоса. Оповещение редколлегии осуществляется автором посредством направления письма, содержащего ссылку на опубликованный легос, на электронную почту <MailLink address="legos@legio.news" />.</>,
                                'Ежемесячный фиксированный бонус экспертам уровня «Алмазный» выплачивается ежемесячно в течение 5 (пяти) рабочих дней после окончания месяца, за который начислено вознаграждение.',
                            ]} />

                            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-4">
                                <p className="font-bold text-zinc-900 dark:text-white mb-2">
                                    Критерии удержания уровня «Алмазный»
                                </p>
                                <p className="mb-3">
                                    Для сохранения уровня и продолжения получения бонусов аналитик с уровнем «Алмазный»
                                    должен соответствовать следующим критериям:
                                </p>
                                <Bullets items={[
                                    <><span className="font-semibold text-zinc-800 dark:text-zinc-100">Активность:</span> выполнять минимум 50 прогнозов в течение месяца.</>,
                                    <><span className="font-semibold text-zinc-800 dark:text-zinc-100">Точность:</span> поддерживать среднюю точность прогнозов не ниже 70%.</>,
                                    <><span className="font-semibold text-zinc-800 dark:text-zinc-100">Репутация:</span> соблюдать этические нормы поведения на площадке и избегать нарушений правил.</>,
                                ]} />
                                <p className="mt-3">
                                    При несоблюдении критериев активности или качества прогнозов уровень аналитика может
                                    быть понижен до более низкого ранга, что повлечет прекращение права на премиальное
                                    вознаграждение.
                                </p>
                            </div>
                        </Appendix>

                        <Appendix label="Приложение 3" title="Порядок начисления рейтинговых баллов" icon={<Calculator size={18} />}>
                            <p>
                                <span className="font-semibold text-zinc-800 dark:text-zinc-100">1.</span> За регистрацию
                                на платформе новый пользователь получает 100 приветственных баллов.
                            </p>

                            <p>
                                <span className="font-semibold text-zinc-800 dark:text-zinc-100">2.</span> Баллы для
                                перехода на следующий уровень рассчитываются по таблице:
                            </p>

                            {/* Wide content gets its own horizontal scroll so the page body never
                                scrolls sideways on a phone. */}
                            <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead className="bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white">
                                        <tr>
                                            <th className="px-4 py-3 font-bold">Уровень</th>
                                            <th className="px-4 py-3 font-bold">Название</th>
                                            <th className="px-4 py-3 font-bold">Баллов для перехода</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                        {[
                                            [1, 'Стартовый', '0'],
                                            [2, 'Бронзовый', '1 000'],
                                            [3, 'Серебряный', '3 000'],
                                            [4, 'Золотой', '9 000'],
                                            [5, 'Платиновый', '30 000'],
                                            [6, 'Алмазный', '50 000'],
                                        ].map(([level, name, points]) => (
                                            <tr key={String(level)} className="bg-white dark:bg-zinc-900/40">
                                                <td className="px-4 py-2.5 tabular-nums">{level}</td>
                                                <td className="px-4 py-2.5">{name}</td>
                                                <td className="px-4 py-2.5 tabular-nums font-medium text-zinc-900 dark:text-white">{points}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <p>
                                <span className="font-semibold text-zinc-800 dark:text-zinc-100">3.</span> Количество
                                начисляемых за победу баллов варьируется от 100 до 200 и рассчитывается путем
                                суммирования базовых баллов за победу и баллов, начисленных с учетом коэффициента
                                редкости ответа (Kро). Kро зависит от соотношения голосов за правильный вариант к общему
                                числу участников легоса.
                            </p>

                            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-900 dark:bg-black p-4 space-y-1.5">
                                <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                                    Формула расчета баллов за победу в легосе
                                </p>
                                <p className="font-mono text-sm text-cyan-400">points = wins_points + (100 − Kро)</p>
                                <p className="font-mono text-sm text-cyan-400">Kро = (user_vote_count / total_votes) × 100</p>
                            </div>

                            <div className="space-y-2">
                                <p className="font-semibold text-zinc-800 dark:text-zinc-100">Где:</p>
                                <Bullets items={[
                                    <><span className="font-mono text-cyan-600 dark:text-cyan-400">points</span> — итоговая сумма баллов пользователя за победу в легосе;</>,
                                    <><span className="font-mono text-cyan-600 dark:text-cyan-400">wins_points</span> — базовые баллы за победу в легосе (100 баллов);</>,
                                    <><span className="font-mono text-cyan-600 dark:text-cyan-400">user_vote_count</span> — количество голосов за правильный вариант ответа;</>,
                                    <><span className="font-mono text-cyan-600 dark:text-cyan-400">total_votes</span> — количество голосов в легосе всего.</>,
                                ]} />
                            </div>
                        </Appendix>

                        <Appendix label="Приложение 4" title="Правила создания и публикации легоса" icon={<FileText size={18} />}>
                            <p>
                                Пользователи сайта, достигшие необходимого уровня экспертности, могут предлагать свои
                                легосы путем направления проекта легоса на электронную почту{' '}
                                <MailLink address="legos@legio.news" />. После утверждения легоса редколлегией сайта, а
                                для уровней «Платиновый» и «Алмазный» непосредственно после создания, легос публикуется
                                на сайте legio.news.
                            </p>
                            <p>Предлагая и публикуя легосы, пользователи должны учитывать следующие требования:</p>

                            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-4 space-y-3">
                                <p className="font-bold text-zinc-900 dark:text-white">
                                    1. Вопрос должен предполагать возможность прогнозирования
                                </p>
                                <div className="space-y-2">
                                    <p className="flex gap-2.5 items-start text-red-600 dark:text-red-400">
                                        <XIcon size={16} className="shrink-0 mt-0.5" />
                                        <span>«Как вы относитесь к этому решению?» — это мнение, такой вопрос не подходит.</span>
                                    </p>
                                    <p className="flex gap-2.5 items-start text-emerald-600 dark:text-emerald-400">
                                        <Check size={16} className="shrink-0 mt-0.5" />
                                        <span>«Как, по-вашему, закончится этот суд?» — это прогноз, такой вариант соответствует идее проекта.</span>
                                    </p>
                                </div>
                                <p className="font-semibold text-zinc-700 dark:text-zinc-200 pt-1">Примеры:</p>
                                <Bullets items={[
                                    '«Станет ли компания Х банкротом до конца года?»',
                                    '«Будет ли законопроект Y принят в текущей редакции?»',
                                ]} />
                            </div>

                            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-4 space-y-3">
                                <p className="font-bold text-zinc-900 dark:text-white">
                                    2. Варианты ответов должны быть чёткими и однозначными
                                </p>
                                <p>
                                    Они должны содержать только конкретные варианты исхода событий (без «возможно»,
                                    «затрудняюсь ответить» и т.п.).
                                </p>
                                <p className="font-semibold text-zinc-700 dark:text-zinc-200">Примеры:</p>
                                <Bullets items={[
                                    '«Компания объявит дефолт до 1 июля».',
                                    '«Компания избежит дефолта, но акции упадут на 20%».',
                                    '«Ничего не изменится».',
                                ]} />
                            </div>

                            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-4 space-y-2">
                                <p className="font-bold text-zinc-900 dark:text-white">
                                    3. Опрос должен быть привязан к конкретному сроку
                                </p>
                                <p>
                                    Необходимо сразу оценивать новость в возможности установления точной даты подведения
                                    итогов прогноза. Стараться избегать слишком долгосрочных прогнозов. Желательно
                                    ограничивать исход ситуации 1–2 месяцами.
                                </p>
                            </div>

                            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-4 space-y-2">
                                <p className="font-bold text-zinc-900 dark:text-white">
                                    4. Источник определения правильного результата должен быть известен заранее
                                </p>
                                <p>
                                    Предлагая опрос, необходимо указывать, по каким данным будет проверяться правильность
                                    прогноза (например: «по решению суда», «по отчёту компании», по публикации на сайте
                                    _____ и т.д.).
                                </p>
                            </div>

                            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-4 space-y-2">
                                <p className="font-bold text-zinc-900 dark:text-white">
                                    5. Ссылка на официальный источник информации прилагается обязательно
                                </p>
                                <p>
                                    Мы прогнозируем новости, опубликованные только на сайтах официальных общедоступных
                                    СМИ и верифицированных аккаунтов в соцсетях.
                                </p>
                            </div>

                            <Callout tone="amber">
                                Не принимаются к публикации опросы, формулировки которых нарушают законодательство
                                Российской Федерации, вызывают агрессию или содержат оскорбления, разжигают вражду и
                                ненависть.
                            </Callout>
                        </Appendix>
                    </div>
                )}

                {/* ------------------------------- ПОЛИТИКА -------------------------------- */}
                {activeTab === 'privacy' && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                        <div className="rounded-[28px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-6 lg:p-8">
                            <h1 className="text-xl lg:text-2xl font-bold text-zinc-900 dark:text-white mb-3">
                                Политика конфиденциальности
                            </h1>
                            <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                                Мы ценим ваше доверие и стремимся обеспечить защиту ваших персональных данных. Настоящая
                                политика объясняет, как мы собираем, используем и защищаем информацию, которую вы
                                предоставляете при использовании нашего сайта.
                            </p>
                        </div>

                        <Callout tone="amber">
                            Использование сайта legio.news означает безоговорочное согласие Пользователя с настоящей
                            Политикой и указанными в ней условиями обработки его персональной информации; в случае
                            несогласия с этими условиями Пользователь должен воздержаться от посещения сайта.
                        </Callout>

                        <Rule number={1} title="Какие данные мы собираем">
                            <p>При использовании нашего сайта мы можем собирать следующие данные.</p>
                            <p className="font-semibold text-zinc-800 dark:text-zinc-100">Информация, предоставленная вами:</p>
                            <Bullets items={[
                                'Ваши ответы на опросы.',
                                'Комментарии, оставленные вами на сайте (если такая функция доступна).',
                                'Данные, предоставленные при регистрации (если требуется): имя, адрес электронной почты и другая информация.',
                            ]} />
                            <p className="font-semibold text-zinc-800 dark:text-zinc-100">Технические данные:</p>
                            <Bullets items={[
                                'IP-адрес, тип браузера, операционная система, данные о посещенных страницах и времени пребывания на сайте.',
                                'Файлы cookie и аналогичные технологии для улучшения работы сайта и анализа пользовательского поведения.',
                            ]} />
                        </Rule>

                        <Rule number={2} title="Как мы используем ваши данные">
                            <p>Мы используем собранную информацию для следующих целей:</p>
                            <Bullets items={[
                                'Проведение опросов и анализ результатов.',
                                'Улучшение функциональности и удобства сайта.',
                                'Обеспечение безопасности и предотвращение мошенничества.',
                                'Информирование вас о новых опросах, акциях или обновлениях сайта (если вы дали согласие на рассылку).',
                                'Соблюдение требований законодательства.',
                            ]} />
                        </Rule>

                        <Rule number={3} title="Передача данных третьим лицам">
                            <p>
                                Мы не передаем ваши персональные данные третьим лицам, за исключением следующих случаев:
                            </p>
                            <Bullets items={[
                                'Если это необходимо для выполнения ваших запросов (например, при технической поддержке).',
                                'Если это требуется по закону или для защиты наших прав и безопасности.',
                                'Если вы дали явное согласие на передачу данных.',
                            ]} />
                        </Rule>

                        <Rule number={4} title="Защита данных">
                            <p>
                                Мы принимаем все необходимые меры для защиты ваших данных от несанкционированного
                                доступа, изменения, раскрытия или уничтожения. Для этого используются современные
                                технологии шифрования и строгие процедуры контроля доступа.
                            </p>
                        </Rule>

                        <Rule number={5} title="Файлы cookie">
                            <p>
                                Наш сайт использует файлы cookie для улучшения вашего опыта. Файлы cookie — это небольшие
                                текстовые файлы, которые сохраняются на вашем устройстве. Вы можете отключить их в
                                настройках браузера, но это может повлиять на функциональность сайта.
                            </p>
                        </Rule>

                        <Rule number={6} title="Ваши права">
                            <p>Вы имеете право:</p>
                            <Bullets items={[
                                'Запросить доступ к вашим персональным данным.',
                                'Исправить неточности в ваших данных.',
                                'Удалить ваши данные (если это не противоречит законодательству).',
                                'Отозвать согласие на обработку данных.',
                                'Ограничить или возразить против обработки ваших данных.',
                            ]} />
                            <p>
                                Для реализации этих прав свяжитесь с нами по электронной почте, указанной на сайте.
                            </p>
                        </Rule>

                        <Rule number={7} title="Изменения в политике конфиденциальности">
                            <p>
                                Мы можем время от времени обновлять нашу политику конфиденциальности. Все изменения будут
                                опубликованы на этой странице. Рекомендуем периодически проверять ее, чтобы быть в курсе
                                последних обновлений.
                            </p>
                        </Rule>

                        <Rule number={8} title="Контакты">
                            <p>
                                Если у вас есть вопросы или замечания относительно нашей политики конфиденциальности,
                                пожалуйста, свяжитесь с нами.
                            </p>
                            <p>
                                Электронная почта: <MailLink address="info@legio.news" />
                            </p>
                        </Rule>

                        <div className="rounded-[28px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-6 text-center space-y-2">
                            <p className="font-bold text-zinc-900 dark:text-white">
                                Благодарим за доверие и участие в наших опросах!
                            </p>
                            <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-2xl mx-auto">
                                Ваше мнение важно для нас, и мы делаем все возможное, чтобы защитить вашу
                                конфиденциальность. Если у вас есть дополнительные пожелания или вопросы, не стесняйтесь
                                обращаться. Мы всегда готовы помочь!
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
