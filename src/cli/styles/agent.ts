// The agent-friendly style: help with exact rules and examples, results that
// say what changed, and errors that say what to do next.

import { COLUMNS, COLUMN_TITLES } from "../../domain/board.ts";
import type { Board, BoardEvent, Card, ColumnId } from "../../domain/board.ts";
import type { ApiError } from "../client.ts";
import type { Style } from "../style.ts";

const COLUMN_LIST = COLUMNS.map((c) => `${c} = ${COLUMN_TITLES[c]}`).join(", ");

const USAGE = `board: read and change the kanban board. People see every change as it happens.

Commands
  board show [column]              list the cards in every column, or in one
  board card <id>                  one card in full, including its description
  board add <title> [--column C] [--label L]...
                                   add a card (default column: backlog)
  board move <id> <column> [--position N]
                                   move a card; N counts from 1 (the top); default: the bottom
  board rename <id> <title>        change a card's title
  board describe <id> <text>       replace a card's description
  board label <id> [label]...      replace ALL labels of a card: list the ones to keep too;
                                   no labels removes them all
  board archive <id>               take a card off the board

Columns (use the id): ${COLUMN_LIST}
Card ids can be written as 12 or #12. Titles and text need no quotes.

Examples
  board show todo
  board move 12 doing --position 1
  board add Fix the login timeout --column todo --label bug
  board label 12 bug urgent        (card 12 now has exactly: bug, urgent)`;

export const agent: Style = {
  board(board, column) {
    const columns: readonly ColumnId[] = column ? [column] : COLUMNS;
    return columns.map((c) => section(board, c)).join("\n\n");
  },

  card(card) {
    const lines = [
      `#${card.id} ${card.title}`,
      card.archived ? "status: archived (not on the board)" : `column: ${place(card)}`,
      `labels: ${card.labels.length ? card.labels.join(", ") : "none"}`,
      `last changed by: ${card.touchedBy === "agent" ? "the agent" : "a person"}`,
      "",
      card.description ? `description:\n${card.description}` : "description: none",
    ];
    return lines.join("\n");
  },

  changed(event, board) {
    return describe(event, board);
  },

  error(error, board) {
    const card = error.card !== undefined ? board?.cards[error.card] : undefined;
    switch (error.code) {
      case "no-such-card":
        return `error: there is no card #${error.card}. Run "board show" to see all cards and their ids.`;
      case "archived":
        return `error: card #${error.card}${card ? ` "${card.title}"` : ""} is archived and can't be changed.`;
      default:
        return `error: ${error.message}. Run "board help" for the exact syntax.`;
    }
  },

  usage(problem) {
    return problem ? `error: ${problem}\n\n${USAGE}` : USAGE;
  },
};

function section(board: Board, column: ColumnId): string {
  const ids = board.columns[column];
  const head = `${COLUMN_TITLES[column]} (id: ${column}), ${ids.length} card${ids.length === 1 ? "" : "s"}`;
  if (!ids.length) return `${head}\n  (empty)`;
  return [head, ...ids.map((id, i) => row(board.cards[id]!, i + 1))].join("\n");
}

function row(card: Card, position: number): string {
  const parts = [`  ${position}. #${card.id} ${card.title}`];
  if (card.labels.length) parts.push(`labels: ${card.labels.join(", ")}`);
  if (card.description) parts.push(`has a description (board card ${card.id})`);
  return parts.join("  |  ");
}

function place(card: Card): string {
  return `${COLUMN_TITLES[card.column]} (${card.column})`;
}

function describe({ change }: BoardEvent, board: Board): string {
  const card = board.cards[change.card]!;
  const name = `#${card.id} "${card.title}"`;
  switch (change.type) {
    case "created":
      return `created ${name} in ${place(card)}${card.labels.length ? `, labels: ${card.labels.join(", ")}` : ""}`;
    case "moved": {
      const ids = board.columns[card.column];
      return `moved ${name} to ${place(card)}, position ${ids.indexOf(card.id) + 1} of ${ids.length}`;
    }
    case "renamed":
      return `renamed #${card.id} to "${card.title}"`;
    case "described":
      return `set the description of ${name}`;
    case "labelled":
      return `labels of ${name} are now: ${card.labels.length ? card.labels.join(", ") : "none"}`;
    case "archived":
      return `archived ${name}; it is no longer on the board`;
  }
}
