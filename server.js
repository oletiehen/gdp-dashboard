import { createApp } from "./src/server/app.js";

const port = Number(process.env.PORT || 3000);
const app = await createApp();
const stopScheduler = app.locals.services.push.startScheduler();

const server = app.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "server_started", port, version: "1.0.0" }));
});

function shutdown() {
  stopScheduler();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
