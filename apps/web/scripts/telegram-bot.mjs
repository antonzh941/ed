const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "AI Tutor OGE";

if (!botToken) {
  console.error("TELEGRAM_BOT_TOKEN is required to run the Telegram bot.");
  process.exit(1);
}

const apiBase = `https://api.telegram.org/bot${botToken}`;

function buildStartMessage() {
  return [
    `${appName}`,
    "",
    "Миниприложение для подготовки к ОГЭ уже готово.",
    "Нажмите кнопку ниже, чтобы открыть тренажер, получить задание и продолжить обучение.",
  ].join("\n");
}

async function callTelegram(method, payload) {
  const response = await fetch(`${apiBase}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    const description =
      typeof data.description === "string" ? data.description : "Telegram API request failed";
    throw new Error(description);
  }

  return data.result;
}

async function sendStartReply(chatId, firstName) {
  const greeting = firstName ? `Привет, ${firstName}!` : "Привет!";

  await callTelegram("sendMessage", {
    chat_id: chatId,
    text: `${greeting}\n\n${buildStartMessage()}`,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Открыть miniapp",
            web_app: {
              url: appBaseUrl,
            },
          },
        ],
      ],
    },
  });
}

async function sendFallbackReply(chatId) {
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text: "Напишите /start, чтобы получить кнопку запуска miniapp.",
  });
}

async function setupBot() {
  await callTelegram("deleteWebhook", {
    drop_pending_updates: false,
  });

  await callTelegram("setMyCommands", {
    commands: [
      {
        command: "start",
        description: "Открыть миниприложение",
      },
    ],
  });
}

async function handleUpdate(update) {
  const message = update.message;

  if (!message?.chat?.id) {
    return;
  }

  const text = message.text?.trim() ?? "";
  const chatId = message.chat.id;
  const firstName = message.from?.first_name ?? "";

  if (text.startsWith("/start")) {
    await sendStartReply(chatId, firstName);
    return;
  }

  await sendFallbackReply(chatId);
}

async function main() {
  console.log("Telegram bot polling started.");
  console.log(`Miniapp URL: ${appBaseUrl}`);

  await setupBot();

  let offset = 0;

  while (true) {
    try {
      const updates = await callTelegram("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message"],
      });

      for (const update of updates) {
        offset = update.update_id + 1;
        await handleUpdate(update);
      }
    } catch (error) {
      console.error("Telegram polling error");
      console.error(error instanceof Error ? error.message : error);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

main().catch((error) => {
  console.error("Telegram bot failed to start");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
