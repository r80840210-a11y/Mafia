# 🎭 Mafia Online

Мультиплеерная «Мафия» в браузере: аккаунты, комнаты по коду, 4–10 игроков, 12 ролей, монеты и магазин.

## Запуск локально
```bash
npm install
export DATABASE_URL=postgresql://user:pass@localhost:5432/mafia   # Windows: set DATABASE_URL=...
npm start        # http://localhost:3000
```
Таблицы создаются автоматически при старте — вручную выполнять `schema.sql` не нужно.

## Деплой на Render.com
1. Залейте проект на GitHub.
2. **New → PostgreSQL** (Free). Скопируйте **Internal Database URL**.
3. **New → Web Service** → ваш репозиторий. Build: `npm install`, Start: `npm start`.
4. Вкладка **Environment**: `DATABASE_URL` = скопированный URL (целиком, начинается с `postgresql://` и содержит хост вида `dpg-…`), `NODE_ENV` = `production`.
5. Deploy. Таблицы создадутся сами. Ссылку вида `https://….onrender.com` отправьте друзьям.

Если в логах «Не задана переменная DATABASE_URL» или `ENOTFOUND` — значение переменной пустое или неверное.

## Что внутри
- `client/` — интерфейс (без inline-обработчиков, совместим с CSP Helmet)
- `server/` — Express + Socket.IO, авторитетная логика игры, PostgreSQL
- `shared/engine.js` — правила (сервер и локальный режим), `shared/shop.js` — каталог магазина и награды

## Монеты
За игру +10, за выживание +15, за победу +50, за убийство +15 (максимум 200 за партию). Ежедневный бонус +50. Новому игроку — 100 монет. Начисляет и проверяет покупки только сервер.
