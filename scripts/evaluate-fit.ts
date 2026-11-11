/**
 * Evaluates the AI fit score: how consistent is it, how fast, and does it agree with common sense?
 *
 * It takes a fixed set of sample student/drive pairs (written below, made up for this test, not read from the
 * database), asks the same local model the website uses to score each pair several times, and reports:
 *   - consistency: the spread of the repeated scores (standard deviation, range, share within +/-5 of the mean)
 *   - reliability: how many runs returned a usable answer
 *   - speed: average, median and slowest time per score
 *   - sense: does the average land in the band we expect for that pair, and does it move with a plain
 *     skill-overlap count (a deterministic baseline) across the pairs?
 *
 * Usage (Ollama must be running with your model pulled):
 *   npm run evaluate                 full run: 8 pairs x 5 runs
 *   npm run evaluate -- --quick      3 pairs x 3 runs, for a fast check
 *   npm run evaluate -- --runs 10    more repeats per pair
 *   npm run evaluate -- --mock       no AI: checks that this script itself works (output is labelled MOCK)
 *
 * Results are printed and written to evaluation-results/ as a Markdown table and a JSON file.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/* ---------- Settings from .env (the site reads the same two names) ---------- */
function loadEnv() {
  const file = join(process.cwd(), ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(OLLAMA_BASE_URL|OLLAMA_MODEL)\s*=\s*"?([^"#]*)"?\s*(?:#.*)?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

/* ---------- Sample data (made up for this evaluation) ---------- */
interface Profile {
  name: string;
  skills: string[];
  projects: string;
  certifications: string[];
  experience: string;
  assessment: string;
}
interface Drive {
  name: string;
  summary: string;
  required: string[];
  preferred: string[];
}
interface Pair {
  id: string;
  student: Profile;
  drive: Drive;
  expect: "strong" | "partial" | "weak";
}

const BACKEND: Drive = {
  name: "Backend Developer",
  summary: "Build and maintain REST services in Java with Spring Boot, backed by a SQL database.",
  required: ["Java", "Spring Boot", "SQL", "REST APIs", "Git"],
  preferred: ["Docker", "AWS"],
};
const ANALYST: Drive = {
  name: "Data Analyst",
  summary: "Clean data, write SQL queries and build dashboards and reports for business teams.",
  required: ["Python", "SQL", "Excel", "Power BI", "Statistics"],
  preferred: ["Tableau", "Machine Learning basics"],
};
const FRONTEND: Drive = {
  name: "Frontend Developer",
  summary: "Build responsive web interfaces with React, HTML and CSS.",
  required: ["JavaScript", "React", "HTML", "CSS", "Git"],
  preferred: ["TypeScript", "Tailwind CSS"],
};

const S_BACKEND: Profile = {
  name: "Strong backend profile",
  skills: ["Java", "Spring Boot", "SQL", "REST APIs", "Git", "Docker"],
  projects: "Library Management API: REST service in Spring Boot with MySQL and JWT login; deployed with Docker.",
  certifications: ["Oracle Java SE Associate"],
  experience: "Summer internship: built two REST endpoints for an internal tool.",
  assessment: "Aptitude 78, Communication 72",
};
const S_PARTIAL_BACKEND: Profile = {
  name: "Python and SQL student",
  skills: ["Python", "SQL", "Git", "Basic Java"],
  projects: "Student result portal in Flask with SQLite.",
  certifications: [],
  experience: "none listed",
  assessment: "Aptitude 64, Communication 60",
};
const S_DATA: Profile = {
  name: "Strong data profile",
  skills: ["Python", "SQL", "Excel", "Power BI", "Statistics", "Pandas"],
  projects: "Sales dashboard in Power BI; churn analysis in Python with Pandas and basic statistics.",
  certifications: ["Google Data Analytics Certificate"],
  experience: "Data entry and reporting intern for 2 months.",
  assessment: "Aptitude 81, Communication 69",
};
const S_FRONTEND: Profile = {
  name: "Strong frontend profile",
  skills: ["JavaScript", "React", "HTML", "CSS", "Git", "TypeScript", "Tailwind CSS"],
  projects: "Portfolio site and a weather app in React with Tailwind CSS; a to-do app with TypeScript.",
  certifications: [],
  experience: "none listed",
  assessment: "Aptitude 70, Communication 75",
};
const S_MIXED: Profile = {
  name: "Web basics with SQL",
  skills: ["HTML", "CSS", "JavaScript", "SQL"],
  projects: "Static college event page; a quiz app in plain JavaScript.",
  certifications: [],
  experience: "none listed",
  assessment: "Aptitude 58, Communication 66",
};
const S_WEAK: Profile = {
  name: "Little relevant experience",
  skills: ["MS Word", "Basic C"],
  projects: "none listed",
  certifications: [],
  experience: "none listed",
  assessment: "Aptitude 49, Communication 55",
};

const PAIRS: Pair[] = [
  { id: "P1", student: S_BACKEND, drive: BACKEND, expect: "strong" },
  { id: "P2", student: S_PARTIAL_BACKEND, drive: BACKEND, expect: "partial" },
  { id: "P3", student: S_WEAK, drive: BACKEND, expect: "weak" },
  { id: "P4", student: S_DATA, drive: ANALYST, expect: "strong" },
  { id: "P5", student: S_BACKEND, drive: ANALYST, expect: "partial" },
  { id: "P6", student: S_FRONTEND, drive: FRONTEND, expect: "strong" },
  { id: "P7", student: S_MIXED, drive: FRONTEND, expect: "partial" },
  { id: "P8", student: S_WEAK, drive: FRONTEND, expect: "weak" },
];
const QUICK_IDS = ["P1", "P2", "P3"];

/** What we expect, as a score band. A rough human judgement, used only as a sanity check. */
const BANDS = { strong: [70, 100], partial: [30, 70], weak: [0, 40] } as const;

/* ---------- Deterministic baseline: how many required skills does the student list? ---------- */
export function skillOverlapPercent(have: string[], required: string[]): number {
  if (required.length === 0) return 0;
  const mine = new Set(have.map((s) => s.trim().toLowerCase()));
  const hit = required.filter((r) => mine.has(r.trim().toLowerCase())).length;
  return Math.round((hit / required.length) * 100);
}

/* ---------- Statistics ---------- */
export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
export function percentile(xs: number[], p: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}
export function pearson(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null;
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da === 0 || db === 0 ? null : num / Math.sqrt(da * db);
}

/* ---------- Running ---------- */
interface PairResult {
  id: string;
  student: string;
  drive: string;
  expect: string;
  baseline: number;
  scores: number[];
  failures: number;
  seconds: number[];
  mean: number;
  sd: number;
  min: number;
  max: number;
  range: number;
  within5: number; // percent of runs within +/-5 of the mean
  inBand: boolean;
}

function parseArgs(argv: string[]) {
  const a = { runs: 5, quick: false, mock: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--quick") a.quick = true;
    else if (argv[i] === "--mock") a.mock = true;
    else if (argv[i] === "--runs") a.runs = Math.max(2, Math.min(30, parseInt(argv[++i] ?? "5", 10) || 5));
  }
  if (a.quick) a.runs = Math.min(a.runs, 3);
  return a;
}

/** A fake scorer for --mock only: roughly follows skill overlap with a little noise. Never used for real results. */
function mockScore(baseline: number, run: number): number {
  const noise = ((run * 37) % 9) - 4;
  return Math.max(0, Math.min(100, Math.round(baseline * 0.9 + 5 + noise)));
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const pairs = args.quick ? PAIRS.filter((p) => QUICK_IDS.includes(p.id)) : PAIRS;
  const model = process.env.OLLAMA_MODEL || "gemma4:e4b";

  // Loaded here so --mock never needs the model or the database.
  const { matchCandidateToJob } = args.mock ? { matchCandidateToJob: null } : await import("../src/lib/ai");

  console.log(`\nC-Link fit score evaluation${args.mock ? "  [MOCK MODE: not a real measurement]" : ""}`);
  console.log(`Model: ${args.mock ? "none (mock)" : model} | pairs: ${pairs.length} | runs per pair: ${args.runs}\n`);

  const results: PairResult[] = [];
  for (const pair of pairs) {
    const baseline = skillOverlapPercent(pair.student.skills, pair.drive.required);
    const scores: number[] = [];
    const seconds: number[] = [];
    let failures = 0;
    for (let run = 0; run < args.runs; run++) {
      const t0 = Date.now();
      try {
        const score = args.mock
          ? mockScore(baseline, run)
          : (
              await matchCandidateToJob!({
                studentSkills: pair.student.skills,
                studentProjects: pair.student.projects,
                studentCertifications: pair.student.certifications,
                studentExperience: pair.student.experience,
                assessmentSummary: pair.student.assessment,
                requiredSkills: pair.drive.required,
                preferredSkills: pair.drive.preferred,
                jobSummary: pair.drive.summary,
              })
            ).fitScore;
        scores.push(score);
        seconds.push((Date.now() - t0) / 1000 + (args.mock ? 0.5 + (run % 3) * 0.1 : 0));
        process.stdout.write(`  ${pair.id} run ${run + 1}/${args.runs}: score ${score} (${seconds[seconds.length - 1].toFixed(1)}s)\n`);
      } catch (err) {
        failures++;
        process.stdout.write(`  ${pair.id} run ${run + 1}/${args.runs}: FAILED (${(err as Error).message.slice(0, 80)})\n`);
      }
    }
    // If the very first pair cannot be scored at all, the AI is not reachable: stop now instead of failing for minutes.
    if (results.length === 0 && scores.length === 0) {
      throw new Error(
        `The AI did not answer any of the ${args.runs} runs for the first pair. Check that Ollama is running, that "${model}" is pulled, and OLLAMA_BASE_URL in .env.`
      );
    }
    const m = mean(scores);
    const [lo, hi] = BANDS[pair.expect];
    results.push({
      id: pair.id,
      student: pair.student.name,
      drive: pair.drive.name,
      expect: pair.expect,
      baseline,
      scores,
      failures,
      seconds,
      mean: m,
      sd: stdev(scores),
      min: scores.length ? Math.min(...scores) : NaN,
      max: scores.length ? Math.max(...scores) : NaN,
      range: scores.length ? Math.max(...scores) - Math.min(...scores) : NaN,
      within5: scores.length ? Math.round((scores.filter((s) => Math.abs(s - m) <= 5).length / scores.length) * 100) : 0,
      inBand: scores.length > 0 && m >= lo && m <= hi,
    });
  }

  /* ---------- Summary ---------- */
  const ok = results.filter((r) => r.scores.length > 0);
  const allSeconds = results.flatMap((r) => r.seconds);
  const totalRuns = results.length * args.runs;
  const totalFail = results.reduce((a, r) => a + r.failures, 0);
  const r = pearson(ok.map((x) => x.mean), ok.map((x) => x.baseline));
  const summary = {
    pairs: results.length,
    runsPerPair: args.runs,
    successRate: Math.round(((totalRuns - totalFail) / totalRuns) * 100),
    meanSd: round1(mean(ok.map((x) => x.sd))),
    pairsWithRangeWithin10: ok.filter((x) => x.range <= 10).length,
    meanWithin5: Math.round(mean(ok.map((x) => x.within5))),
    expectedBandHits: ok.filter((x) => x.inBand).length,
    correlationWithSkillOverlap: r === null ? null : Math.round(r * 100) / 100,
    secondsMean: round1(mean(allSeconds)),
    secondsMedian: round1(median(allSeconds)),
    secondsP95: round1(percentile(allSeconds, 95)),
    secondsMax: round1(allSeconds.length ? Math.max(...allSeconds) : NaN),
  };

  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const md = renderMarkdown({ mock: args.mock, model, stamp, results, summary });
  console.log("\n" + md);

  const dir = join(process.cwd(), "evaluation-results");
  mkdirSync(dir, { recursive: true });
  const base = join(dir, `${args.mock ? "MOCK-" : ""}fit-score-${stamp}`);
  writeFileSync(`${base}.md`, md);
  writeFileSync(`${base}.json`, JSON.stringify({ mock: args.mock, model, stamp, summary, results }, null, 2));
  console.log(`Saved: ${base}.md and .json\n`);
}

function round1(n: number) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : NaN;
}
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "–");
const f0 = (n: number) => (Number.isFinite(n) ? String(Math.round(n)) : "–");

function renderMarkdown(o: {
  mock: boolean;
  model: string;
  stamp: string;
  results: PairResult[];
  summary: ReturnType<typeof Object>;
}): string {
  const s = o.summary as Record<string, number | null>;
  const lines: string[] = [];
  lines.push(`# C-Link fit score evaluation`);
  lines.push("");
  if (o.mock) lines.push("> **MOCK DATA. This run did not use the AI. It only checks that the script works. Do not quote these numbers.**", "");
  lines.push(`Model: \`${o.mock ? "none (mock)" : o.model}\` · Run: ${o.stamp} · ${s.pairs} sample pairs × ${s.runsPerPair} runs each`, "");
  lines.push("## Per pair", "");
  lines.push("| Pair | Student → Drive | Expected | Skill overlap | Scores | Mean | Std dev | Range | Within ±5 | Avg time |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of o.results) {
    lines.push(
      `| ${r.id} | ${r.student} → ${r.drive} | ${r.expect} | ${r.baseline}% | ${r.scores.join(", ") || "none"}${r.failures ? ` (${r.failures} failed)` : ""} | ${f1(r.mean)} | ${f1(r.sd)} | ${f0(r.range)} | ${r.within5}% | ${f1(mean(r.seconds))}s |`
    );
  }
  lines.push("", "## Summary", "");
  lines.push("| Measure | Result |", "|---|---|");
  lines.push(`| Runs that returned a usable answer | ${s.successRate}% |`);
  lines.push(`| Average spread of repeated scores (std dev, points) | ${f1(s.meanSd as number)} |`);
  lines.push(`| Pairs whose repeated scores stay within 10 points | ${s.pairsWithRangeWithin10} of ${s.pairs} |`);
  lines.push(`| Runs within ±5 of that pair's mean | ${s.meanWithin5}% |`);
  lines.push(`| Pairs whose mean lands in the expected band | ${s.expectedBandHits} of ${s.pairs} |`);
  lines.push(`| Correlation with plain skill overlap (−1 to 1) | ${s.correlationWithSkillOverlap ?? "not enough variation"} |`);
  lines.push(`| Time per score: mean / median / 95th percentile / slowest | ${f1(s.secondsMean as number)}s / ${f1(s.secondsMedian as number)}s / ${f1(s.secondsP95 as number)}s / ${f1(s.secondsMax as number)}s |`);
  lines.push("", "Expected bands: strong 70–100, partial 30–70, weak 0–40. The bands are a rough human judgement used as a sanity check, not a ground truth.");
  lines.push("The AI score is advice for a person. It is never used to shortlist or rank anyone on its own.", "");
  return lines.join("\n");
}

// Run only when started directly, so selftest can import the statistics helpers without starting an evaluation.
if (process.argv[1] && /evaluate-fit\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error("Evaluation stopped:", (err as Error).message);
    process.exit(1);
  });
}
