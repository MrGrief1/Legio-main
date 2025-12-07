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

---

## ✅ Verify

- [ ] Deployment Success
- [ ] Website opens
- [ ] DevTools: requests → `/api/...` (not localhost)
- [ ] First user = admin
- [ ] Can create news

**Done!** 🎉
