/* =========================================================
   Снек — бот + приём заявок на Cloudflare Workers
   ---------------------------------------------------------
   Работает 24/7 бесплатно, компьютер включать не нужно.
   Токен хранится в настройках воркера и не попадает на сайт.

   Переменные (Settings → Variables and Secrets):
     BOT_TOKEN   (Secret)  — токен от @BotFather
     CHAT_ID     (Text)    — твой chat_id (бот подскажет его по /start)
     WEBAPP_URL  (Text)    — https-адрес сайта для кнопки Mini App
     ALLOWED_ORIGIN (Text, необязательно) — например https://saaq122.github.io

   После деплоя открой  https://<твой-воркер>.workers.dev/setup
   — бот подключится к воркеру.
   ========================================================= */

const enc = new TextEncoder();

const esc = (s) => String(s ?? "").slice(0, 3000)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function tg(env, method, body = {}) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey(
    "raw", typeof key === "string" ? enc.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
const hex = (buf) => [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");

async function webhookSecret(env) {
  const h = await crypto.subtle.digest("SHA-256", enc.encode("snek:" + env.BOT_TOKEN));
  return hex(new Uint8Array(h)).slice(0, 48);
}

/* Проверка, что данные Mini App действительно пришли из Telegram */
async function verifyInitData(env, initData) {
  if (!initData) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get("hash");
  if (!hash) return null;
  p.delete("hash");
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = await hmac("WebAppData", env.BOT_TOKEN);
  if (hex(await hmac(secret, check)) !== hash) return null;
  try { return JSON.parse(p.get("user")); } catch { return null; }
}

const appButton = (env) => env.WEBAPP_URL
  ? { reply_markup: { inline_keyboard: [[{ text: "Открыть портфолио", web_app: { url: env.WEBAPP_URL } }]] } }
  : {};

/* ---------------- заявка с сайта ---------------- */
const lastByIp = new Map();

async function handleLead(request, env, cors) {
  const json = (code, obj) => new Response(JSON.stringify(obj), {
    status: code, headers: { ...cors, "Content-Type": "application/json" },
  });

  const ip = request.headers.get("CF-Connecting-IP") || "?";
  if (Date.now() - (lastByIp.get(ip) || 0) < 60_000) return json(429, { ok: false });

  let d;
  try { d = await request.json(); } catch { return json(400, { ok: false }); }
  if (String(d.contact || "").trim().length < 2 || String(d.description || "").trim().length < 10) {
    return json(400, { ok: false });
  }
  if (!env.CHAT_ID) return json(503, { ok: false, error: "CHAT_ID not set" });

  const user = await verifyInitData(env, d.tgInitData);
  const text = [
    "🐍 <b>Новая заявка</b>",
    "",
    `👤 <b>Имя:</b> ${esc(d.name || "—")}`,
    `📬 <b>Контакт:</b> ${esc(d.contact)}`,
    `🧩 <b>Платформа:</b> ${esc(d.platform)}`,
    `🛠 <b>Задача:</b> ${esc(d.type)}`,
    `💰 <b>Бюджет:</b> ${esc(d.budget)}`,
    `⏱ <b>Сроки:</b> ${esc(d.deadline)}`,
    `📍 <b>Откуда:</b> ${user ? "Telegram Mini App" : "Сайт"}`,
    ...(user ? [`🆔 <a href="tg://user?id=${user.id}">Профиль</a> · ответь Reply — бот передаст · #id${user.id}`] : []),
    "",
    "📝 <b>Описание:</b>",
    esc(d.description),
  ].join("\n");

  try {
    await tg(env, "sendMessage", { chat_id: env.CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true });
    lastByIp.set(ip, Date.now());
    return json(200, { ok: true });
  } catch (e) {
    return json(502, { ok: false, error: e.message });
  }
}

/* ---------------- сообщения боту ---------------- */
async function onMessage(msg, env) {
  if (msg.chat.type !== "private") return;
  const chatId = msg.chat.id;
  const text = msg.text || "";
  const owner = env.CHAT_ID && String(chatId) === String(env.CHAT_ID);

  if (text.startsWith("/id")) {
    return tg(env, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: `Твой chat_id: <code>${chatId}</code>` });
  }

  if (!env.CHAT_ID) {
    return tg(env, "sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: `Бот почти готов.\n\nТвой chat_id: <code>${chatId}</code>\nВпиши его в переменную <b>CHAT_ID</b> в настройках воркера Cloudflare.`,
    });
  }

  /* --- владелец --- */
  if (owner) {
    const r = msg.reply_to_message;
    const m = r && String(r.text || r.caption || "").match(/#id(\d+)/);
    if (m) {
      await tg(env, "copyMessage", { chat_id: m[1], from_chat_id: chatId, message_id: msg.message_id });
      return tg(env, "sendMessage", { chat_id: chatId, text: "✔ Отправлено клиенту", reply_to_message_id: msg.message_id });
    }
    if (text.startsWith("/start")) {
      return tg(env, "sendMessage", {
        chat_id: chatId,
        text: "Бот работает 24/7. Заявки с сайта и сообщения клиентов приходят сюда.\nЧтобы ответить клиенту — сделай Reply на его сообщение.",
        ...appButton(env),
      });
    }
    return;
  }

  /* --- клиент --- */
  if (text.startsWith("/start")) {
    return tg(env, "sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text:
        "Привет! Я бот <b>Снека</b> — разработчика плагинов для Minecraft.\n\n" +
        (env.WEBAPP_URL
          ? "Нажми кнопку ниже, чтобы посмотреть портфолио и оставить заявку. Или просто опиши проект здесь — я передам Снеку."
          : "Опиши, какой плагин тебе нужен, — я сразу передам Снеку, и он ответит здесь же."),
      ...appButton(env),
    });
  }

  const u = msg.from;
  const who = esc([u.first_name, u.last_name].filter(Boolean).join(" ")) + (u.username ? ` (@${esc(u.username)})` : "");
  const head = `💬 <a href="tg://user?id=${u.id}">${who}</a> · #id${u.id}`;

  if (msg.text) {
    await tg(env, "sendMessage", { chat_id: env.CHAT_ID, parse_mode: "HTML", text: `${head}\n\n${esc(msg.text)}` });
  } else {
    await tg(env, "sendMessage", { chat_id: env.CHAT_ID, parse_mode: "HTML", text: `${head}\n<i>вложение ниже, отвечай Reply на это сообщение</i>` });
    await tg(env, "copyMessage", { chat_id: env.CHAT_ID, from_chat_id: chatId, message_id: msg.message_id });
  }
  await tg(env, "sendMessage", { chat_id: chatId, text: "Передал Снеку ✔ Он ответит здесь же." });
}

/* ---------------- первичная настройка ---------------- */
async function setup(request, env) {
  const origin = new URL(request.url).origin;
  const out = [];
  const step = async (name, fn) => {
    try { await fn(); out.push(`✔ ${name}`); } catch (e) { out.push(`✘ ${name}: ${e.message}`); }
  };
  if (!env.BOT_TOKEN) return new Response("Нет BOT_TOKEN в настройках воркера", { status: 500 });

  await step("Webhook подключён", async () => tg(env, "setWebhook", {
    url: `${origin}/webhook`,
    secret_token: await webhookSecret(env),
    allowed_updates: ["message"],
  }));
  await step("Команды", () => tg(env, "setMyCommands", { commands: [
    { command: "start", description: "Начать" },
    { command: "id", description: "Узнать свой chat_id" },
  ] }));
  await step("Описание", () => tg(env, "setMyShortDescription", {
    short_description: "Снек — разработка плагинов для Minecraft. Оставь заявку прямо здесь.",
  }));
  if (env.WEBAPP_URL) {
    await step(`Кнопка Mini App → ${env.WEBAPP_URL}`, () => tg(env, "setChatMenuButton", {
      menu_button: { type: "web_app", text: "Заявка", web_app: { url: env.WEBAPP_URL } },
    }));
  } else {
    out.push("• WEBAPP_URL не задан — кнопки Mini App не будет");
  }
  out.push(env.CHAT_ID ? `• CHAT_ID: ${env.CHAT_ID}` : "• CHAT_ID не задан — напиши боту /start, он пришлёт номер");
  const me = await tg(env, "getMe").catch(() => null);
  if (me) out.push(`\nБот: https://t.me/${me.username}`);
  return new Response(out.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/* ---------------- роутер ---------------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (url.pathname === "/api/lead" && request.method === "POST") {
      return handleLead(request, env, cors);
    }

    if (url.pathname === "/webhook" && request.method === "POST") {
      if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== await webhookSecret(env)) {
        return new Response("forbidden", { status: 403 });
      }
      const update = await request.json().catch(() => ({}));
      if (update.message) {
        try { await onMessage(update.message, env); } catch (e) { console.log("error:", e.message); }
      }
      return new Response("ok");
    }

    if (url.pathname === "/setup") return setup(request, env);

    return new Response("Снек бот работает 🐍", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  },
};
