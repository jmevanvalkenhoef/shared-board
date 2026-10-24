// The board CLI: the agent's way in. Every change it makes is recorded as the
// agent's, unless BOARD_ACTOR says otherwise.
//   BOARD_URL (http://localhost:4321)  BOARD_ACTOR (agent)  BOARD_STYLE (plain | agent | forgiving)
// Exit codes: 0 ok, 1 the board refused the command, 2 usage error, 3 server unreachable.

import { parseArgs } from "node:util";
import type { Actor, ColumnId } from "../domain/board.ts";
import type { Command } from "../domain/commands.ts";
import { BoardClient, RequestFailed, Unreachable } from "./client.ts";
import { forgiving, strict } from "./dialect.ts";
import type { Dialect } from "./dialect.ts";
import type { Style } from "./style.ts";
import { agent } from "./styles/agent.ts";
import { plain } from "./styles/plain.ts";

class UsageError extends Error {}

/** The CLI variants of the experiment: what the CLI prints, and what it accepts. */
const VARIANTS: Record<string, { style: Style; dialect: Dialect }> = {
  plain: { style: plain, dialect: strict },
  agent: { style: agent, dialect: strict },
  forgiving: { style: agent, dialect: forgiving },
};

const { style, dialect } = VARIANTS[process.env.BOARD_STYLE ?? "plain"] ?? VARIANTS.plain!;

async function main(argv: string[]): Promise<number> {
  const client = new BoardClient(process.env.BOARD_URL ?? "http://localhost:4321", actorFromEnv());
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        column: { type: "string" },
        label: { type: "string", multiple: true },
        position: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
    const [first, ...rest] = positionals;

    if (!first || first === "help" || values.help) return print(style.usage());
    const { name, args } = dialect.command(first, rest);

    if (name === "show") {
      const column = args[0] === undefined ? undefined : columnArg(args[0]);
      return print(style.board(await client.board(), column));
    }
    if (name === "card") {
      const id = idArg(args[0]);
      const card = (await client.board()).cards[id];
      if (!card) throw new RequestFailed({ code: "no-such-card", message: `no card ${id}`, card: id });
      return print(style.card(card));
    }

    const { event, board } = await client.run(toCommand(name, args, values));
    return print(style.changed(event, board));
  } catch (err) {
    if (err instanceof RequestFailed) return fail(1, style.error(err.error, await client.board().catch(() => undefined)));
    if (err instanceof UsageError || isParseError(err)) return fail(2, style.usage((err as Error).message));
    if (err instanceof Unreachable) return fail(3, `error: ${err.message}`);
    throw err;
  }
}

function toCommand(
  name: string,
  args: string[],
  options: { column?: string; label?: string[]; position?: string },
): Command {
  switch (name) {
    case "add":
      return {
        type: "create",
        title: textArg(args, 0, "title"),
        column: options.column === undefined ? undefined : columnArg(options.column),
        labels: options.label,
      };
    case "move":
      return {
        type: "move",
        card: idArg(args[0]),
        column: columnArg(args[1]),
        index: options.position === undefined ? undefined : positionArg(options.position) - 1,
      };
    case "rename":
      return { type: "rename", card: idArg(args[0]), title: textArg(args, 1, "title") };
    case "describe":
      return { type: "describe", card: idArg(args[0]), description: textArg(args, 1, "text") };
    case "label":
      return { type: "label", card: idArg(args[0]), labels: args.slice(1) };
    case "archive":
      return { type: "archive", card: idArg(args[0]) };
    default:
      throw new UsageError(`unknown command "${name}"`);
  }
}

function idArg(value: string | undefined): number {
  const id = Number((value ?? "").replace(/^#/, ""));
  if (!Number.isInteger(id) || id < 1) throw new UsageError(`expected a card id, got "${value ?? ""}"`);
  return id;
}

function columnArg(value: string | undefined): ColumnId {
  const column = dialect.column(value);
  if (!column) throw new UsageError(`unknown column "${value ?? ""}"`);
  return column;
}

function positionArg(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new UsageError(`position must be 1 or more, got "${value}"`);
  return n;
}

/** The rest of the arguments from `from` on, so titles need no quotes. */
function textArg(args: string[], from: number, name: string): string {
  const text = args.slice(from).join(" ");
  if (!text) throw new UsageError(`missing ${name}`);
  return text;
}

function actorFromEnv(): Actor {
  return process.env.BOARD_ACTOR === "human" ? "human" : "agent";
}

function isParseError(err: unknown): boolean {
  return err instanceof TypeError && "code" in err && String(err.code).startsWith("ERR_PARSE_ARGS");
}

function print(text: string): number {
  console.log(text);
  return 0;
}

function fail(code: number, text: string): number {
  console.error(text);
  return code;
}

process.exitCode = await main(process.argv.slice(2));
