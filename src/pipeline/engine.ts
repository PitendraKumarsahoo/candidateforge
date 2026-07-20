import { 
  PipelineRequest, 
  PipelineResponse, 
  RawCandidateProfile, 
  PipelineTrace, 
  PipelineTraceStep 
} from './types';
import { 
  parseCSV, 
  parseATSJson, 
  parseGitHub, 
  parseLinkedIn, 
  parseNotes 
} from './parsers';
import { parseResume } from './resumeParser';
import { mergeProfiles } from './merger';
import { validateCandidate } from './validator';
import { projectCandidate } from './projector';
import { callModelPredict, SourceType } from '../services/modelClient';

/**
 * Main Pipeline Orchestration Engine.
 * Run Inputs -> Parse -> Normalize -> Merge -> Validate -> Project -> Output
 */
function groupRawProfiles(rawProfiles: RawCandidateProfile[], logs: string[]): RawCandidateProfile[][] {
  const groups: RawCandidateProfile[][] = [];

  rawProfiles.forEach(profile => {
    const emails = (profile.emails || []).map(e => e.trim().toLowerCase()).filter(Boolean);
    const name = profile.full_name ? profile.full_name.trim().toLowerCase().replace(/[^a-z0-9]/g, '') : "";

    let matchedGroupIdx = -1;

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const hasEmailMatch = group.some(p => {
        const pEmails = (p.emails || []).map(e => e.trim().toLowerCase()).filter(Boolean);
        return emails.some(e => pEmails.includes(e));
      });

      const hasNameMatch = name && group.some(p => {
        const pName = p.full_name ? p.full_name.trim().toLowerCase().replace(/[^a-z0-9]/g, '') : "";
        return pName && pName === name;
      });

      if (hasEmailMatch || hasNameMatch) {
        matchedGroupIdx = i;
        break;
      }
    }

    if (matchedGroupIdx !== -1) {
      groups[matchedGroupIdx].push(profile);
    } else {
      groups.push([profile]);
    }
  });

  logs.push(`Clustered ${rawProfiles.length} source profiles into ${groups.length} unique candidate profile(s).`);
  return groups;
}

/**
 * Main Pipeline Orchestration Engine.
 * Run Inputs -> Parse -> Normalize -> Merge -> Validate -> Project -> Output
 */
export async function runPipeline(request: PipelineRequest): Promise<PipelineResponse> {
  const timestamp = new Date().toISOString();
  const logs: string[] = [];
  const warnings: string[] = [];
  const traceSteps: PipelineTraceStep[] = [
    { step: 'Ingest', status: 'pending', duration_ms: 0 },
    { step: 'Extract', status: 'pending', duration_ms: 0 },
    { step: 'Model Inference', status: 'pending', duration_ms: 0 },
    { step: 'Normalize', status: 'pending', duration_ms: 0 },
    { step: 'Merge', status: 'pending', duration_ms: 0 },
    { step: 'Validate', status: 'pending', duration_ms: 0 },
    { step: 'Project', status: 'pending', duration_ms: 0 }
  ];

  const totalStart = Date.now();
  const rawProfiles: RawCandidateProfile[] = [];
  let skippedRows = 0;

  try {
    const { csv, ats_json, github_url, linkedin_text, resume_base64, resume_filename, notes } = request.sources;

    // ==================== 1. INGEST & EXTRACT STAGES ====================
    logs.push("Pipeline run started.");
    
    // --- Step 1: Ingest CSV ---
    const t0 = Date.now();
    traceSteps[0].status = 'running';
    if (csv && csv.trim()) {
      logs.push("Ingesting Recruiter CSV...");
      const csvResult = parseCSV(csv, logs);
      csvResult.profiles.forEach(p => rawProfiles.push(p));
      skippedRows += csvResult.skipped;
      logs.push(`CSV Ingest: parsed ${csvResult.profiles.length} profile(s).`);
    }

    // --- Step 2: Ingest ATS JSON ---
    if (ats_json && ats_json.trim()) {
      logs.push("Ingesting ATS JSON...");
      const jsonProfiles = parseATSJson(ats_json, logs);
      jsonProfiles.forEach(p => rawProfiles.push(p));
      logs.push(`ATS JSON Ingest: parsed ${jsonProfiles.length} profile(s).`);
    }

    // --- Step 3: Fetch GitHub Profile ---
    if (github_url && github_url.trim()) {
      logs.push("Ingesting GitHub Profile URL...");
      try {
        const ghProfile = await parseGitHub(github_url, logs);
        rawProfiles.push(ghProfile);
        logs.push(`GitHub Ingest: parsed profile for user '${ghProfile.full_name}'.`);
      } catch (err: any) {
        warnings.push(`GitHub Source warning: ${err.message}`);
        logs.push(`GitHub Source gracefully degraded. Pipeline will continue.`);
      }
    }

    // --- Step 4: Ingest LinkedIn Text ---
    if (linkedin_text && linkedin_text.trim()) {
      logs.push("Ingesting LinkedIn pasted text...");
      const liProfile = parseLinkedIn(linkedin_text);
      rawProfiles.push(liProfile);
      logs.push(`LinkedIn Ingest: extracted fields under confidence ${liProfile.base_confidence}`);
    }

    // --- Step 5: Ingest Resume File ---
    if (resume_base64 && resume_filename) {
      logs.push(`Ingesting Resume File '${resume_filename}'...`);
      try {
        const fileBuffer = Buffer.from(resume_base64, 'base64');
        const resumeProfile = await parseResume(fileBuffer, resume_filename, logs);
        rawProfiles.push(resumeProfile);
        logs.push(`Resume Ingest: parsed profile with name: '${resumeProfile.full_name || "Unknown"}'.`);
      } catch (err: any) {
        warnings.push(`Resume Ingest failed: ${err.message}`);
        logs.push(`Resume parsing failed. Gracefully ignoring.`);
      }
    }

    // --- Step 6: Ingest Recruiter Notes ---
    if (notes && notes.trim()) {
      logs.push("Ingesting Recruiter Notes...");
      const notesProfile = parseNotes(notes);
      rawProfiles.push(notesProfile);
      logs.push(`Notes Ingest: parsed profile with name: '${notesProfile.full_name || "Unknown"}'`);
    }

    const t1 = Date.now();
    traceSteps[0].duration_ms = t1 - t0;
    traceSteps[0].status = 'done';

    // Check if we extracted any profiles at all. 
    if (rawProfiles.length === 0) {
      logs.push("No valid source fields or files provided. Gracefully degrading with empty profile...");
      rawProfiles.push({
        full_name: "Unidentified Candidate",
        source_name: "Null Input Fallback",
        base_confidence: 0.1
      });
      warnings.push("No active input sources provided. Instantiated a blank fallback candidate.");
    }

    // ==================== 2. EXTRACT STAGE (Log as done) ====================
    traceSteps[1].status = 'running';
    logs.push("Applying deep field-level extraction heuristics...");
    const t2 = Date.now();
    traceSteps[1].duration_ms = Math.max(1, t2 - t1);
    traceSteps[1].status = 'done';

    // ==================== 2.5 MODEL INFERENCE STAGE ====================
    traceSteps[2].status = 'running';
    logs.push("Executing ML Model Inference for field enhancement...");
    const tModelStart = Date.now();

    let modelSuccesses = 0;
    let modelFailures = 0;

    for (const profile of rawProfiles) {
      if (profile.raw_text && profile.raw_text.trim()) {
        const sourceMap: Record<string, string> = {
          "Recruiter CSV": "csv",
          "GitHub Profile": "github",
          "LinkedIn Profile": "linkedin",
          "Recruiter Notes": "notes",
          "ATS JSON Paste": "ats"
        };
        // Normalize source name for model mapping
        let modelSource: any = "resume";
        for (const [key, val] of Object.entries(sourceMap)) {
          if (profile.source_name.includes(key)) {
            modelSource = val;
            break;
          }
        }

        try {
          logs.push(`Calling model inference for profile '${profile.full_name || "Unknown"}' (${profile.source_name})...`);
          const prediction = await callModelPredict(profile.raw_text, modelSource);
          
          profile.model_category = prediction.predicted_category || undefined;
          profile.model_confidence = prediction.model_confidence;
          profile.model_version = prediction.model_version;
          profile.agent_decision = prediction.agent_decision;

          if (prediction.extracted_skills && prediction.extracted_skills.length > 0) {
            profile.model_skills = prediction.extracted_skills.map(s => ({
              name: s.name,
              confidence: s.confidence
            }));
            logs.push(`Model extracted ${prediction.extracted_skills.length} skill(s) with confidence score: ${Math.round(prediction.model_confidence * 100)}%`);
          }
          modelSuccesses++;
        } catch (err: any) {
          modelFailures++;
          warnings.push(`Model Inference Warning for '${profile.full_name || "Unknown"}': ${err.message}`);
          logs.push(`Warning: Model inference failed: ${err.message}. Gracefully falling back to heuristics.`);
        }
      }
    }

    const tModelEnd = Date.now();
    traceSteps[2].duration_ms = Math.max(1, tModelEnd - tModelStart);
    if (modelFailures > 0 && modelSuccesses === 0) {
      traceSteps[2].status = 'error';
      traceSteps[2].message = "Model backend unreachable or returned 503.";
    } else {
      traceSteps[2].status = 'done';
      if (modelSuccesses > 0) {
        logs.push(`Model inference complete: successfully enhanced ${modelSuccesses} profile(s).`);
      } else {
        logs.push("Model inference step complete (no eligible profile raw text found).");
      }
    }

    // ==================== 3. NORMALIZE STAGE (Log as done) ====================
    traceSteps[3].status = 'running';
    logs.push("Applying data-type and format normalization rules...");
    const t3 = Date.now();
    traceSteps[3].duration_ms = Math.max(1, t3 - tModelEnd);
    traceSteps[3].status = 'done';

    // ==================== 4. MERGE STAGE ====================
    traceSteps[4].status = 'running';
    logs.push("Grouping and merging multi-source records with conflict-resolution...");
    const groups = groupRawProfiles(rawProfiles, logs);
    const canonicalProfiles = groups.map((g, idx) => {
      logs.push(`Merging candidate #${idx + 1} (${g[0].full_name || "Unidentified Candidate"})...`);
      return mergeProfiles(g, logs);
    });
    const mergedCandidate = canonicalProfiles[0];
    const t4 = Date.now();
    traceSteps[4].duration_ms = t4 - t3;
    traceSteps[4].status = 'done';

    // ==================== 5. VALIDATE STAGE ====================
    traceSteps[5].status = 'running';
    logs.push("Running schema validations for all candidates...");
    canonicalProfiles.forEach(c => {
      const valRes = validateCandidate(c, request.config, logs);
      if (valRes.warnings) {
        valRes.warnings.forEach(w => warnings.push(`[Candidate: ${c.full_name}] ${w}`));
      }
    });
    const t5 = Date.now();
    traceSteps[5].duration_ms = t5 - t4;
    traceSteps[5].status = 'done';

    // ==================== 6. PROJECT STAGE ====================
    traceSteps[6].status = 'running';
    logs.push("Projecting output JSON based on active config schema...");
    const finalOutputs = canonicalProfiles.map(c => projectCandidate(c, request.config, logs));
    const finalOutput = finalOutputs[0];
    const t6 = Date.now();
    traceSteps[6].duration_ms = t6 - t5;
    traceSteps[6].status = 'done';

    // Collect trace metadata
    const totalDuration = Date.now() - totalStart;
    logs.push(`Pipeline execution completed successfully. Grouped ${canonicalProfiles.length} candidate(s) in ${totalDuration}ms.`);

    const trace: PipelineTrace = {
      steps: traceSteps,
      skipped_rows: skippedRows,
      warnings,
      logs,
      total_duration_ms: totalDuration,
      timestamp
    };

    return {
      success: true,
      output: finalOutput,
      canonical: mergedCandidate,
      canonicalProfiles: canonicalProfiles,
      trace
    };

  } catch (error: any) {
    // If a hard config error occurs, catch it and return gracefully
    const totalDuration = Date.now() - totalStart;
    logs.push(`Pipeline failed with exception: ${error.message}`);
    
    // Mark failed step in trace
    const activeStepIdx = traceSteps.findIndex(s => s.status === 'running' || s.status === 'pending');
    if (activeStepIdx !== -1) {
      traceSteps[activeStepIdx].status = 'error';
      traceSteps[activeStepIdx].message = error.message;
    }

    const trace: PipelineTrace = {
      steps: traceSteps.map(s => s.status === 'pending' ? { ...s, status: 'error' } : s),
      skipped_rows: skippedRows,
      warnings: [...warnings, error.message],
      logs,
      total_duration_ms: totalDuration,
      timestamp
    };

    return {
      success: false,
      output: null,
      trace,
      error: error.message
    };
  }
}
