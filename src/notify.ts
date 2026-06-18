import https from "node:https";

export type NotificationInput = {
  title: string;
  message: string;
};

export type NotificationResult = {
  sent: boolean;
  channels: string[];
};

function postForm(url: string, data: URLSearchParams, auth?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = data.toString();
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body).toString(),
    };

    if (auth) headers.Authorization = `Basic ${Buffer.from(auth).toString("base64")}`;

    const req = https.request(target, { method: "POST", headers }, res => {
      let responseBody = "";
      res.on("data", chunk => responseBody += chunk);
      res.on("end", () => {
        const statusCode = res.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`Notification request failed with HTTP ${statusCode}: ${responseBody}`));
          return;
        }
        resolve();
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function postJson(url: string, payload: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = JSON.stringify(payload);
    const req = https.request(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body).toString(),
      },
    }, res => {
      let responseBody = "";
      res.on("data", chunk => responseBody += chunk);
      res.on("end", () => {
        const statusCode = res.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`Webhook failed with HTTP ${statusCode}: ${responseBody}`));
          return;
        }
        resolve();
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function postText(url: string, body: string, headers: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(target, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": Buffer.byteLength(body).toString(),
      },
    }, res => {
      let responseBody = "";
      res.on("data", chunk => responseBody += chunk);
      res.on("end", () => {
        const statusCode = res.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`Text notification failed with HTTP ${statusCode}: ${responseBody}`));
          return;
        }
        resolve();
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function sendPushover(input: NotificationInput) {
  const user = process.env.PUSHOVER_USER_KEY;
  const token = process.env.PUSHOVER_APP_TOKEN;
  if (!user || !token) return false;

  const data = new URLSearchParams({
    token,
    user,
    title: input.title,
    message: input.message,
  });

  await postForm("https://api.pushover.net/1/messages.json", data);
  return true;
}

async function sendNtfy(input: NotificationInput) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return false;

  const server = process.env.NTFY_SERVER ?? "https://ntfy.sh";
  const normalizedServer = server.replace(/\/+$/g, "");
  const normalizedTopic = topic.replace(/^\/+|\/+$/g, "");

  await postText(`${normalizedServer}/${encodeURIComponent(normalizedTopic)}`, input.message, {
    Title: input.title,
    Tags: "rotating_light",
    Priority: "high",
  });
  return true;
}

async function sendTelegram(input: NotificationInput) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  await postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: `${input.title}\n\n${input.message}`.slice(0, 4096),
    disable_web_page_preview: true,
  });
  return true;
}

async function sendDiscord(input: NotificationInput) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return false;

  await postJson(webhookUrl, {
    content: `**${input.title}**\n${input.message}`.slice(0, 2000),
    allowed_mentions: { parse: [] },
  });
  return true;
}

async function sendTwilio(input: NotificationInput) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = process.env.TWILIO_TO_NUMBER;
  if (!sid || !authToken || !from || !to) return false;

  const data = new URLSearchParams({
    From: from,
    To: to,
    Body: `${input.title}\n${input.message}`,
  });

  await postForm(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
    data,
    `${sid}:${authToken}`
  );
  return true;
}

async function sendWebhook(input: NotificationInput) {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) return false;

  await postJson(webhookUrl, input);
  return true;
}

export async function sendNotification(input: NotificationInput): Promise<NotificationResult> {
  const channels: string[] = [];
  const attempts = [
    ["ntfy", sendNtfy],
    ["telegram", sendTelegram],
    ["discord", sendDiscord],
    ["pushover", sendPushover],
    ["twilio", sendTwilio],
    ["webhook", sendWebhook],
  ] as const;

  for (const [name, send] of attempts) {
    try {
      if (await send(input)) channels.push(name);
    } catch (error) {
      console.error(`${name} notification failed:`, error);
    }
  }

  if (channels.length === 0) {
    console.log(`${input.title}\n${input.message}`);
  }

  return {
    sent: channels.length > 0,
    channels,
  };
}
