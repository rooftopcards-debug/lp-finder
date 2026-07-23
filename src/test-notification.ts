import { requireNotificationDelivery, sendNotification } from "./notify.js";

const result = await sendNotification({
  title: "Florida plate monitor test",
  message: "If this showed up on your phone, alerts are working.",
});

requireNotificationDelivery(result);
console.log(`Sent through: ${result.channels.join(", ")}`);
