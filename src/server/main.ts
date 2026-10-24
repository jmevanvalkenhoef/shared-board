// Starts the board server: one event log, one board service, HTTP on localhost.
//   BOARD_PORT (4321)  BOARD_DB (data/board.sqlite)  BOARD_SEED (seeds/demo.json, used when the log is empty)

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EventLog } from "../store/event-log.ts";
import { BoardService, parseSeed } from "./board-service.ts";
import { createHandler } from "./http.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const port = Number(process.env.BOARD_PORT ?? 4321);
const dbPath = process.env.BOARD_DB ?? join(root, "data", "board.sqlite");
const seedPath = process.env.BOARD_SEED ?? join(root, "seeds", "demo.json");

const service = new BoardService(new EventLog(dbPath));
if (service.board.lastSeq === 0) {
  service.reset(parseSeed(JSON.parse(readFileSync(seedPath, "utf8"))));
}

createServer(createHandler(service, root)).listen(port, "127.0.0.1", () => {
  console.log(`board on http://localhost:${port}`);
});
