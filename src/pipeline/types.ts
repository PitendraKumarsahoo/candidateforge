export interface Location {
  city: string;
  region: string;
  country: string; // ISO-3166 alpha-2
}

export interface Links {
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;
  other: string[];
}

export interface Skill {
  name: string;
  confidence: number;
  verified: boolean;
  sources: string[];
}

export interface Experience {
  company: string;
  title: string;
  start: string; // YYYY-MM
  end: string | null; // YYYY-MM | null
  summary: string;
}

export interface Education {
  institution: string;
  degree: string;
  field: string;
  end_year: number | null;
}

export interface ProvenanceEntry {
  field: string;
  source: string;
  method: string;
  confidence: number;
  verified: boolean;
}

export interface Project {
  name: string;
  description: string;
}

export interface AgentDecision {
  decision: 'shortlist' | 'reject' | 'human_review';
  confidence: number;
  reason: string;
  ml_score_agreement: 'agree' | 'disagree' | 'partial';
  suggested_slot: string | null;
}

export interface CanonicalCandidate {
  candidate_id: string;
  full_name: string;
  emails: string[];
  phones: string[];
  location: Location;
  links: Links;
  headline: string | null;
  years_experience: number | null;
  skills: Skill[];
  experience: Experience[];
  education: Education[];
  projects: Project[];
  provenance: ProvenanceEntry[];
  overall_confidence: number;
  agent_decision?: AgentDecision;
}

// Intermediate profile returned by individual parsers before merging
export interface RawCandidateProfile {
  full_name?: string;
  emails?: string[];
  phones?: string[];
  location?: Partial<Location>;
  links?: Partial<Links>;
  headline?: string;
  years_experience?: number;
  skills?: string[]; // Just names, confidence and sources will be added/computed later
  experience?: Experience[];
  education?: Education[];
  projects?: Project[];
  raw_text?: string; // Stored raw text for ML model analysis
  source_name: string;
  base_confidence: number;
  model_confidence?: number; // Optional model-based confidence score
  model_category?: string; // Optional model-predicted category
  model_skills?: { name: string; confidence: number }[]; // Skills extracted by the ML model
  model_version?: string; // Optional model version
  agent_decision?: AgentDecision;
}

// Runtime Configuration matching instructions
export interface RuntimeConfigField {
  path: string;
  from?: string;
  type: 'string' | 'string[]' | 'number' | 'object' | 'array';
  required?: boolean;
  normalize?: 'E164' | 'canonical' | 'none';
}

export interface RuntimeConfig {
  fields: RuntimeConfigField[];
  include_confidence: boolean;
  on_missing: 'null' | 'omit' | 'error';
}

// Pipeline trace interface for transparency
export interface PipelineTraceStep {
  step: 'Ingest' | 'Extract' | 'Model Inference' | 'Normalize' | 'Merge' | 'Validate' | 'Project';
  status: 'pending' | 'running' | 'done' | 'error';
  duration_ms: number;
  message?: string;
}

export interface PipelineTrace {
  steps: PipelineTraceStep[];
  skipped_rows?: number;
  warnings: string[];
  logs: string[];
  total_duration_ms: number;
  timestamp: string;
}

// API request interface
export interface PipelineRequest {
  sources: {
    csv?: string;        // Raw CSV content
    ats_json?: string;   // Paste JSON blob
    github_url?: string; // GitHub profile URL or username
    linkedin_text?: string;
    resume_base64?: string; // PDF or DOCX file content encoded in base64
    resume_filename?: string;
    notes?: string;
  };
  config?: RuntimeConfig;
}

export interface PipelineResponse {
  success: boolean;
  output: any; // Final projected profile (might be default schema or projected based on config)
  canonical?: CanonicalCandidate;
  canonicalProfiles?: CanonicalCandidate[];
  trace: PipelineTrace;
  error?: string;
}

// --- COMPANY MODE TYPES ---
export enum EducationLevel {
  ANY = 'Any',
  BACHELOR = 'Bachelor',
  MASTER = 'Master'
}

export interface JobPost {
  id: string;
  title: string;
  department: string;
  requiredSkills: string[];
  minExperience: number;
  educationRequirement: EducationLevel;
}

export enum Verdict {
  STRONG_MATCH = 'Strong Match',
  GOOD_MATCH = 'Good Match',
  POSSIBLE_MATCH = 'Possible Match',
  NOT_MATCHED = 'Not Matched'
}

export interface JobMatchResult {
  jobId: string;
  jobTitle: string;
  score: number; // 0-100
  skillMatchScore: number; // 0-1
  experienceScore: number; // 0-1
  educationScore: number; // 0-1
  confidenceScore: number; // 0-1
  verdict: Verdict;
  matchedSkills: string[];
  missingSkills: string[];
}

export interface ProcessedCandidate extends CanonicalCandidate {
  jobMatches: JobMatchResult[];
  shortlistedForJobs: string[]; // job IDs
  rejected: boolean;
  primarySkill?: string;
  secondarySkill?: string;
  sources: string[];
}

export interface Company {
  name: string;
  id: string;
}

export interface CompanySession {
  company: Company;
  jobPosts: JobPost[];
  candidates: ProcessedCandidate[];
  createdAt: string;
  updatedAt: string;
}

export enum BulkSourceType {
  CSV = 'Recruiter CSV',
  RESUMES = 'Resume Files',
  GITHUB = 'GitHub Usernames',
  LINKEDIN = 'LinkedIn Text Bulk',
  ATS = 'ATS JSON Bulk'
}
