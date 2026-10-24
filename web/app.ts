// Wires the page together: live updates go to the view, gestures go to the server.

import { emptyBoard } from "../src/domain/board.ts";
import type { Board } from "../src/domain/board.ts";
import { send, subscribe } from "./api.ts";
import { bind } from "./interactions.ts";
import { BoardView } from "./view.ts";

const root = document.getElementById("board")!;
const status = document.getElementById("status")!;
const notice = document.getElementById("notice")!;

const view = new BoardView(root);
let board: Board = emptyBoard();
let noticeTimer: number | undefined;

subscribe(
  (update) => {
    board = update.board;
    view.render(update);
  },
  (live) => {
    status.dataset.live = String(live);
    status.textContent = live ? "live" : "reconnecting";
  },
);

bind(root, view, {
  board: () => board,
  send: async (command) => {
    const error = await send(command);
    if (error) show(error);
  },
});

function show(message: string): void {
  notice.textContent = message;
  notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (notice.hidden = true), 4000);
}

document.getElementById("theme")!.addEventListener("click", () => {
  const html = document.documentElement;
  const dark = html.dataset.theme ? html.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  html.dataset.theme = dark ? "light" : "dark";
});
