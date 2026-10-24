# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["pymc==5.20.1", "numpy<2.2", "arviz==0.20.0", "matplotlib==3.9.4"]
# ///
"""Bayesian models of the main run: what the CLI variant does, per model.

    uv run experiment/analysis/fit.py [--batch full-2026-10-24T21:44] [--draws 1000]

Five outcomes, one model each, all with the same structure:

    outcome ~ cell[model, cli] + task[t] + task×cli[t, cli]

`cell` is a free estimate for each of the nine model × CLI combinations. Task
difficulty is a random effect, so a CLI's effect is measured within tasks and
the tasks share information. The task × CLI term lets that effect differ from
task to task (the missing-card task, say, gives an error under every CLI).

    errors, calls   negative binomial (counts)
    tokens, cost    lognormal, with a spread per model
    success         logistic, without the task × CLI term (two failures in 324)

Writes experiment/analysis/posterior.json: cell estimates for a typical task,
CLI contrasts per model, task difficulties, posterior predictive checks and
sampler diagnostics.
"""

import argparse
import json
from pathlib import Path

import arviz as az
import numpy as np
import pymc as pm

ROOT = Path(__file__).resolve().parents[2]
RUNS = ROOT / "experiment" / "results" / "runs.jsonl"
OUT = ROOT / "experiment" / "analysis" / "posterior.json"

MODELS = ["claude-haiku-4-5", "haiku", "sonnet"]
CLIS = ["plain", "agent", "forgiving"]


def load(batch):
    rows = [json.loads(line) for line in RUNS.read_text().splitlines()]
    rows = [r for r in rows if r.get("batch") == batch]
    tasks = sorted({r["task"] for r in rows})
    return tasks, {
        "task": np.array([tasks.index(r["task"]) for r in rows]),
        "model": np.array([MODELS.index(r["requestedModel"]) for r in rows]),
        "cli": np.array([CLIS.index(r["style"]) for r in rows]),
        "errors": np.array([r["toolErrors"] for r in rows]),
        "calls": np.array([r["toolCalls"] for r in rows]),
        "tokens": np.array([sum(r["tokens"].values()) for r in rows], float),
        "cost": np.array([r["costUsd"] for r in rows]),
        "success": np.array([r["success"] for r in rows], int),
    }


def linear(d, n_tasks, cell_mu, cell_sd, task_by_cli=True):
    """The shared structure; returns the linear predictor for every run."""
    cell = pm.Normal("cell", cell_mu, cell_sd, shape=(len(MODELS), len(CLIS)))
    sd_task = pm.HalfNormal("sd_task", 1.0)
    task = pm.Deterministic("task", sd_task * pm.Normal("task_z", 0, 1, shape=n_tasks))
    eta = cell[d["model"], d["cli"]] + task[d["task"]]
    if task_by_cli:
        sd_tc = pm.HalfNormal("sd_task_cli", 0.5)
        tc = sd_tc * pm.Normal("task_cli_z", 0, 1, shape=(n_tasks, len(CLIS)))
        eta = eta + tc[d["task"], d["cli"]]
    return eta


def count_model(y, d, n_tasks):
    with pm.Model() as model:
        eta = linear(d, n_tasks, np.log(max(y.mean(), 0.05)), 1.5)
        alpha = pm.HalfNormal("alpha", 5.0)
        pm.NegativeBinomial("y", mu=pm.math.exp(eta), alpha=alpha, observed=y)
    return model


def positive_model(y, d, n_tasks):
    with pm.Model() as model:
        eta = linear(d, n_tasks, np.log(np.median(y)), 1.0)
        sigma = pm.HalfNormal("sigma", 1.0, shape=len(MODELS))
        pm.Normal("y", eta, sigma[d["model"]], observed=np.log(y))
    return model


def binary_model(y, d, n_tasks):
    with pm.Model() as model:
        eta = linear(d, n_tasks, 0.0, 2.5, task_by_cli=False)
        pm.Bernoulli("y", logit_p=eta, observed=y)
    return model


OUTCOMES = {
    "errors": count_model,
    "calls": count_model,
    "tokens": positive_model,
    "cost": positive_model,
    "success": binary_model,
}


def interval(x):
    return {"mean": float(np.mean(x)), "q05": float(np.quantile(x, 0.05)), "q95": float(np.quantile(x, 0.95))}


def summarise(name, idata, d, tasks):
    cell = idata.posterior["cell"].values.reshape(-1, len(MODELS), len(CLIS))
    binary = name == "success"
    typical = 1 / (1 + np.exp(-cell)) if binary else np.exp(cell)

    out = {
        "cells": {m: {c: interval(typical[:, i, j]) for j, c in enumerate(CLIS)} for i, m in enumerate(MODELS)},
        "contrasts": {},
        "tasks": dict(zip(tasks, (interval(t) for t in idata.posterior["task"].values.reshape(-1, len(tasks)).T))),
    }
    # Ratio (or, for success, difference) of each CLI against plain, per model and averaged over models.
    for j, cli in enumerate(CLIS[1:], start=1):
        per_model = {}
        for i, m in enumerate(MODELS):
            diff = typical[:, i, j] - typical[:, i, 0] if binary else np.exp(cell[:, i, j] - cell[:, i, 0])
            per_model[m] = {**interval(diff), "p_below": float(np.mean(diff < (0 if binary else 1)))}
        avg = typical[:, :, j].mean(1) - typical[:, :, 0].mean(1) if binary else np.exp((cell[:, :, j] - cell[:, :, 0]).mean(1))
        per_model["all"] = {**interval(avg), "p_below": float(np.mean(avg < (0 if binary else 1)))}
        out["contrasts"][f"{cli}_vs_plain"] = per_model

    # Posterior predictive check: per cell, the observed total against the predicted range.
    if "posterior_predictive" in idata:
        pred = idata.posterior_predictive["y"].values.reshape(-1, len(d["task"]))
        if name in ("tokens", "cost"):
            pred, obs = np.exp(pred), d[name]
        else:
            obs = d[name]
        out["check"] = {
            f"{m}|{c}": {
                "observed": float(obs[(d["model"] == i) & (d["cli"] == j)].sum()),
                **interval(pred[:, (d["model"] == i) & (d["cli"] == j)].sum(1)),
            }
            for i, m in enumerate(MODELS)
            for j, c in enumerate(CLIS)
        }
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", default="full-2026-10-24T21:44")
    ap.add_argument("--draws", type=int, default=1000)
    ap.add_argument("--seed", type=int, default=2026)
    args = ap.parse_args()

    tasks, d = load(args.batch)
    print(f"{len(d['task'])} runs, {len(tasks)} tasks", flush=True)
    result = {"batch": args.batch, "runs": int(len(d["task"])), "tasks": tasks, "outcomes": {}}

    for name, build_model in OUTCOMES.items():
        with build_model(d[name], d, len(tasks)):
            idata = pm.sample(args.draws, tune=1000, chains=4, cores=4, target_accept=0.95,
                              random_seed=args.seed, progressbar=False)
            pm.sample_posterior_predictive(idata, extend_inferencedata=True, random_seed=args.seed, progressbar=False)
        summary = az.summary(idata, var_names=["cell", "sd_task"], round_to=3)
        diag = {
            "divergences": int(idata.sample_stats.diverging.sum()),
            "rhat_max": float(az.rhat(idata).to_array().max()),
            "ess_min": float(az.ess(idata).to_array().min()),
        }
        print(f"\n== {name}: {diag}", flush=True)
        print(summary[["mean", "sd", "hdi_3%", "hdi_97%", "r_hat"]].to_string())
        result["outcomes"][name] = {**summarise(name, idata, d, tasks), "diagnostics": diag}

    OUT.write_text(json.dumps(result, indent=1))
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
