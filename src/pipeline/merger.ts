import { 
  RawCandidateProfile, 
  CanonicalCandidate, 
  Experience, 
  Education, 
  Skill, 
  ProvenanceEntry, 
  Location, 
  Links,
  Project
} from './types';
import { 
  normalizeName, 
  normalizeEmail, 
  normalizePhone, 
  normalizeCountry, 
  normalizeSkill, 
  normalizeDate 
} from './normalizer';
import { v4 as uuidv4 } from 'uuid';

function getSourcePriority(sourceName: string): number {
  const name = sourceName.toLowerCase();
  if (name.includes('resume')) return 5;
  if (name.includes('linkedin')) return 4;
  if (name.includes('github')) return 3;
  if (name.includes('csv') || name.includes('recruiter csv') || name.includes('ats')) return 2;
  if (name.includes('notes') || name.includes('recruiter notes')) return 1;
  return 0;
}

/**
 * Merges a list of RawCandidateProfiles from different sources 
 * into a single high-fidelity CanonicalCandidate profile.
 * Incorporates conflict resolution (highest confidence wins) and tracks provenance.
 */
export function mergeProfiles(
  rawProfiles: RawCandidateProfile[],
  traceLogs?: string[]
): CanonicalCandidate {
  if (rawProfiles.length === 0) {
    throw new Error("No profiles available to merge.");
  }

  traceLogs?.push(`Initiating merger for ${rawProfiles.length} raw profile source records.`);

  // Stage 1: Normalize all raw profiles individually first
  const normalizedProfiles = rawProfiles.map(p => {
    traceLogs?.push(`Normalizing fields for source: '${p.source_name}'`);
    
    // Normalize country first to help phone inference
    let countryCode = "";
    if (p.location?.country) {
      countryCode = normalizeCountry(p.location.country);
    }

    const nProfile: RawCandidateProfile = {
      source_name: p.source_name,
      base_confidence: p.base_confidence,
      full_name: p.full_name ? normalizeName(p.full_name) : undefined,
      emails: p.emails ? p.emails.map(normalizeEmail).filter(Boolean) : undefined,
      phones: p.phones ? p.phones.map(ph => {
        const norm = normalizePhone(ph, countryCode);
        if (norm.note) traceLogs?.push(`[Phone Warning - ${p.source_name}]: ${norm.note}`);
        return norm.phone;
      }).filter(Boolean) : undefined,
      location: p.location ? {
        city: p.location.city ? normalizeName(p.location.city) : "",
        region: p.location.region ? p.location.region.trim().toUpperCase() : "",
        country: countryCode
      } : undefined,
      links: p.links ? {
        linkedin: p.links.linkedin || null,
        github: p.links.github || null,
        portfolio: p.links.portfolio || null,
        other: p.links.other ? p.links.other.map(l => l.trim()).filter(Boolean) : []
      } : undefined,
      headline: p.headline ? p.headline.trim() : undefined,
      years_experience: p.years_experience,
      skills: p.skills ? p.skills.map(normalizeSkill).filter(Boolean) : undefined,
      experience: p.experience ? p.experience.map(exp => ({
        company: normalizeName(exp.company),
        title: normalizeName(exp.title),
        start: normalizeDate(exp.start) || "2021-01",
        end: exp.end ? normalizeDate(exp.end) : null,
        summary: exp.summary ? exp.summary.trim() : ""
      })) : undefined,
      education: p.education ? p.education.map(edu => ({
        institution: normalizeName(edu.institution),
        degree: edu.degree ? edu.degree.trim() : "Degree",
        field: edu.field ? edu.field.trim() : "Field",
        end_year: edu.end_year ? Number(edu.end_year) : null
      })) : undefined
    };

    return nProfile;
  });

  // Sort profiles by source priority descending, then by confidence descending so we naturally find highest confidence values
  const sortedProfiles = [...normalizedProfiles].sort((a, b) => {
    const priorityA = getSourcePriority(a.source_name);
    const priorityB = getSourcePriority(b.source_name);
    if (priorityA !== priorityB) {
      return priorityB - priorityA;
    }
    return b.base_confidence - a.base_confidence;
  });

  // Initialize Canonical structures
  let canonicalName = "";
  const canonicalEmailsSet = new Set<string>();
  const canonicalPhonesSet = new Set<string>();
  let canonicalLocation: Location = { city: "", region: "", country: "" };
  const canonicalLinks: Links = { linkedin: null, github: null, portfolio: null, other: [] };
  let canonicalHeadline: string | null = null;
  let canonicalYearsExp: number | null = null;
  const canonicalSkillsMap = new Map<string, { confidence: number; sources: string[] }>();
  const canonicalExp: Experience[] = [];
  const canonicalEdu: Education[] = [];
  
  const provenance: ProvenanceEntry[] = [];
  
  // Field Confidence Trackers for Scorer stage
  const fieldConfidences: Record<string, number> = {
    full_name: 0,
    emails: 0,
    phones: 0,
    location: 0,
    links: 0,
    headline: 0,
    years_experience: 0,
    skills: 0,
    experience: 0,
    education: 0
  };

  // Helper to check if a profile has a real source (not fallback)
  const isRealSource = (source: string) => {
    return source !== "Null Input Fallback";
  };

  // Helper to get simple method name based on source
  const getSimpleMethodName = (sourceName: string): string => {
    const lower = sourceName.toLowerCase();
    if (lower.includes('resume')) return 'resume_parser';
    if (lower.includes('csv') || lower.includes('recruiter')) return 'csv_parser';
    if (lower.includes('ats')) return 'ats_parser';
    if (lower.includes('github')) return 'github_extractor';
    if (lower.includes('linkedin')) return 'linkedin_extractor';
    if (lower.includes('notes') || lower.includes('recruiter notes')) return 'notes_extractor';
    if (lower.includes('ml_model') || lower.includes('model:')) return 'model_inference';
    return 'default_extractor';
  };

  // --- 1. Merge Full Name (Highest Confidence Wins) ---
  const nameProfile = sortedProfiles.find(p => p.full_name);
  if (nameProfile && nameProfile.full_name) {
    canonicalName = nameProfile.full_name;
    fieldConfidences.full_name = nameProfile.base_confidence;
    provenance.push({
      field: "full_name",
      source: nameProfile.source_name,
      method: getSimpleMethodName(nameProfile.source_name),
      confidence: nameProfile.base_confidence,
      verified: isRealSource(nameProfile.source_name)
    });
    
    // Check conflicts
    sortedProfiles.forEach(p => {
      if (p.full_name && p.full_name !== canonicalName) {
        traceLogs?.push(`Conflict Resolved [full_name]: Picked '${canonicalName}' (${nameProfile.source_name}, conf ${nameProfile.base_confidence}) over '${p.full_name}' (${p.source_name}, conf ${p.base_confidence})`);
      }
    });
  } else {
    fieldConfidences.full_name = 0.1; // Default low confidence for empty name
    provenance.push({
      field: "full_name",
      source: "Null Input Fallback",
      method: "Default fallback",
      confidence: 0.1,
      verified: false
    });
  }

  // --- 2. Merge Emails (Union across all sources, deduplicated) ---
  const emailSources: string[] = [];
  let emailConfSum = 0;
  sortedProfiles.forEach(p => {
    if (p.emails) {
      p.emails.forEach(e => {
        if (!canonicalEmailsSet.has(e)) {
          canonicalEmailsSet.add(e);
          emailSources.push(p.source_name);
          emailConfSum += p.base_confidence;
        }
      });
    }
  });
  if (canonicalEmailsSet.size > 0) {
    const emailConfidence = emailConfSum / canonicalEmailsSet.size;
    fieldConfidences.emails = emailConfidence;
    provenance.push({
      field: "emails",
      source: emailSources.join(", "),
      method: getSimpleMethodName(emailSources[0] || "default"),
      confidence: emailConfidence,
      verified: emailSources.some(isRealSource)
    });
  }

  // --- 3. Merge Phones (Union across all sources, deduplicated) ---
  const phoneSources: string[] = [];
  let phoneConfSum = 0;
  sortedProfiles.forEach(p => {
    if (p.phones) {
      p.phones.forEach(ph => {
        if (!canonicalPhonesSet.has(ph)) {
          canonicalPhonesSet.add(ph);
          phoneSources.push(p.source_name);
          phoneConfSum += p.base_confidence;
        }
      });
    }
  });
  if (canonicalPhonesSet.size > 0) {
    const phoneConfidence = phoneConfSum / canonicalPhonesSet.size;
    fieldConfidences.phones = phoneConfidence;
    provenance.push({
      field: "phones",
      source: phoneSources.join(", "),
      method: getSimpleMethodName(phoneSources[0] || "default"),
      confidence: phoneConfidence,
      verified: phoneSources.some(isRealSource)
    });
  }

  // --- 4. Merge Location (Highest Confidence wins) ---
  const locProfile = sortedProfiles.find(p => p.location && (p.location.city || p.location.country));
  if (locProfile && locProfile.location) {
    canonicalLocation = locProfile.location as Location;
    fieldConfidences.location = locProfile.base_confidence;
    provenance.push({
      field: "location",
      source: locProfile.source_name,
      method: getSimpleMethodName(locProfile.source_name),
      confidence: locProfile.base_confidence,
      verified: isRealSource(locProfile.source_name)
    });
    
    // Log location conflicts
    sortedProfiles.forEach(p => {
      if (p.location && (p.location.city !== canonicalLocation.city || p.location.country !== canonicalLocation.country)) {
        if (p.source_name !== locProfile.source_name) {
          traceLogs?.push(`Conflict Resolved [location]: Picked '${canonicalLocation.city}, ${canonicalLocation.country}' (${locProfile.source_name}) over '${p.location.city}, ${p.location.country}' (${p.source_name})`);
        }
      }
    });
  } else {
    provenance.push({
      field: "location",
      source: "Null Input Fallback",
      method: "Default fallback",
      confidence: 0.0,
      verified: false
    });
  }

  // --- 5. Merge Links (Deduplicated, Highest wins per profile type) ---
  let linksAdded = false;
  const linkFields = ["linkedin", "github", "portfolio"] as const;
  linkFields.forEach(linkType => {
    const linkProfile = sortedProfiles.find(p => p.links && p.links[linkType]);
    if (linkProfile && linkProfile.links && linkProfile.links[linkType]) {
      canonicalLinks[linkType] = linkProfile.links[linkType];
      provenance.push({
        field: `links.${linkType}`,
        source: linkProfile.source_name,
        method: getSimpleMethodName(linkProfile.source_name),
        confidence: linkProfile.base_confidence,
        verified: isRealSource(linkProfile.source_name)
      });
      fieldConfidences.links = Math.max(fieldConfidences.links, linkProfile.base_confidence);
      linksAdded = true;
    }
  });
  sortedProfiles.forEach(p => {
    if (p.links && p.links.other) {
      p.links.other.forEach(url => {
        if (!canonicalLinks.other.includes(url)) {
          canonicalLinks.other.push(url);
        }
      });
    }
  });
  if (linksAdded && fieldConfidences.links === 0) {
    fieldConfidences.links = 0.6;
  }

  // --- 6. Merge Headline (Highest Confidence Wins) ---
  const mlCategoryProfile = sortedProfiles.find(p => p.model_category);
  if (mlCategoryProfile && mlCategoryProfile.model_category) {
    canonicalHeadline = mlCategoryProfile.model_category;
    const headlineConfidence = mlCategoryProfile.model_confidence || 0.90;
    fieldConfidences.headline = headlineConfidence;
    provenance.push({
      field: "headline",
      source: `ml_model:${mlCategoryProfile.model_version || 'candidate_model.pkl'}`,
      method: getSimpleMethodName(`ml_model:${mlCategoryProfile.model_version || 'candidate_model.pkl'}`),
      confidence: headlineConfidence,
      verified: true
    });
  } else {
    const headlineProfile = sortedProfiles.find(p => p.headline);
    if (headlineProfile && headlineProfile.headline) {
      canonicalHeadline = headlineProfile.headline;
      fieldConfidences.headline = headlineProfile.base_confidence;
      provenance.push({
        field: "headline",
        source: headlineProfile.source_name,
        method: getSimpleMethodName(headlineProfile.source_name),
        confidence: headlineProfile.base_confidence,
        verified: isRealSource(headlineProfile.source_name)
      });
    } else {
      provenance.push({
        field: "headline",
        source: "Null Input Fallback",
        method: "default_extractor",
        confidence: 0.0,
        verified: false
      });
    }
  }

  // --- 7. Merge Years of Experience (Highest Confidence Wins or Average) ---
  const yoeProfile = sortedProfiles.find(p => p.years_experience !== undefined);
  if (yoeProfile && yoeProfile.years_experience !== undefined) {
    canonicalYearsExp = yoeProfile.years_experience;
    fieldConfidences.years_experience = yoeProfile.base_confidence;
    provenance.push({
      field: "years_experience",
      source: yoeProfile.source_name,
      method: getSimpleMethodName(yoeProfile.source_name),
      confidence: yoeProfile.base_confidence,
      verified: isRealSource(yoeProfile.source_name)
    });
  } else {
    provenance.push({
      field: "years_experience",
      source: "Null Input Fallback",
      method: "default_extractor",
      confidence: 0.0,
      verified: false
    });
  }

  // --- 8. Merge Skills (Union, confidence is maximum, track all sources) ---
  sortedProfiles.forEach(p => {
    if (p.skills) {
      p.skills.forEach(skill => {
        const existing = canonicalSkillsMap.get(skill);
        if (existing) {
          existing.confidence = Math.max(existing.confidence, p.base_confidence);
          if (!existing.sources.includes(p.source_name)) {
            existing.sources.push(p.source_name);
          }
        } else {
          canonicalSkillsMap.set(skill, {
            confidence: p.base_confidence,
            sources: [p.source_name]
          });
        }
      });
    }

    if (p.model_skills) {
      p.model_skills.forEach(skill => {
        const skillName = skill.name;
        const skillConfidence = skill.confidence;
        const modelSource = `ml_model:${p.model_version || 'candidate_model.pkl'}`;
        const existing = canonicalSkillsMap.get(skillName);
        if (existing) {
          existing.confidence = Math.max(existing.confidence, skillConfidence);
          if (!existing.sources.includes(modelSource)) {
            existing.sources.push(modelSource);
          }
        } else {
          canonicalSkillsMap.set(skillName, {
            confidence: skillConfidence,
            sources: [modelSource]
          });
        }
      });
    }
  });

  const canonicalSkills: Skill[] = Array.from(canonicalSkillsMap.entries()).map(([name, data]) => ({
    name,
    confidence: data.confidence,
    verified: data.sources.some(isRealSource) || data.sources.some(src => src.startsWith("ml_model:")),
    sources: data.sources
  }));
  
  if (canonicalSkills.length > 0) {
    const sum = canonicalSkills.reduce((acc, curr) => acc + curr.confidence, 0);
    const skillsConfidence = sum / canonicalSkills.length;
    fieldConfidences.skills = skillsConfidence;
    
    const hasMlSkills = canonicalSkills.some(s => s.sources.some(src => src.startsWith("ml_model")));
    const baseSources = sortedProfiles.filter(p => p.skills && p.skills.length > 0).map(p => p.source_name);
    const allSources = [...baseSources];
    if (hasMlSkills) {
      const mlModelName = sortedProfiles.find(p => p.model_skills && p.model_skills.length > 0)?.model_version || "candidate_model.pkl";
      allSources.push(`ml_model:${mlModelName}`);
    }
    const sourceStr = allSources.join(", ");

    provenance.push({
      field: "skills",
      source: sourceStr,
      method: getSimpleMethodName(allSources[0] || "default"),
      confidence: skillsConfidence,
      verified: allSources.some(s => isRealSource(s) || s.startsWith("ml_model:"))
    });
  } else {
    provenance.push({
      field: "skills",
      source: "Null Input Fallback",
      method: "default_extractor",
      confidence: 0.0,
      verified: false
    });
  }

  // --- 9. Merge Work Experience (Deduplicated union by company/title) ---
  let expConfSum = 0;
  let expCount = 0;
  sortedProfiles.forEach(p => {
    if (p.experience) {
      p.experience.forEach(exp => {
        const isDuplicate = canonicalExp.some(e => 
          e.company.toLowerCase() === exp.company.toLowerCase() && 
          (e.title.toLowerCase() === exp.title.toLowerCase() || e.start === exp.start)
        );
        if (!isDuplicate) {
          canonicalExp.push(exp);
          expConfSum += p.base_confidence;
          expCount++;
        } else {
          traceLogs?.push(`Deduplicated work history entry at '${exp.company}' from source '${p.source_name}' (already extracted).`);
        }
      });
    }
  });
  if (canonicalExp.length > 0) {
    const expConfidence = expConfSum / expCount;
    fieldConfidences.experience = expConfidence;
    const expSourceNames = sortedProfiles.filter(p => p.experience && p.experience.length > 0).map(p => p.source_name);
    provenance.push({
      field: "experience",
      source: expSourceNames.join(", "),
      method: getSimpleMethodName(expSourceNames[0] || "default"),
      confidence: expConfidence,
      verified: sortedProfiles.some(p => p.experience && p.experience.length > 0 && isRealSource(p.source_name))
    });
  } else {
    provenance.push({
      field: "experience",
      source: "Null Input Fallback",
      method: "default_extractor",
      confidence: 0.0,
      verified: false
    });
  }

  // --- 10. Merge Education (Deduplicated union by institution/degree) ---
  let eduConfSum = 0;
  let eduCount = 0;
  sortedProfiles.forEach(p => {
    if (p.education) {
      p.education.forEach(edu => {
        const isDuplicate = canonicalEdu.some(e => 
          e.institution.toLowerCase() === edu.institution.toLowerCase() && 
          e.degree.toLowerCase() === edu.degree.toLowerCase()
        );
        if (!isDuplicate) {
          canonicalEdu.push(edu);
          eduConfSum += p.base_confidence;
          eduCount++;
        } else {
          traceLogs?.push(`Deduplicated education history entry at '${edu.institution}' from source '${p.source_name}' (already extracted).`);
        }
      });
    }
  });
  if (canonicalEdu.length > 0) {
    const eduConfidence = eduConfSum / eduCount;
    fieldConfidences.education = eduConfidence;
    const eduSourceNames = sortedProfiles.filter(p => p.education && p.education.length > 0).map(p => p.source_name);
    provenance.push({
      field: "education",
      source: eduSourceNames.join(", "),
      method: getSimpleMethodName(eduSourceNames[0] || "default"),
      confidence: eduConfidence,
      verified: sortedProfiles.some(p => p.education && p.education.length > 0 && isRealSource(p.source_name))
    });
  } else {
    provenance.push({
      field: "education",
      source: "Null Input Fallback",
      method: "default_extractor",
      confidence: 0.0,
      verified: false
    });
  }

  // --- 11. Merge Projects (Deduplicated union by name) ---
  const canonicalProjects: Project[] = [];
  sortedProfiles.forEach(p => {
    if (p.projects) {
      p.projects.forEach(proj => {
        const isDuplicate = canonicalProjects.some(e => 
          e.name.toLowerCase() === proj.name.toLowerCase()
        );
        if (!isDuplicate) {
          canonicalProjects.push(proj);
        } else {
          traceLogs?.push(`Deduplicated project entry '${proj.name}' from source '${p.source_name}' (already extracted).`);
        }
      });
    }
  });
  if (canonicalProjects.length > 0) {
    const projSources = sortedProfiles.filter(p => p.projects && p.projects.length > 0).map(p => p.source_name);
    provenance.push({
      field: "projects",
      source: projSources.join(", "),
      method: getSimpleMethodName(projSources[0] || "default"),
      confidence: sortedProfiles.filter(p => p.projects && p.projects.length > 0).reduce((sum, p) => sum + p.base_confidence, 0) / Math.max(1, sortedProfiles.filter(p => p.projects && p.projects.length > 0).length),
      verified: projSources.some(isRealSource)
    });
  } else {
    provenance.push({
      field: "projects",
      source: "Null Input Fallback",
      method: "default_extractor",
      confidence: 0.0,
      verified: false
    });
  }

  // Calculate Overall Confidence score dynamically based on valid present fields (excluding empty defaults)
  let validFieldsCount = 0;
  const totalFieldsCount = 11; // Name, Email, Phone, Location, Headline, YOE, Skills, Experience, Education, Links, Projects

  if (canonicalName && canonicalName.trim() && canonicalName !== "Unidentified Candidate") validFieldsCount++;
  if (canonicalEmailsSet.size > 0) validFieldsCount++;
  if (canonicalPhonesSet.size > 0) validFieldsCount++;
  if (canonicalLocation && (canonicalLocation.city || canonicalLocation.country)) validFieldsCount++;
  if (canonicalHeadline && canonicalHeadline.trim() && !canonicalHeadline.includes("Null Input Fallback")) validFieldsCount++;
  if (canonicalYearsExp !== null && canonicalYearsExp !== undefined) validFieldsCount++;
  if (canonicalSkills.length > 0) validFieldsCount++;
  if (canonicalExp.length > 0) validFieldsCount++;
  if (canonicalEdu.length > 0) validFieldsCount++;
  if (canonicalLinks && (canonicalLinks.linkedin || canonicalLinks.github || canonicalLinks.portfolio)) validFieldsCount++;
  if (canonicalProjects.length > 0) validFieldsCount++;

  let overall_confidence = Math.round((validFieldsCount / totalFieldsCount) * 100) / 100;

  // Average in model_confidence alongside per-source base confidences
  const profilesWithModelConf = sortedProfiles.filter(p => p.model_confidence !== undefined && p.model_confidence !== null);
  if (profilesWithModelConf.length > 0) {
    const totalModelConf = profilesWithModelConf.reduce((sum, p) => sum + (p.model_confidence || 0), 0);
    const avgModelConf = totalModelConf / profilesWithModelConf.length;
    overall_confidence = Math.round(((overall_confidence + avgModelConf) / 2) * 100) / 100;
  }

  // Find if any raw profile has an agent_decision
  const decisionProfile = sortedProfiles.find(p => p.agent_decision !== undefined);
  const agent_decision = decisionProfile ? decisionProfile.agent_decision : undefined;

  traceLogs?.push(`Candidate Merge complete. Computed overall confidence score dynamically: ${Math.round(overall_confidence * 100)}% (Valid fields: ${validFieldsCount}/${totalFieldsCount})`);

  return {
    candidate_id: uuidv4(),
    full_name: canonicalName || "Unidentified Candidate",
    emails: Array.from(canonicalEmailsSet),
    phones: Array.from(canonicalPhonesSet),
    location: canonicalLocation,
    links: canonicalLinks,
    headline: canonicalHeadline,
    years_experience: canonicalYearsExp,
    skills: canonicalSkills,
    experience: canonicalExp,
    education: canonicalEdu,
    projects: canonicalProjects,
    provenance,
    overall_confidence,
    agent_decision
  };
}
