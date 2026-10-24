// The tasks. Most start from seeds/experiment.json (15 cards); the "large"
// ones from seeds/large.json (44 cards), where the answer depends on what the
// descriptions say. `level` is my guess at the difficulty before any runs; the
// model estimates its own. `solution` is one correct sequence of CLI calls,
// used to test the checks (experiment/test-tasks.ts).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Board, Card } from "../src/domain/board.ts";
import { parseSeed } from "../src/server/board-service.ts";
import type { SeedStep } from "../src/server/board-service.ts";
import { addedCard, archived, inColumn, labels, order, unchangedExcept } from "./checks.ts";

export interface Task {
  id: string;
  level: "easy" | "medium" | "hard" | "large";
  prompt: string;
  seed: SeedStep[];
  check(before: Board, after: Board): string[];
  solution: string[][];
}

type Spec = Omit<Task, "seed"> & { board?: "large" };

const SPECS: Spec[] = [
  {
    id: "bugs-to-doing",
    level: "easy",
    prompt: "Move every bug that is in Todo to In progress.",
    check: (b, a) => [...inColumn(a, [5, 7, 8], "doing"), ...unchangedExcept(b, a, [5, 7, 8])],
    solution: [["move", "5", "doing"], ["move", "7", "doing"], ["move", "8", "doing"]],
  },
  {
    id: "add-card",
    level: "easy",
    prompt: 'Add a card called "Upgrade the database driver" to Todo, labelled chore.',
    check: (b, a) => [...addedCard(b, a, "Upgrade the database driver", "todo", ["chore"]), ...unchangedExcept(b, a, [], 1)],
    solution: [["add", "Upgrade the database driver", "--column", "todo", "--label", "chore"]],
  },
  {
    id: "move-by-title",
    level: "easy",
    prompt: 'Move "Write the install guide" to In progress.',
    check: (b, a) => [...inColumn(a, [6], "doing"), ...unchangedExcept(b, a, [6])],
    solution: [["move", "6", "doing"]],
  },
  {
    id: "add-label",
    level: "medium",
    prompt: "Add the label urgent to card #5, keeping its other labels.",
    check: (b, a) => [...labels(a, 5, ["bug", "security", "urgent"]), ...unchangedExcept(b, a, [5])],
    solution: [["label", "5", "bug", "security", "urgent"]],
  },
  {
    id: "to-top",
    level: "medium",
    prompt: 'Make "Login page loads slowly on mobile" the top card in Todo.',
    check: (b, a) => [...order(a, "todo", [8, 5, 6, 7]), ...unchangedExcept(b, a, [8])],
    solution: [["move", "8", "todo", "--position", "1"]],
  },
  {
    id: "second-position",
    level: "medium",
    prompt: 'Move "Search cards by title" to Todo, as the second card from the top.',
    check: (b, a) => [...order(a, "todo", [5, 4, 6, 7, 8]), ...unchangedExcept(b, a, [4])],
    solution: [["move", "4", "todo", "--position", "2"]],
  },
  {
    id: "archive-done-except",
    level: "medium",
    prompt: "Archive every card in Done except the one about continuous integration.",
    check: (b, a) => [...archived(a, [13, 14]), ...inColumn(a, [12], "done"), ...unchangedExcept(b, a, [13, 14])],
    solution: [["archive", "13"], ["archive", "14"]],
  },
  {
    id: "dependency",
    level: "hard",
    prompt: "Card #9 depends on another card, as its description explains. Move that other card to Done.",
    check: (b, a) => [...inColumn(a, [10], "done"), ...unchangedExcept(b, a, [10])],
    solution: [["move", "10", "done"]],
  },
  {
    id: "split-card",
    level: "hard",
    prompt:
      'Card #11 describes two problems. Replace it with two cards in the same column, one per problem: "Card titles overflow on narrow screens" and "Card labels overflow on narrow screens", each with the same labels as #11. Then archive #11.',
    check: (b, a) => [
      ...addedCard(b, a, "Card titles overflow on narrow screens", "doing", ["bug", "design"]),
      ...addedCard(b, a, "Card labels overflow on narrow screens", "doing", ["bug", "design"]),
      ...archived(a, [11]),
      ...unchangedExcept(b, a, [11], 2),
    ],
    solution: [
      ["add", "Card titles overflow on narrow screens", "--column", "doing", "--label", "bug", "--label", "design"],
      ["add", "Card labels overflow on narrow screens", "--column", "doing", "--label", "bug", "--label", "design"],
      ["archive", "11"],
    ],
  },
  {
    id: "missing-card",
    level: "hard",
    prompt: "Move card #42 to Done.",
    check: (b, a) => unchangedExcept(b, a, []),
    solution: [],
  },
  {
    id: "login-cleanup",
    level: "hard",
    prompt: "Archive every login card in Done, and move every login card in Todo to In progress.",
    check: (b, a) => [...archived(a, [14]), ...inColumn(a, [5, 8], "doing"), ...unchangedExcept(b, a, [5, 8, 14])],
    solution: [["archive", "14"], ["move", "5", "doing"], ["move", "8", "doing"]],
  },
  {
    id: "rename-label",
    level: "hard",
    prompt: "Rename the label design to ui on every card that has it.",
    check: (b, a) => [...labels(a, 3, ["ui"]), ...labels(a, 11, ["bug", "ui"]), ...unchangedExcept(b, a, [3, 11])],
    solution: [["label", "3", "ui"], ["label", "11", "bug", "ui"]],
  },  {
    id: "sort-by-priority",
    level: "large",
    board: "large",
    prompt:
      "Sort the Todo column by priority: high first, then medium, then low. Each card's priority is in its description.",
    check: (b, a) => {
      const rank = (id: number) => PRIORITY[field(a.cards[id]!, "Priority") ?? ""] ?? 9;
      const todo = a.columns.todo;
      const problems: string[] = [];
      if ([...todo].sort().join() !== [...b.columns.todo].sort().join()) problems.push("Todo does not hold the same cards");
      if (todo.some((id, i) => i > 0 && rank(todo[i - 1]!) > rank(id))) problems.push(`Todo is not sorted by priority: [${todo.map((id) => `#${id}`).join(" ")}]`);
      return [...problems, ...unchangedExcept(b, a, b.columns.todo)];
    },
    solution: [15, 18, 22, 16, 20, 23, 24, 17, 19, 21].map((id, i) => ["move", String(id), "todo", "--position", String(i + 1)]),
  },
  {
    id: "label-sam",
    level: "large",
    board: "large",
    prompt: "Add the label sam to every card on the board that is assigned to Sam, keeping their other labels. Assignees are in the descriptions.",
    check: (b, a) => {
      const sam = onBoard(b).filter((c) => field(c, "Assignee") === "Sam");
      return [...sam.flatMap((c) => labels(a, c.id, [...c.labels, "sam"])), ...unchangedExcept(b, a, sam.map((c) => c.id))];
    },
    solution: [
      ["3", "feature"], ["7", "feature", "security"], ["15", "bug", "security"], ["20", "bug", "performance"],
      ["24", "feature"], ["26", "chore"], ["30", "feature", "security"], ["33", "bug"], ["36", "feature"], ["40", "feature", "security"],
    ].map(([id, ...rest]) => ["label", id!, ...rest, "sam"]),
  },
  {
    id: "archive-duplicates",
    level: "large",
    board: "large",
    prompt:
      "Some cards have exactly the same title as another card. For each such title, keep the card with the lowest id and archive the others.",
    check: (b, a) => {
      const extra = duplicates(b);
      return [...archived(a, extra), ...unchangedExcept(b, a, extra)];
    },
    solution: [["archive", "17"], ["archive", "24"], ["archive", "35"], ["archive", "41"]],
  },
  {
    id: "strip-wip",
    level: "large",
    board: "large",
    prompt: 'Some card titles start with "WIP: ". Remove that prefix from those titles and leave the rest of each title as it is.',
    check: (b, a) => {
      const wip = onBoard(b).filter((c) => c.title.startsWith("WIP: "));
      const problems = wip
        .filter((c) => a.cards[c.id]!.title !== c.title.slice(5))
        .map((c) => `#${c.id} is titled "${a.cards[c.id]!.title}"`);
      return [...problems, ...unchangedExcept(b, a, wip.map((c) => c.id))];
    },
    solution: [
      ["rename", "7", "Audit log for admin actions"],
      ["rename", "19", "Email digest of board activity"],
      ["rename", "26", "Migrate the database to SQLite"],
      ["rename", "30", "Sign in with a passkey"],
    ],
  },
  {
    id: "triage-bugs",
    level: "large",
    board: "large",
    prompt:
      "Move every bug in Backlog that has no description to the top of Todo, in the same order as they had in Backlog.",
    check: (b, a) => {
      const bugs = b.columns.backlog.filter((id) => b.cards[id]!.labels.includes("bug") && !b.cards[id]!.description);
      return [...order(a, "todo", [...bugs, ...b.columns.todo]), ...unchangedExcept(b, a, bugs)];
    },
    solution: [2, 6, 9, 13].map((id, i) => ["move", String(id), "todo", "--position", String(i + 1)]),
  },
  {
    id: "unblock",
    level: "large",
    board: "large",
    prompt:
      'Some cards in In progress say "Blocked by #N" in their description. Move each of those back to Todo if the card blocking it is not in Done yet. Leave the others where they are.',
    check: (b, a) => {
      const blocked = blockedByOpenWork(b);
      return [...inColumn(a, blocked, "todo"), ...unchangedExcept(b, a, blocked)];
    },
    solution: [["move", "26", "todo"], ["move", "28", "todo"]],
  },
];

export function loadTasks(root: string): Task[] {
  const load = (name: string) => parseSeed(JSON.parse(readFileSync(join(root, "seeds", `${name}.json`), "utf8")));
  const seeds = { experiment: load("experiment"), large: load("large") };
  return SPECS.map(({ board, ...spec }) => ({ ...spec, seed: seeds[board ?? "experiment"] }));
}

/** A field written in a description as "Name: value". */
function field(card: Card, name: string): string | undefined {
  return card.description.match(new RegExp(`^${name}: (.+)$`, "m"))?.[1]?.trim();
}

const PRIORITY: Record<string, number> = { high: 0, medium: 1, low: 2 };

function onBoard(board: Board): Card[] {
  return Object.values(board.cards).filter((c) => !c.archived);
}

/** Active cards that share a title with an active card of lower id. */
function duplicates(board: Board): number[] {
  const first = new Map<string, number>();
  const extra: number[] = [];
  for (const card of onBoard(board).sort((a, b) => a.id - b.id)) {
    if (first.has(card.title)) extra.push(card.id);
    else first.set(card.title, card.id);
  }
  return extra;
}

function blockedByOpenWork(board: Board): number[] {
  return board.columns.doing.filter((id) => {
    const blocker = Number(board.cards[id]!.description.match(/^Blocked by #(\d+)$/m)?.[1]);
    return blocker > 0 && board.cards[blocker]?.column !== "done";
  });
}
