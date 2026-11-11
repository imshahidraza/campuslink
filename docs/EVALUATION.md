# C-Link AI fit-score evaluation

**Question:** when the same student and the same drive are scored again and again by the local model (`gemma4:e2b` through Ollama), how steady, how reliable and how fast is the fit score, and does it agree with common sense?

**What this is not:** a test of accuracy against real hiring outcomes. C-Link has no such ground truth, and the AI never selects or ranks anyone. The fit score is advice shown to the student and the placement cell; humans decide.

## How the test works

`npm run evaluate` (script: `scripts/evaluate-fit.ts`)

* It uses **8 made-up student and drive pairs** written inside the script. It does not read the database, so no real student data is involved.
* Each pair is scored **5 times** (full run) by the same function the website uses, `matchCandidateToJob`, on the same Ollama model. `--quick` uses 3 pairs x 3 runs. `--runs 10` repeats more.
* Pairs are chosen to be clearly strong, partial or weak:

| Pair | Student | Drive | Expected |
| --- | --- | --- | --- |
| P1 | Strong backend profile | Backend Developer | strong |
| P2 | Partial backend profile | Backend Developer | partial |
| P3 | Weak profile | Backend Developer | weak |
| P4 | Data profile | Data Analyst | strong |
| P5 | Strong backend profile | Data Analyst | partial |
| P6 | Frontend profile | Frontend Developer | strong |
| P7 | Mixed profile | Frontend Developer | partial |
| P8 | Weak profile | Frontend Developer | weak |

## What it measures

| Measure | Meaning |
| --- | --- |
| Mean score | Average of the repeated scores for one pair. |
| Standard deviation (SD) | How much repeated scores move. Lower is steadier. |
| Range | Highest minus lowest score for the pair. |
| Within ±5 | Share of runs that land within 5 points of that pair's mean. |
| Success rate | Share of runs that returned a usable score (the model can time out or answer badly). |
| Time | Mean, median, 95th percentile and slowest seconds per score. |
| Expected band | Does the pair's mean fall in its band: strong 70-100, partial 30-70, weak 0-40? A rough human judgement, used only as a sanity check. |
| Agreement with baseline | Correlation (Pearson r) between the AI mean per pair and a plain count: the share of the drive's required skills that the student lists. A value near 1 means the AI moves with the obvious signal. |

## Results

**No AI results are recorded in this file yet.** The environment where this was written has no Ollama, so no score here can honestly be filled in. Run the script on the machine that has the model, then copy the table that it prints (it also saves `evaluation-results/fit-score-<time>.md` and `.json`) into the section below.

```bash
ollama serve                     # in one terminal, with gemma4:e2b pulled
npm run evaluate                 # full run, about 8 pairs x 5 runs
```

With about 27 seconds per score, a full run takes roughly 18 minutes, and `--quick` about 4 minutes.

### Paste the results here

| Pair | Student -> Drive | Expected | Baseline | Scores | Mean | SD | Range | Within ±5 | Avg time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| _fill from the script output_ | | | | | | | | | |

| Summary | Value |
| --- | --- |
| Success rate | |
| Mean SD across pairs | |
| Pairs whose range stays within 10 points | |
| Runs within ±5 of their pair's mean | |
| Pairs whose mean lands in the expected band | |
| Agreement with baseline (Pearson r) | |
| Time per score: mean / median / 95th percentile / slowest | |

Date run: ____  Model: gemma4:e2b  Machine: ____

## How to read it honestly

* A small SD and a high "within ±5" mean the score is steady. A large range on one pair means a single score for that pair should be read as "roughly this", which is how the screens already present it (advice with a written explanation, never a decision).
* Eight pairs is a small sample. It shows steadiness and speed; it does not prove accuracy.
* The skill-overlap baseline is a simple count. Agreement with it means the AI is not contradicting an obvious signal; it does not mean the AI is "right".
* `--mock` exists only to check that the script itself works. Its output files start with `MOCK-` and must never be quoted as results.
* Exact eligibility (CGPA, backlogs, specialization, graduation year) never uses AI. It is plain TypeScript in `src/lib/rules.ts`, so it is consistent every time by construction. Same for the eligibility assistant's verdicts: the AI only words the facts, and its wording is rejected if it adds a number or verdict that is not in the facts.
