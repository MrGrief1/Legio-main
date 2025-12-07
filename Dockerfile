# Этап 1: Сборка фронтенда
FROM node:18 AS frontend-builder

WORKDIR /frontend
COPY designe/package*.json ./
RUN npm install

# Копируем остальные файлы фронтенда
COPY designe/ .

# Создаем директорию для билда, если её нет
RUN mkdir -p dist

# Запускаем сборку
RUN npm run build

# Проверяем, что файлы билда созданы
RUN ls -la dist/

# Этап 2: Сборка бэкенда
FROM node:18 AS backend-builder

WORKDIR /backend
COPY server/package*.json ./
RUN npm install --production

# Копируем остальные файлы бэкенда
COPY server/ .

# Этап 3: Финальный образ
FROM node:18-slim

# Устанавливаем зависимости для работы с SQLite
RUN apt-get update && apt-get install -y \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Создаем рабочую директорию
WORKDIR /app

# Копируем бэкенд
COPY --from=backend-builder /backend /app

# Создаем директорию для статических файлов
RUN mkdir -p /app/public

# Копируем собранный фронтенд
COPY --from=frontend-builder /frontend/dist /app/public

# Проверяем, что файлы скопированы правильно
RUN ls -la /app/public

# Открываем порт, на котором работает приложение
EXPOSE 3000

# Команда для запуска приложения
CMD ["node", "index.js"]
