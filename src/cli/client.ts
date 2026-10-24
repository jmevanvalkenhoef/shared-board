// HTTP client for the board server.

import type { Actor, Board, BoardEvent } from "../domain/board.ts";
import type { Command } from "../domain/commands.ts";

export interface ApiError {
  code?: string;
  message: string;
  card?: number;
}

export class RequestFailed extends Error {
  readonly error: ApiError;

  constructor(error: ApiError) {
    super(error.message);
    this.error = error;
  }
}

export class Unreachable extends Error {}

export class BoardClient {
  readonly #url: string;
  readonly #actor: Actor;

  constructor(url: string, actor: Actor) {
    this.#url = url.replace(/\/$/, "");
    this.#actor = actor;
  }

  async board(): Promise<Board> {
    const body = (await this.#request("GET", "/api/board")) as { board: Board };
    return body.board;
  }

  async run(command: Command): Promise<{ event: BoardEvent; board: Board }> {
    return (await this.#request("POST", "/api/commands", { actor: this.#actor, command })) as {
      event: BoardEvent;
      board: Board;
    };
  }

  async #request(method: string, path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(this.#url + path, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Unreachable(`cannot reach the board at ${this.#url}`);
    }
    const json = (await res.json()) as { error?: ApiError };
    if (!res.ok) throw new RequestFailed(json.error ?? { message: `HTTP ${res.status}` });
    return json;
  }
}
