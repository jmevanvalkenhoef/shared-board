// What the CLI prints. Each style turns the same results into text; the
// commands themselves don't know which style is in use.

import type { Board, BoardEvent, Card, ColumnId } from "../domain/board.ts";
import type { ApiError } from "./client.ts";

export interface Style {
  board(board: Board, column?: ColumnId): string;
  card(card: Card): string;
  changed(event: BoardEvent, board: Board): string;
  error(error: ApiError, board?: Board): string;
  usage(problem?: string): string;
}
