// Draws the board. Card elements are kept between updates, so a card that
// changes place can be animated from where it was to where it is now.

import { COLUMNS, COLUMN_TITLES } from "../src/domain/board.ts";
import type { Card, ColumnId } from "../src/domain/board.ts";
import type { Update } from "./api.ts";

const MOVE_MS = 280;

export class BoardView {
  readonly #lists = new Map<ColumnId, HTMLElement>();
  readonly #counts = new Map<ColumnId, HTMLElement>();
  readonly #cards = new Map<number, HTMLElement>();
  readonly #still = matchMedia("(prefers-reduced-motion: reduce)");

  constructor(root: HTMLElement) {
    for (const column of COLUMNS) {
      const section = el("section", "column");
      section.dataset.column = column;
      const head = el("header", "column-head");
      const title = el("h2", "", COLUMN_TITLES[column]);
      const count = el("span", "count");
      head.append(title, count);
      const list = el("div", "cards");
      list.dataset.column = column;
      list.setAttribute("aria-label", COLUMN_TITLES[column]);
      section.append(head, list);
      root.append(section);
      this.#lists.set(column, list);
      this.#counts.set(column, count);
    }
    setInterval(() => this.#refreshTimes(), 30_000);
  }

  list(column: ColumnId): HTMLElement {
    return this.#lists.get(column)!;
  }

  render({ board, event }: Update): void {
    const before = new Map([...this.#cards].map(([id, node]) => [id, node.getBoundingClientRect()]));
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.card : undefined;

    const shown = new Set<number>();
    for (const column of COLUMNS) {
      const list = this.#lists.get(column)!;
      const ids = board.columns[column];
      for (const id of ids) {
        this.#card(board.cards[id]!);
        shown.add(id);
      }
      this.#order(list, ids);
      this.#counts.get(column)!.textContent = String(ids.length);
    }
    for (const [id, node] of this.#cards) {
      if (!shown.has(id)) {
        node.remove();
        this.#cards.delete(id);
      }
    }

    if (focused) this.#cards.get(Number(focused))?.focus({ preventScroll: true });
    if (before.size && !this.#still.matches) this.#animate(before);
    if (event?.actor === "agent") this.#flash(event.change.card);
  }

  #card(card: Card): HTMLElement {
    let node = this.#cards.get(card.id);
    if (!node) {
      node = el("article", "card");
      node.dataset.card = String(card.id);
      node.tabIndex = 0;
      node.draggable = true;
      const title = el("p", "title");
      const labels = el("ul", "labels");
      const foot = el("footer", "meta");
      const archive = el("button", "archive", "×");
      archive.type = "button";
      archive.setAttribute("aria-label", `Archive card ${card.id}`);
      foot.append(el("span", "id", `#${card.id}`), el("span", "who"), el("time"), archive);
      node.append(title, labels, foot);
      this.#cards.set(card.id, node);
    }

    node.dataset.actor = card.touchedBy;
    node.querySelector(".title")!.textContent = card.title;
    node.querySelector(".labels")!.replaceChildren(...card.labels.map((l) => el("li", "", l)));
    node.querySelector(".who")!.textContent = card.touchedBy === "agent" ? "agent" : "you";
    const time = node.querySelector("time")!;
    time.dateTime = card.touchedAt;
    time.textContent = ago(card.touchedAt);
    return node;
  }

  /** Puts the column's cards in order, taking them from other columns if needed. */
  #order(list: HTMLElement, ids: number[]): void {
    ids.forEach((id, i) => {
      const node = this.#cards.get(id)!;
      if (list.children[i] !== node) list.insertBefore(node, list.children[i] ?? null);
    });
  }

  #animate(before: Map<number, DOMRect>): void {
    for (const [id, node] of this.#cards) {
      const was = before.get(id);
      if (!was) {
        node.animate([{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: MOVE_MS, easing: "ease-out" });
        continue;
      }
      const now = node.getBoundingClientRect();
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (dx || dy) {
        node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: MOVE_MS, easing: "cubic-bezier(.2,.7,.3,1)" });
      }
    }
  }

  #flash(id: number): void {
    const node = this.#cards.get(id);
    if (!node) return;
    node.classList.remove("flash");
    void node.offsetWidth; // restart the animation
    node.classList.add("flash");
  }

  #refreshTimes(): void {
    for (const time of document.querySelectorAll<HTMLTimeElement>(".card time")) time.textContent = ago(time.dateTime);
  }
}

function ago(iso: string): string {
  const seconds = (Date.now() - Date.parse(iso)) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
