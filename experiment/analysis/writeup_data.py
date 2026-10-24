"""Collects what the write-up shows into experiment/writeup/data.json.

    python3 experiment/analysis/writeup_data.py

Reads the run log and transcripts, posterior.json (fit.py) and
prediction.json (predict.py). Standard library only.
"""

import json
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESULTS = ROOT / "experiment" / "results"
ANALYSIS = ROOT / "experiment" / "analysis"
OUT = ROOT / "experiment" / "writeup" / "data.json"

MAIN = "full-2026-10-24T21:44"
ROUND1 = "full-2026-10-24T21:34"
MODELS = ["claude-haiku-4-5", "haiku", "sonnet"]
CLIS = ["plain", "agent", "forgiving"]


def tokens(r):
    return sum(r["tokens"].values())


def failed_commands(r):
    """(command, error text) for every tool call that failed in a run."""
    calls, out = {}, []
    for line in (RESULTS / "transcripts" / f"{r['id']}.jsonl").read_text().splitlines():
        m = json.loads(line)
        msg = m.get("message")
        content = msg.get("content") if isinstance(msg, dict) else None
        for c in content if isinstance(content, list) else []:
            if not isinstance(c, dict):
                continue
            if c.get("type") == "tool_use":
                calls[c["id"]] = c["input"].get("command", "")
            if c.get("type") == "tool_result" and c.get("is_error"):
                text = c["content"] if isinstance(c["content"], str) else " ".join(x.get("text", "") for x in c["content"])
                out.append((calls.get(c["tool_use_id"], ""), text))
    return out


def kind(command, text):
    if "denied" in text:
        return "a loop or other shell command, refused"
    if m := re.search(r'unknown command "([^"]*)"', text):
        return f"board {m.group(1)}: no such command"
    if "unknown column" in text:
        return "board show <id> for a card"
    if "no-such-card" in text or "there is no card" in text:
        return "a card that does not exist"
    if "position must be" in text:
        return "--position 0"
    if "expected a card id" in text:
        return "#id read as a shell comment" if re.search(r"\s#\d", command) else "a missing card id"
    return "other"


def cell_table(runs):
    rows = []
    for m in MODELS:
        for c in CLIS:
            g = [r for r in runs if r["requestedModel"] == m and r["style"] == c]
            rows.append({
                "model": m, "cli": c, "runs": len(g),
                "passed": sum(r["success"] for r in g),
                "calls_mean": statistics.mean(r["toolCalls"] for r in g),
                "errors": sum(r["toolErrors"] for r in g),
                "tokens_median": statistics.median(tokens(r) for r in g),
            })
    return rows


def error_kinds(runs):
    counts = defaultdict(Counter)
    for r in runs:
        if r["toolErrors"]:
            for command, text in failed_commands(r):
                counts[kind(command, text)][r["style"]] += 1
    return sorted(
        ({"kind": k, **{c: v[c] for c in CLIS}} for k, v in counts.items()),
        key=lambda row: -sum(row[c] for c in CLIS),
    )


def main():
    runs = [json.loads(line) for line in (RESULTS / "runs.jsonl").read_text().splitlines()]
    pilot = [r for r in runs if "batch" not in r]  # the pilot ran before runs had a batch
    main_runs = [r for r in runs if r.get("batch") == MAIN]
    round1 = [r for r in runs if r.get("batch") == ROUND1]
    holdout = [r for r in runs if str(r.get("batch", "")).startswith("holdout-")]
    post = json.loads((ANALYSIS / "posterior.json").read_text())
    pred = json.loads((ANALYSIS / "prediction.json").read_text())

    observed_errors = {c: sum(r["toolErrors"] for r in holdout if r["style"] == c) for c in CLIS}

    def holdout_ratio(m):
        med = lambda c: statistics.median(tokens(r) for r in holdout if r["style"] == c and r["requestedModel"] == m)
        return med("forgiving") / med("plain")

    data = {
        "batches": {"main": MAIN, "round1": ROUND1, "holdout": holdout[0]["batch"] if holdout else None},
        "pilot": {"runs": len(pilot), "passed": sum(r["success"] for r in pilot)},
        "round1": {"runs": len(round1), "passed": sum(r["success"] for r in round1)},
        "main": {
            "runs": len(main_runs),
            "passed": sum(r["success"] for r in main_runs),
            "tasks": len({r["task"] for r in main_runs}),
            "tokens_total": sum(tokens(r) for r in main_runs),
            "cells": cell_table(main_runs),
            "error_kinds": error_kinds(main_runs),
            "failures": [{"task": r["task"], "model": r["requestedModel"], "cli": r["style"], "problems": r["problems"]}
                         for r in main_runs if not r["success"]],
        },
        "posterior": {k: post["outcomes"][k] for k in ("errors", "calls", "tokens", "cost", "success")},
        "holdout": {
            "runs": len(holdout),
            "passed": sum(r["success"] for r in holdout),
            "tasks": len({r["task"] for r in holdout}),
            "error_kinds": error_kinds(holdout),
            "errors": {c: {**pred["errors"]["total_per_cli"][c], "observed": observed_errors[c]} for c in CLIS},
            "token_ratio": {m: {**pred["tokens"]["forgiving_over_plain_per_model"][m], "observed": holdout_ratio(m)} for m in MODELS},
            "prediction_commit": pred["commit"],
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1))
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
