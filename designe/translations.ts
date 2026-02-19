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
        projectNews: string;
        chats: string;
        leaderboard: string;
        adminPanel: string;
        statistics: string;
        errorReports: string;
        information: string;
        searchPlaceholder: string;
        categories: string;
    };

    // Auth
    auth: {
        login: string;
        register: string;
        username: string;
        password: string;
        loginButton: string;
        registerButton: string;
        logout: string;
        role: string;
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
        createNews: string;
        createNewsPoll: string;
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
    };

    // Leaderboard
    leaderboard: {
        title: string;
        loading: string;
        pointsLabel: string;
    };

    // Right Panel
    rightPanel: {
        checkIntuition: string;
        promoText: string;
        topLeader: string;
        topPredictors: string;
        noLeaders: string;
        loadError: string;
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
            projectNews: 'Новости проекта',
            chats: 'Чаты',
            leaderboard: 'Таблица лидеров',
            adminPanel: 'Админ панель',
            statistics: 'Статистика',
            errorReports: 'Сообщения об ошибках',
            information: 'Информация',
            searchPlaceholder: 'Я ищу...',
            categories: 'Категории',
        },

        // Auth
        auth: {
            login: 'Вход',
            register: 'Регистрация',
            username: 'Имя пользователя',
            password: 'Пароль',
            loginButton: 'Войти в аккаунт',
            registerButton: 'Создать аккаунт',
            logout: 'Выйти',
            role: 'Роль',
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
            createNews: 'Создать новость',
            createNewsPoll: 'Создать новость и опрос',
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
        },

        // Leaderboard
        leaderboard: {
            title: 'Таблица лидеров',
            loading: 'Загрузка...',
            pointsLabel: 'баллов',
        },

        // Right Panel
        rightPanel: {
            checkIntuition: 'Проверь свою интуицию',
            promoText: 'Выбирайте опросы и прогнозируйте исходы. Зарабатывайте баллы, открывайте новые уровни и получайте эксклюзивные призы!',
            topLeader: 'Лидер рейтинга',
            topPredictors: 'Лидеры прогнозов',
            noLeaders: 'Пока нет лидеров',
            loadError: 'Ошибка загрузки',
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
            projectNews: 'Project News',
            chats: 'Chats',
            leaderboard: 'Leaderboard',
            adminPanel: 'Admin Panel',
            statistics: 'Statistics',
            errorReports: 'Error Reports',
            information: 'Information',
            searchPlaceholder: 'I\'m looking for...',
            categories: 'Categories',
        },

        // Auth
        auth: {
            login: 'Login',
            register: 'Register',
            username: 'Username',
            password: 'Password',
            loginButton: 'Sign In',
            registerButton: 'Create Account',
            logout: 'Logout',
            role: 'Role',
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
            createNews: 'Create News',
            createNewsPoll: 'Create News & Poll',
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
        },

        // Leaderboard
        leaderboard: {
            title: 'Leaderboard',
            loading: 'Loading...',
            pointsLabel: 'points',
        },

        // Right Panel
        rightPanel: {
            checkIntuition: 'Check Your Intuition',
            promoText: 'Choose polls and predict outcomes. Earn points, unlock new levels and get exclusive prizes!',
            topLeader: 'Top Leader',
            topPredictors: 'Top Predictors',
            noLeaders: 'No leaders yet',
            loadError: 'Loading error',
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
