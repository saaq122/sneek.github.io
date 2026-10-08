# Снек — портфолио

Сайт-портфолио разработчика плагинов с формой заявки, которая приходит в Telegram.
Работает и как обычный сайт, и как Telegram Mini App.

**Сайт:** https://saaq122.github.io/sneek.github.io/

## Файлы

| Файл | Что это |
|---|---|
| `index.html`, `style.css`, `script.js` | сам сайт |
| `config.js` | адрес воркера для отправки заявок |
| `worker.js` | бот и приём заявок на Cloudflare Workers (на GitHub Pages не запускается) |

## Включить GitHub Pages

Settings → Pages → Source: **Deploy from a branch** → Branch: `main`, папка `/ (root)` → Save.

## Подключить бота (Cloudflare Worker, бесплатно)

1. Зайди на [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Create Worker**.
   Назови `snek-bot` → **Deploy**.
2. **Edit code** → удали всё и вставь содержимое `worker.js` → **Deploy**.
3. **Settings → Variables and Secrets** → добавь:
   - `BOT_TOKEN` — тип **Secret**, токен от @BotFather
   - `WEBAPP_URL` — `https://saaq122.github.io/sneek.github.io/`
   - `ALLOWED_ORIGIN` — `https://saaq122.github.io`
4. Открой в браузере `https://snek-bot.<твой-поддомен>.workers.dev/setup` — бот подключится.
5. Напиши боту `/start` — он пришлёт твой chat_id. Добавь переменную `CHAT_ID` с этим числом.
6. В `config.js` впиши `API_ENDPOINT: "https://snek-bot.<твой-поддомен>.workers.dev/api/lead"` и закоммить.

Готово: бот работает 24/7, заявки с сайта и сообщения клиентов приходят тебе,
а ответить клиенту можно через Reply на его сообщение.

> Токен бота никогда не добавляй в этот репозиторий — он публичный.
