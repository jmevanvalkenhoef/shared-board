# Shared Board

A kanban board that a person and an AI agent use at the same time. The person
works in a web page; the agent uses a command-line tool. Both go through the
same small server, so when the agent moves a card, the page shows it moving.

The board is the setting for an experiment on how CLI design affects an
agent's success. See [docs/PLAN.md](docs/PLAN.md).

## Run it

Needs Node 24 or later. No build step: Node runs the TypeScript directly.

```sh
npm install          # only TypeScript, for type checking
npm start            # http://localhost:4321
bin/board show       # in another terminal
bin/board move 4 doing
```

The first start fills the board from `seeds/demo.json`. Changes are kept in
`data/board.sqlite`.

## The CLI

```
board show [column]
board card <id>
board add <title> [--column C] [--label L]...
board move <id> <column> [--position N]
board rename <id> <title>
board describe <id> <text>
board label <id> [label]...
board archive <id>
```

Columns: `backlog`, `todo`, `doing`, `done`. Changes made through the CLI are
recorded as the agent's (`BOARD_ACTOR=human` to change that). `BOARD_URL` points
it at another server. Exit codes: 0 ok, 1 the board refused the command, 2 usage
error, 3 server unreachable.

## In the page

Drag cards between columns, or focus a card and use the arrow keys (left and
right change column, Alt with up and down reorders). Enter or a double click
renames, Delete archives. Cards the agent touched last have an accent edge and
flash when it changes them.

## How it fits together

```
src/domain/   the board as a fold over events, and command checks (pure; also runs in the browser)
src/store/    append-only event log in SQLite
src/server/   board service, HTTP API, live updates (Server-Sent Events), static files
src/cli/      the board CLI; output styles in src/cli/styles/
web/          the page: api, view, interactions, app
```

Every change is an event appended to the log, and the board is computed from
the log. The server is the only writer. The page imports `src/domain` directly:
the server strips the types from TypeScript files as it serves them.

`npm run check` type-checks everything.

## The experiment harness

```sh
node experiment/run.ts --task bugs-to-doing --model haiku --style plain
```

One run starts a fresh board in memory on a free port, gives the task to
Claude Code running headless, and grades the final board against the task's
checks. The agent gets only the Bash tool, limited to the `board` command;
anything else is refused. Each run appends a line to
`experiment/results/runs.jsonl` (success, problems, tool calls, errors, tokens,
time) and keeps its transcript in `experiment/results/transcripts/`.

```
experiment/sandbox.ts   a throwaway board server for one run
experiment/agent.ts     starts the agent and reads its transcript
experiment/tasks.ts     tasks and their checks
experiment/run.ts       one graded run
```

## Write-up

[experiment/writeup/](experiment/writeup/): how three designs of the CLI
change the work of three Claude models, with a Bayesian model of 324 runs and a
prediction test on 90 more. Serve that folder (`python3 -m http.server`) and
open it. To rebuild its data: `uv run experiment/analysis/fit.py`, then
`python3 experiment/analysis/writeup_data.py`.

## Related work

[Headway](https://github.com/damus-io/notedeck/tree/master/crates/notedeck_headway)
by William Casarin is a kanban board built the same way (a GUI for people, a CLI
for agents), stored as nostr events. This project borrows its event-sourcing
idea and adds the experiment.
