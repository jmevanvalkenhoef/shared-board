// A throwaway board for one run: in-memory log, seeded, served on a free port.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { EventLog } from "../src/store/event-log.ts";
import { BoardService } from "../src/server/board-service.ts";
import type { SeedStep } from "../src/server/board-service.ts";
import { createHandler } from "../src/server/http.ts";

export interface Sandbox {
  url: string;
  service: BoardService;
  close(): Promise<void>;
}

export async function startSandbox(root: string, seed: SeedStep[]): Promise<Sandbox> {
  const log = new EventLog(":memory:");
  const service = new BoardService(log);
  service.reset(seed);

  const server = createServer(createHandler(service, root));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    service,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          log.close();
          resolve();
        });
      }),
  };
}
