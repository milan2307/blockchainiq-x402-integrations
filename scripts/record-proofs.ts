/**
 * Writes settlement proofs (JSON lines from PROOF_FILE, default proofs.jsonl)
 * into README.md between the PAID-CALL-PROOFS markers.
 *   npm run record-proofs  (or: node dist/scripts/record-proofs.js [proofs.jsonl])
 */
import { readFileSync, writeFileSync } from "node:fs";

const START = "<!-- PAID-CALL-PROOFS:START -->";
const END = "<!-- PAID-CALL-PROOFS:END -->";

interface Proof { framework: string; resource: string; transaction: string; network: string; payer?: string; at: string }

const file = process.argv[2] ?? process.env.PROOF_FILE ?? "proofs.jsonl";
const proofs: Proof[] = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
if (proofs.length === 0) throw new Error(`no proofs in ${file}`);

const rows = proofs.map(
  (p) => `| ${p.framework} | \`${p.resource}\` | [\`${p.transaction}\`](https://basescan.org/tx/${p.transaction}) | \`${p.payer ?? "?"}\` | ${p.at} |`,
);
const block = [START, "| Framework | Resource | Settlement tx (Base) | Payer | Time (UTC) |", "| --- | --- | --- | --- | --- |", ...rows, END].join("\n");

const readme = readFileSync("README.md", "utf8");
const pattern = new RegExp(`${START}[\\s\\S]*?${END}`);
if (!pattern.test(readme)) throw new Error("README.md has no PAID-CALL-PROOFS markers");
writeFileSync("README.md", readme.replace(pattern, block));
console.log(`recorded ${proofs.length} proof(s) in README.md`);
