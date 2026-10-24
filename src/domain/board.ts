// The board is a fold over an append-only list of events. This module is pure:
// it runs unchanged on the server and in the browser.

export const COLUMNS = ["backlog", "todo", "doing", "done"] as const;
export type ColumnId = (typeof COLUMNS)[number];

export const COLUMN_TITLES: Record<ColumnId, string> = {
  backlog: "Backlog",
  todo: "Todo",
  doing: "In progress",
  done: "Done",
};

export type Actor = "human" | "agent";

export type Change =
  | { type: "created"; card: number; title: string; column: ColumnId; labels: string[] }
  | { type: "moved"; card: number; column: ColumnId; index: number }
  | { type: "renamed"; card: number; title: string }
  | { type: "described"; card: number; description: string }
  | { type: "labelled"; card: number; labels: string[] }
  | { type: "archived"; card: number };

export interface BoardEvent {
  seq: number;
  at: string;
  actor: Actor;
  change: Change;
}

export interface Card {
  id: number;
  title: string;
  description: string;
  labels: string[];
  column: ColumnId;
  archived: boolean;
  touchedBy: Actor;
  touchedAt: string;
}

export interface Board {
  cards: Record<number, Card>;
  columns: Record<ColumnId, number[]>;
  lastSeq: number;
}

export function emptyBoard(): Board {
  return { cards: {}, columns: { backlog: [], todo: [], doing: [], done: [] }, lastSeq: 0 };
}

export function isColumn(value: unknown): value is ColumnId {
  return typeof value === "string" && (COLUMNS as readonly string[]).includes(value);
}

export function nextCardId(board: Board): number {
  const ids = Object.keys(board.cards).map(Number);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

export function fold(events: Iterable<BoardEvent>, board: Board = emptyBoard()): Board {
  for (const event of events) board = apply(board, event);
  return board;
}

/** Returns a new board with the event applied; the input is left untouched. */
export function apply(board: Board, event: BoardEvent): Board {
  const { change, actor, at } = event;
  const touched = { touchedBy: actor, touchedAt: at };
  const next: Board = { cards: { ...board.cards }, columns: { ...board.columns }, lastSeq: event.seq };

  if (change.type === "created") {
    next.cards[change.card] = {
      id: change.card,
      title: change.title,
      description: "",
      labels: change.labels,
      column: change.column,
      archived: false,
      ...touched,
    };
    next.columns[change.column] = [...next.columns[change.column], change.card];
    return next;
  }

  const card = next.cards[change.card];
  if (!card) return next;

  switch (change.type) {
    case "moved": {
      removeFrom(next.columns, card);
      const list = [...next.columns[change.column]];
      list.splice(clamp(change.index, 0, list.length), 0, card.id);
      next.columns[change.column] = list;
      next.cards[card.id] = { ...card, column: change.column, ...touched };
      break;
    }
    case "renamed":
      next.cards[card.id] = { ...card, title: change.title, ...touched };
      break;
    case "described":
      next.cards[card.id] = { ...card, description: change.description, ...touched };
      break;
    case "labelled":
      next.cards[card.id] = { ...card, labels: change.labels, ...touched };
      break;
    case "archived":
      removeFrom(next.columns, card);
      next.cards[card.id] = { ...card, archived: true, ...touched };
      break;
  }
  return next;
}

function removeFrom(columns: Record<ColumnId, number[]>, card: Card): void {
  columns[card.column] = columns[card.column].filter((id) => id !== card.id);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}
