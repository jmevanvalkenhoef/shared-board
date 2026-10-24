"""Writes seeds/large.json: a board of about 50 cards for the hard tasks.

    python3 seeds/make-large.py

Descriptions hold what the board view doesn't show: priority, assignee and
blockers. Some titles repeat and some start with "WIP: ", on purpose.
"""

import json
from pathlib import Path

# (column, title, labels, description); ids follow the order, starting at 1.
CARDS = [
    # backlog
    ("backlog", "Export the board as Markdown", ["feature"], "Priority: low\nAssignee: Ana"),
    ("backlog", "Crash when a card title is empty", ["bug"], ""),
    ("backlog", "Keyboard shortcut to add a card", ["feature"], "Priority: medium\nAssignee: Sam"),
    ("backlog", "Avatar images are blurry on retina screens", ["bug"], "Priority: low\nAssignee: Lee"),
    ("backlog", "Dark mode for the print view", ["design"], ""),
    ("backlog", "Session expires while typing a comment", ["bug"], ""),
    ("backlog", "WIP: Audit log for admin actions", ["feature", "security"], "Priority: medium\nAssignee: Sam"),
    ("backlog", "Search cards by title", ["feature"], "Priority: medium"),
    ("backlog", "Typo in the welcome email", ["bug"], ""),
    ("backlog", "Translate the settings page to Dutch", ["i18n"], "Priority: low\nAssignee: Ana"),
    ("backlog", "Write the install guide", ["docs"], "Priority: low"),
    ("backlog", "Undo for archived cards", ["feature"], "Priority: low\nAssignee: Lee"),
    ("backlog", "Footer links open in the same tab", ["bug"], ""),
    ("backlog", "Bulk move cards between columns", ["feature"], "Priority: medium"),
    # todo
    ("todo", "Login form accepts an empty password", ["bug", "security"], "Priority: high\nAssignee: Sam"),
    ("todo", "Dates show in UTC instead of local time", ["bug"], "Priority: medium\nAssignee: Ana"),
    ("todo", "Write the install guide", ["docs"], "Priority: low\nAssignee: Lee"),
    ("todo", "Rate-limit the public API", ["feature", "security"], "Priority: high"),
    ("todo", "WIP: Email digest of board activity", ["feature"], "Priority: low\nAssignee: Ana"),
    ("todo", "Login page loads slowly on mobile", ["bug", "performance"], "Priority: medium\nAssignee: Sam"),
    ("todo", "Card colours ignore the theme", ["bug", "design"], "Priority: low"),
    ("todo", "Password reset link never expires", ["bug", "security"], "Priority: high\nAssignee: Lee"),
    ("todo", "Add a changelog page", ["docs"], "Priority: medium"),
    ("todo", "Search cards by title", ["feature"], "Priority: medium\nAssignee: Sam"),
    # doing
    ("doing", "Add request logging", ["chore"], "Priority: high\nAssignee: Lee"),
    ("doing", "WIP: Migrate the database to SQLite", ["chore"], "Priority: high\nAssignee: Sam\nBlocked by #27"),
    ("doing", "Upgrade the web framework", ["chore"], "Priority: medium\nAssignee: Ana"),
    ("doing", "Webhooks for card changes", ["feature"], "Priority: medium\nAssignee: Ana\nBlocked by #25"),
    ("doing", "Mobile layout for the board", ["design"], "Priority: medium\nAssignee: Lee\nBlocked by #38"),
    ("doing", "WIP: Sign in with a passkey", ["feature", "security"], "Priority: high\nAssignee: Sam\nBlocked by #40"),
    # done
    ("done", "Set up continuous integration", ["chore"], "Assignee: Lee"),
    ("done", "Add a health-check endpoint", ["feature"], "Assignee: Ana"),
    ("done", "Fix login redirect loop", ["bug"], "Assignee: Sam"),
    ("done", "Card titles overflow on narrow screens", ["bug", "design"], "Assignee: Lee"),
    ("done", "Export the board as Markdown", ["feature"], "Assignee: Ana"),
    ("done", "Show who changed a card", ["feature"], "Assignee: Sam"),
    ("done", "Speed up the board query", ["performance"], "Assignee: Lee"),
    ("done", "Design tokens for colours", ["design"], "Assignee: Ana"),
    ("done", "Remove the old login page", ["chore"], ""),
    ("done", "Store passkeys per device", ["feature", "security"], "Assignee: Sam"),
    ("done", "Typo in the welcome email", ["bug"], "Assignee: Lee"),
    ("done", "Automatic backups", ["chore"], "Assignee: Ana"),
]

ARCHIVED_AFTER = [  # created in backlog, then archived
    ("Prototype a native app", ["feature"], ""),
    ("Old onboarding flow", ["chore"], "Assignee: Sam"),
]


def main() -> None:
    steps = []
    for column, title, labels, _ in CARDS:
        steps.append(create(title, column, labels))
    for title, labels, _ in ARCHIVED_AFTER:
        steps.append(create(title, "backlog", labels))
    for i, (_, _, _, desc) in enumerate(CARDS, start=1):
        if desc:
            steps.append({"actor": "human", "command": {"type": "describe", "card": i, "description": desc}})
    for j, (_, _, desc) in enumerate(ARCHIVED_AFTER, start=len(CARDS) + 1):
        if desc:
            steps.append({"actor": "human", "command": {"type": "describe", "card": j, "description": desc}})
        steps.append({"actor": "human", "command": {"type": "archive", "card": j}})
    out = Path(__file__).with_name("large.json")
    out.write_text(json.dumps(steps, indent=2) + "\n")
    print(f"{len(CARDS) + len(ARCHIVED_AFTER)} cards, {len(steps)} steps -> {out}")


def create(title: str, column: str, labels: list[str]) -> dict:
    return {"actor": "human", "command": {"type": "create", "title": title, "column": column, "labels": labels}}


if __name__ == "__main__":
    main()
