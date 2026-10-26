/**
 * Starts `wrangler dev --local` (free, no Cloudflare account) with secrets from a
 * temporary 0600 env file that is deleted on stop. Secrets never touch argv or logs.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function startWrangler({ vars = {}, port = 8790 + Math.floor(Math.random() * 200) } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "biq-wrangler-"));
  const envFile = join(dir, "vars.env");
  writeFileSync(envFile, Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
  const child = spawn(
    "npx",
    ["wrangler", "dev", "--local", "--ip", "127.0.0.1", "--port", String(port), "--env-file", envFile, "--show-interactive-dev-session=false", "--log-level", "warn"],
    { cwd: PROJECT, env: { ...process.env, WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"] },
  );
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const baseUrl = `http://127.0.0.1:${port}`;
  const stop = () => {
    child.kill("SIGTERM");
    rmSync(dir, { recursive: true, force: true });
  };
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      await fetch(baseUrl);
      return { baseUrl, agentUrl: `${baseUrl}/agents/blockchain-iq-agent/default`, stop, log: () => log };
    } catch {
      if (child.exitCode !== null) break;
    }
  }
  stop();
  throw new Error(`wrangler dev did not start:\n${log.slice(-2000)}`);
}
