# Florida Plate Scanner

Checks Florida personalized license plate availability and adds phone-friendly workflows:

- `npm run phone` starts a small web app you can open from Safari on your iPhone.
- `npm run monitor:one-char` watches for newly available 1-character plates and sends a notification when one appears.
- `npm run monitor:hourly` checks 1-character, 2-character, cool-number, and same-character plates.
- `npm run notify:test` sends one test notification through your configured phone alert service.

## iPhone scanning

Start the local phone page:

```powershell
npm run phone
```

The terminal prints URLs. On your iPhone, open the URL that uses your computer's Wi-Fi IP address, usually something like:

```text
http://192.168.1.25:3000
```

For one-tap access, open it in Safari, tap Share, then Add to Home Screen.

Your computer must be awake and on the same Wi-Fi network. Windows may ask whether Node can accept local network connections.

## Manual scans

Run the interactive checker:

```powershell
npm start
```

Scan exactly 2 letters:

```powershell
npm run scan:two-letters
```

Scan exactly 1 character, including numbers:

```powershell
npm run scan:one-char
```

For custom flags, call the TypeScript entrypoint directly:

```powershell
npx tsx src/cli.ts --length=3 --exact --letters-only
```

## Background alerts

The monitor only notifies when a plate is available and has never been seen before for that scan type.

Run the 1-character monitor:

```powershell
npm run monitor:one-char
```

Run the 2-letter monitor:

```powershell
npm run monitor:two-letters
```

Run the full hourly watchlist once:

```powershell
npm run monitor:hourly
```

The first run seeds the baseline silently. After that, the monitor only alerts for plates it has never seen before.

The hourly watchlist checks:

- 1 character: A-Z and 0-9.
- 2 characters: A-Z and 0-9.
- Cool numbers up to 7 characters: single digits, repeated digits, `0123`-style ordered runs, and numbers like `1000`.
- Same-character plates up to 7 characters: values like `A`, `AA`, `777`, and `ZZZZZZZ`.

## GitHub Actions hourly setup

The included workflow at `.github/workflows/plate-monitor.yml` runs once per hour. It commits `data/plate-monitor-state.json` so it remembers which plates have already been seen.

The cheapest/easiest alert path is ntfy. It does not need a bot, phone number, or paid provider.

1. Install the ntfy app on your iPhone.
2. Pick a long random topic name, such as `fl-plates-9f1d2c-your-random-words`.
3. Subscribe to that topic in the ntfy app.
4. Add this repository secret in GitHub:

```text
NTFY_TOPIC
```

Set the secret value to your random topic name.

To test locally in PowerShell:

```powershell
$env:NTFY_TOPIC="your-random-topic"
npm run notify:test
```

Telegram alerts are also supported. Create a bot with `@BotFather`, send your bot one message, then add these repository secrets in GitHub:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

You can get your chat ID by opening this URL after messaging the bot:

```text
https://api.telegram.org/botYOUR_TOKEN/getUpdates
```

Discord is also supported with this repository secret:

```text
DISCORD_WEBHOOK_URL
```

Vercel is not the recommended free host for this because Vercel Hobby cron jobs only run once per day. GitHub Actions can run this hourly within the free allowance.

### Pushover push alerts

Set these in PowerShell before starting the monitor:

```powershell
$env:PUSHOVER_USER_KEY="your-user-key"
$env:PUSHOVER_APP_TOKEN="your-app-token"
npm run monitor:one-char
```

### Twilio SMS alerts

Set these in PowerShell before starting the monitor:

```powershell
$env:TWILIO_ACCOUNT_SID="your-account-sid"
$env:TWILIO_AUTH_TOKEN="your-auth-token"
$env:TWILIO_FROM_NUMBER="+15551234567"
$env:TWILIO_TO_NUMBER="+15557654321"
npm run monitor:one-char
```

### Generic webhook

Any service that accepts JSON can be used:

```powershell
$env:WEBHOOK_URL="https://example.com/your-webhook"
npm run monitor:one-char
```

## Notes

The GitHub Actions workflow checks hourly by default.
