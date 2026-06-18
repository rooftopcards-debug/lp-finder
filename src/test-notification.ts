import { sendNotification } from "./notify.js";

const result = await sendNotification({
  title: "Florida plate monitor test",
  message: "If this showed up on your phone, alerts are working.",
});

if (!result.sent) {
  console.log("No notification channel was configured.");
  console.log("For the easiest free setup, set NTFY_TOPIC to a long random topic name.");
  process.exitCode = 1;
} else {
  console.log(`Sent through: ${result.channels.join(", ")}`);
}
