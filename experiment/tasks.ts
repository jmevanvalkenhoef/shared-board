// The tasks. All start from seeds/experiment.json. `level` is my guess at the
// difficulty before any runs; the model estimates its own. `solution` is one
// correct sequence of CLI calls, used to test the checks (experiment/test-tasks.ts).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Board } from "../src/domain/board.ts";
import { parseSeed } from "../src/server/board-service.ts";
import type { SeedStep } from "../src/server/board-service.ts";
import { addedCard, archived, inColumn, labels, order, unchangedExcept } from "./checks.ts";

export interface Task {
  id: string;
  level: "easy" | "medium" | "hard";
  prompt: string;
  seed: SeedStep[];
  check(before: Board, after: Board): string[];
  solution: string[][];
}

type Spec = Omit<Task, "seed">;

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
  },
];

export function loadTasks(root: string): Task[] {
  const seed = parseSeed(JSON.parse(readFileSync(join(root, "seeds", "experiment.json"), "utf8")));
  return SPECS.map((spec) => ({ ...spec, seed }));
}
