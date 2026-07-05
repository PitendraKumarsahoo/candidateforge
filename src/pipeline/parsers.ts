import Papa from 'papaparse';
import { RawCandidateProfile, Experience, Education, Links } from './types';
import { extractFromText } from './heuristics';

// Helper to extract GitHub username from a URL or raw string
export function extractGitHubUsername(input: string): string {
  if (!input) return "";
  const clean = input.trim();
  // Match github.com/username
  const match = clean.match(/(?:github\.com\/)([a-zA-Z0-9-._]+)/i);
  if (match) return match[1];
  return clean.replace(/^@/, ''); // remove leading @ if any
}

// --- 1. Recruiter CSV Parser ---
export function parseCSV(csvText: string, traceLogs?: string[]): { profiles: RawCandidateProfile[]; skipped: number } {
  let skipped = 0;
  const profiles: RawCandidateProfile[] = [];
  
  if (!csvText || !csvText.trim()) {
    return { profiles, skipped };
  }

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: 'greedy'
  });

  if (parsed.errors && parsed.errors.length > 0) {
    const errorMsg = parsed.errors.map(e => e.message).join(', ');
    traceLogs?.push(`CSV Parser warnings: ${errorMsg}`);
    // If there is an invalid/broken CSV error, throw
    if (parsed.data.length === 0) {
      throw new Error(`Invalid CSV: ${errorMsg}`);
    }
  }

  if (!parsed.data || parsed.data.length === 0) {
    throw new Error("Invalid CSV: No valid candidate data rows found.");
  }

  parsed.data.forEach((row: any, index) => {
    // Check if row has any content
    const name = row.full_name || row.name || row.candidate_name || "";
    const email = row.email || row.email_address || "";
    const phone = row.phone || row.phone_number || row.telephone || "";
    const company = row.current_company || row.company || row.employer || "";
    const title = row.title || row.current_title || row.role || row.position || row.designation || "";
    const skillsCol = row.skills || row.technologies || row.skills_list || "";
    const experienceCol = row.experience || row.work_history || "";
    const educationCol = row.education || row.academic || "";
    const linkedinCol = row.linkedin || row.linkedin_url || "";
    const githubCol = row.github || row.github_url || "";

    if (!name && !email && !phone) {
      skipped++;
      traceLogs?.push(`Row ${index + 1} skipped: missing both name, email, and phone.`);
      return;
    }

    const experience: Experience[] = [];
    if (company || title) {
      experience.push({
        company: String(company || "Unknown Company").trim(),
        title: String(title || "Software Engineer").trim(),
        start: "2021-01", // Placeholder start date
        end: null, // Present
        summary: experienceCol ? String(experienceCol).trim() : "Extracted from recruiter CSV current employment fields."
      });
    } else if (experienceCol) {
      experience.push({
        company: "Previous Employer",
        title: "Software Engineer",
        start: "2021-01",
        end: null,
        summary: String(experienceCol).trim()
      });
    }

    const education: Education[] = [];
    if (educationCol) {
      education.push({
        institution: String(educationCol).trim(),
        degree: "Degree",
        field: "Field of Study",
        end_year: null
      });
    }

    const links: Links = {
      linkedin: linkedinCol ? String(linkedinCol).trim() : null,
      github: githubCol ? String(githubCol).trim() : null,
      portfolio: null,
      other: []
    };

    // Collect skills from all possible columns
    const allSkills: string[] = [];
    Object.entries(row).forEach(([key, value]) => {
      if (key.toLowerCase().includes('skill') || key.toLowerCase().includes('tech')) {
        if (value) {
          const skillsFromCol = String(value).split(/[,;]/).map(s => s.trim()).filter(Boolean);
          allSkills.push(...skillsFromCol);
        }
      }
    });

    const parsedSkills = allSkills.length > 0 ? allSkills : undefined;

    // Generate raw text for model prediction
    const rawTextParts = [];
    if (name) rawTextParts.push(name);
    if (title) rawTextParts.push(title);
    if (company) rawTextParts.push(`at ${company}`);
    if (parsedSkills) rawTextParts.push(`Skills: ${parsedSkills.join(', ')}`);

    profiles.push({
      full_name: name ? String(name).trim() : undefined,
      emails: email ? [String(email).trim().toLowerCase()] : undefined,
      phones: phone ? [String(phone).trim()] : undefined,
      experience: experience.length > 0 ? experience : undefined,
      education: education.length > 0 ? education : undefined,
      skills: parsedSkills,
      links: (links.linkedin || links.github) ? links : undefined,
      raw_text: rawTextParts.join(' '),
      source_name: "Recruiter CSV",
      base_confidence: 0.80 // CSV priority confidence
    });
  });

  if (profiles.length === 0) {
    throw new Error("Invalid CSV: All rows were skipped or lacked required candidate fields.");
  }

  return { profiles, skipped };
}

// --- 2. ATS JSON Blob Parser (Intelligent key heuristics + type inference) ---
export function parseATSJson(jsonText: string, traceLogs?: string[]): RawCandidateProfile[] {
  const profiles: RawCandidateProfile[] = [];
  if (!jsonText || !jsonText.trim()) return profiles;

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e: any) {
    traceLogs?.push(`ATS JSON error: failed to parse JSON structure. ${e.message}`);
    return profiles;
  }

  // Handle single object vs list of objects
  const list = Array.isArray(parsed) ? parsed : [parsed];

  list.forEach((item, index) => {
    // Heuristic key matching
    let name: string | undefined;
    let emails: string[] = [];
    let phones: string[] = [];
    let city = "";
    let region = "";
    let country = "";
    let headline: string | undefined;
    let years_experience: number | undefined;
    let skills: string[] = [];
    const experience: Experience[] = [];
    const education: Education[] = [];

    // Helper to search key patterns
    const findValue = (obj: any, regexes: RegExp[]): any => {
      for (const key of Object.keys(obj)) {
        if (regexes.some(r => r.test(key))) {
          return obj[key];
        }
      }
      return undefined;
    };

    // Name Match
    name = findValue(item, [/^name$/i, /^fullname$/i, /^full_name$/i, /^candidate_name$/i]);
    if (!name) {
      const first = findValue(item, [/^first_name$/i, /^firstname$/i, /^fname$/i]);
      const last = findValue(item, [/^last_name$/i, /^lastname$/i, /^lname$/i]);
      if (first || last) name = `${first || ""} ${last || ""}`.trim();
    }

    // Emails Match
    const emailVal = findValue(item, [/^email$/i, /^emails$/i, /^email_address$/i, /^mail$/i]);
    if (emailVal) {
      emails = Array.isArray(emailVal) ? emailVal.map(String) : [String(emailVal)];
    }

    // Phones Match
    const phoneVal = findValue(item, [/^phone$/i, /^phones$/i, /^phone_number$/i, /^telephone$/i, /^mobile$/i]);
    if (phoneVal) {
      phones = Array.isArray(phoneVal) ? phoneVal.map(String) : [String(phoneVal)];
    }

    // Headline Match
    headline = findValue(item, [/^headline$/i, /^title$/i, /^position$/i, /^role$/i, /^current_role$/i]);

    // Years experience Match
    const yExpVal = findValue(item, [/^years_experience$/i, /^years$/i, /^experience_years$/i, /^yoe$/i]);
    if (yExpVal !== undefined) {
      const parsedYoe = parseFloat(yExpVal);
      if (!isNaN(parsedYoe)) years_experience = parsedYoe;
    }

    // Location Match (could be object or flat fields)
    const locVal = findValue(item, [/^location$/i, /^address$/i]);
    if (locVal && typeof locVal === 'object') {
      city = findValue(locVal, [/^city$/i]) || "";
      region = findValue(locVal, [/^region$/i, /^state$/i, /^province$/i]) || "";
      country = findValue(locVal, [/^country$/i, /^iso_country$/i]) || "";
    } else {
      city = findValue(item, [/^city$/i, /^location_city$/i]) || "";
      region = findValue(item, [/^region$/i, /^state$/i, /^location_state$/i]) || "";
      country = findValue(item, [/^country$/i, /^location_country$/i]) || "";
    }

    // Skills Match
    const skillsVal = findValue(item, [/^skills$/i, /^skill_list$/i, /^technologies$/i]);
    if (skillsVal) {
      if (Array.isArray(skillsVal)) {
        skills = skillsVal.map((s: any) => typeof s === 'object' ? (s.name || s.skill) : s).map(String);
      } else if (typeof skillsVal === 'string') {
        skills = skillsVal.split(',').map(s => s.trim());
      }
    }

    // Experience Array Match
    const expVal = findValue(item, [/^experience$/i, /^work_experience$/i, /^jobs$/i, /^history$/i]);
    if (Array.isArray(expVal)) {
      expVal.forEach((exp: any) => {
        const co = findValue(exp, [/^company$/i, /^employer$/i, /^org$/i, /^organization$/i]) || "Unknown Company";
        const tl = findValue(exp, [/^title$/i, /^role$/i, /^position$/i]) || "Software Engineer";
        const st = findValue(exp, [/^start$/i, /^start_date$/i, /^from$/i]) || "2021-01";
        const en = findValue(exp, [/^end$/i, /^end_date$/i, /^to$/i]);
        const sm = findValue(exp, [/^summary$/i, /^description$/i, /^details$/i, /^responsibilities$/i]) || "";
        experience.push({
          company: String(co),
          title: String(tl),
          start: String(st),
          end: en ? String(en) : null,
          summary: String(sm)
        });
      });
    }

    // Education Array Match
    const eduVal = findValue(item, [/^education$/i, /^schools$/i, /^academic$/i]);
    if (Array.isArray(eduVal)) {
      eduVal.forEach((edu: any) => {
        const inst = findValue(edu, [/^institution$/i, /^school$/i, /^university$/i, /^college$/i]) || "Unknown University";
        const deg = findValue(edu, [/^degree$/i, /^diploma$/i]) || "Degree";
        const fld = findValue(edu, [/^field$/i, /^field_of_study$/i, /^major$/i, /^specialization$/i]) || "Computer Science";
        const yr = findValue(edu, [/^end_year$/i, /^year$/i, /^graduation_year$/i, /^grad_year$/i]);
        education.push({
          institution: String(inst),
          degree: String(deg),
          field: String(fld),
          end_year: yr ? parseInt(yr, 10) : null
        });
      });
    }

    if (!name && emails.length === 0 && phones.length === 0) {
      traceLogs?.push(`ATS JSON index ${index} skipped due to empty critical fields.`);
      return;
    }

    profiles.push({
      full_name: name ? String(name) : undefined,
      emails: emails.length > 0 ? emails : undefined,
      phones: phones.length > 0 ? phones : undefined,
      location: (city || region || country) ? { city, region, country } : undefined,
      headline: headline ? String(headline) : undefined,
      years_experience,
      skills: skills.length > 0 ? skills : undefined,
      experience: experience.length > 0 ? experience : undefined,
      education: education.length > 0 ? education : undefined,
      source_name: "ATS JSON",
      base_confidence: 0.9
    });
  });

  return profiles;
}

// --- 3. GitHub Profile URL Parser (Real Fetching) ---
export async function parseGitHub(usernameOrUrl: string, traceLogs?: string[]): Promise<RawCandidateProfile> {
  const trimmed = usernameOrUrl.trim();
  
  // Accept either GitHub username/URL or exported JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    traceLogs?.push("GitHub: Input is JSON format, parsing exported data directly.");
    try {
      const data = JSON.parse(trimmed);
      const user = Array.isArray(data) ? {} : data;
      const username = user.login || user.username || "github-user";
      const bio = user.bio || user.description || "GitHub Developer";
      const followers = user.followers || 0;
      
      const skillsSet = new Set<string>();
      const repos = user.repos || user.repositories || [];
      if (Array.isArray(repos)) {
        repos.forEach((repo: any) => {
          if (repo.language) skillsSet.add(repo.language);
        });
      }
      
      const links = {
        linkedin: null,
        github: `https://github.com/${username}`,
        portfolio: user.blog || user.website || null,
        other: []
      };

      return {
        full_name: user.name || username,
        emails: user.email ? [user.email.toLowerCase()] : undefined,
        location: user.location ? { city: user.location, region: "", country: "" } : undefined,
        links,
        headline: bio,
        skills: Array.from(skillsSet),
        source_name: "GitHub Profile",
        base_confidence: 0.85
      };
    } catch (err: any) {
      throw new Error(`GitHub JSON parsing failed: ${err.message}`);
    }
  }

  const username = extractGitHubUsername(usernameOrUrl);
  if (!username) {
    throw new Error("GitHub Parse Error: Invalid GitHub Profile URL or Username");
  }

  traceLogs?.push(`Attempting real GitHub REST API fetch for user: '${username}'`);
  
  try {
    // Fetch User Profile
    const profileRes = await fetch(`https://api.github.com/users/${username}`, {
      headers: { 'User-Agent': 'CandidateForge-App' }
    });

    if (profileRes.status === 404) {
      throw new Error(`GitHub not found: The requested user profile '${username}' does not exist on GitHub.`);
    }

    if (profileRes.status === 403 || profileRes.status === 429) {
      throw new Error("GitHub API rate limit exceeded. Please try again later or paste exported JSON profile.");
    }

    if (!profileRes.ok) {
      throw new Error(`GitHub API error (Status ${profileRes.status})`);
    }

    const profileData = await profileRes.json();
    
    // Fetch Repos to extract top programming languages
    const reposRes = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=30`, {
      headers: { 'User-Agent': 'CandidateForge-App' }
    });
    
    const skillsSet = new Set<string>();
    if (reposRes.ok) {
      const reposData = await reposRes.json();
      if (Array.isArray(reposData)) {
        reposData.forEach((repo: any) => {
          if (repo.language) {
            skillsSet.add(repo.language);
          }
        });
      }
    } else {
      traceLogs?.push(`Warning: GitHub Repos fetch failed. Only profile info was parsed.`);
    }

    // Assemble Location from github location text
    let city = "";
    let country = "";
    if (profileData.location) {
      const parts = profileData.location.split(',').map((p: string) => p.trim());
      if (parts.length > 1) {
        city = parts[0];
        country = parts[parts.length - 1];
      } else {
        city = parts[0];
      }
    }

    const links = {
      linkedin: null,
      github: `https://github.com/${username}`,
      portfolio: profileData.blog || null,
      other: []
    };

    return {
      full_name: profileData.name || username,
      emails: profileData.email ? [profileData.email.toLowerCase()] : undefined,
      location: (city || country) ? { city, region: "", country } : undefined,
      links,
      headline: profileData.bio || `GitHub Developer: ${profileData.login}`,
      skills: Array.from(skillsSet),
      raw_text: `${profileData.name || username} is a GitHub Developer. Bio: ${profileData.bio || ""}. Public Repos: ${profileData.public_repos || 0}. Blog: ${profileData.blog || ""}`,
      source_name: "GitHub Profile",
      base_confidence: 0.85
    };

  } catch (error: any) {
    traceLogs?.push(`GitHub Pipeline Step Error: ${error.message}`);
    throw error;
  }
}

// --- 4. LinkedIn Text Parser ---
export function parseLinkedIn(text: string): RawCandidateProfile {
  if (!text || !text.trim()) {
    throw new Error("LinkedIn parse failed: Paste text has no identifiable candidate name or information.");
  }
  // Leverage heuristics text parser but flag as LinkedIn source
  return extractFromText(text, "LinkedIn Profile", 0.90);
}

// --- 5. Resume PDF / DOCX Parser (Fallback for browser usage) ---
export async function parseResume(fileBuffer: Buffer, filename: string, traceLogs?: string[]): Promise<RawCandidateProfile> {
  let extractedText = "";
  const ext = filename.split('.').pop()?.toLowerCase();

  traceLogs?.push(`Parsing resume file '${filename}' (format: ${ext})`);

  try {
    // For browser, just use the buffer as string for now
    extractedText = fileBuffer.toString('utf-8');
    if (!extractedText || !extractedText.trim()) {
      throw new Error("Resume file contains no readable content.");
    }
    traceLogs?.push(`Successfully parsed resume content: ${extractedText.length} characters.`);
  } catch (err: any) {
    traceLogs?.push(`Resume file extraction error: ${err.message}`);
    throw new Error(`Invalid ${ext?.toUpperCase() || "Resume"} File: ${err.message}`);
  }

  // Extract candidate profile via our heuristics engine
  return extractFromText(extractedText, `Resume (${ext?.toUpperCase() || "File"})`, 0.95);
}

// --- 6. Recruiter Notes Parser ---
export function parseNotes(text: string): RawCandidateProfile {
  return extractFromText(text, "Recruiter Notes", 0.5);
}
