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

## Related work

[Headway](https://github.com/damus-io/notedeck/tree/master/crates/notedeck_headway)
by William Casarin is a kanban board built the same way (a GUI for people, a CLI
for agents), stored as nostr events. This project borrows its event-sourcing
idea and adds the experiment.
