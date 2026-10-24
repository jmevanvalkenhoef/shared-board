// Commands are requests; `decide` checks one against the current board and
// turns it into the change to record, or throws a CommandError.

import { COLUMN_TITLES, isColumn, nextCardId } from "./board.ts";
import type { Board, Card, Change, ColumnId } from "./board.ts";

export type Command =
  | { type: "create"; title: string; column?: ColumnId; labels?: string[] }
  | { type: "move"; card: number; column: ColumnId; index?: number }
  | { type: "rename"; card: number; title: string }
  | { type: "describe"; card: number; description: string }
  | { type: "label"; card: number; labels: string[] }
  | { type: "archive"; card: number };

export type ErrorCode = "invalid" | "no-such-card" | "archived";

export class CommandError extends Error {
  readonly code: ErrorCode;
  readonly card: number | undefined;

  constructor(code: ErrorCode, message: string, card?: number) {
    super(message);
    this.code = code;
    this.card = card;
  }
}

const TITLE_MAX = 200;

export function decide(board: Board, command: Command): Change {
  switch (command.type) {
    case "create":
      return {
        type: "created",
        card: nextCardId(board),
        title: title(command.title),
        column: command.column ?? "backlog",
        labels: labels(command.labels ?? []),
      };
    case "move": {
      const card = live(board, command.card);
      const length = board.columns[command.column].filter((id) => id !== card.id).length;
      return { type: "moved", card: card.id, column: command.column, index: command.index ?? length };
    }
    case "rename":
      return { type: "renamed", card: live(board, command.card).id, title: title(command.title) };
    case "describe":
      return { type: "described", card: live(board, command.card).id, description: command.description.trim() };
    case "label":
      return { type: "labelled", card: live(board, command.card).id, labels: labels(command.labels) };
    case "archive":
      return { type: "archived", card: live(board, command.card).id };
  }
}

function live(board: Board, id: number): Card {
  const card = board.cards[id];
  if (!card) throw new CommandError("no-such-card", `no card ${id}`, id);
  if (card.archived) throw new CommandError("archived", `card ${id} is archived`, id);
  return card;
}

function title(value: string): string {
  const t = value.trim();
  if (!t) throw new CommandError("invalid", "title is empty");
  if (t.length > TITLE_MAX) throw new CommandError("invalid", `title is longer than ${TITLE_MAX} characters`);
  return t;
}

function labels(values: string[]): string[] {
  return [...new Set(values.map((l) => l.trim().toLowerCase()).filter(Boolean))].sort();
}

/** Validates untrusted input (an HTTP body) into a Command. */
export function parseCommand(input: unknown): Command {
  if (typeof input !== "object" || input === null) throw invalid("command must be an object");
  const c = input as Record<string, unknown>;

  switch (c.type) {
    case "create":
      return {
        type: "create",
        title: str(c.title, "title"),
        column: c.column === undefined ? undefined : column(c.column),
        labels: c.labels === undefined ? undefined : strings(c.labels, "labels"),
      };
    case "move":
      return {
        type: "move",
        card: id(c.card),
        column: column(c.column),
        index: c.index === undefined ? undefined : index(c.index),
      };
    case "rename":
      return { type: "rename", card: id(c.card), title: str(c.title, "title") };
    case "describe":
      return { type: "describe", card: id(c.card), description: str(c.description, "description") };
    case "label":
      return { type: "label", card: id(c.card), labels: strings(c.labels, "labels") };
    case "archive":
      return { type: "archive", card: id(c.card) };
    default:
      throw invalid(`unknown command type ${JSON.stringify(c.type)}`);
  }
}

function invalid(message: string): CommandError {
  return new CommandError("invalid", message);
}

function str(v: unknown, name: string): string {
  if (typeof v !== "string") throw invalid(`${name} must be a string`);
  return v;
}

function strings(v: unknown, name: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw invalid(`${name} must be a list of strings`);
  return v;
}

function id(v: unknown): number {
  if (!Number.isInteger(v) || (v as number) < 1) throw invalid("card must be a positive whole number");
  return v as number;
}

function index(v: unknown): number {
  if (!Number.isInteger(v) || (v as number) < 0) throw invalid("index must be zero or more");
  return v as number;
}

function column(v: unknown): ColumnId {
  if (!isColumn(v)) throw invalid(`column must be one of ${Object.keys(COLUMN_TITLES).join(", ")}`);
  return v;
}
