// How the CLI reads its arguments. The strict dialect takes exactly what the
// help describes. The forgiving one also takes what agents guessed in the
// pilot: `list` for `show`, `show 9` for a card, column names like "in progress".

import { COLUMNS, COLUMN_TITLES, isColumn } from "../domain/board.ts";
import type { ColumnId } from "../domain/board.ts";

export interface Dialect {
  /** Rewrites a command line into the strict form, or returns it unchanged. */
  command(name: string, args: string[]): { name: string; args: string[] };
  column(text: string | undefined): ColumnId | undefined;
}

export const strict: Dialect = {
  command: (name, args) => ({ name, args }),
  column: (text) => (isColumn(text) ? text : undefined),
};

const COMMAND_ALIASES: Record<string, string> = {
  list: "show",
  ls: "show",
  board: "show",
  view: "card",
  get: "card",
  new: "add",
  create: "add",
  mv: "move",
  title: "rename",
  labels: "label",
  tag: "label",
  delete: "archive",
  remove: "archive",
  rm: "archive",
};

const COLUMN_ALIASES: Record<string, ColumnId> = {
  "to do": "todo",
  "in progress": "doing",
  inprogress: "doing",
  progress: "doing",
  wip: "doing",
  "in-progress": "doing",
  finished: "done",
  completed: "done",
  complete: "done",
};

export const forgiving: Dialect = {
  command(name, args) {
    const canonical = COMMAND_ALIASES[name.toLowerCase()] ?? name.toLowerCase();
    if (canonical === "show" && args.length === 1 && /^#?\d+$/.test(args[0]!)) return { name: "card", args };
    if ((canonical === "show" || canonical === "move") && args.length > (canonical === "move" ? 2 : 1)) {
      // A column name of several words, unquoted: `move 6 in progress`.
      const fixed = canonical === "move" ? 1 : 0;
      return { name: canonical, args: [...args.slice(0, fixed), args.slice(fixed).join(" ")] };
    }
    return { name: canonical, args };
  },

  column(text) {
    if (text === undefined) return undefined;
    const key = text.trim().toLowerCase().replace(/[_\s]+/g, " ");
    if (isColumn(key)) return key;
    if (COLUMN_ALIASES[key]) return COLUMN_ALIASES[key];
    return COLUMNS.find((c) => COLUMN_TITLES[c].toLowerCase() === key);
  },
};
