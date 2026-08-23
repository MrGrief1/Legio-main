export type Language = 'ru' | 'en';

export interface Translations {
    // Common
    loading: string;
    error: string;
    save: string;
    cancel: string;
    delete: string;
    deleteConfirm: string;
    edit: string;
    search: string;
    points: string;

    // Sidebar
    sidebar: {
        tagline: string;
        latestNews: string;
        favorites: string;
        openPolls: string;
        chats: string;
        leaderboard: string;
        adminPanel: string;
        createPoll: string;
        managePolls: string;
        statistics: string;
        errorReports: string;
        information: string;
        searchPlaceholder: string;
        categories: string;
    };

    // Manage / resolve pending polls
    managePolls: {
        title: string;
        subtitle: string;
        loading: string;
        empty: string;
        votes: string;
        pickCorrect: string;
        pickEarly: string;
        resolving: string;
        searchPlaceholder: string;
        noResults: string;
        // Вкладки набора опросов
        tabOverdue: string;
        tabActive: string;
        tabResolved: string;
        tabHintOverdue: string;
        tabHintActive: string;
        tabHintResolved: string;
        emptyOverdue: string;
        emptyActive: string;
        emptyResolved: string;
        // Фильтры и сортировка
        author: string;
        allAuthors: string;
        onlyMine: string;
        withoutAuthor: string;
        authorHint: string;
        // Согласование числительных: 1 голос, 2 голоса, 5 голосов.
        votesOne: string;
        votesFew: string;
        sortBy: string;
        sortDeadline: string;
        sortCreated: string;
        sortResolvedAt: string;
        sortTitle: string;
        sortAuthor: string;
        sortVotes: string;
        orderAsc: string;
        orderDesc: string;
        resetFilters: string;
        // Плотность списка
        compactView: string;
        expandedView: string;
        // Строка опроса
        createdOn: string;
        deadline: string;
        noDeadline: string;
        overdue: string;
        unknownAuthor: string;
        openPoll: string;
        editPoll: string;
        // Вкладка черновиков и запланированных публикаций
        tabDrafts: string;
        tabHintDrafts: string;
        emptyDrafts: string;
        draftBadge: string;
        scheduledBadge: string;
        goesLiveAt: string;
        noPollYet: string;
        continueEditing: string;
        publishNow: string;
        confirmPublishNow: string;
        publishedNow: string;
        deleteDraft: string;
        confirmDeleteDraft: string;
        draftDeleted: string;
        copyLink: string;
        linkCopied: string;
        linkCopyFailed: string;
        expandRow: string;
        collapseRow: string;
        resolvedBy: string;
        resolvedAt: string;
        correctAnswer: string;
        resolvedBadge: string;
        voidBadge: string;
        voidedAt: string;
        voidHint: string;
        loadMore: string;
        loadingMore: string;
        shown: string;
        confirmResolve: string;
        confirmResolveEarly: string;
        resolveSuccess: string;
        resolveFailed: string;
        networkError: string;
        openFailed: string;
    };

    // Auth
    auth: {
        login: string;
        register: string;
        username: string;
        email: string;
        name: string;
        password: string;
        loginButton: string;
        registerButton: string;
        logout: string;
        role: string;
        // Подтверждение по коду с почты
        verifyEmailTitle: string;
        verifyLoginTitle: string;
        codeSentTo: string;
        codePlaceholder: string;
        verifyButton: string;
        resendCode: string;
        resendIn: string;
        back: string;
        forgotPassword: string;
        resetTitle: string;
        resetHint: string;
        sendCode: string;
        newPassword: string;
        resetButton: string;
        resetSent: string;
    };

    // Settings Modal
    settings: {
        title: string;
        profile: string;
        security: string;
        displayName: string;
        language: string;
        emailUsername: string;
        newPassword: string;
        confirmPassword: string;
        saveChanges: string;
        updateCredentials: string;
        changeAvatar: string;
        passwordMismatch: string;
        profileUpdated: string;
        securityUpdated: string;
        updateFailed: string;
        displayNamePlaceholder: string;
        emailPlaceholder: string;
        passwordPlaceholder: string;
        confirmPasswordPlaceholder: string;
        // Безопасность: почта, пароль, вход по коду
        emailSection: string;
        currentEmail: string;
        noEmail: string;
        noEmailHint: string;
        bindEmail: string;
        changeEmail: string;
        passwordSection: string;
        currentPassword: string;
        currentPasswordPlaceholder: string;
        changePassword: string;
        twoFactorSection: string;
        twoFactorHint: string;
        twoFactorOn: string;
        twoFactorOff: string;
        enable: string;
        disable: string;
        codeSentTo: string;
        codePlaceholder: string;
        confirmCode: string;
        cancel: string;
        resendCode: string;
        passwordChanged: string;
        emailChanged: string;
        twoFactorEnabled: string;
        twoFactorDisabled: string;
        stepCurrentEmail: string;
        stepNewEmail: string;
        newEmailPlaceholder: string;
        // Профиль: подписи, которые раньше были вшиты в разметку по-русски
        bio: string;
        bioPlaceholder: string;
        birthdate: string;
        birthdatePlaceholder: string;
        // Оформление: тема переехала сюда с главного экрана
        appearance: string;
        theme: string;
        themeHint: string;
        themeLight: string;
        themeDark: string;
        themeSystem: string;
    };

    // Календарь выбора даты
    datePicker: {
        placeholder: string;
        today: string;
        clear: string;
        previous: string;
        next: string;
    };

    // Feed
    feed: {
        vote: string;
        votes: string;
        select: string;
        resolve: string;
        delete: string;
        report: string;
        like: string;
        viewResults: string;
        votedFor: string;
        resolved: string;
        winner: string;
        noNews: string;
    };

    // Admin Panel
    admin: {
        title: string;
        titleLabel: string;
        descriptionLabel: string;
        coverImage: string;
        imageUrl: string;
        tags: string;
        category: string;
        pollConfig: string;
        question: string;
        option: string;
        addTag: string;
        addOption: string;
        publishNews: string;
        userManagement: string;
        searchUsers: string;
        user: string;
        role: string;
        actions: string;
        loadingUsers: string;
        noUsers: string;
        accessDenied: string;
        newsCreated: string;
        newsCreateFailed: string;
        uploadFailed: string;
        titlePlaceholder: string;
        descriptionPlaceholder: string;
        tagsPlaceholder: string;
        questionPlaceholder: string;
        optionPlaceholder: string;
        registered: string;
        lastSeen: string;
        sortBy: string;
        never: string;
        openProfileHint: string;
        // User details modal
        userDetails: string;
        loadingDetails: string;
        detailsFailed: string;
        overview: string;
        activity: string;
        pointsLedger: string;
        votesTotal: string;
        accuracy: string;
        correctVotes: string;
        wrongVotes: string;
        pendingVotes: string;
        likesGiven: string;
        reportsSubmitted: string;
        monthlyPoints: string;
        allTimeRank: string;
        monthlyRank: string;
        level: string;
        bio: string;
        birthdate: string;
        notSet: string;
        firstVote: string;
        lastVote: string;
        favoriteCategories: string;
        noPointsHistory: string;
        noVotesYet: string;
        outOf: string;
        changeRoleLabel: string;
    };

    // Create-poll wizard
    wizard: {
        title: string;
        stepLabel: string;
        of: string;
        next: string;
        back: string;
        stepCategory: string;
        stepContent: string;
        stepTags: string;
        stepPoll: string;
        stepReview: string;
        selectCategoryHint: string;
        sourceLabel: string;
        sourcePlaceholder: string;
        pollEndDateLabel: string;
        pollEndDateHint: string;
        pollEndDateNote: string;
        optional: string;
        reviewHeading: string;
        reviewCategory: string;
        reviewNoTags: string;
        reviewNoSource: string;
        reviewNoEndDate: string;
        validationCategory: string;
        validationContent: string;
        validationPoll: string;
        validationPollUnique: string;
        // Правка уже опубликованного материала
        editTitle: string;
        editSubtitle: string;
        saved: string;
        saveChanges: string;
        cancelEdit: string;
        backToPolls: string;
        loadFailed: string;
        pollLockedHint: string;
        // Черновики и отложенная публикация
        saveDraft: string;
        draftSaved: string;
        scheduledSaved: string;
        draftNeedsTitle: string;
        publishNow: string;
        publishSchedule: string;
        publishWhen: string;
        publishDateLabel: string;
        publishTimeLabel: string;
        publishScheduleHint: string;
        publishNowHint: string;
        schedulePublish: string;
        editingDraft: string;
    };

    // Leaderboard
    leaderboard: {
        title: string;
        loading: string;
        pointsLabel: string;
        // Monthly event table
        monthlyTitle: string;
        // "{points}" is substituted with the prize amount reported by the server.
        prizeRule: string;
        monthlyTab: string;
        allTimeTab: string;
        monthlySubtitle: string;
        allTimeSubtitle: string;
        endsIn: string;
        newWinnerIn: string;
        eventClosed: string;
        currentWinner: string;
        noMonthlyLeaders: string;
        monthlyPointsLabel: string;
        totalPointsLabel: string;
        winsLabel: string;
        participants: string;
        days: string;
        hours: string;
        minutes: string;
        seconds: string;
    };

    // Right Panel
    rightPanel: {
        checkIntuition: string;
        promoText: string;
        topLeader: string;
        prizeWinner: string;
        prizePoints: string;
        prizeGift: string;
        topPredictors: string;
        noLeaders: string;
        loadError: string;
        monthlyLeader: string;
        noMonthlyLeader: string;
        forFirstPlace: string;
        untilNewWinner: string;
    };

    // Statistics (будет добавлено позже если нужно)
    statistics: {
        title: string;
        overview: string;
        userRegistrations: string;
        pollsCreated: string;
        votingActivity: string;
        totalVisits: string;
        engagementRate: string;
        period: string;
        day: string;
        week: string;
        month: string;
        year: string;
    };

    // Error Reports
    errorReports: {
        title: string;
        loading: string;
        noReports: string;
        status: string;
        pending: string;
        resolved: string;
        dismissed: string;
        markResolved: string;
        markDismissed: string;
        delete: string;
    };

    // Report Modal
    reportModal: {
        title: string;
        selectReason: string;
        spam: string;
        inappropriate: string;
        misleading: string;
        other: string;
        additionalInfo: string;
        submit: string;
        submitting: string;
        success: string;
        failed: string;
        placeholder: string;
    };

    // News Modal
    newsModal: {
        // Минимальный набор, так как в основном используется контент
        close: string;
    };

    // Categories (будут взяты из constants)
    categories: {
        all: string;
        general: string;
        politics: string;
        sport: string;
        tech: string;
        business: string;
        entertainment: string;
        science: string;
    };

    // User roles
    roles: {
        user: string;
        creator: string;
        admin: string;
    };
}

export const translations: Record<Language, Translations> = {
    ru: {
        // Common
        loading: 'Загрузка...',
        error: 'Ошибка',
        save: 'Сохранить',
        cancel: 'Отмена',
        delete: 'Удалить',
        deleteConfirm: 'Удалить сообщение?',
        edit: 'Редактировать',
        search: 'Поиск',
        points: 'баллов',

        // Sidebar
        sidebar: {
            tagline: 'Сервис для проверки интуиции. Только свежие новости и интересные опросы.',
            latestNews: 'Последние новости',
            favorites: 'Избранное',
            openPolls: 'Незавершённые опросы',
            chats: 'Чаты',
            leaderboard: 'Таблица лидеров',
            adminPanel: 'Админ панель',
            createPoll: 'Создать опрос',
            managePolls: 'Управление опросами',
            statistics: 'Статистика',
            errorReports: 'Сообщения об ошибках',
            information: 'Информация',
            searchPlaceholder: 'Я ищу...',
            categories: 'Категории',
        },

        managePolls: {
            title: 'Опросы',
            subtitle: 'Все опросы в одном месте: заголовок, автор и срок — можно завершить прямо здесь или открыть опрос целиком.',
            loading: 'Загрузка опросов...',
            empty: 'Все опросы завершены',
            votes: 'голосов',
            pickCorrect: 'Выберите правильный ответ:',
            pickEarly: 'Голосование ещё идёт — завершить можно досрочно, но только с подтверждением',
            resolving: 'Завершаем...',
            searchPlaceholder: 'Поиск по заголовку, вопросу или автору...',
            noResults: 'Ничего не найдено',
            tabOverdue: 'Требуют завершения',
            tabActive: 'Ещё идут',
            tabResolved: 'Завершённые',
            tabHintOverdue: 'Срок голосования вышел, верный вариант ещё не выбран.',
            tabHintActive: 'Голосование открыто — завершить можно досрочно, с подтверждением.',
            tabHintResolved: 'Уже завершённые опросы: видно, кто и когда проставил верный вариант.',
            emptyOverdue: 'Просроченных опросов нет — всё разобрано',
            emptyActive: 'Открытых опросов нет',
            emptyResolved: 'Завершённых опросов пока нет',
            author: 'Автор',
            allAuthors: 'Все авторы',
            onlyMine: 'Только мои',
            withoutAuthor: 'Без автора',
            authorHint: '{pending} к завершению · {total} всего',
            votesOne: 'голос',
            votesFew: 'голоса',
            sortBy: 'Сортировка',
            sortDeadline: 'По сроку',
            sortCreated: 'По дате создания',
            sortResolvedAt: 'По дате завершения',
            sortTitle: 'По заголовку',
            sortAuthor: 'По автору',
            sortVotes: 'По числу голосов',
            orderAsc: 'По возрастанию',
            orderDesc: 'По убыванию',
            resetFilters: 'Сбросить',
            compactView: 'Сжато',
            expandedView: 'Развёрнуто',
            createdOn: 'Создан',
            deadline: 'До',
            noDeadline: 'Без срока',
            overdue: 'Срок вышел',
            unknownAuthor: 'Автор не указан',
            openPoll: 'Открыть опрос',
            editPoll: 'Редактировать',
            tabDrafts: 'Черновики',
            tabHintDrafts: 'Черновики и запланированные публикации — читателям они пока не видны.',
            emptyDrafts: 'Черновиков нет',
            draftBadge: 'Черновик',
            scheduledBadge: 'Запланирован',
            goesLiveAt: 'Выйдет',
            noPollYet: 'Опрос ещё не заполнен',
            continueEditing: 'Продолжить',
            publishNow: 'Опубликовать сейчас',
            confirmPublishNow: 'Опубликовать «{title}» прямо сейчас?',
            publishedNow: 'Опубликовано — материал уже в ленте',
            deleteDraft: 'Удалить',
            confirmDeleteDraft: 'Удалить «{title}» без возможности восстановления?',
            draftDeleted: 'Удалено',
            copyLink: 'Скопировать ссылку',
            linkCopied: 'Ссылка скопирована — можно переслать',
            linkCopyFailed: 'Не удалось скопировать ссылку',
            expandRow: 'Показать варианты',
            collapseRow: 'Скрыть варианты',
            resolvedBy: 'Завершил',
            resolvedAt: 'Завершён',
            correctAnswer: 'Верный ответ',
            resolvedBadge: 'Завершён',
            voidBadge: 'Без результата',
            voidedAt: 'Закрыт без результата',
            voidHint: 'Опрос закрыт без результата — победителя нет, баллы не начислялись. Если исход всё-таки известен, выберите верный вариант: опрос завершится по-настоящему и баллы уйдут угадавшим.',
            loadMore: 'Показать ещё',
            loadingMore: 'Загружаем...',
            shown: 'Показано',
            confirmResolve: 'Отметить вариант «{option}» верным и завершить опрос? Это действие нельзя отменить.',
            confirmResolveEarly: 'Голосование идёт до {deadline}. Отметить вариант «{option}» верным и завершить опрос досрочно? Баллы начислятся сразу, отменить нельзя.',
            resolveSuccess: 'Опрос завершён. Начислено {points} баллов победителям ({winners}).',
            resolveFailed: 'Не удалось завершить опрос.',
            networkError: 'Ошибка сети. Попробуйте ещё раз.',
            openFailed: 'Не удалось открыть опрос.',
        },

        // Auth
        auth: {
            login: 'Вход',
            register: 'Регистрация',
            username: 'Имя пользователя',
            email: 'Email',
            name: 'Имя',
            password: 'Пароль',
            loginButton: 'Войти в аккаунт',
            registerButton: 'Создать аккаунт',
            logout: 'Выйти',
            role: 'Роль',
            verifyEmailTitle: 'Подтвердите почту',
            verifyLoginTitle: 'Подтверждение входа',
            codeSentTo: 'Код отправлен на',
            codePlaceholder: 'Код из письма',
            verifyButton: 'Подтвердить',
            resendCode: 'Отправить код ещё раз',
            resendIn: 'Отправить повторно можно через',
            back: 'Назад',
            forgotPassword: 'Забыли пароль?',
            resetTitle: 'Восстановление пароля',
            resetHint: 'Укажите почту — пришлём код для смены пароля.',
            sendCode: 'Отправить код',
            newPassword: 'Новый пароль',
            resetButton: 'Сменить пароль',
            resetSent: 'Если такой аккаунт существует, код отправлен',
        },

        // Settings Modal
        settings: {
            title: 'Настройки',
            profile: 'Профиль',
            security: 'Безопасность',
            displayName: 'Отображаемое имя',
            language: 'Язык / Language',
            emailUsername: 'Email / Логин',
            newPassword: 'Новый пароль',
            confirmPassword: 'Подтвердите пароль',
            saveChanges: 'Сохранить изменения',
            updateCredentials: 'Обновить данные',
            changeAvatar: 'Нажмите, чтобы изменить аватар',
            passwordMismatch: 'Пароли не совпадают',
            profileUpdated: 'Профиль успешно обновлен',
            securityUpdated: 'Настройки безопасности обновлены. Пожалуйста, войдите снова.',
            updateFailed: 'Не удалось обновить',
            displayNamePlaceholder: 'Введите ваше имя',
            emailPlaceholder: 'Введите новый email',
            passwordPlaceholder: 'Введите новый пароль',
            confirmPasswordPlaceholder: 'Подтвердите новый пароль',
            emailSection: 'Почта',
            currentEmail: 'Текущая почта',
            noEmail: 'Почта не привязана',
            noEmailHint: 'Привяжите почту, чтобы восстанавливать пароль и включить вход по коду.',
            bindEmail: 'Привязать почту',
            changeEmail: 'Сменить почту',
            passwordSection: 'Пароль',
            currentPassword: 'Текущий пароль',
            currentPasswordPlaceholder: 'Введите текущий пароль',
            changePassword: 'Сменить пароль',
            twoFactorSection: 'Вход по коду с почты',
            twoFactorHint: 'При входе мы будем присылать одноразовый код на вашу почту.',
            twoFactorOn: 'Включён',
            twoFactorOff: 'Отключён',
            enable: 'Включить',
            disable: 'Отключить',
            codeSentTo: 'Код отправлен на',
            codePlaceholder: 'Код из письма',
            confirmCode: 'Подтвердить',
            cancel: 'Отмена',
            resendCode: 'Отправить ещё раз',
            passwordChanged: 'Пароль обновлён',
            emailChanged: 'Почта обновлена',
            twoFactorEnabled: 'Вход по коду включён',
            twoFactorDisabled: 'Вход по коду отключён',
            stepCurrentEmail: 'Шаг 1: подтвердите текущую почту',
            stepNewEmail: 'Шаг 2: подтвердите новую почту',
            newEmailPlaceholder: 'Новый адрес почты',
            bio: 'О себе',
            bioPlaceholder: 'Расскажите о себе...',
            birthdate: 'День рождения',
            birthdatePlaceholder: 'Выберите дату',
            appearance: 'Оформление',
            theme: 'Тема',
            themeHint: 'Настройка сохраняется на этом устройстве.',
            themeLight: 'Светлая',
            themeDark: 'Тёмная',
            themeSystem: 'Авто',
        },

        datePicker: {
            placeholder: 'Выберите дату',
            today: 'Сегодня',
            clear: 'Очистить',
            previous: 'Назад',
            next: 'Вперёд',
        },

        // Feed
        feed: {
            vote: 'голос',
            votes: 'голосов',
            select: 'Выбрать',
            resolve: 'Завершить',
            delete: 'Удалить',
            report: 'Пожаловаться',
            like: 'Нравится',
            viewResults: 'Смотреть результаты',
            votedFor: 'Вы проголосовали за',
            resolved: 'Опрос завершен',
            winner: 'Победитель',
            noNews: 'Новостей пока нет',
        },

        // Admin Panel
        admin: {
            title: 'Админ панель',
            titleLabel: 'Заголовок',
            descriptionLabel: 'Описание',
            coverImage: 'Обложка',
            imageUrl: 'URL изображения (или загрузите файл)',
            tags: 'Теги',
            category: 'Категория',
            pollConfig: 'Настройка опроса',
            question: 'Вопрос',
            option: 'Вариант',
            addTag: 'Добавить тег',
            addOption: 'Добавить вариант',
            publishNews: 'Опубликовать новость',
            userManagement: 'Управление пользователями',
            searchUsers: 'Поиск пользователей...',
            user: 'Пользователь',
            role: 'Роль',
            actions: 'Действия',
            loadingUsers: 'Загрузка пользователей...',
            noUsers: 'Пользователи не найдены',
            accessDenied: 'Доступ запрещен',
            newsCreated: 'Новость успешно создана!',
            newsCreateFailed: 'Не удалось создать новость',
            uploadFailed: 'Ошибка загрузки',
            titlePlaceholder: 'Заголовок',
            descriptionPlaceholder: 'Описание',
            tagsPlaceholder: 'Введите тег и нажмите Enter или запятую',
            questionPlaceholder: 'Вопрос',
            optionPlaceholder: 'Вариант',
            registered: 'Регистрация',
            lastSeen: 'Был(а) в сети',
            sortBy: 'Сортировка',
            never: 'Никогда',
            openProfileHint: 'Нажмите на пользователя, чтобы открыть полную статистику',
            userDetails: 'Профиль пользователя',
            loadingDetails: 'Загрузка статистики...',
            detailsFailed: 'Не удалось загрузить статистику пользователя',
            overview: 'Обзор',
            activity: 'Активность',
            pointsLedger: 'История баллов',
            votesTotal: 'Всего прогнозов',
            accuracy: 'Точность прогнозов',
            correctVotes: 'Верные',
            wrongVotes: 'Неверные',
            pendingVotes: 'В ожидании',
            likesGiven: 'Лайков поставлено',
            reportsSubmitted: 'Жалоб отправлено',
            monthlyPoints: 'Баллов за месяц',
            allTimeRank: 'Место за всё время',
            monthlyRank: 'Место за месяц',
            level: 'Уровень',
            bio: 'О себе',
            birthdate: 'Дата рождения',
            notSet: 'Не указана',
            firstVote: 'Первый прогноз',
            lastVote: 'Последний прогноз',
            favoriteCategories: 'Любимые категории',
            noPointsHistory: 'Баллы пока не начислялись',
            noVotesYet: 'Прогнозов пока нет',
            outOf: 'из',
            changeRoleLabel: 'Изменить роль',
        },

        // Create-poll wizard
        wizard: {
            title: 'Создать опрос',
            stepLabel: 'Шаг',
            of: 'из',
            next: 'Далее',
            back: 'Назад',
            stepCategory: 'Категория',
            stepContent: 'Новость',
            stepTags: 'Теги',
            stepPoll: 'Опрос',
            stepReview: 'Проверка',
            selectCategoryHint: 'Выберите категорию для новости',
            sourceLabel: 'Источник (ссылка)',
            sourcePlaceholder: 'https://example.com/article',
            pollEndDateLabel: 'Окончание голосования',
            pollEndDateHint: 'Необязательно. Без даты голосование остаётся открытым, пока опрос не завершат вручную.',
            pollEndDateNote: 'Как это работает: до указанной даты люди голосуют. В сам этот день приём голосов закрывается — опрос остаётся открытым, на карточке появляется пометка «Приём голосов закрыт», и виден только расклад голосов. Верный вариант вы проставляете позже, вручную; тогда и начисляются баллы. Пример: опрос «кто выиграет матч» со сроком в день матча — ставки принимаются до начала игры, а завершаете вы опрос после неё.',
            optional: 'необязательно',
            reviewHeading: 'Проверьте и опубликуйте',
            reviewCategory: 'Категория',
            reviewNoTags: 'Без тегов',
            reviewNoSource: 'Источник не указан',
            reviewNoEndDate: 'Дата окончания не указана',
            validationCategory: 'Выберите категорию, чтобы продолжить',
            validationContent: 'Заполните заголовок, описание и обложку',
            validationPoll: 'Укажите вопрос и минимум 2 варианта ответа',
            validationPollUnique: 'Варианты ответа не должны повторяться',
            editTitle: 'Редактирование публикации',
            editSubtitle: 'Правки применяются сразу. Отданные голоса сохраняются: варианты сопоставляются по номеру, а не по тексту.',
            saved: 'Изменения сохранены',
            saveChanges: 'Сохранить изменения',
            cancelEdit: 'Отменить правку',
            backToPolls: 'К списку опросов',
            loadFailed: 'Не удалось загрузить публикацию для редактирования',
            pollLockedHint: 'Опрос уже завершён — вопрос и варианты изменить нельзя, баллы за него начислены. Остальные поля правятся свободно.',
            saveDraft: 'Сохранить черновик',
            draftSaved: 'Черновик сохранён — он в разделе «Управление опросами», вкладка «Черновики»',
            scheduledSaved: 'Публикация запланирована — выйдет автоматически в указанное время',
            draftNeedsTitle: 'Для черновика нужен хотя бы заголовок (от 3 символов)',
            publishNow: 'Опубликовать сейчас',
            publishSchedule: 'Запланировать',
            publishWhen: 'Когда публиковать',
            publishDateLabel: 'Дата выхода',
            publishTimeLabel: 'Время выхода',
            publishScheduleHint: 'Публикация появится в ленте сама, в указанные дату и время по вашим часам.',
            publishNowHint: 'Материал появится в ленте сразу после нажатия кнопки.',
            schedulePublish: 'Запланировать публикацию',
            editingDraft: 'Это черновик — читателям он пока не виден.',
        },

        // Leaderboard
        leaderboard: {
            title: 'Таблица лидеров',
            loading: 'Загрузка...',
            pointsLabel: 'баллов',
            monthlyTitle: 'Ивент месяца',
            prizeRule: 'За 1-е место — {points} баллов. Побеждает тот, кто наберёт больше всех баллов с начала месяца.',
            monthlyTab: 'За месяц',
            allTimeTab: 'За всё время',
            monthlySubtitle: 'Баллы, заработанные с начала месяца. Кто наберёт больше всех — становится призёром.',
            allTimeSubtitle: 'Общий счёт за всю историю участия.',
            endsIn: 'До конца ивента',
            newWinnerIn: 'Новый призёр через',
            eventClosed: 'Ивент завершён',
            currentWinner: 'Текущий призёр',
            noMonthlyLeaders: 'В этом месяце ещё никто не заработал баллы',
            monthlyPointsLabel: 'за месяц',
            totalPointsLabel: 'всего',
            winsLabel: 'побед',
            participants: 'участников',
            days: 'д',
            hours: 'ч',
            minutes: 'м',
            seconds: 'с',
        },

        // Right Panel
        rightPanel: {
            checkIntuition: 'Проверь свою интуицию',
            promoText: 'Выбирайте опросы и прогнозируйте исходы. Зарабатывайте баллы, открывайте новые уровни и получайте эксклюзивные призы!',
            topLeader: 'Лидер рейтинга',
            prizeWinner: 'Призёр',
            prizePoints: 'баллов',
            prizeGift: 'и Приз от Легио!',
            topPredictors: 'Лидеры прогнозов',
            noLeaders: 'Пока нет лидеров',
            loadError: 'Ошибка загрузки',
            monthlyLeader: 'заработано за месяц',
            noMonthlyLeader: 'Призёр определится, когда появятся первые баллы этого месяца',
            forFirstPlace: 'за 1-е место',
            untilNewWinner: 'до нового призёра',
        },

        // Statistics
        statistics: {
            title: 'Статистика',
            overview: 'Обзор',
            userRegistrations: 'Регистрации пользователей',
            pollsCreated: 'Созданные опросы',
            votingActivity: 'Активность голосования',
            totalVisits: 'Всего посещений',
            engagementRate: 'Уровень вовлеченности',
            period: 'Период',
            day: 'День',
            week: 'Неделя',
            month: 'Месяц',
            year: 'Год',
        },

        // Error Reports
        errorReports: {
            title: 'Сообщения об ошибках',
            loading: 'Загрузка...',
            noReports: 'Нет сообщений об ошибках',
            status: 'Статус',
            pending: 'В ожидании',
            resolved: 'Решено',
            dismissed: 'Отклонено',
            markResolved: 'Отметить как решено',
            markDismissed: 'Отклонить',
            delete: 'Удалить',
        },

        // Report Modal
        reportModal: {
            title: 'Пожаловаться на публикацию',
            selectReason: 'Выберите причину',
            spam: 'Спам',
            inappropriate: 'Неприемлемый контент',
            misleading: 'Вводящая в заблуждение информация',
            other: 'Другое',
            additionalInfo: 'Дополнительная информация (необязательно)',
            submit: 'Отправить жалобу',
            submitting: 'Отправка...',
            success: 'Жалоба успешно отправлена',
            failed: 'Не удалось отправить жалобу',
            placeholder: 'Опишите проблему подробнее...',
        },

        // News Modal
        newsModal: {
            close: 'Закрыть',
        },

        // Categories
        categories: {
            all: 'Все',
            general: 'Общее',
            politics: 'Политика',
            sport: 'Спорт',
            tech: 'Технологии',
            business: 'Бизнес',
            entertainment: 'Развлечения',
            science: 'Наука',
        },

        // User roles
        roles: {
            user: 'Пользователь',
            creator: 'Создатель',
            admin: 'Администратор',
        },
    },

    en: {
        // Common
        loading: 'Loading...',
        error: 'Error',
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        deleteConfirm: 'Delete message?',
        edit: 'Edit',
        search: 'Search',
        points: 'points',

        // Sidebar
        sidebar: {
            tagline: 'A service for testing your intuition. Only fresh news and interesting polls.',
            latestNews: 'Latest news',
            favorites: 'Favorites',
            openPolls: 'Open polls',
            chats: 'Chats',
            leaderboard: 'Leaderboard',
            adminPanel: 'Admin Panel',
            createPoll: 'Create poll',
            managePolls: 'Manage polls',
            statistics: 'Statistics',
            errorReports: 'Error Reports',
            information: 'Information',
            searchPlaceholder: 'I\'m looking for...',
            categories: 'Categories',
        },

        managePolls: {
            title: 'Polls',
            subtitle: 'Every poll in one place: headline, author and deadline — resolve it here or open the full poll.',
            loading: 'Loading polls...',
            empty: 'All polls are resolved',
            votes: 'votes',
            pickCorrect: 'Pick the correct answer:',
            pickEarly: 'Voting is still open — resolving now closes the poll early and needs a confirmation',
            resolving: 'Resolving...',
            searchPlaceholder: 'Search by headline, question or author...',
            noResults: 'Nothing found',
            tabOverdue: 'Needs a result',
            tabActive: 'Still running',
            tabResolved: 'Resolved',
            tabHintOverdue: 'Voting has closed and no correct option has been picked yet.',
            tabHintActive: 'Voting is still open — resolving is possible early, with a confirmation.',
            tabHintResolved: 'Already resolved polls: who picked the answer, and when.',
            emptyOverdue: 'Nothing overdue — everything is resolved',
            emptyActive: 'No open polls',
            emptyResolved: 'No resolved polls yet',
            author: 'Author',
            allAuthors: 'All authors',
            onlyMine: 'Mine only',
            withoutAuthor: 'No author',
            authorHint: '{pending} to resolve · {total} total',
            votesOne: 'vote',
            votesFew: 'votes',
            sortBy: 'Sort',
            sortDeadline: 'By deadline',
            sortCreated: 'By creation date',
            sortResolvedAt: 'By resolution date',
            sortTitle: 'By headline',
            sortAuthor: 'By author',
            sortVotes: 'By vote count',
            orderAsc: 'Ascending',
            orderDesc: 'Descending',
            resetFilters: 'Reset',
            compactView: 'Compact',
            expandedView: 'Expanded',
            createdOn: 'Created',
            deadline: 'Until',
            noDeadline: 'No deadline',
            overdue: 'Overdue',
            unknownAuthor: 'No author',
            openPoll: 'Open poll',
            editPoll: 'Edit',
            tabDrafts: 'Drafts',
            tabHintDrafts: 'Drafts and scheduled posts — readers cannot see them yet.',
            emptyDrafts: 'No drafts',
            draftBadge: 'Draft',
            scheduledBadge: 'Scheduled',
            goesLiveAt: 'Goes live',
            noPollYet: 'Poll not filled in yet',
            continueEditing: 'Continue',
            publishNow: 'Publish now',
            confirmPublishNow: 'Publish "{title}" right now?',
            publishedNow: 'Published — it is in the feed now',
            deleteDraft: 'Delete',
            confirmDeleteDraft: 'Delete "{title}" permanently?',
            draftDeleted: 'Deleted',
            copyLink: 'Copy link',
            linkCopied: 'Link copied — ready to forward',
            linkCopyFailed: 'Could not copy the link',
            expandRow: 'Show options',
            collapseRow: 'Hide options',
            resolvedBy: 'Resolved by',
            resolvedAt: 'Resolved',
            correctAnswer: 'Correct answer',
            resolvedBadge: 'Resolved',
            voidBadge: 'No result',
            voidedAt: 'Closed with no result',
            voidHint: 'This poll was closed without a result — no winner, no points awarded. If the outcome is known after all, pick the correct option: the poll resolves properly and points go to whoever got it right.',
            loadMore: 'Load more',
            loadingMore: 'Loading...',
            shown: 'Showing',
            confirmResolve: 'Mark "{option}" as the correct answer and close the poll? This cannot be undone.',
            confirmResolveEarly: 'Voting runs until {deadline}. Mark "{option}" as the correct answer and close the poll early? Points are awarded immediately and this cannot be undone.',
            resolveSuccess: 'Poll resolved. {points} points awarded to the winners ({winners}).',
            resolveFailed: 'Could not resolve the poll.',
            networkError: 'Network error. Please try again.',
            openFailed: 'Could not open the poll.',
        },

        // Auth
        auth: {
            login: 'Login',
            register: 'Register',
            username: 'Username',
            email: 'Email',
            name: 'Name',
            password: 'Password',
            loginButton: 'Sign In',
            registerButton: 'Create Account',
            logout: 'Logout',
            role: 'Role',
            verifyEmailTitle: 'Confirm your email',
            verifyLoginTitle: 'Confirm sign-in',
            codeSentTo: 'Code sent to',
            codePlaceholder: 'Code from email',
            verifyButton: 'Confirm',
            resendCode: 'Send the code again',
            resendIn: 'You can resend in',
            back: 'Back',
            forgotPassword: 'Forgot password?',
            resetTitle: 'Password recovery',
            resetHint: 'Enter your email — we will send a code to reset the password.',
            sendCode: 'Send code',
            newPassword: 'New password',
            resetButton: 'Change password',
            resetSent: 'If the account exists, the code has been sent',
        },

        // Settings Modal
        settings: {
            title: 'Settings',
            profile: 'Profile',
            security: 'Security',
            displayName: 'Display Name',
            language: 'Language / Язык',
            emailUsername: 'Email / Username',
            newPassword: 'New Password',
            confirmPassword: 'Confirm Password',
            saveChanges: 'Save Changes',
            updateCredentials: 'Update Credentials',
            changeAvatar: 'Click to change avatar',
            passwordMismatch: 'Passwords don\'t match',
            profileUpdated: 'Profile updated successfully',
            securityUpdated: 'Security settings updated. Please login again.',
            updateFailed: 'Update failed',
            displayNamePlaceholder: 'Enter your display name',
            emailPlaceholder: 'Enter new email',
            passwordPlaceholder: 'Enter new password',
            confirmPasswordPlaceholder: 'Confirm new password',
            emailSection: 'Email',
            currentEmail: 'Current email',
            noEmail: 'No email linked',
            noEmailHint: 'Link an email to recover your password and enable sign-in codes.',
            bindEmail: 'Link email',
            changeEmail: 'Change email',
            passwordSection: 'Password',
            currentPassword: 'Current password',
            currentPasswordPlaceholder: 'Enter your current password',
            changePassword: 'Change password',
            twoFactorSection: 'Sign-in code by email',
            twoFactorHint: 'We will email a one-time code every time you sign in.',
            twoFactorOn: 'Enabled',
            twoFactorOff: 'Disabled',
            enable: 'Enable',
            disable: 'Disable',
            codeSentTo: 'Code sent to',
            codePlaceholder: 'Code from email',
            confirmCode: 'Confirm',
            cancel: 'Cancel',
            resendCode: 'Send again',
            passwordChanged: 'Password updated',
            emailChanged: 'Email updated',
            twoFactorEnabled: 'Sign-in code enabled',
            twoFactorDisabled: 'Sign-in code disabled',
            stepCurrentEmail: 'Step 1: confirm your current email',
            stepNewEmail: 'Step 2: confirm the new email',
            newEmailPlaceholder: 'New email address',
            bio: 'About you',
            bioPlaceholder: 'Tell us about yourself...',
            birthdate: 'Birthday',
            birthdatePlaceholder: 'Pick a date',
            appearance: 'Appearance',
            theme: 'Theme',
            themeHint: 'Saved on this device.',
            themeLight: 'Light',
            themeDark: 'Dark',
            themeSystem: 'Auto',
        },

        datePicker: {
            placeholder: 'Pick a date',
            today: 'Today',
            clear: 'Clear',
            previous: 'Previous',
            next: 'Next',
        },

        // Feed
        feed: {
            vote: 'vote',
            votes: 'votes',
            select: 'Select',
            resolve: 'Resolve',
            delete: 'Delete',
            report: 'Report',
            like: 'Like',
            viewResults: 'View Results',
            votedFor: 'You voted for',
            resolved: 'Poll Resolved',
            winner: 'Winner',
            noNews: 'No news yet',
        },

        // Admin Panel
        admin: {
            title: 'Admin Panel',
            titleLabel: 'Title',
            descriptionLabel: 'Description',
            coverImage: 'Cover Image',
            imageUrl: 'Image URL (or upload file)',
            tags: 'Tags',
            category: 'Category',
            pollConfig: 'Poll Configuration',
            question: 'Question',
            option: 'Option',
            addTag: 'Add Tag',
            addOption: 'Add Option',
            publishNews: 'Publish News',
            userManagement: 'User Management',
            searchUsers: 'Search users...',
            user: 'User',
            role: 'Role',
            actions: 'Actions',
            loadingUsers: 'Loading users...',
            noUsers: 'No users found',
            accessDenied: 'Access Denied',
            newsCreated: 'News created successfully!',
            newsCreateFailed: 'Failed to create news',
            uploadFailed: 'Upload failed',
            titlePlaceholder: 'Title',
            descriptionPlaceholder: 'Description',
            tagsPlaceholder: 'Type a tag and press Enter or comma',
            questionPlaceholder: 'Question',
            optionPlaceholder: 'Option',
            registered: 'Registered',
            lastSeen: 'Last seen',
            sortBy: 'Sort by',
            never: 'Never',
            openProfileHint: 'Click a user to open their full statistics',
            userDetails: 'User profile',
            loadingDetails: 'Loading statistics...',
            detailsFailed: 'Could not load user statistics',
            overview: 'Overview',
            activity: 'Activity',
            pointsLedger: 'Points history',
            votesTotal: 'Predictions total',
            accuracy: 'Prediction accuracy',
            correctVotes: 'Correct',
            wrongVotes: 'Wrong',
            pendingVotes: 'Pending',
            likesGiven: 'Likes given',
            reportsSubmitted: 'Reports sent',
            monthlyPoints: 'Points this month',
            allTimeRank: 'All-time rank',
            monthlyRank: 'Monthly rank',
            level: 'Level',
            bio: 'About',
            birthdate: 'Birthdate',
            notSet: 'Not set',
            firstVote: 'First prediction',
            lastVote: 'Last prediction',
            favoriteCategories: 'Favorite categories',
            noPointsHistory: 'No points awarded yet',
            noVotesYet: 'No predictions yet',
            outOf: 'of',
            changeRoleLabel: 'Change role',
        },

        // Create-poll wizard
        wizard: {
            title: 'Create poll',
            stepLabel: 'Step',
            of: 'of',
            next: 'Next',
            back: 'Back',
            stepCategory: 'Category',
            stepContent: 'Article',
            stepTags: 'Tags',
            stepPoll: 'Poll',
            stepReview: 'Review',
            selectCategoryHint: 'Choose a category for the article',
            sourceLabel: 'Source (link)',
            sourcePlaceholder: 'https://example.com/article',
            pollEndDateLabel: 'Voting deadline',
            pollEndDateHint: 'Optional. With no date, voting stays open until the poll is resolved manually.',
            pollEndDateNote: 'How it works: people vote up until the date you set. On that day voting closes — the poll stays open, the card gets a "voting closed" mark, and only the current split is visible. You pick the correct option later, by hand; that is when points are awarded. Example: a "who wins the match" poll dated on match day — bets close before kick-off, and you resolve the poll afterwards.',
            optional: 'optional',
            reviewHeading: 'Review & publish',
            reviewCategory: 'Category',
            reviewNoTags: 'No tags',
            reviewNoSource: 'No source provided',
            reviewNoEndDate: 'No end date set',
            validationCategory: 'Select a category to continue',
            validationContent: 'Fill in the title, description and cover image',
            validationPoll: 'Provide a question and at least 2 options',
            validationPollUnique: 'Poll options must not repeat',
            editTitle: 'Edit publication',
            editSubtitle: 'Changes apply immediately. Existing votes are kept: options are matched by id, not by text.',
            saved: 'Changes saved',
            saveChanges: 'Save changes',
            cancelEdit: 'Cancel editing',
            backToPolls: 'Back to polls',
            loadFailed: 'Could not load the publication for editing',
            pollLockedHint: 'This poll is already resolved — its question and options are locked because points have been awarded. Everything else stays editable.',
            saveDraft: 'Save draft',
            draftSaved: 'Draft saved — find it under "Manage polls", the "Drafts" tab',
            scheduledSaved: 'Publication scheduled — it will go live automatically at the set time',
            draftNeedsTitle: 'A draft needs at least a headline (3 characters or more)',
            publishNow: 'Publish now',
            publishSchedule: 'Schedule',
            publishWhen: 'When to publish',
            publishDateLabel: 'Publish date',
            publishTimeLabel: 'Publish time',
            publishScheduleHint: 'The post goes live on its own, at the date and time on your clock.',
            publishNowHint: 'The post appears in the feed as soon as you press the button.',
            schedulePublish: 'Schedule publication',
            editingDraft: 'This is a draft — readers cannot see it yet.',
        },

        // Leaderboard
        leaderboard: {
            title: 'Leaderboard',
            loading: 'Loading...',
            pointsLabel: 'points',
            monthlyTitle: 'Monthly event',
            prizeRule: '1st place gets {points} points. The winner is whoever earns the most points since the 1st.',
            monthlyTab: 'This month',
            allTimeTab: 'All time',
            monthlySubtitle: 'Points earned since the 1st. Whoever scores the most becomes the winner.',
            allTimeSubtitle: 'Total score across the whole history.',
            endsIn: 'Event ends in',
            newWinnerIn: 'New winner in',
            eventClosed: 'Event closed',
            currentWinner: 'Current winner',
            noMonthlyLeaders: 'Nobody has earned points this month yet',
            monthlyPointsLabel: 'this month',
            totalPointsLabel: 'total',
            winsLabel: 'wins',
            participants: 'participants',
            days: 'd',
            hours: 'h',
            minutes: 'm',
            seconds: 's',
        },

        // Right Panel
        rightPanel: {
            checkIntuition: 'Check Your Intuition',
            promoText: 'Choose polls and predict outcomes. Earn points, unlock new levels and get exclusive prizes!',
            topLeader: 'Top Leader',
            prizeWinner: 'winner',
            prizePoints: 'points',
            prizeGift: 'and a prize from Legio!',
            topPredictors: 'Top Predictors',
            noLeaders: 'No leaders yet',
            loadError: 'Loading error',
            monthlyLeader: 'earned this month',
            noMonthlyLeader: 'The winner is decided once the first points of the month land',
            forFirstPlace: 'for 1st place',
            untilNewWinner: 'until the new winner',
        },

        // Statistics
        statistics: {
            title: 'Statistics',
            overview: 'Overview',
            userRegistrations: 'User Registrations',
            pollsCreated: 'Polls Created',
            votingActivity: 'Voting Activity',
            totalVisits: 'Total Visits',
            engagementRate: 'Engagement Rate',
            period: 'Period',
            day: 'Day',
            week: 'Week',
            month: 'Month',
            year: 'Year',
        },

        // Error Reports
        errorReports: {
            title: 'Error Reports',
            loading: 'Loading...',
            noReports: 'No error reports',
            status: 'Status',
            pending: 'Pending',
            resolved: 'Resolved',
            dismissed: 'Dismissed',
            markResolved: 'Mark as Resolved',
            markDismissed: 'Dismiss',
            delete: 'Delete',
        },

        // Report Modal
        reportModal: {
            title: 'Report Post',
            selectReason: 'Select a reason',
            spam: 'Spam',
            inappropriate: 'Inappropriate Content',
            misleading: 'Misleading Information',
            other: 'Other',
            additionalInfo: 'Additional Information (optional)',
            submit: 'Submit Report',
            submitting: 'Submitting...',
            success: 'Report submitted successfully',
            failed: 'Failed to submit report',
            placeholder: 'Describe the problem in more detail...',
        },

        // News Modal
        newsModal: {
            close: 'Close',
        },

        // Categories
        categories: {
            all: 'All',
            general: 'General',
            politics: 'Politics',
            sport: 'Sport',
            tech: 'Technology',
            business: 'Business',
            entertainment: 'Entertainment',
            science: 'Science',
        },

        // User roles
        roles: {
            user: 'User',
            creator: 'Creator',
            admin: 'Administrator',
        },
    },
};
