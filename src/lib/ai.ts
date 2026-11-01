import { ollamaJSON } from "./ollama";

/* ---------- A. Resume Understanding ---------- */

export interface ParsedResume {
  skills: string[];
  technologies: string[];
  projects: { title: string; description: string }[];
  certifications: string[];
  experience: { title: string; org: string; description: string }[];
  domains: string[];
}

export async function parseResume(resumeText: string): Promise<ParsedResume> {
  return ollamaJSON<ParsedResume>({
    system:
      "You are an assistant that extracts structured career information from a student's resume text for a campus placement platform.",
    prompt: resumeText,
    schemaHint: `{
  "skills": string[],
  "technologies": string[],
  "projects": [{"title": string, "description": string}],
  "certifications": string[],
  "experience": [{"title": string, "org": string, "description": string}],
  "domains": string[]
}`,
  });
}

/* ---------- B. Job Description Understanding ---------- */

export interface ParsedJD {
  role: string;
  requiredSkills: string[];
  preferredSkills: string[];
  eligibilityNotes: string[];
  qualifications: string[];
  experienceNeeded: string;
  summary: string;
}

export async function parseJobDescription(jdText: string, jobRole: string): Promise<ParsedJD> {
  return ollamaJSON<ParsedJD>({
    system:
      "You are an assistant that reads a recruiter's job description for a campus placement drive and extracts structured hiring requirements.",
    prompt: `Job role: ${jobRole}\n\nJob description:\n${jdText}`,
    schemaHint: `{
  "role": string,
  "requiredSkills": string[],
  "preferredSkills": string[],
  "eligibilityNotes": string[],
  "qualifications": string[],
  "experienceNeeded": string,
  "summary": string
}`,
  });
}

/* ---------- C + D. Candidate-Job Matching + Explainability ---------- */

export interface MatchResult {
  fitScore: number; // 0-100
  matchedSkills: string[];
  missingSkills: string[];
  relevantProjects: string[];
  relevantCertifications: string[];
  explanation: string;
}

export async function matchCandidateToJob(input: {
  studentSkills: string[];
  studentProjects: string;
  studentCertifications: string[];
  studentExperience: string;
  assessmentSummary: string;
  requiredSkills: string[];
  preferredSkills: string[];
  jobSummary: string;
}): Promise<MatchResult> {
  return ollamaJSON<MatchResult>({
    system: `You compare a student's profile against a job's requirements for a campus placement platform.
Produce an AI Fit Score from 0-100 representing how well the profile matches the STATED requirements
(skills, projects, certifications, assessments) — NOT a prediction of selection probability.
Always explain the score in plain, specific language a student or recruiter can act on.`,
    prompt: `STUDENT PROFILE
Skills: ${input.studentSkills.join(", ") || "none listed"}
Projects: ${input.studentProjects || "none listed"}
Certifications: ${input.studentCertifications.join(", ") || "none listed"}
Experience: ${input.studentExperience || "none listed"}
Assessment performance: ${input.assessmentSummary}

JOB REQUIREMENTS
Summary: ${input.jobSummary}
Required skills: ${input.requiredSkills.join(", ")}
Preferred skills: ${input.preferredSkills.join(", ")}`,
    schemaHint: `{
  "fitScore": number,
  "matchedSkills": string[],
  "missingSkills": string[],
  "relevantProjects": string[],
  "relevantCertifications": string[],
  "explanation": string
}`,
  });
}

/* ---------- Readiness Analysis (student-facing, not tied to one job) ---------- */

export interface ReadinessResult {
  readinessLevel: "NOT_READY" | "DEVELOPING" | "READY" | "HIGHLY_READY";
  summary: string;
  strengths: string[];
  skillGaps: string[];
  improvementAreas: string[];
}

export async function analyzeReadiness(input: {
  cgpa: number;
  backlogs: number;
  aptitudeScore?: number | null;
  reasoningScore?: number | null;
  verbalScore?: number | null;
  communicationScore?: number | null;
  skills: string[];
  projects: string;
  certifications: string[];
  experience: string;
  preferredRoles: string[];
}): Promise<ReadinessResult> {
  return ollamaJSON<ReadinessResult>({
    system: `You assess a student's overall placement readiness for a campus recruitment platform.
Levels, from lowest to highest: NOT_READY, DEVELOPING, READY, HIGHLY_READY.
Base the level on academic standing, assessment scores, and career profile completeness/strength
relative to their preferred roles. Always explain WHY they got this level.`,
    prompt: `CGPA: ${input.cgpa}, Backlogs: ${input.backlogs}
Aptitude: ${input.aptitudeScore ?? "N/A"}, Reasoning: ${input.reasoningScore ?? "N/A"}, Verbal: ${
      input.verbalScore ?? "N/A"
    }, Communication: ${input.communicationScore ?? "N/A"}
Skills: ${input.skills.join(", ") || "none listed"}
Projects: ${input.projects || "none listed"}
Certifications: ${input.certifications.join(", ") || "none listed"}
Experience: ${input.experience || "none listed"}
Preferred roles/domains: ${input.preferredRoles.join(", ") || "not specified"}`,
    schemaHint: `{
  "readinessLevel": "NOT_READY" | "DEVELOPING" | "READY" | "HIGHLY_READY",
  "summary": string,
  "strengths": string[],
  "skillGaps": string[],
  "improvementAreas": string[]
}`,
  });
}

/* ---------- F. Personalized Preparation ---------- */

export interface PrepPlan {
  focusAreas: string[];
  recommendations: { area: string; suggestion: string }[];
}

export async function generatePrepPlan(input: {
  skillGaps: string[];
  targetRole: string;
}): Promise<PrepPlan> {
  return ollamaJSON<PrepPlan>({
    system:
      "You generate a short, actionable preparation plan for a student targeting a specific role, based on their current skill gaps.",
    prompt: `Target role: ${input.targetRole}\nSkill gaps: ${input.skillGaps.join(", ")}`,
    schemaHint: `{
  "focusAreas": string[],
  "recommendations": [{"area": string, "suggestion": string}]
}`,
  });
}

/* ---------- Skill roadmap (from the gaps across the student's open drives) ---------- */

export interface Roadmap {
  steps: { skill: string; whyItMatters: string; howToLearn: string; miniProject: string }[];
}

export async function generateRoadmap(input: {
  gaps: { skill: string; drives: number; roles: string[] }[];
  currentSkills: string[];
}): Promise<Roadmap> {
  return ollamaJSON<Roadmap>({
    system:
      "You are a friendly placement mentor. For each missing skill, give a short, realistic plan a student can start this week. Keep every field to one or two sentences. Do not invent courses, websites or certificates by name.",
    prompt: `Student's current skills: ${input.currentSkills.join(", ") || "none listed"}
Missing skills (with how many open drives ask for them):
${input.gaps
      .map((g) => `- ${g.skill}: wanted by ${g.drives} drive(s) (${g.roles.join(", ")})`)
      .join("\n")}`,
    schemaHint: `{
  "steps": [{"skill": string, "whyItMatters": string, "howToLearn": string, "miniProject": string}]
}`,
    temperature: 0.3,
  });
}

/* ---------- Resume feedback ---------- */

export interface ResumeFeedback {
  strengths: string[];
  improvements: { issue: string; suggestion: string }[];
}

export async function reviewResume(resumeText: string): Promise<ResumeFeedback> {
  return ollamaJSON<ResumeFeedback>({
    system:
      "You review a student's resume for a campus placement. Give 2-3 genuine strengths and 3-5 specific, concrete improvements (e.g. add measurable results, name the technologies used, shorten vague bullets). Refer to actual content in the resume. Be encouraging, never harsh. Do not rewrite the whole resume.",
    prompt: resumeText.slice(0, 12000),
    schemaHint: `{
  "strengths": string[],
  "improvements": [{"issue": string, "suggestion": string}]
}`,
    temperature: 0.3,
  });
}
