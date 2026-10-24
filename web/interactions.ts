// Turns what the person does on the page into commands. Drawing stays in the
// view: a command's effect shows up when the server sends the new board back.

import { COLUMNS, isColumn } from "../src/domain/board.ts";
import type { Board, ColumnId } from "../src/domain/board.ts";
import type { Command } from "../src/domain/commands.ts";
import type { BoardView } from "./view.ts";

export interface Handlers {
  board(): Board;
  send(command: Command): void;
}

export function bind(root: HTMLElement, view: BoardView, handlers: Handlers): void {
  bindDrag(root, handlers);
  bindKeys(root, handlers);
  bindEditing(root, handlers);
  bindAdding(view, handlers);
}

function bindDrag(root: HTMLElement, { board, send }: Handlers): void {
  const marker = document.createElement("div");
  marker.className = "drop-marker";
  let dragged: number | undefined;

  root.addEventListener("dragstart", (e) => {
    const card = cardOf(e.target);
    if (!card) return;
    dragged = Number(card.dataset.card);
    card.classList.add("dragging");
    e.dataTransfer?.setData("text/plain", String(dragged));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  });

  root.addEventListener("dragend", (e) => {
    cardOf(e.target)?.classList.remove("dragging");
    marker.remove();
    dragged = undefined;
  });

  root.addEventListener("dragover", (e) => {
    const list = listOf(e.target);
    if (!list || dragged === undefined) return;
    e.preventDefault();
    const index = dropIndex(list, e.clientY);
    const others = [...list.querySelectorAll<HTMLElement>(".card:not(.dragging)")];
    list.insertBefore(marker, others[index] ?? null);
  });

  root.addEventListener("drop", (e) => {
    const list = listOf(e.target);
    if (!list || dragged === undefined) return;
    e.preventDefault();
    const column = list.dataset.column;
    const index = dropIndex(list, e.clientY);
    marker.remove();
    if (!isColumn(column)) return;
    const unchanged = board().cards[dragged]?.column === column && board().columns[column].indexOf(dragged) === index;
    if (!unchanged) send({ type: "move", card: dragged, column, index });
  });
}

/** Where in the list a drop at height y lands, counting the other cards only. */
function dropIndex(list: HTMLElement, y: number): number {
  const others = [...list.querySelectorAll<HTMLElement>(".card:not(.dragging)")];
  const i = others.findIndex((node) => {
    const r = node.getBoundingClientRect();
    return y < r.top + r.height / 2;
  });
  return i === -1 ? others.length : i;
}

function bindKeys(root: HTMLElement, { board, send }: Handlers): void {
  root.addEventListener("keydown", (e) => {
    const node = e.target instanceof HTMLElement && e.target.classList.contains("card") ? e.target : undefined;
    if (!node) return;
    const id = Number(node.dataset.card);
    const card = board().cards[id];
    if (!card) return;
    const ids = board().columns[card.column];
    const at = ids.indexOf(id);
    const col = COLUMNS.indexOf(card.column);

    const move = (column: ColumnId, index: number) => {
      e.preventDefault();
      send({ type: "move", card: id, column, index });
    };
    if (e.key === "ArrowLeft" && col > 0) move(COLUMNS[col - 1]!, board().columns[COLUMNS[col - 1]!].length);
    else if (e.key === "ArrowRight" && col < COLUMNS.length - 1) move(COLUMNS[col + 1]!, board().columns[COLUMNS[col + 1]!].length);
    else if (e.key === "ArrowUp" && e.altKey && at > 0) move(card.column, at - 1);
    else if (e.key === "ArrowDown" && e.altKey && at < ids.length - 1) move(card.column, at + 1);
    else if (e.key === "ArrowUp" && at > 0) focusCard(root, ids[at - 1]!, e);
    else if (e.key === "ArrowDown" && at < ids.length - 1) focusCard(root, ids[at + 1]!, e);
    else if (e.key === "Enter") {
      e.preventDefault();
      edit(node.querySelector<HTMLElement>(".title")!, (title) => send({ type: "rename", card: id, title }));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      send({ type: "archive", card: id });
    }
  });
}

function focusCard(root: HTMLElement, id: number, e: KeyboardEvent): void {
  e.preventDefault();
  root.querySelector<HTMLElement>(`.card[data-card="${id}"]`)?.focus();
}

function bindEditing(root: HTMLElement, { send }: Handlers): void {
  root.addEventListener("dblclick", (e) => {
    const title = e.target instanceof HTMLElement && e.target.classList.contains("title") ? e.target : undefined;
    const card = cardOf(title);
    if (title && card) edit(title, (text) => send({ type: "rename", card: Number(card.dataset.card), title: text }));
  });

  root.addEventListener("click", (e) => {
    if (!(e.target instanceof HTMLElement) || !e.target.classList.contains("archive")) return;
    const card = cardOf(e.target);
    if (card) send({ type: "archive", card: Number(card.dataset.card) });
  });
}

/** Makes an element editable in place; Enter saves, Escape or leaving cancels. */
function edit(node: HTMLElement, save: (text: string) => void): void {
  const original = node.textContent ?? "";
  const card = cardOf(node);
  node.contentEditable = "plaintext-only";
  if (card) card.draggable = false;
  node.focus();
  getSelection()?.selectAllChildren(node);

  const finish = (keep: boolean) => {
    node.removeEventListener("keydown", onKey);
    node.removeEventListener("blur", onBlur);
    node.contentEditable = "false";
    if (card) {
      card.draggable = true;
      card.focus();
    }
    const text = (node.textContent ?? "").trim();
    if (keep && text && text !== original) save(text);
    else node.textContent = original;
  };
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") finish(false);
  };
  const onBlur = () => finish(false);
  node.addEventListener("keydown", onKey);
  node.addEventListener("blur", onBlur);
}

function bindAdding(view: BoardView, { send }: Handlers): void {
  for (const column of COLUMNS) {
    const form = document.createElement("form");
    form.className = "add";
    const input = document.createElement("input");
    input.name = "title";
    input.placeholder = "Add a card";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "New card title");
    form.append(input);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) return;
      send({ type: "create", title, column });
      input.value = "";
    });
    view.list(column).after(form);
  }
}

function cardOf(target: EventTarget | null | undefined): HTMLElement | undefined {
  return target instanceof Element ? (target.closest<HTMLElement>(".card") ?? undefined) : undefined;
}

function listOf(target: EventTarget | null): HTMLElement | undefined {
  return target instanceof Element ? (target.closest<HTMLElement>(".column")?.querySelector<HTMLElement>(".cards") ?? undefined) : undefined;
}
