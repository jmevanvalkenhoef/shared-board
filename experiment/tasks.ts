// Tasks for the agent. Each starts from the demo seed and is graded by
// comparing the board before and after: a list of problems, empty on success.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Board, Card, ColumnId } from "../src/domain/board.ts";
import { parseSeed } from "../src/server/board-service.ts";
import type { SeedStep } from "../src/server/board-service.ts";

export interface Task {
  id: string;
  prompt: string;
  seed: SeedStep[];
  check(before: Board, after: Board): string[];
}

export function loadTasks(root: string): Task[] {
  const demo = parseSeed(JSON.parse(readFileSync(join(root, "seeds", "demo.json"), "utf8")));
  return [
    {
      id: "bugs-to-doing",
      prompt: "Move every bug that is in Todo to In progress.",
      seed: demo,
      check: (before, after) => [
        ...inColumn(after, [4, 6], "doing"),
        ...unchangedExcept(before, after, [4, 6]),
      ],
    },
  ];
}

function inColumn(board: Board, ids: number[], column: ColumnId): string[] {
  return ids.filter((id) => board.cards[id]?.column !== column || board.cards[id]?.archived).map((id) => `#${id} is not in ${column}`);
}

/** Every card not in `ids` keeps its column, title, labels and description, and no cards appear. */
function unchangedExcept(before: Board, after: Board, ids: number[]): string[] {
  const problems: string[] = [];
  for (const card of Object.values(after.cards)) {
    if (ids.includes(card.id)) continue;
    const was = before.cards[card.id];
    if (!was) problems.push(`#${card.id} "${card.title}" was added`);
    else if (!same(was, card)) problems.push(`#${card.id} was changed`);
  }
  return problems;
}

function same(a: Card, b: Card): boolean {
  return (
    a.column === b.column &&
    a.title === b.title &&
    a.description === b.description &&
    a.archived === b.archived &&
    a.labels.join() === b.labels.join()
  );
}
