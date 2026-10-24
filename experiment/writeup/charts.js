// Charts for the write-up, drawn from data.json (experiment/analysis/writeup_data.py).
// Numbers in the text are filled from the same data, so text and charts agree.

const MODELS = ["claude-haiku-4-5", "haiku", "sonnet"];
const MODEL_NAMES = { "claude-haiku-4-5": "Haiku 4.5", haiku: "Haiku 5.5", sonnet: "Sonnet 5.5", all: "All models" };
const CLI_NAMES = { plain: "plain", agent: "agent-friendly", forgiving: "forgiving" };
const W = 700;
const ROW = 26;
const LEFT = 128;
const RIGHT = 70;

const ratio = (x) => `${x.toFixed(2)}×`;
const change = (r) => `${r < 1 ? "−" : "+"}${Math.abs(Math.round((r - 1) * 100))}%`;
const pct = (x) => `${Math.round(100 * x)}%`;
const dollars = (x) => `$${x.toFixed(2)}`;

// ── Tooltip and table ──────────────────────────────────────────────────

function tooltip(container) {
  const tip = d3.select(container).append("div").attr("class", "tooltip").style("display", "none");
  return {
    show(event, lines) {
      // Built with textContent only.
      tip.selectAll("*").remove();
      lines.forEach((text, i) => {
        if (i) tip.append("br");
        tip.append(i === 0 ? "strong" : "span").text(text);
      });
      const box = container.getBoundingClientRect();
      tip.style("display", "block");
      const w = tip.node().offsetWidth;
      const x = event.clientX - box.left;
      tip.style("left", `${Math.min(Math.max(0, x - w / 2), box.width - w)}px`).style("top", `${event.clientY - box.top - 70}px`);
    },
    hide() {
      tip.style("display", "none");
    },
  };
}

function table(el, headers, rows) {
  const details = d3.select(el.closest("figure")).append("details");
  details.append("summary").text("data table");
  const t = details.append("table");
  t.append("thead").append("tr").selectAll("th").data(headers).join("th").text((d) => d);
  t.append("tbody").selectAll("tr").data(rows).join("tr").selectAll("td").data((r) => r).join("td").text((d) => d);
}

function svgFor(el, height, label) {
  return d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${height}`).attr("role", "img").attr("aria-label", label);
}

/** Ticks for a log axis: the usual round values that fall inside the domain. */
function logTicks(domain, candidates) {
  return candidates.filter((t) => t >= domain[0] && t <= domain[1]);
}

/**
 * Draws one block of rows with interval marks. rows: [{label, group?, marks: [{cls, mean, q05, q95, tip}]}].
 * Returns the height used.
 */
function intervalRows(svg, tip, top, rows, x, { title, axisFormat, ticks, ref, valueFormat } = {}) {
  let y = top;
  if (title) {
    svg.append("text").attr("class", "panel-title").attr("x", 0).attr("y", y + 12).text(title);
    y += 24;
  }
  const bodyTop = y;
  let group;
  const placed = [];
  for (const row of rows) {
    if (row.group && row.group !== group) {
      group = row.group;
      svg.append("text").attr("class", "group-label").attr("x", 0).attr("y", y + 16).text(group);
      y += ROW - 4;
    }
    placed.push({ row, y: y + ROW / 2 });
    y += ROW;
  }
  const bodyBottom = y;

  svg.append("g").attr("class", "grid").selectAll("line").data(ticks).join("line")
    .attr("x1", x).attr("x2", x).attr("y1", bodyTop).attr("y2", bodyBottom);
  if (ref !== undefined) {
    svg.append("line").attr("class", "ref").attr("x1", x(ref)).attr("x2", x(ref)).attr("y1", bodyTop - 4).attr("y2", bodyBottom);
  }
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${bodyBottom})`)
    .call(d3.axisBottom(x).tickValues(ticks).tickFormat(axisFormat).tickSizeOuter(0));

  for (const { row, y: cy } of placed) {
    svg.append("text").attr("class", "row-label").attr("x", row.group ? 12 : 0).attr("y", cy + 4).text(row.label);
    const n = row.marks.length;
    row.marks.forEach((m, i) => {
      const yy = cy + (i - (n - 1) / 2) * 9;
      const g = svg.append("g").attr("class", `mark ${m.cls}`);
      g.append("line").attr("x1", x(m.q05)).attr("x2", x(m.q95)).attr("y1", yy).attr("y2", yy);
      g.append("circle").attr("cx", x(m.mean)).attr("cy", yy).attr("r", 4.5);
      if (valueFormat && n === 1) {
        svg.append("text").attr("class", "value-label").attr("x", x(m.q95) + 6).attr("y", yy + 4).text(valueFormat(m.mean));
      }
    });
    svg.append("rect").attr("class", "hit").attr("x", LEFT - 8).attr("y", cy - ROW / 2).attr("width", W - LEFT).attr("height", ROW)
      .on("mousemove", (event) => tip.show(event, [row.tipTitle ?? row.label, ...row.marks.map((m) => m.tip)]))
      .on("mouseleave", () => tip.hide());
  }
  return bodyBottom + 34 - top;
}

// ── Chart: effects of the two richer CLIs ──────────────────────────────

const OUTCOMES = [
  { key: "errors", title: "Wrong commands", ticks: [0.05, 0.1, 0.2, 0.5, 1, 2, 3] },
  { key: "calls", title: "Tool calls", ticks: [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3] },
  { key: "tokens", title: "Tokens", ticks: [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3] },
  { key: "cost", title: "List-price cost", ticks: [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3] },
];

function effectsChart(el, post) {
  const blocks = OUTCOMES.map((o) => {
    const c = post[o.key].contrasts;
    const rows = [...MODELS, "all"].map((m) => ({
      label: MODEL_NAMES[m],
      tipTitle: `${o.title}, ${MODEL_NAMES[m]}`,
      marks: ["agent", "forgiving"].map((cli) => {
        const v = c[`${cli}_vs_plain`][m];
        return { cls: cli, ...v, tip: `${CLI_NAMES[cli]}: ${ratio(v.mean)} (${ratio(v.q05)} to ${ratio(v.q95)}), P(lower) ${pct(v.p_below)}` };
      }),
    }));
    const all = rows.flatMap((r) => r.marks.flatMap((m) => [m.q05, m.q95]));
    const domain = [Math.min(d3.min(all), 0.95) * 0.9, Math.max(d3.max(all), 1.05) * 1.1];
    return { o, rows, domain };
  });

  const heights = blocks.map((b) => 24 + b.rows.length * ROW + 34 + 14);
  const svg = svgFor(el, d3.sum(heights), "Ratio of each richer CLI to plain, per outcome and model, with 90% intervals");
  const tip = tooltip(el);
  let top = 0;
  blocks.forEach((b, i) => {
    const x = d3.scaleLog().domain(b.domain).range([LEFT, W - RIGHT]);
    intervalRows(svg, tip, top, b.rows, x, { title: b.o.title, ticks: logTicks(b.domain, b.o.ticks), axisFormat: (d) => `${d}×`, ref: 1 });
    top += heights[i];
  });

  table(el, ["outcome", "model", "agent-friendly / plain", "forgiving / plain"], blocks.flatMap((b) =>
    b.rows.map((r) => [b.o.title, r.label, ...r.marks.map((m) => `${ratio(m.mean)} (${ratio(m.q05)}–${ratio(m.q95)})`)])));
}

// ── Chart: cost per 1000 tasks ─────────────────────────────────────────

function costChart(el, cells) {
  const rows = MODELS.flatMap((m) => ["plain", "agent", "forgiving"].map((cli) => {
    const v = cells[m][cli];
    const k = { mean: v.mean * 1000, q05: v.q05 * 1000, q95: v.q95 * 1000 };
    return { group: MODEL_NAMES[m], label: CLI_NAMES[cli], tipTitle: `${MODEL_NAMES[m]}, ${CLI_NAMES[cli]}`,
      marks: [{ cls: "single", ...k, tip: `${dollars(k.mean)} per 1000 tasks (${dollars(k.q05)} to ${dollars(k.q95)})` }] };
  }));
  const domain = [0.5, 40];
  const x = d3.scaleLog().domain(domain).range([LEFT, W - RIGHT]);
  const height = 3 * (ROW - 4) + rows.length * ROW + 40;
  const svg = svgFor(el, height, "List-price cost per 1000 typical tasks, per model and CLI");
  intervalRows(svg, tooltip(el), 0, rows, x, { ticks: [0.5, 1, 2, 5, 10, 20, 40], axisFormat: (d) => `$${d}`, valueFormat: dollars });
  table(el, ["model", "CLI", "per 1000 tasks", "90% interval"], rows.map((r) => [r.group, r.label, dollars(r.marks[0].mean), `${dollars(r.marks[0].q05)}–${dollars(r.marks[0].q95)}`]));
}

// ── Chart: task difficulty ─────────────────────────────────────────────

function tasksChart(el, tasks) {
  const rows = Object.entries(tasks)
    .map(([name, v]) => ({ name, mean: Math.exp(v.mean), q05: Math.exp(v.q05), q95: Math.exp(v.q95) }))
    .sort((a, b) => b.mean - a.mean)
    .map((t) => ({ label: t.name, marks: [{ cls: "single", ...t, tip: `${ratio(t.mean)} a typical task's tool calls (${ratio(t.q05)} to ${ratio(t.q95)})` }] }));
  const domain = [0.2, 5];
  const x = d3.scaleLog().domain(domain).range([LEFT + 30, W - RIGHT]);
  const svg = svgFor(el, rows.length * ROW + 40, "Tool calls per task relative to a typical task, with 90% intervals");
  intervalRows(svg, tooltip(el), 0, rows, x, { ticks: [0.2, 0.5, 1, 2, 5], axisFormat: (d) => `${d}×`, ref: 1, valueFormat: ratio });
  table(el, ["task", "tool calls vs. typical", "90% interval"], rows.map((r) => [r.label, ratio(r.marks[0].mean), `${ratio(r.marks[0].q05)}–${ratio(r.marks[0].q95)}`]));
}

// ── Chart: prediction against outcome ──────────────────────────────────

function predictionChart(el, ho) {
  const blocks = [
    { title: "Wrong commands in the round, per CLI (30 runs each)", fmt: (d) => d.toFixed(0),
      rows: ["plain", "agent", "forgiving"].map((c) => ({ label: CLI_NAMES[c], ...ho.errors[c] })), scale: () => d3.scaleLinear().domain([0, 60]) },
    { title: "Tokens with forgiving ÷ plain, per model", fmt: (d) => ratio(d), ref: 1,
      rows: MODELS.map((m) => ({ label: MODEL_NAMES[m], ...ho.token_ratio[m] })), scale: () => d3.scaleLinear().domain([0.5, 1.5]) },
  ];
  const blockH = (b) => 24 + b.rows.length * ROW + 34 + 14;
  const svg = svgFor(el, d3.sum(blocks, blockH), "Predicted ranges and observed outcomes for the held-out round");
  const tip = tooltip(el);
  let top = 0;
  for (const b of blocks) {
    const x = b.scale().range([LEFT, W - RIGHT]);
    svg.append("text").attr("class", "panel-title").attr("x", 0).attr("y", top + 12).text(b.title);
    const y0 = top + 24;
    const ticks = x.ticks(6);
    svg.append("g").attr("class", "grid").selectAll("line").data(ticks).join("line")
      .attr("x1", x).attr("x2", x).attr("y1", y0).attr("y2", y0 + b.rows.length * ROW);
    if (b.ref !== undefined) svg.append("line").attr("class", "ref").attr("x1", x(b.ref)).attr("x2", x(b.ref)).attr("y1", y0 - 4).attr("y2", y0 + b.rows.length * ROW);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${y0 + b.rows.length * ROW})`)
      .call(d3.axisBottom(x).tickValues(ticks).tickFormat(b.fmt).tickSizeOuter(0));
    b.rows.forEach((r, i) => {
      const cy = y0 + i * ROW + ROW / 2;
      svg.append("text").attr("class", "row-label").attr("x", 0).attr("y", cy + 4).text(r.label);
      svg.append("rect").attr("class", "band").attr("x", x(r.q05)).attr("width", Math.max(2, x(r.q95) - x(r.q05))).attr("y", cy - 6).attr("height", 12);
      svg.append("line").attr("class", "tick-mid").attr("x1", x(r.q50)).attr("x2", x(r.q50)).attr("y1", cy - 8).attr("y2", cy + 8);
      svg.append("circle").attr("class", "obs").attr("cx", x(r.observed)).attr("cy", cy).attr("r", 5);
      svg.append("rect").attr("class", "hit").attr("x", LEFT - 8).attr("y", cy - ROW / 2).attr("width", W - LEFT).attr("height", ROW)
        .on("mousemove", (event) => tip.show(event, [r.label, `predicted ${b.fmt(r.q50)} (${b.fmt(r.q05)} to ${b.fmt(r.q95)})`, `observed ${b.fmt(r.observed)}`]))
        .on("mouseleave", () => tip.hide());
    });
    top += blockH(b);
  }
  table(el, ["quantity", "", "predicted median", "90% range", "observed"], blocks.flatMap((b) =>
    b.rows.map((r) => [b.title, r.label, b.fmt(r.q50), `${b.fmt(r.q05)}–${b.fmt(r.q95)}`, b.fmt(r.observed)])));
}

// ── Table: kinds of wrong commands ─────────────────────────────────────

function kindsTable(el, kinds) {
  const max = d3.max(kinds, (k) => Math.max(k.plain, k.agent, k.forgiving));
  const t = d3.select(el).append("table").attr("class", "kinds");
  t.append("thead").append("tr").selectAll("th").data(["kind", "plain", "agent-friendly", "forgiving"]).join("th").text((d) => d);
  const tr = t.append("tbody").selectAll("tr").data(kinds).join("tr");
  tr.append("td").text((k) => k.kind);
  for (const cli of ["plain", "agent", "forgiving"]) {
    const td = tr.append("td").attr("class", (k) => (k[cli] ? "n" : "n zero"));
    td.append("span").text((k) => k[cli]);
    td.append("span").attr("class", "bar").style("width", (k) => `${(k[cli] / max) * 60}px`);
  }
}

// ── Text and wiring ────────────────────────────────────────────────────

function fill(name, value) {
  document.querySelectorAll(`[data-fill="${name}"]`).forEach((el) => { el.textContent = value; });
}

function fillText(d) {
  const p = d.posterior;
  const c = (o, cli, m) => p[o].contrasts[`${cli}_vs_plain`][m];

  fill("pilot-runs", d.pilot.runs);
  fill("pilot-passed", d.pilot.passed);
  fill("round1-runs", d.round1.runs);
  fill("round1-failed", d.round1.runs - d.round1.passed);
  fill("main-runs", d.main.runs);
  fill("main-passed", d.main.passed);
  fill("main-tasks", d.main.tasks);
  fill("main-tokens", (d.main.tokens_total / 1e6).toFixed(1));
  fill("cell-runs-cli", d.main.runs / 3);

  const ef = c("errors", "forgiving", "all");
  fill("err-f-all", ef.mean.toFixed(2));
  fill("err-f-all-lo", ef.q05.toFixed(2));
  fill("err-f-all-hi", ef.q95.toFixed(2));
  fill("err-f-pmin", pct(Math.min(...MODELS.map((m) => c("errors", "forgiving", m).p_below))));
  const ea = c("errors", "agent", "all");
  fill("err-a-all", ratio(ea.mean));
  fill("err-a-all-lo", ratio(ea.q05));
  fill("err-a-all-hi", ratio(ea.q95));
  fill("calls-a-all-pct", change(c("calls", "agent", "all").mean));
  fill("calls-f-all-pct", change(c("calls", "forgiving", "all").mean));
  fill("tok-f-h45-pct", change(c("tokens", "forgiving", "claude-haiku-4-5").mean));
  const ca = c("cost", "agent", "sonnet");
  fill("cost-a-sonnet-pct", change(ca.mean));
  fill("cost-a-sonnet-lo", change(ca.q05));
  fill("cost-a-sonnet-hi", change(ca.q95));
  fill("cost-f-sonnet-pct", change(c("cost", "forgiving", "sonnet").mean));
  fill("cost-haiku-plain", (p.cost.cells.haiku.plain.mean * 1000).toFixed(2));
  fill("cost-sonnet-plain", (p.cost.cells.sonnet.plain.mean * 1000).toFixed(2));
  fill("success-min", pct(Math.min(...MODELS.flatMap((m) => Object.values(p.success.cells[m]).map((v) => v.q05)))));
  fill("rhat", Math.max(...Object.values(p).map((o) => o.diagnostics.rhat_max)).toFixed(3));

  const ho = d.holdout;
  fill("ho-runs", ho.runs);
  fill("ho-err-total", d3.sum(Object.values(ho.errors), (e) => e.observed));
  fill("ho-h45-pred", pct(1 - ho.token_ratio["claude-haiku-4-5"].q50));
  fill("ho-h45-obs", pct(1 - ho.token_ratio["claude-haiku-4-5"].observed));
  fill("pred-commit", ho.prediction_commit);
}

async function main() {
  const d = await (await fetch("data.json")).json();
  fillText(d);
  kindsTable(document.getElementById("table-kinds"), d.main.error_kinds);
  effectsChart(document.getElementById("chart-effects"), d.posterior);
  costChart(document.getElementById("chart-cost"), d.posterior.cost.cells);
  tasksChart(document.getElementById("chart-tasks"), d.posterior.calls.tasks);
  predictionChart(document.getElementById("chart-prediction"), d.holdout);
}

document.getElementById("theme").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
});

main();
