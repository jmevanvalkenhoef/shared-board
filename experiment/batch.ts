// Runs a batch of graded runs in parallel, with a token limit.
//   node experiment/batch.ts --design full [--reps 1] [--concurrency 6] [--max-tokens 6000000] [--dry-run]
// "full" runs every task with every model and CLI variant, `reps` times;
// "holdout" does the same for the held-out tasks of the prediction test.
// "pilot" (the first, smaller round) gave every task two runs with opposite
// model and opposite CLI style, on two models and two variants.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { run } from "./run.ts";
import type { RunRecord, RunSpec } from "./run.ts";
import { loadTasks } from "./tasks.ts";
import type { Task } from "./tasks.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const MODELS = ["claude-haiku-4-5", "haiku", "sonnet"] as const;
export const VARIANTS = ["plain", "agent", "forgiving"] as const;

const PILOT_COMBOS = [
  { model: "haiku", style: "plain" },
  { model: "haiku", style: "agent" },
  { model: "sonnet", style: "plain" },
  { model: "sonnet", style: "agent" },
];

function pilot(tasks: Task[]): RunSpec[] {
  return tasks.flatMap((task, i) => {
    const c = i % PILOT_COMBOS.length;
    return [PILOT_COMBOS[c]!, PILOT_COMBOS[PILOT_COMBOS.length - 1 - c]!].map((combo) => ({ task, ...combo }));
  });
}

function full(tasks: Task[], reps: number): RunSpec[] {
  return Array.from({ length: reps }, () =>
    tasks.flatMap((task) => MODELS.flatMap((model) => VARIANTS.map((style) => ({ task, model, style })))),
  ).flat();
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
        `${String(records.length).padStart(3)}/${specs.length} ${r.success ? "pass" : "FAIL"} ${r.task.padEnd(20)} ${spec.model.padEnd(16)} ${r.style.padEnd(9)} ` +
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
      design: { type: "string", default: "full" },
      reps: { type: "string", default: "1" },
      concurrency: { type: "string", default: "6" },
      "max-tokens": { type: "string", default: "6000000" },
      seed: { type: "string", default: "1" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const tasks = loadTasks(ROOT);
  const designs: Record<string, () => RunSpec[]> = {
    pilot: () => pilot(tasks.filter((t) => t.level !== "large")),
    full: () => full(tasks.filter((t) => !t.holdout), Number(values.reps)),
    holdout: () => full(tasks.filter((t) => t.holdout), Number(values.reps)),
  };
  const design = designs[values.design!];
  if (!design) throw new Error(`unknown design "${values.design}"`);
  const batch = `${values.design}-${new Date().toISOString().slice(0, 16)}`;
  const specs = shuffle(design(), Number(values.seed)).map((s) => ({ ...s, batch }));

  if (values["dry-run"]) {
    for (const s of specs) console.log(`${s.task.id.padEnd(20)} ${s.model.padEnd(16)} ${s.style}`);
    console.log(`${specs.length} runs`);
  } else {
    const records = await runBatch(specs, Number(values.concurrency), Number(values["max-tokens"]));
    const total = records.reduce((n, r) => n + tokensOf(r), 0);
    const out = records.reduce((n, r) => n + r.tokens.output, 0);
    console.log(`\n${records.length} runs, ${records.filter((r) => r.success).length} passed`);
    console.log(`${total} tokens in total (${out} output), ${Math.round(total / records.length)} per run`);
    for (const model of MODELS) {
      for (const style of VARIANTS) {
        const rs = records.filter((r) => r.requestedModel === model && r.style === style);
        if (!rs.length) continue;
        const t = rs.reduce((n, r) => n + tokensOf(r), 0);
        console.log(`  ${model.padEnd(16)} ${style.padEnd(9)} ${rs.filter((r) => r.success).length}/${rs.length} passed, ${Math.round(t / rs.length)} tokens per run`);
      }
    }
  }
}
