// Append-only event log in SQLite. Events are never updated or deleted, except
// by `clear`, which the harness uses to reset the board between runs.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Actor, BoardEvent, Change } from "../domain/board.ts";

interface Row {
  seq: number;
  at: string;
  actor: string;
  change: string;
}

export class EventLog {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS events (
        seq    INTEGER PRIMARY KEY AUTOINCREMENT,
        at     TEXT NOT NULL,
        actor  TEXT NOT NULL CHECK (actor IN ('human', 'agent')),
        change TEXT NOT NULL
      );
    `);
  }

  all(): BoardEvent[] {
    const rows = this.#db.prepare("SELECT seq, at, actor, change FROM events ORDER BY seq").all() as unknown as Row[];
    return rows.map(toEvent);
  }

  append(actor: Actor, change: Change): BoardEvent {
    const at = new Date().toISOString();
    const result = this.#db
      .prepare("INSERT INTO events (at, actor, change) VALUES (?, ?, ?)")
      .run(at, actor, JSON.stringify(change));
    return { seq: Number(result.lastInsertRowid), at, actor, change };
  }

  clear(): void {
    this.#db.exec("DELETE FROM events; DELETE FROM sqlite_sequence WHERE name = 'events';");
  }

  close(): void {
    this.#db.close();
  }
}

function toEvent(row: Row): BoardEvent {
  return { seq: row.seq, at: row.at, actor: row.actor as Actor, change: JSON.parse(row.change) as Change };
}
