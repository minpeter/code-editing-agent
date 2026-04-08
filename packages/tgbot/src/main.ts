import { setDefaultResultOrder } from "node:dns";
import { Agent, setGlobalDispatcher } from "undici";

setDefaultResultOrder("ipv4first");
setGlobalDispatcher(new Agent({ connect: { autoSelectFamily: false } }));

await import("./env");
const { closeAgent } = await import("./agent");
const { bot, registerCommands } = await import("./bot");

await bot.initialize();
await registerCommands();

console.log("[tgbot] Bot initialized and running.");

process.on("SIGINT", async () => {
  console.log("\n[tgbot] Shutting down...");
  try {
    await closeAgent();
    await bot.shutdown();
  } catch (error) {
    console.error("[tgbot] Error during shutdown:", error);
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  try {
    await closeAgent();
    await bot.shutdown();
  } catch (error) {
    console.error("[tgbot] Error during shutdown:", error);
  }
  process.exit(0);
});
