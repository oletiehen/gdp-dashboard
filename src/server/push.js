const NEUTRAL_NOTIFICATION = Object.freeze({
  title: "Olafs Kompass",
  body: "In Kürze steht ein persönlicher Termin an. Öffne deinen Kompass.",
  url: "/#/kalender"
});

function validSubscription(subscription) {
  return Boolean(
    subscription &&
    typeof subscription.endpoint === "string" &&
    subscription.endpoint.startsWith("https://") &&
    typeof subscription.keys?.auth === "string" &&
    typeof subscription.keys?.p256dh === "string"
  );
}

export function createPushService({ webPush, store, publicKey, privateKey, contact = "mailto:admin@example.invalid", now = () => Date.now() }) {
  const configured = Boolean(webPush && publicKey && privateKey);
  if (configured) webPush.setVapidDetails(contact, publicKey, privateKey);

  async function subscribe(subscription) {
    if (!configured) throw Object.assign(new Error("push_not_configured"), { code: "PUSH_NOT_CONFIGURED", status: 503 });
    if (!validSubscription(subscription)) throw Object.assign(new Error("invalid_subscription"), { code: "INVALID_SUBSCRIPTION", status: 400 });
    return store.putSubscription(subscription);
  }

  async function unsubscribe(endpoint) {
    if (!endpoint || typeof endpoint !== "string") return false;
    return store.removeSubscription(endpoint);
  }

  async function replaceReminders(reminders) {
    const clean = reminders.slice(0, 250).flatMap(item => {
      const fireAt = new Date(item.fireAt);
      if (!item.id || Number.isNaN(fireAt.getTime())) return [];
      return [{ id: String(item.id).slice(0, 120), fireAt: fireAt.toISOString(), sentAt: null }];
    });
    return store.replaceReminders(clean);
  }

  async function sendNeutral(subscription) {
    if (!configured) throw Object.assign(new Error("push_not_configured"), { code: "PUSH_NOT_CONFIGURED", status: 503 });
    return webPush.sendNotification(subscription, JSON.stringify(NEUTRAL_NOTIFICATION), { TTL: 300, urgency: "normal" });
  }

  async function sendTest() {
    if (!configured) throw Object.assign(new Error("push_not_configured"), { code: "PUSH_NOT_CONFIGURED", status: 503 });
    const data = await store.readPushData();
    let sent = 0;
    for (const record of data.subscriptions) {
      try {
        await sendNeutral(record.subscription);
        sent += 1;
      } catch (error) {
        if ([404, 410].includes(Number(error?.statusCode))) await store.removeSubscription(record.subscription.endpoint);
        else throw error;
      }
    }
    return sent;
  }

  async function processDue() {
    if (!configured) return { sent: 0, due: 0 };
    return store.mutatePushData(async data => {
      const due = data.reminders.filter(item => !item.sentAt && new Date(item.fireAt).getTime() <= now());
      let sent = 0;
      for (const reminder of due) {
        for (const record of [...data.subscriptions]) {
          try {
            await sendNeutral(record.subscription);
            sent += 1;
          } catch (error) {
            if ([404, 410].includes(Number(error?.statusCode))) data.subscriptions = data.subscriptions.filter(item => item.endpointHash !== record.endpointHash);
          }
        }
        reminder.sentAt = new Date(now()).toISOString();
      }
      data.reminders = data.reminders.filter(item => !item.sentAt || now() - new Date(item.sentAt).getTime() < 7 * 24 * 60 * 60 * 1000);
      return { sent, due: due.length };
    });
  }

  function startScheduler({ intervalMs = 60_000 } = {}) {
    const timer = setInterval(() => {
      processDue().catch(() => {});
    }, intervalMs);
    timer.unref?.();
    return () => clearInterval(timer);
  }

  return { configured, publicKey: configured ? publicKey : "", subscribe, unsubscribe, replaceReminders, sendTest, processDue, startScheduler };
}

export { NEUTRAL_NOTIFICATION, validSubscription };
