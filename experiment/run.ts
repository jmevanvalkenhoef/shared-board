// One graded run: a fresh board, one task, one agent.
//   node experiment/run.ts --task bugs-to-doing --model haiku [--style plain]
// Appends a line to experiment/results/runs.jsonl and keeps the transcript.

import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { runAgent } from "./agent.ts";
import type { AgentResult } from "./agent.ts";
import { startSandbox } from "./sandbox.ts";
import { loadTasks } from "./tasks.ts";
import type { Task } from "./tasks.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "experiment", "results");

export interface RunSpec {
  task: Task;
  model: string;
  style: string;
}

export interface RunRecord extends Omit<AgentResult, "reply"> {
  id: string;
  at: string;
  task: string;
  style: string;
  success: boolean;
  problems: string[];
  boardChanges: number;
  reply: string;
}

export async function run({ task, model, style }: RunSpec): Promise<RunRecord> {
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${task.id}-${model}-${style}`;
  const sandbox = await startSandbox(ROOT, task.seed);
  const cwd = mkdtempSync(join(tmpdir(), "board-run-"));
  mkdirSync(join(RESULTS, "transcripts"), { recursive: true });

  try {
    const before = sandbox.service.board;
    const agent = await runAgent({
      task: task.prompt,
      model,
      cwd,
      env: {
        PATH: `${join(ROOT, "bin")}:${process.env.PATH ?? ""}`,
        BOARD_URL: sandbox.url,
        BOARD_ACTOR: "agent",
        BOARD_STYLE: style,
      },
      timeoutMs: 180_000,
      maxBudgetUsd: 1,
      transcriptPath: join(RESULTS, "transcripts", `${id}.jsonl`),
    });
    const after = sandbox.service.board;
    const problems = agent.timedOut ? ["timed out", ...task.check(before, after)] : task.check(before, after);

    const record: RunRecord = {
      id,
      at: new Date().toISOString(),
      task: task.id,
      style,
      ...agent,
      success: problems.length === 0,
      problems,
      boardChanges: after.lastSeq - before.lastSeq,
    };
    appendFileSync(join(RESULTS, "runs.jsonl"), JSON.stringify(record) + "\n");
    return record;
  } finally {
    await sandbox.close();
    rmSync(cwd, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      task: { type: "string" },
      model: { type: "string", default: "haiku" },
      style: { type: "string", default: "plain" },
    },
  });
  const task = loadTasks(ROOT).find((t) => t.id === values.task);
  if (!task) {
    console.error(`unknown task; one of: ${loadTasks(ROOT).map((t) => t.id).join(", ")}`);
    process.exit(2);
  }
  const r = await run({ task, model: values.model!, style: values.style! });
  const tokens = r.tokens.input + r.tokens.output + r.tokens.cacheRead + r.tokens.cacheWrite;
  console.log(`${r.success ? "PASS" : "FAIL"} ${r.task} ${r.model} ${r.style}`);
  if (r.problems.length) console.log(`  problems: ${r.problems.join("; ")}`);
  console.log(`  ${r.toolCalls} tool calls, ${r.toolErrors} errors, ${r.boardChanges} board changes, ${r.turns} turns`);
  console.log(`  ${tokens} tokens (${r.tokens.output} out, ${r.tokens.cacheRead} cache read), $${r.costUsd.toFixed(4)} list price, ${(r.durationMs / 1000).toFixed(1)} s`);
  console.log(`  reply: ${r.reply}`);
}
