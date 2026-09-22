// Extension: foundry-image-gen
import { imageTools } from "./lib/tools.mjs";

if (process.argv.includes("--self-test")) {
    const { runSelfTest } = await import("./tests/self-test.mjs");
    await runSelfTest();
} else {
    const { joinSession } = await import("@github/copilot-sdk/extension");
    const session = await joinSession({ tools: imageTools(() => session) });
}
