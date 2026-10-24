// Owns the current board: checks commands, records their changes and tells
// subscribers. The only writer to the event log.

import { apply, emptyBoard, fold } from "../domain/board.ts";
import type { Actor, Board, BoardEvent } from "../domain/board.ts";
import { CommandError, decide, parseCommand } from "../domain/commands.ts";
import type { Command } from "../domain/commands.ts";
import type { EventLog } from "../store/event-log.ts";

export interface Update {
  board: Board;
  event?: BoardEvent;
}

export type SeedStep = { actor: Actor; command: Command };

type Listener = (update: Update) => void;

/** Validates untrusted input (a seed file or request body) into seed steps. */
export function parseSeed(value: unknown): SeedStep[] {
  if (!Array.isArray(value)) throw new CommandError("invalid", "seed must be a list of steps");
  return value.map((step: { actor?: unknown; command?: unknown }) => {
    const actor = step.actor ?? "human";
    if (actor !== "human" && actor !== "agent") throw new CommandError("invalid", 'actor must be "human" or "agent"');
    return { actor, command: parseCommand(step.command) };
  });
}

export class BoardService {
  readonly #log: EventLog;
  readonly #listeners = new Set<Listener>();
  #board: Board;

  constructor(log: EventLog) {
    this.#log = log;
    this.#board = fold(log.all());
  }

  get board(): Board {
    return this.#board;
  }

  /** Throws CommandError if the command does not apply to the current board. */
  execute(actor: Actor, command: Command): BoardEvent {
    const change = decide(this.#board, command);
    const event = this.#log.append(actor, change);
    this.#board = apply(this.#board, event);
    this.#publish({ board: this.#board, event });
    return event;
  }

  /**
   * Replaces the log with the seed's changes, as one update to subscribers.
   * The whole seed is checked first, so a bad seed leaves the board as it was.
   */
  reset(seed: SeedStep[]): void {
    let draft = emptyBoard();
    const changes = seed.map(({ actor, command }, i) => {
      const change = decide(draft, command);
      draft = apply(draft, { seq: i + 1, at: "", actor, change });
      return { actor, change };
    });

    this.#log.clear();
    let board = emptyBoard();
    for (const { actor, change } of changes) board = apply(board, this.#log.append(actor, change));
    this.#board = board;
    this.#publish({ board });
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #publish(update: Update): void {
    for (const listener of this.#listeners) listener(update);
  }
}
