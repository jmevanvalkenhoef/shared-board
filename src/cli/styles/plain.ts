// The terse style: short tables, bare errors, minimal help.

import { COLUMNS, COLUMN_TITLES } from "../../domain/board.ts";
import type { Board, Card, ColumnId } from "../../domain/board.ts";
import type { Style } from "../style.ts";

const USAGE = `usage: board <command> [args]

  show [column]
  card <id>
  add <title> [--column C] [--label L]...
  move <id> <column> [--position N]
  rename <id> <title>
  describe <id> <text>
  label <id> [label]...
  archive <id>

columns: ${COLUMNS.join(", ")}`;

export const plain: Style = {
  board(board, column) {
    const columns: readonly ColumnId[] = column ? [column] : COLUMNS;
    return columns
      .map((c) => {
        const ids = board.columns[c];
        const rows = ids.map((id) => row(board.cards[id]!));
        return [`${COLUMN_TITLES[c].toUpperCase()} (${ids.length})`, ...rows].join("\n");
      })
      .join("\n\n");
  },

  card(card) {
    const lines = [`#${card.id} ${card.title}`, `column: ${card.column}`];
    if (card.labels.length) lines.push(`labels: ${card.labels.join(", ")}`);
    if (card.archived) lines.push("archived");
    if (card.description) lines.push("", card.description);
    return lines.join("\n");
  },

  changed() {
    return "ok";
  },

  error(error) {
    return `error: ${error.code ?? error.message}`;
  },

  usage(problem) {
    return problem ? `error: ${problem}` : USAGE;
  },
};

function row(card: Card): string {
  const labels = card.labels.length ? `  [${card.labels.join(", ")}]` : "";
  return `  #${card.id}  ${card.title}${labels}`;
}
