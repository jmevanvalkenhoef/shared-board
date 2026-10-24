# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["pymc==5.20.1", "numpy<2.2", "arviz==0.20.0", "matplotlib==3.9.4"]
# ///
"""Predictions for the held-out tasks, written before they are run.

    uv run experiment/analysis/predict.py [--tasks 5] [--reps 2]

Fits the error and token models on the main run (as fit.py does), then
simulates the held-out round: for every posterior draw, each new task gets a
difficulty from the fitted spread between tasks (and its own CLI deviations),
and every run of the round is drawn from the model. Writes
experiment/analysis/prediction.json.
"""

import argparse
import json
import subprocess
from datetime import datetime, timezone

import numpy as np
import pymc as pm

from fit import CLIS, MODELS, OUT, ROOT, count_model, load, positive_model

PREDICTION = OUT.with_name("prediction.json")


def interval(x):
    return {"q05": float(np.quantile(x, 0.05)), "q50": float(np.quantile(x, 0.5)), "q95": float(np.quantile(x, 0.95))}


def draws(idata, name):
    return idata.posterior[name].values.reshape(-1, *idata.posterior[name].shape[2:])


def simulate(idata, kind, n_tasks, reps, rng):
    """Every run of the held-out round, per draw: array (draws, models, clis, tasks, reps)."""
    cell = draws(idata, "cell")
    n = len(cell)
    u = draws(idata, "sd_task")[:, None] * rng.standard_normal((n, n_tasks))
    w = draws(idata, "sd_task_cli")[:, None, None] * rng.standard_normal((n, n_tasks, len(CLIS)))
    eta = cell[:, :, :, None] + u[:, None, None, :] + np.moveaxis(w, 2, 1)[:, None, :, :]
    eta = np.repeat(eta[..., None], reps, axis=-1)
    if kind == "count":
        mu = np.exp(eta)
        alpha = draws(idata, "alpha")[:, None, None, None, None]
        return rng.negative_binomial(alpha, alpha / (alpha + mu))
    sigma = draws(idata, "sigma")[:, :, None, None, None]
    return np.exp(eta + sigma * rng.standard_normal(eta.shape))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", default="full-2026-10-24T21:44")
    ap.add_argument("--tasks", type=int, default=5)
    ap.add_argument("--reps", type=int, default=2)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    tasks, d = load(args.batch)
    rng = np.random.default_rng(args.seed)
    out = {
        "written": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "commit": subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip(),
        "fitted_on": args.batch,
        "round": {"tasks": args.tasks, "reps": args.reps, "runs_per_cell": args.tasks * args.reps},
    }

    for name, build, kind in (("errors", count_model, "count"), ("tokens", positive_model, "positive")):
        with build(d[name], d, len(tasks)):
            idata = pm.sample(1000, tune=1000, chains=4, cores=4, target_accept=0.95, random_seed=args.seed, progressbar=False)
        sims = simulate(idata, kind, args.tasks, args.reps, rng)
        if kind == "count":
            per_cli = sims.sum(axis=(1, 3, 4))  # draws × clis: total over models, tasks, reps
            out["errors"] = {
                "total_per_cli": {c: interval(per_cli[:, j]) for j, c in enumerate(CLIS)},
                "total_per_cell": {
                    f"{m}|{c}": interval(sims[:, i, j].sum(axis=(1, 2))) for i, m in enumerate(MODELS) for j, c in enumerate(CLIS)
                },
                "p_forgiving_fewer_than_plain": float(np.mean(per_cli[:, 2] < per_cli[:, 0])),
                "p_agent_fewer_than_plain": float(np.mean(per_cli[:, 1] < per_cli[:, 0])),
            }
        else:
            medians = np.median(sims.reshape(*sims.shape[:3], -1), axis=-1)  # draws × models × clis
            out["tokens"] = {
                "median_per_cell": {f"{m}|{c}": interval(medians[:, i, j]) for i, m in enumerate(MODELS) for j, c in enumerate(CLIS)},
                "forgiving_over_plain_per_model": {m: interval(medians[:, i, 2] / medians[:, i, 0]) for i, m in enumerate(MODELS)},
            }

    PREDICTION.write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
