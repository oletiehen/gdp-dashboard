import assert from "node:assert/strict";
import test from "node:test";
import { createPushService, NEUTRAL_NOTIFICATION } from "../../src/server/push.js";

test("due reminders send only the neutral lock-screen payload", async () => {
  let data = {
    subscriptions: [{ endpointHash: "one", subscription: { endpoint: "https://push.invalid/one", keys: { auth: "auth", p256dh: "key" } } }],
    reminders: [{ id: "synthetic-reminder", fireAt: "2030-01-01T00:00:00.000Z", sentAt: null }]
  };
  const sent = [];
  const store = {
    readPushData: async () => data,
    putSubscription: async () => ({}),
    removeSubscription: async endpoint => { data.subscriptions = data.subscriptions.filter(item => item.subscription.endpoint !== endpoint); return true; },
    replaceReminders: async reminders => { data.reminders = reminders; return reminders.length; },
    mutatePushData: async mutator => { const result = await mutator(data); return result; }
  };
  const webPush = {
    setVapidDetails() {},
    async sendNotification(_subscription, payload) { sent.push(JSON.parse(payload)); }
  };
  const service = createPushService({ webPush, store, publicKey: "public", privateKey: "private", now: () => new Date("2030-01-01T00:01:00Z").getTime() });
  const result = await service.processDue();
  assert.equal(result.due, 1);
  assert.deepEqual(sent[0], NEUTRAL_NOTIFICATION);
  assert.equal(data.reminders[0].sentAt !== null, true);
});

test("unsubscribe removes the stored subscription", async () => {
  let removed = "";
  const store = { removeSubscription: async endpoint => { removed = endpoint; return true; } };
  const service = createPushService({ webPush: null, store, publicKey: "", privateKey: "" });
  assert.equal(await service.unsubscribe("https://push.invalid/test"), true);
  assert.equal(removed, "https://push.invalid/test");
});
