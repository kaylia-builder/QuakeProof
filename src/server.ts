import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const port = Number(process.env.PORT ?? 8080);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const app = createApp(config);

// Vercel detects and invokes this Express export as one serverless function.
// Local/container runtimes keep using the ordinary port listener.
export default app;

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(
      `quakeproof listening on :${port} ` +
        `(network ${config.payment.network}, ${config.price} per call to ${config.payTo})`
    );
  });
}
