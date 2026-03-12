# Legio2

Legio2 - это full-stack платформа для голосований и сообщества с новостями, опросами, чатом, лайками, лидербордом и административной панелью.

Сейчас в репозитории находятся:

- `server/` - API на Express, схема SQLite, аутентификация, загрузка файлов, админские инструменты и синхронизация с WordPress
- `designe/` - фронтенд на React + TypeScript, собранный через Vite
- `Dockerfile` - production-сборка всего приложения в одном контейнере
- `server/Dockerfile.backend` и `designe/Dockerfile.frontend` - раздельные Docker-образы для локального запуска через compose

Папка `designe/` пока оставлена с текущим именем для совместимости с существующей структурой проекта.

## Стек

- Backend: Node.js, Express, SQLite, JWT, bcrypt, multer
- Frontend: React 19, TypeScript, Vite, Tailwind CSS, Framer Motion
- Инфраструктура: Docker, деплой под Railway, GitHub Actions CI

## Быстрый старт

### 1. Backend

```bash
cd server
cp .env.example .env
npm install
npm start
```

Обязательная переменная окружения:

- `SECRET_KEY` - случайный секрет длиной не менее 32 символов

Сгенерировать можно так:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

По умолчанию backend запускается на `http://localhost:3001`.

### 2. Frontend

```bash
cd designe
npm install
npm run dev
```

По умолчанию frontend запускается на `http://localhost:5173`.

## Тесты

Базовые smoke/security-проверки backend:

```bash
cd server
npm test
```

Сейчас тесты покрывают:

- валидацию регистрации со слабым паролем
- санитизацию пользовательского контента в новостях
- дедупликацию счетчика визитов за день

## Резервные копии

Скрипт резервного копирования SQLite:

```bash
./scripts/backup-db.sh
```

Полезные переменные:

- `DATABASE_PATH` - явный путь к файлу SQLite
- `BACKUP_DIR` - папка, куда складываются архивы
- `RETENTION_DAYS` - сколько дней хранить резервные копии

По умолчанию бэкапы пишутся в `./backups`, а архивы старше 30 дней удаляются автоматически.

## CI

GitHub Actions workflow: `.github/workflows/ci.yml`

Сейчас он выполняет:

- установку зависимостей backend и `npm test`
- установку зависимостей frontend и `npm run build`

## Структура проекта

```text
Legio-main/
├── .github/workflows/ci.yml
├── Dockerfile
├── README.md
├── designe/
│   ├── App.tsx
│   ├── components/
│   ├── context/
│   └── package.json
└── server/
    ├── index.js
    ├── database.js
    ├── docker-entrypoint.sh
    ├── .env.example
    ├── test/
    └── package.json
```

## Что уже сделано по безопасности

- сервер не запускается без сильного `SECRET_KEY`
- входные данные валидируются и санитизируются перед сохранением
- визиты дедуплицируются по дням
- загрузка файлов ограничена безопасными форматами изображений и лимитом размера

## Заметки по деплою

- Используйте корневой `Dockerfile`, если хотите один контейнер, где frontend раздается backend-ом
- Используйте `docker-compose.yml` вместе с `server/Dockerfile.backend` и `designe/Dockerfile.frontend`, если хотите раздельные сервисы
- Для production обязательно задайте `ALLOWED_ORIGINS`, `PUBLIC_BASE_URL` и другие параметры из `server/.env.example`
