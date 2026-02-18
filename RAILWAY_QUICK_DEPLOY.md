# Railway Quick Deploy

## ❌ Предыдущая ошибка
```
The executable `cd` could not be found.
```

**Причина:** `railway.json` переопределял Dockerfile CMD неправильной командой.

## ✅ Исправлено

`railway.json` теперь использует:
```json
{
  "build": {
    "builder": "DOCKERFILE"  
  }
}
```

Dockerfile уже правильно настроен с `CMD ["node", "index.js"]`.

---

## 🚀 Deploy Now

### 1. Push Changes

```bash
git add railway.json
git commit -m "Fix Railway deployment: use Dockerfile builder"
git push
```

### 2. Railway Variables

Установите в Railway Dashboard → Variables:

```bash
SECRET_KEY=<random-string>

# Опционально: миграция старой WordPress БД
WP_DB_HOST=<mysql-host>
WP_DB_PORT=3306
WP_DB_USER=<mysql-user>
WP_DB_PASSWORD=<mysql-password>
WP_DB_NAME=<mysql-database>
WP_DB_PREFIX=wp_
WP_SYNC_ON_STARTUP=true
WP_SYNC_FULL_REPLACE=true
```

> Генерируйте: `openssl rand -base64 32`

### 3. Wait for Deployment

Railway автоматически:
- Соберет Dockerfile
- Frontend в `/app/public`
- Backend запустится: `node index.js`

### 4. Register First User

Откройте `https://your-app.railway.app`

✅ **Первый пользователь = ADMIN автоматически!**

Если подключена старая WordPress БД и нужен ручной перезапуск миграции:
- войдите под админом
- вызовите `POST /api/admin/sync/wordpress` (можно передать `{\"fullReplace\": true}`).

---

## ✅ Verify

- [ ] Deployment Success
- [ ] Website opens
- [ ] DevTools: requests → `/api/...` (not localhost)
- [ ] First user = admin
- [ ] Can create news

**Done!** 🎉
