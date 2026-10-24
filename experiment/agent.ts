// Runs Claude Code headless as the agent. It gets one tool, Bash, and may only
// run the board CLI; anything else is refused without asking.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";

export const SYSTEM_PROMPT = `You work on a kanban board through the \`board\` command-line tool, using the Bash tool.
Only the \`board\` command is available. Run \`board help\` to see what it can do.
Run one \`board\` command per Bash call, or chain several with \`&&\` or \`;\`. Loops and other shell commands are refused.
Do the task you are given, then reply with one short sentence saying what you did.`;

export interface AgentOptions {
  task: string;
  model: string;
  env: Record<string, string>;
  cwd: string;
  timeoutMs: number;
  maxBudgetUsd: number;
  transcriptPath: string;
}

export interface AgentResult {
  finished: boolean;
  timedOut: boolean;
  reply: string;
  model: string;
  turns: number;
  toolCalls: number;
  toolErrors: number;
  durationMs: number;
  costUsd: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export async function runAgent(o: AgentOptions): Promise<AgentResult> {
  const args = [
    "-p", o.task,
    "--model", o.model,
    "--system-prompt", SYSTEM_PROMPT,
    "--tools", "Bash",
    "--allowedTools", "Bash(board *)",
    "--permission-mode", "dontAsk",
    "--setting-sources", "",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--no-session-persistence",
    "--max-budget-usd", String(o.maxBudgetUsd),
    "--output-format", "stream-json",
    "--verbose",
  ];
  const started = Date.now();
  const child = spawn("claude", args, { cwd: o.cwd, env: { ...process.env, ...o.env }, stdio: ["ignore", "pipe", "pipe"] });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, o.timeoutMs);

  const stderr: string[] = [];
  child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
  const closed = new Promise((resolve) => child.once("close", resolve));

  const lines: string[] = [];
  const result: AgentResult = {
    finished: false,
    timedOut: false,
    reply: "",
    model: o.model,
    turns: 0,
    toolCalls: 0,
    toolErrors: 0,
    durationMs: 0,
    costUsd: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };

  for await (const line of createInterface({ input: child.stdout })) {
    if (!line.trim()) continue;
    lines.push(line);
    read(JSON.parse(line) as Message, result);
  }
  await closed;
  clearTimeout(timer);

  writeFileSync(o.transcriptPath, lines.join("\n") + "\n");
  if (stderr.length && !result.finished) result.reply ||= stderr.join("").trim().slice(0, 500);
  result.timedOut = timedOut;
  result.durationMs = Date.now() - started;
  return result;
}

interface Message {
  type: string;
  subtype?: string;
  message?: { content?: Array<{ type: string; is_error?: boolean }> };
  result?: string;
  num_turns?: number;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  modelUsage?: Record<string, unknown>;
}

function read(m: Message, r: AgentResult): void {
  const content = typeof m.message === "object" && Array.isArray(m.message.content) ? m.message.content : [];
  if (m.type === "assistant") r.toolCalls += content.filter((c) => c.type === "tool_use").length;
  if (m.type === "user") r.toolErrors += content.filter((c) => c.type === "tool_result" && c.is_error).length;
  if (m.type === "result") {
    r.finished = m.subtype === "success";
    r.reply = m.result ?? m.subtype ?? "";
    r.turns = m.num_turns ?? 0;
    r.costUsd = m.total_cost_usd ?? 0;
    r.model = Object.keys(m.modelUsage ?? {})[0] ?? r.model;
    r.tokens = {
      input: m.usage?.input_tokens ?? 0,
      output: m.usage?.output_tokens ?? 0,
      cacheRead: m.usage?.cache_read_input_tokens ?? 0,
      cacheWrite: m.usage?.cache_creation_input_tokens ?? 0,
    };
  }
}
