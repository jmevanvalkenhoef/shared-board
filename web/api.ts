// The page's connection to the server: live updates in, commands out.

import type { Board, BoardEvent } from "../src/domain/board.ts";
import type { Command } from "../src/domain/commands.ts";

export interface Update {
  board: Board;
  event?: BoardEvent;
}

export function subscribe(onUpdate: (update: Update) => void, onStatus: (live: boolean) => void): void {
  const source = new EventSource("/api/stream");
  source.onopen = () => onStatus(true);
  source.onerror = () => onStatus(false);
  source.onmessage = (message) => onUpdate(JSON.parse(message.data as string) as Update);
}

/** Resolves with an error message, or undefined when the command was applied. */
export async function send(command: Command): Promise<string | undefined> {
  try {
    const res = await fetch("/api/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor: "human", command }),
    });
    if (res.ok) return undefined;
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? `request failed (${res.status})`;
  } catch {
    return "cannot reach the board";
  }
}
