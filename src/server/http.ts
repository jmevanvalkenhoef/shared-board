// HTTP API and live updates. Routes translate between HTTP and the board
// service; they hold no board logic of their own.

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Actor } from "../domain/board.ts";
import { CommandError, parseCommand } from "../domain/commands.ts";
import { parseSeed } from "./board-service.ts";
import type { BoardService, Update } from "./board-service.ts";
import { serveStatic } from "./static.ts";

const BODY_LIMIT = 64 * 1024;

export function createHandler(service: BoardService, root: string) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "POST" && !sameOrigin(req)) return send(res, 403, { error: { message: "cross-origin request" } });

      if (url.pathname === "/api/board" && req.method === "GET") return send(res, 200, { board: service.board });
      if (url.pathname === "/api/stream" && req.method === "GET") return stream(service, req, res);

      if (url.pathname === "/api/commands" && req.method === "POST") {
        const body = await readJson(req);
        const event = service.execute(actor(body.actor), parseCommand(body.command));
        return send(res, 200, { event, board: service.board });
      }
      if (url.pathname === "/api/reset" && req.method === "POST") {
        const body = await readJson(req);
        service.reset(parseSeed(body.seed));
        return send(res, 200, { board: service.board });
      }

      if (req.method === "GET" && (await serveStatic(root, url.pathname, res))) return;
      send(res, 404, { error: { message: "not found" } });
    } catch (err) {
      if (err instanceof CommandError) {
        return send(res, 422, { error: { code: err.code, message: err.message, card: err.card } });
      }
      if (err instanceof BadRequest) return send(res, 400, { error: { message: err.message } });
      console.error(err);
      send(res, 500, { error: { message: "internal error" } });
    }
  };
}

function stream(service: BoardService, req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const push = (update: Update) => res.write(`data: ${JSON.stringify(update)}\n\n`);
  push({ board: service.board });
  const unsubscribe = service.subscribe(push);
  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
}

class BadRequest extends Error {}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > BODY_LIMIT) throw new BadRequest("body too large");
    chunks.push(chunk as Buffer);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof value !== "object" || value === null) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new BadRequest("body must be a JSON object");
  }
}

function actor(value: unknown): Actor {
  if (value === "human" || value === "agent") return value;
  throw new BadRequest('actor must be "human" or "agent"');
}

/** Browsers send Origin on cross-site POSTs; the CLI sends none. */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  return origin === undefined || origin === `http://${req.headers.host}`;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
