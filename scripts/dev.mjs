import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const children = [
  spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    stdio: "inherit",
    env: { ...process.env, PORT: "3187", FRONTEND_PORT: "5178" },
  }),
  spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL("../node_modules/vite/bin/vite.js", import.meta.url),
      ),
      "--host",
      "0.0.0.0",
    ],
    { stdio: "inherit" },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const child of children) child.on("exit", (code) => stop(code || 0));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
