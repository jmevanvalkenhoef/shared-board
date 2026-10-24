// Building blocks for grading. Each returns a list of problems, empty when the
// board is as expected.

import type { Board, Card, ColumnId } from "../src/domain/board.ts";

export function inColumn(board: Board, ids: number[], column: ColumnId): string[] {
  return ids
    .filter((id) => board.cards[id]?.column !== column || board.cards[id]?.archived)
    .map((id) => `#${id} is not in ${column}`);
}

export function order(board: Board, column: ColumnId, ids: number[]): string[] {
  const actual = board.columns[column];
  return actual.join() === ids.join() ? [] : [`${column} is ${fmt(actual)}, expected ${fmt(ids)}`];
}

export function archived(board: Board, ids: number[]): string[] {
  return ids.filter((id) => !board.cards[id]?.archived).map((id) => `#${id} is not archived`);
}

export function labels(board: Board, id: number, expected: string[]): string[] {
  const actual = board.cards[id]?.labels ?? [];
  return actual.join() === [...expected].sort().join() ? [] : [`#${id} has labels [${actual}], expected [${[...expected].sort()}]`];
}

export function added(before: Board, after: Board): Card[] {
  return Object.values(after.cards).filter((card) => !before.cards[card.id]);
}

/** One new card with this title (ignoring case, quotes and a final full stop), in `column`, with exactly `labelList`. */
export function addedCard(before: Board, after: Board, title: string, column: ColumnId, labelList: string[]): string[] {
  const card = added(before, after).find((c) => sameText(c.title, title));
  if (!card) return [`no new card "${title}"`];
  return [...inColumn(after, [card.id], column), ...labels(after, card.id, labelList)];
}

/**
 * Cards outside `ids` keep their column, title, labels, description and
 * archived state, and no cards are added beyond `allowAdded`.
 */
export function unchangedExcept(before: Board, after: Board, ids: number[], allowAdded = 0): string[] {
  const problems: string[] = [];
  for (const card of Object.values(before.cards)) {
    if (ids.includes(card.id)) continue;
    const now = after.cards[card.id]!;
    if (!same(card, now)) problems.push(`#${card.id} was changed`);
  }
  const extra = added(before, after).length - allowAdded;
  if (extra > 0) problems.push(`${extra} card${extra === 1 ? "" : "s"} added that should not be`);
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

/** Equal, ignoring case, surrounding quotes and a final full stop. */
export function sameText(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/^["']|["']$/g, "").replace(/\.$/, "").toLowerCase();
  return norm(a) === norm(b);
}

function fmt(ids: number[]): string {
  return `[${ids.map((id) => `#${id}`).join(" ")}]`;
}
