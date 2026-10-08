(() => {
  "use strict";

  const cfg = window.SNEK_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* =========================================================
     Telegram Mini App
     Если сайт открыт из бота, Telegram добавляет в адрес #tgWebApp...
     Только тогда подгружаем их SDK — обычный сайт от этого не тормозит.
     ========================================================= */
  let tg = null;
  const launchedFromTelegram = /tgWebApp(Data|Platform|Version)=/.test(location.hash);

  if (launchedFromTelegram) {
    document.documentElement.classList.add("tg");
    const sdk = document.createElement("script");
    sdk.src = "https://telegram.org/js/telegram-web-app.js";
    sdk.onload = initTelegram;
    document.head.appendChild(sdk);
  }

  function safeCall(fn) { try { fn(); } catch { /* старый клиент Telegram */ } }

  function initTelegram() {
    tg = window.Telegram && window.Telegram.WebApp;
    if (!tg) return;

    tg.ready();
    safeCall(() => tg.expand());
    safeCall(() => tg.setHeaderColor("#0c0e16"));
    safeCall(() => tg.setBackgroundColor("#0c0e16"));
    safeCall(() => tg.setBottomBarColor && tg.setBottomBarColor("#0c0e16"));

    // отступы под «чёлку» и шапку Telegram
    const applyInsets = () => {
      const s = tg.safeAreaInset || {};
      const c = tg.contentSafeAreaInset || {};
      const root = document.documentElement.style;
      root.setProperty("--tg-top", `${(s.top || 0) + (c.top || 0)}px`);
      root.setProperty("--tg-bottom", `${(s.bottom || 0) + (c.bottom || 0)}px`);
    };
    applyInsets();
    safeCall(() => tg.onEvent("safeAreaChanged", applyInsets));
    safeCall(() => tg.onEvent("contentSafeAreaChanged", applyInsets));

    // подставляем данные пользователя
    const u = tg.initDataUnsafe && tg.initDataUnsafe.user;
    if (u) {
      const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ");
      if (!form.elements.name.value) form.elements.name.value = fullName;
      if (!form.elements.contact.value) {
        form.elements.contact.value = u.username ? `@${u.username}` : `Telegram ID ${u.id}`;
      }
      $("#tgName").textContent = u.first_name || "друг";
      $("#tgHello").hidden = false;
    }

    // лёгкая вибрация при выборе вариантов
    $$(".chip input", form).forEach((el) =>
      el.addEventListener("change", () => safeCall(() => tg.HapticFeedback.selectionChanged()))
    );
  }

  const haptic = (type) => tg && safeCall(() => tg.HapticFeedback.notificationOccurred(type));

  /* ---------- Год в футере ---------- */
  $("#year").textContent = new Date().getFullYear();

  /* ---------- Появление при скролле ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

  $$(".reveal").forEach((el, i) => {
    el.style.transitionDelay = `${(i % 4) * 70}ms`;
    io.observe(el);
  });

  /* ---------- Блик на стекле за курсором ---------- */
  document.addEventListener("pointermove", (e) => {
    const el = e.target.closest(".glass");
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, { passive: true });

  /* ---------- Лёгкий 3D-наклон карточки с кодом ---------- */
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tilt = $("[data-tilt]");
  if (tilt && !reduce && window.matchMedia("(hover: hover)").matches) {
    tilt.addEventListener("pointermove", (e) => {
      const r = tilt.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      tilt.style.transform = `perspective(900px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`;
    });
    tilt.addEventListener("pointerleave", () => { tilt.style.transform = ""; });
  }

  /* ---------- Toast ---------- */
  const toast = $("#toast");
  const toastText = $(".toast-text", toast);
  const toastIcon = $(".toast-icon use", toast);
  let toastTimer;
  function showToast(text, type = "ok") {
    toastText.textContent = text;
    toastIcon.setAttribute("href", type === "ok" ? "#i-check" : "#i-alert");
    toast.className = `toast glass show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 4500);
  }

  /* ---------- Форма ---------- */
  const form = $("#orderForm");
  const btn = $("#submitBtn");
  const desc = form.elements.description;
  const count = $("#count");

  desc.addEventListener("input", () => { count.textContent = desc.value.length; });
  $$(".glass-input", form).forEach((el) =>
    el.addEventListener("input", () => el.classList.remove("invalid"))
  );

  const COOLDOWN_MS = 60_000;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };

  const esc = (s) => String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function buildMessage(d) {
    const time = new Date().toLocaleString("ru-RU");
    const lines = [
      "🐍 <b>Новая заявка</b>",
      "",
      `👤 <b>Имя:</b> ${esc(d.name || "—")}`,
      `📬 <b>Контакт:</b> ${esc(d.contact)}`,
      `🧩 <b>Платформа:</b> ${esc(d.platform)}`,
      `🛠 <b>Задача:</b> ${esc(d.type)}`,
      `💰 <b>Бюджет:</b> ${esc(d.budget)}`,
      `⏱ <b>Сроки:</b> ${esc(d.deadline)}`,
      `📍 <b>Откуда:</b> ${d.tgUserId ? "Telegram Mini App" : "Сайт"}`,
    ];
    if (d.tgUserId) lines.push(`🆔 <a href="tg://user?id=${Number(d.tgUserId)}">Профиль в Telegram</a>`);
    lines.push("", "📝 <b>Описание:</b>", esc(d.description), "", `<i>${esc(time)}</i>`);
    return lines.join("\n");
  }

  async function send(data) {
    // Вариант Б — через свой сервер (токен спрятан)
    if (cfg.API_ENDPOINT) {
      const res = await fetch(cfg.API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`Server ${res.status}`);
      return;
    }

    // Вариант А — напрямую в Telegram
    if (!cfg.BOT_TOKEN || !cfg.CHAT_ID) throw new Error("NO_CONFIG");

    const res = await fetch(`https://api.telegram.org/bot${cfg.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cfg.CHAT_ID,
        text: buildMessage(data),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.description || `Telegram ${res.status}`);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // ловушка для ботов
    if (form.elements.website.value) return;

    const fd = new FormData(form);
    const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    const data = {
      name: (fd.get("name") || "").trim(),
      contact: (fd.get("contact") || "").trim(),
      platform: fd.get("platform") || "",
      type: fd.get("type") || "",
      budget: fd.get("budget") || "",
      deadline: fd.get("deadline") || "",
      description: (fd.get("description") || "").trim(),
      tgUserId: user ? user.id : null,
      tgInitData: tg ? tg.initData : "",
    };

    // проверка
    let bad = false;
    if (data.contact.length < 2) { form.elements.contact.classList.add("invalid"); bad = true; }
    if (data.description.length < 10) { desc.classList.add("invalid"); bad = true; }
    if (bad) {
      haptic("error");
      showToast("Заполни контакт и опиши проект хотя бы парой предложений", "err");
      form.querySelector(".invalid")?.focus();
      return;
    }

    const last = Number(store.get("snek_last_send") || 0);
    if (Date.now() - last < COOLDOWN_MS) {
      haptic("warning");
      showToast("Заявка уже отправлена — подожди минутку перед следующей", "err");
      return;
    }

    btn.classList.add("loading");
    btn.querySelector(".btn-label").textContent = "Отправляю…";

    try {
      await send(data);
      store.set("snek_last_send", String(Date.now()));
      const keepName = form.elements.name.value;
      const keepContact = form.elements.contact.value;
      form.reset();
      if (tg) { form.elements.name.value = keepName; form.elements.contact.value = keepContact; }
      count.textContent = "0";
      haptic("success");
      showToast("Готово! Заявка у Снека — скоро напишу тебе", "ok");
    } catch (err) {
      console.error(err);
      haptic("error");
      showToast(
        err.message === "NO_CONFIG"
          ? "Форма пока не подключена — напиши мне в Telegram напрямую"
          : "Не получилось отправить. Попробуй ещё раз чуть позже",
        "err"
      );
    } finally {
      btn.classList.remove("loading");
      btn.querySelector(".btn-label").textContent = "Отправить заявку";
    }
  });
})();
