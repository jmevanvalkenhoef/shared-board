# Shared Board: plan

Working title. A kanban board that a person and an AI agent use at the same
time: the person through a web page, the agent through a command-line tool.
Both talk to the same small backend, so when the agent moves a card, you see
it move.

The board is the stage. The portfolio piece is a Bayesian experiment on the
agent's side of it.

## The question

Can a well-designed CLI make a cheap model as good as an expensive one?

Two factors, crossed:

| | plain CLI | agent-friendly CLI |
|---|---|---|
| cheap model (Haiku) | A | B |
| stronger model (Sonnet) | C | D |

The two CLIs have the same commands. They differ in what they print:

- **plain**: terse text tables, bare errors (`error: not found`), minimal `--help`.
- **agent-friendly**: help with the exact rules and examples (positions count
  from 1, `label` replaces all labels, column ids next to their names), results
  that say what changed (`labels of #5 are now: urgent`), and errors that say
  what to do next (`there is no card #42. Run "board show" ...`).

Both are plain text. If a later round has budget, the agent-friendly side can
be split into its parts (help, results, errors) to see which part matters.

## One run

1. Reset the board to a fixed seed (same cards every time).
2. Start the agent headless: `claude -p` with a short custom system prompt,
   only the Bash tool, and Bash limited to the `board` command.
3. Give it one task, for example "move every bug in Todo to In Progress" or
   "split card 7 into three cards and archive the original".
4. When it stops, a grader compares the final board with the task's expected
   state. Success is decided by a script, not by a person or a model.
5. Record: success, commands used, errors hit, turns, tokens, time.

Twelve tasks in `experiment/tasks.ts`, from easy (move the bugs in Todo) to
hard (a card that doesn't exist, a dependency only written in a description,
renaming a label on every card that has it). All start from
`seeds/experiment.json`. Each has a reference solution, and
`experiment/test-tasks.ts` checks that the solution passes and doing nothing
fails.

## The Bayesian model

Hierarchical logistic regression for success:

    logit P(success) = task difficulty + CLI effect + model effect + CLI×model

Task difficulty is a random effect, so tasks share information and a few runs
per task are enough. Tokens per run get a lognormal model of the same shape.

Reported as probabilities, for example "the agent-friendly CLI raises success
by 18 points (90% interval 9 to 27)" and "P(cheap + good CLI ≥ strong + plain
CLI) = 0.83".

Two more Bayesian pieces:

- **Adaptive runs.** After each batch, the next runs go where the posterior is
  least certain about the comparison that matters (cheap + good vs. strong +
  plain).
- **A prediction test.** Before running a few new tasks, save the model's
  predictions for them; then run them and check.

## Budget and run rules

- The agent runs on the subscription. Limit: about 20% of the weekly budget
  for the whole experiment.
- Every run logs its tokens. A pilot of about 20 runs measures tokens per run;
  then Joost checks `/usage` to turn that into a share of the weekly budget,
  and the main experiment is sized from it.
- Runs are API-bound, not CPU-bound, so 4 to 8 run in parallel. Batches stay
  under about 30 minutes, and each batch is started only after asking.
- Hard stop in the harness when a batch's token total passes its budget.

## Architecture

```
web page (GUI) ──HTTP + SSE──┐
                             ├── server ── event log (SQLite, append-only)
board CLI (agent) ───────────┘
```

- **Event log.** Every change is an appended event (card created, moved,
  edited, archived), with who made it. The board is a fold over the log. This
  is the same idea as Headway's event sourcing (credited below), on SQLite
  instead of nostr events.
- **Server.** Small HTTP API plus Server-Sent Events, so every open page sees
  changes as they happen.
- **CLI.** Talks to the server. One flag (`--style plain|agent`) switches the
  output style, so both variants share all logic and differ only in text.
- **Web page.** Kanban columns, drag and drop, cards animate when someone else
  moves them, each card shows who touched it last (you or the agent), and the
  agent's change can be undone.
- **Stack.** TypeScript on Node (built-in `node:sqlite`, no framework) for the
  server, CLI and page; Python with PyMC for the analysis, as in FIPS Lab.

## Milestones

1. **Board.** Event log, server, CLI, live web page. Done when a card moved
   from the terminal moves on the page.
2. **Harness.** Seeded reset, one headless agent run, grader, run log. Done
   when one task runs end to end and is graded. *Done: first run passed with
   Haiku in 9 s and about 12k tokens; a non-board command is refused.*
3. **Variants and tasks.** Both CLI styles, 12 tasks with checks. Pilot of 24
   runs (each task twice, opposite model and style) to measure tokens;
   calibrate the budget with Joost.
4. **Experiment.** Adaptive batches, each under 30 minutes, each approved.
5. **Model and write-up.** PyMC model, interactive write-up in the FIPS Lab
   style (same theme), with data tables and the model's limits. *Done:
   experiment/writeup/.*
6. **Prediction test.** Saved predictions for new tasks, then the runs.
   *Done: 90 runs on five held-out tasks, all inside the predictions.*
7. **Demo and site.** Short video of a person and the agent on the board;
   case-study page and card on the portfolio site.

## Related work

- **Headway** (William Casarin, in [notedeck](https://github.com/damus-io/notedeck),
  `crates/notedeck_headway`): a kanban board stored as nostr events, with a
  `headway` CLI and a Claude Code skill. Same human-GUI, agent-CLI pattern.
  Its sibling **Notebook** does the same for a JSON Canvas. This project
  builds a small web version of the pattern; its contribution is the
  measurement.

## Not in scope (for now)

- Sync between machines or several people. Single machine, one board.
- A canvas surface. Possible later on the same backend.
