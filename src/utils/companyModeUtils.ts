import { v4 as uuidv4 } from 'uuid';
import { 
  CanonicalCandidate, 
  EducationLevel, 
  JobMatchResult, 
  JobPost, 
  ProcessedCandidate, 
  Verdict 
} from '../pipeline/types';

export function generateId(): string {
  return uuidv4();
}

// Avatar color generator based on name
const COLORS = [
  '#4F46E5', '#22D3EE', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#6366F1'
];
export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    const char = name.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const index = Math.abs(hash) % COLORS.length;
  return COLORS[index];
}

// Job Match Scoring Engine
export function calculateJobMatch(
  candidate: CanonicalCandidate & { primarySkill?: string; secondarySkill?: string },
  jobPost: JobPost
): JobMatchResult {
  // Collect all candidate skills (lowercase for comparison)
  const candidateSkillsLower = new Set<string>();
  candidate.skills.forEach(skill => {
    candidateSkillsLower.add(skill.name.toLowerCase());
  });
  if (candidate.primarySkill) {
    candidateSkillsLower.add(candidate.primarySkill.toLowerCase());
  }
  if (candidate.secondarySkill) {
    candidateSkillsLower.add(candidate.secondarySkill.toLowerCase());
  }

  // Skill Match
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  jobPost.requiredSkills.forEach(reqSkill => {
    const reqSkillLower = reqSkill.toLowerCase();
    if (candidateSkillsLower.has(reqSkillLower)) {
      matchedSkills.push(reqSkill);
    } else {
      missingSkills.push(reqSkill);
    }
  });
  const skillMatchScore = jobPost.requiredSkills.length > 0 
    ? matchedSkills.length / jobPost.requiredSkills.length 
    : 1;

  // Experience Match
  const experienceScore = candidate.years_experience 
    ? Math.min(1, candidate.years_experience / Math.max(1, jobPost.minExperience)) 
    : 0;

  // Education Match
  const educationOrder = [EducationLevel.ANY, EducationLevel.BACHELOR, EducationLevel.MASTER];
  const candidateEduIndex = candidate.education.length > 0 
    ? (candidate.education[0].degree.toLowerCase().includes('master') ? 2 
       : candidate.education[0].degree.toLowerCase().includes('bachelor') ? 1 
       : 0) 
    : 0;
  const requiredEduIndex = educationOrder.indexOf(jobPost.educationRequirement);
  
  let educationScore = 0;
  if (requiredEduIndex <= candidateEduIndex) {
    educationScore = 1;
  } else if (requiredEduIndex - candidateEduIndex === 1) {
    educationScore = 0.5;
  } else {
    educationScore = 0;
  }

  const confidenceScore = candidate.overall_confidence;

  // Total Score (0-100)
  const totalScore = Math.round(
    (skillMatchScore * 0.4 + experienceScore * 0.25 + educationScore * 0.2 + confidenceScore * 0.15) * 100
  );

  // Verdict
  let verdict: Verdict;
  if (totalScore >= 80) {
    verdict = Verdict.STRONG_MATCH;
  } else if (totalScore >= 60) {
    verdict = Verdict.GOOD_MATCH;
  } else if (totalScore >= 40) {
    verdict = Verdict.POSSIBLE_MATCH;
  } else {
    verdict = Verdict.NOT_MATCHED;
  }

  return {
    jobId: jobPost.id,
    jobTitle: jobPost.title,
    score: totalScore,
    skillMatchScore,
    experienceScore,
    educationScore,
    confidenceScore,
    verdict,
    matchedSkills,
    missingSkills
  };
}

// Export to CSV
export function exportToCSV(data: any[], filename: string): void {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        let cell = row[header];
        if (cell === null || cell === undefined) return '';
        if (typeof cell === 'object') cell = JSON.stringify(cell);
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          cell = `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')
    )
  ];

  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Format phone to E.164 (simple heuristic)
export function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.startsWith('1') && digits.length === 11) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

// Verdict colors
export function getVerdictColor(verdict: Verdict): string {
  switch (verdict) {
    case Verdict.STRONG_MATCH:
      return '#10B981'; // green
    case Verdict.GOOD_MATCH:
      return '#22D3EE'; // cyan
    case Verdict.POSSIBLE_MATCH:
      return '#F59E0B'; // amber
    case Verdict.NOT_MATCHED:
      return '#EF4444'; // red
    default:
      return '#64748B';
  }
}
