"use client";

import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import {
  AlertCircle,
  Ban,
  BookOpen,
  CalendarClock,
  ExternalLink,
  Gauge,
  Percent,
  Receipt,
  RefreshCw,
  Scale,
  Search,
  X,
} from "lucide-react";

/* ----------------------------- types & helpers ----------------------------- */

type Rule = {
  id: string;
  category: string;
  ruleCode: string;
  ruleName: string;
  valueJson: any;
  effectiveFrom: string;
  effectiveTo?: string | null;
  description?: string | null;
  officialSource?: string | null;
  sourceQuote?: string | null;
  status?: string | null;
  updatedAt?: string | null;
};

type Phase = "current" | "upcoming" | "superseded";

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; order: number }> = {
  RATE: { label: "GST rates", icon: Percent, order: 1 },
  CESS: { label: "Cess", icon: Receipt, order: 2 },
  DUE_DATE: { label: "Due dates", icon: CalendarClock, order: 3 },
  ITC_RULE: { label: "Input tax credit", icon: Scale, order: 4 },
  BLOCK_ITC: { label: "Blocked credit", icon: Ban, order: 5 },
  THRESHOLD: { label: "Thresholds", icon: Gauge, order: 6 },
  PENALTY: { label: "Interest & late fee", icon: AlertCircle, order: 7 },
};

const metaFor = (cat: string) =>
  CATEGORY_META[cat] ?? { label: cat.replace(/_/g, " ").toLowerCase(), icon: BookOpen, order: 99 };

// "2017-07-01 00:00:00" (CSV style) is not valid ISO in every browser.
const toDate = (s?: string | null) => (s ? new Date(String(s).replace(" ", "T")) : null);

const fmtDate = (s?: string | null) => {
  const d = toDate(s);
  return d && !isNaN(d.getTime())
    ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
    : "";
};

const parseValue = (v: any) => {
  if (typeof v !== "string") return v ?? {};
  try {
    return JSON.parse(v);
  } catch {
    return { value: v };
  }
};

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

const humanize = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function phaseOf(rule: Rule, now: Date): Phase {
  const from = toDate(rule.effectiveFrom);
  const to = toDate(rule.effectiveTo);
  if (from && from > now) return "upcoming";
  // effectiveTo is inclusive: valid through the end of that day
  if (to && now.getTime() >= to.getTime() + 24 * 60 * 60 * 1000) return "superseded";
  return "current";
}

function searchText(rule: Rule) {
  const v = parseValue(rule.valueJson);
  const rate = typeof v.rate === "number" ? `${v.rate}% ${v.rate} percent` : "";
  return [
    rule.ruleName,
    rule.ruleCode,
    metaFor(rule.category).label,
    rule.category,
    rule.description,
    rule.sourceQuote,
    rate,
    JSON.stringify(v),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const sortRules = (a: Rule, b: Rule) => {
  const va = parseValue(a.valueJson);
  const vb = parseValue(b.valueJson);
  if (typeof va.rate === "number" && typeof vb.rate === "number") return va.rate - vb.rate;
  return a.ruleName.localeCompare(b.ruleName);
};

/* ------------------------------ value renderers ----------------------------- */

function Facts({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 text-xs">
          <dt className="text-slate-500">{r.label}</dt>
          <dd className="text-right font-semibold text-slate-900">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RuleValue({ rule }: { rule: Rule }) {
  const v = parseValue(rule.valueJson);

  if (rule.category === "RATE" && typeof v.rate === "number") {
    return (
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          ["CGST", v.cgst],
          ["SGST / UTGST", v.sgst],
          ["IGST", v.igst],
        ].map(([label, val]) => (
          <span key={label as string} className="rounded-lg bg-slate-50 px-2.5 py-1 ring-1 ring-slate-200">
            <span className="text-slate-500">{label}</span>{" "}
            <span className="font-semibold tabular-nums text-slate-900">{val}%</span>
          </span>
        ))}
      </div>
    );
  }

  if (Array.isArray(v.categories)) {
    return (
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {v.categories.map((c: any) => (
          <li key={c.code} className="flex gap-2 text-xs leading-relaxed text-slate-700">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
            <span>{c.name}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (Array.isArray(v.items)) return <Facts rows={v.items} />;

  const rest = Object.entries(v).filter(([k]) => !["dayOfMonth", "frequency", "rate", "cgst", "sgst", "igst"].includes(k));
  if (rest.length) return <Facts rows={rest.map(([k, val]) => ({ label: humanize(k), value: String(val) }))} />;
  return null;
}

function Headline({ rule }: { rule: Rule }) {
  const v = parseValue(rule.valueJson);
  if (rule.category === "RATE" && typeof v.rate === "number") {
    return (
      <div className="text-right">
        <div className="text-3xl font-bold tabular-nums leading-none text-slate-900">{v.rate}%</div>
        <div className="mt-1 text-[11px] text-slate-500">total GST</div>
      </div>
    );
  }
  if (rule.category === "DUE_DATE" && typeof v.dayOfMonth === "number") {
    return (
      <div className="text-right">
        <div className="text-2xl font-bold leading-none text-slate-900">{ordinal(v.dayOfMonth)}</div>
        <div className="mt-1 text-[11px] text-slate-500">{String(v.frequency || "").toLowerCase()}</div>
      </div>
    );
  }
  if (rule.category === "DUE_DATE" && v.frequency) {
    return <div className="text-right text-[11px] font-medium text-slate-500">{String(v.frequency).toLowerCase()}</div>;
  }
  return null;
}

/* --------------------------------- cards ----------------------------------- */

function RuleCard({ rule, phase }: { rule: Rule; phase: Phase }) {
  const to = fmtDate(rule.effectiveTo);
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{rule.ruleName}</h3>
          <p className="mt-0.5 font-mono text-[11px] text-slate-400">{rule.ruleCode}</p>
        </div>
        <Headline rule={rule} />
      </div>

      {rule.description && <p className="mt-3 max-w-prose text-sm leading-relaxed text-slate-600">{rule.description}</p>}

      <div className="mt-4">
        <RuleValue rule={rule} />
      </div>

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-2">
          <span
            className={
              "rounded-full px-2 py-0.5 font-medium " +
              (phase === "current"
                ? "bg-emerald-50 text-emerald-700"
                : phase === "upcoming"
                ? "bg-amber-50 text-amber-700"
                : "bg-slate-100 text-slate-600")
            }
          >
            {phase === "current" ? "In force" : phase === "upcoming" ? "Upcoming" : "Superseded"}
          </span>
          <span>
            {phase === "upcoming" ? "From" : "Effective"} {fmtDate(rule.effectiveFrom)}
            {to ? ` – ${to}` : phase === "current" ? " onwards" : ""}
          </span>
        </span>

        {rule.officialSource && (
          <a
            href={rule.officialSource}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
          >
            {rule.sourceQuote || new URL(rule.officialSource).hostname}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </footer>
    </article>
  );
}

/* ---------------------------------- page ----------------------------------- */

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("ALL");
  const [phase, setPhase] = useState<Phase>("current");

  const load = async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<{ rules?: Rule[] }>("/rules?includeHistory=true");
    if (res.data) {
      const list = res.data.rules || [];
      setRules(list);
    } else {
      setError(res.error || "Could not load GST rules. Please try again.");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const now = useMemo(() => new Date(), []);

  const withPhase = useMemo(() => rules.map((r) => ({ rule: r, phase: phaseOf(r, now), text: searchText(r) })), [rules, now]);

  const counts = useMemo(() => {
    const c: Record<Phase, number> = { current: 0, upcoming: 0, superseded: 0 };
    withPhase.forEach((x) => c[x.phase]++);
    return c;
  }, [withPhase]);

  // If the search term is set, look across every phase so a user can still find a superseded rate.
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;

  const matches = useMemo(
    () =>
      withPhase.filter(
        (x) => (searching || x.phase === phase) && terms.every((t) => x.text.includes(t))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [withPhase, phase, query]
  );

  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = {};
    matches.forEach((x) => (c[x.rule.category] = (c[x.rule.category] || 0) + 1));
    return c;
  }, [matches]);

  const visible = matches.filter((x) => category === "ALL" || x.rule.category === category);

  const grouped = useMemo(() => {
    const g: Record<string, typeof visible> = {};
    visible.forEach((x) => (g[x.rule.category] = [...(g[x.rule.category] || []), x]));
    return Object.entries(g)
      .sort(([a], [b]) => metaFor(a).order - metaFor(b).order)
      .map(([cat, items]) => [cat, [...items].sort((a, b) => sortRules(a.rule, b.rule))] as const);
  }, [visible]);

  const lastUpdated = useMemo(() => {
    const t = rules.map((r) => toDate(r.updatedAt)?.getTime() || 0).filter(Boolean);
    return t.length ? fmtDate(new Date(Math.max(...t)).toISOString()) : "";
  }, [rules]);

  const tabs: { id: Phase; label: string; hidden?: boolean }[] = [
    { id: "current", label: "In force" },
    { id: "upcoming", label: "Upcoming", hidden: counts.upcoming === 0 },
    { id: "superseded", label: "Superseded" },
  ];

    return (
    <div className="w-full space-y-5">
      {/* Header */}
      <header className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <BookOpen className="h-5 w-5 text-blue-600" />
          GST rules and rates
        </h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Curated rules and rate references link to their source documents; this is not a live government feed. A rate slab is not a substitute for checking the applicable HSN/SAC notification and any later amendments.
          {lastUpdated && <> Database records last updated {lastUpdated}.</>}
        </p>
      </header>

      {/* Search (separate box, same as GST Dictionary) */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search rules, e.g. 18%, GSTR-3B, motor vehicle, e-invoice"
          aria-label="Search GST rules"
          className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-11 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by category">
          {["ALL", ...Object.keys(categoryCounts).sort((a, b) => metaFor(a).order - metaFor(b).order)].map((c) => {
            const active = category === c;
            const n = c === "ALL" ? matches.length : categoryCounts[c];
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                  (active ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")
                }
              >
                {c === "ALL" ? "All" : metaFor(c).label} <span className={active ? "text-slate-300" : "text-slate-400"}>{n}</span>
              </button>
            );
          })}
        </div>

        {!searching && (
          <div className="inline-flex shrink-0 rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
            {tabs
              .filter((t) => !t.hidden)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => setPhase(t.id)}
                  className={
                    "rounded-md px-3 py-1.5 transition-colors " +
                    (phase === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")
                  }
                >
                  {t.label} <span className="text-slate-400">{counts[t.id]}</span>
                </button>
              ))}
          </div>
        )}
      </div>

      {searching && (
        <p className="text-xs text-slate-500">
          {visible.length} result{visible.length === 1 ? "" : "s"} for “{query.trim()}” across in-force, upcoming and
          superseded rules.
        </p>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-800">{error}</p>
          <button
            onClick={load}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-100"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-800">
            {rules.length === 0 ? "No GST rules are loaded yet" : "No rules found"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {rules.length === 0
              ? "Run `npm run db:seed` in the Backend directory to load the source-linked rate references."
              : "Try a different keyword, such as a rate (18%) or a return name (GSTR-1)."}
          </p>
          {(query || category !== "ALL") && (
            <button
              onClick={() => {
                setQuery("");
                setCategory("ALL");
              }}
              className="mt-3 text-xs font-semibold text-blue-700 hover:underline"
            >
              Clear search and filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([cat, items]) => {
            const Icon = metaFor(cat).icon;
            return (
              <section key={cat} aria-labelledby={`h-${cat}`}>
                <h2 id={`h-${cat}`} className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Icon className="h-4 w-4 text-slate-400" />
                  {metaFor(cat).label}
                </h2>
                <div className="space-y-3">
                  {items.map(({ rule, phase: p }) => (
                    <RuleCard key={rule.id} rule={rule} phase={p} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="pb-4 text-center text-[11px] text-slate-400">
        The applicable rate depends on the time of supply, not only the invoice date. Confirm the current notification on cbic-gst.gov.in; the linked September 2025 GST Council FAQ is not a substitute for later amendments.
      </p>
    </div>
  );
}