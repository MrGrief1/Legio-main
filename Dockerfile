# Этап 1: Сборка фронтенда
FROM node:18 AS frontend-builder

WORKDIR /frontend
COPY designe/package*.json ./
RUN npm ci

# Копируем остальные файлы фронтенда
COPY designe/ .

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

# Устанавливаем зависимости для работы с SQLite и других утилит
RUN apt-get update && apt-get install -y \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Создаем рабочую директорию
WORKDIR /app

# Копируем бэкенд
COPY --from=backend-builder /backend /app

# Создаем необходимые директории
RUN mkdir -p /app/public /app/uploads

# Копируем собранный фронтенд
COPY --from=frontend-builder /frontend/dist /app/public

# Устанавливаем правильные права доступа
# RUN chown -R node:node /app
# USER node

# Проверяем, что файлы скопированы правильно
RUN ls -la /app/public

# Открываем порт, на котором работает приложение
EXPOSE 3000

# Переменные окружения
ENV NODE_ENV=production
ENV PORT=3000

# Команда для запуска приложения
CMD ["node", "index.js"]
