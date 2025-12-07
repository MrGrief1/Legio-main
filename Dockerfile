# Этап 1: Сборка фронтенда
FROM node:18 AS frontend-builder

WORKDIR /app/designe
COPY designe/package*.json ./
RUN npm install

# Копируем остальные файлы фронтенда
COPY designe/ .
RUN npm run build

# Этап 2: Сборка бэкенда
FROM node:18 AS backend-builder

WORKDIR /app/server
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

# Настраиваем рабочую директорию
WORKDIR /app

# Копируем бэкенд
COPY --from=backend-builder /app/server /app

# Копируем собранный фронтенд в папку статических файлов бэкенда
COPY --from=frontend-builder /app/designe/dist /app/public

# Открываем порт, на котором работает приложение
EXPOSE 3000

# Команда для запуска приложения
CMD ["node", "index.js"]
