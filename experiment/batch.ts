// Runs a batch of graded runs in parallel, with a token limit.
//   node experiment/batch.ts --design pilot [--concurrency 4] [--max-tokens 800000] [--dry-run]
// The pilot gives every task two runs with opposite model and opposite CLI style,
// so each of the four combinations gets six runs.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { run } from "./run.ts";
import type { RunRecord, RunSpec } from "./run.ts";
import { loadTasks } from "./tasks.ts";
import type { Task } from "./tasks.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const COMBOS = [
  { model: "haiku", style: "plain" },
  { model: "haiku", style: "agent" },
  { model: "sonnet", style: "plain" },
  { model: "sonnet", style: "agent" },
] as const;

function pilot(tasks: Task[]): RunSpec[] {
  return tasks.flatMap((task, i) => {
    const c = i % COMBOS.length;
    return [COMBOS[c]!, COMBOS[COMBOS.length - 1 - c]!].map((combo) => ({ task, ...combo }));
  });
}

export function tokensOf(r: RunRecord): number {
  return r.tokens.input + r.tokens.output + r.tokens.cacheRead + r.tokens.cacheWrite;
}

/** Runs specs with at most `concurrency` at once; stops starting new ones past `maxTokens`. */
export async function runBatch(specs: RunSpec[], concurrency: number, maxTokens: number): Promise<RunRecord[]> {
  const queue = [...specs];
  const records: RunRecord[] = [];
  let used = 0;

  async function worker(): Promise<void> {
    for (let spec = queue.shift(); spec; spec = queue.shift()) {
      if (used >= maxTokens) return;
      const r = await run(spec);
      used += tokensOf(r);
      records.push(r);
      console.log(
        `${String(records.length).padStart(3)}/${specs.length} ${r.success ? "pass" : "FAIL"} ${r.task.padEnd(20)} ${spec.model.padEnd(6)} ${r.style.padEnd(5)} ` +
          `${String(tokensOf(r)).padStart(6)} tok ${(r.durationMs / 1000).toFixed(0).padStart(3)} s  total ${used}` +
          (r.success ? "" : `  | ${r.problems.join("; ")}`),
      );
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return records;
}

/** Fisher-Yates with a fixed seed, so a batch's order can be reproduced. */
function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      design: { type: "string", default: "pilot" },
      concurrency: { type: "string", default: "4" },
      "max-tokens": { type: "string", default: "800000" },
      seed: { type: "string", default: "1" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  if (values.design !== "pilot") throw new Error(`unknown design "${values.design}"`);
  const specs = shuffle(pilot(loadTasks(ROOT)), Number(values.seed));

  if (values["dry-run"]) {
    for (const s of specs) console.log(`${s.task.id.padEnd(20)} ${s.model.padEnd(6)} ${s.style}`);
    console.log(`${specs.length} runs`);
  } else {
    const records = await runBatch(specs, Number(values.concurrency), Number(values["max-tokens"]));
    const total = records.reduce((n, r) => n + tokensOf(r), 0);
    const out = records.reduce((n, r) => n + r.tokens.output, 0);
    console.log(`\n${records.length} runs, ${records.filter((r) => r.success).length} passed`);
    console.log(`${total} tokens in total (${out} output), ${Math.round(total / records.length)} per run`);
    for (const c of COMBOS) {
      const rs = records.filter((r) => r.style === c.style && r.model.includes(c.model));
      const t = rs.reduce((n, r) => n + tokensOf(r), 0);
      console.log(`  ${c.model.padEnd(6)} ${c.style.padEnd(5)} ${rs.filter((r) => r.success).length}/${rs.length} passed, ${rs.length ? Math.round(t / rs.length) : 0} tokens per run`);
    }
  }
}
