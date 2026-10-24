// Tests the tasks' checks without an agent: each task's reference solution must
// pass, and doing nothing must fail (except where doing nothing is the answer).
//   node experiment/test-tasks.ts

import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { startSandbox } from "./sandbox.ts";
import { loadTasks } from "./tasks.ts";
import type { Task } from "./tasks.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exec = promisify(execFile);

async function problemsAfter(task: Task, steps: string[][]): Promise<string[]> {
  const sandbox = await startSandbox(ROOT, task.seed);
  try {
    const before = sandbox.service.board;
    for (const args of steps) {
      await exec(join(ROOT, "bin", "board"), args, { env: { ...process.env, BOARD_URL: sandbox.url } });
    }
    return task.check(before, sandbox.service.board);
  } finally {
    await sandbox.close();
  }
}

let failed = 0;
for (const task of loadTasks(ROOT)) {
  const solved = await problemsAfter(task, task.solution);
  const idle = await problemsAfter(task, []);
  const idleShouldPass = task.solution.length === 0;
  const ok = solved.length === 0 && (idle.length === 0) === idleShouldPass;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${task.id.padEnd(20)} solution: ${solved.length ? solved.join("; ") : "passes"} | idle: ${idle.length ? "fails" : "passes"}`);
}
process.exitCode = failed ? 1 : 0;
