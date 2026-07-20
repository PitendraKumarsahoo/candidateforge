import React, { useState, useEffect, useMemo } from 'react';
import { Save, Upload, FileText, FileSpreadsheet, Github, Linkedin, Code, CheckCircle2, XCircle } from 'lucide-react';
import CompanyOnboardingPanel from './CompanyOnboardingPanel';
import {
  Company,
  JobPost,
  ProcessedCandidate,
  RawCandidateProfile,
  CompanySession,
  CanonicalCandidate,
  EducationLevel
} from '../pipeline/types';
import {
  calculateJobMatch,
  exportToCSV,
  getAvatarColor
} from '../utils/companyModeUtils';
import { parseCSV, parseATSJson } from '../pipeline/parsers';
import { extractFromText } from '../pipeline/heuristics';
import { generateId } from '../utils/companyModeUtils';

interface CompanyHiringModeProps {
  onExportReport: () => void;
}

export default function CompanyHiringMode({ onExportReport }: CompanyHiringModeProps) {
  // State
  const [company, setCompany] = useState<Company>({ name: 'TechCorp Inc.', id: generateId() });
  const [jobPosts, setJobPosts] = useState<JobPost[]>([
    { id: generateId(), title: 'Senior Frontend Engineer', department: 'Engineering', requiredSkills: ['React', 'TypeScript', 'Next.js', 'CSS'], minExperience: 3, educationRequirement: EducationLevel.BACHELOR },
    { id: generateId(), title: 'Backend Engineer', department: 'Engineering', requiredSkills: ['Python', 'Django', 'PostgreSQL', 'AWS'], minExperience: 2, educationRequirement: EducationLevel.ANY }
  ]);
  const [candidates, setCandidates] = useState<ProcessedCandidate[]>([]);
  const [activeJobId, setActiveJobId] = useState<string>(jobPosts[0]?.id || '');
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<ProcessedCandidate | null>(null);

  // Pipeline state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0, step: '', speed: 0, eta: 0 });

  // Bulk source state
  const [bulkSources, setBulkSources] = useState<{
    csvContent: string;
    csvIngestedCount: number;
    resumeFiles: File[];
    resumeParsedTexts: string[];
    githubUsernames: string;
    linkedinText: string;
    atsJsonText: string;
  }>({
    csvContent: '',
    csvIngestedCount: 0,
    resumeFiles: [],
    resumeParsedTexts: [],
    githubUsernames: '',
    linkedinText: '',
    atsJsonText: ''
  });

  // Filtered and sorted candidates for active job
  const filteredCandidatesForActiveJob = useMemo(() => {
    if (!activeJobId || candidates.length === 0) return [];
    return candidates
      .filter(c => !c.rejected)
      .map(c => {
        const jobMatch = c.jobMatches.find(j => j.jobId === activeJobId);
        return { ...c, activeJobMatch: jobMatch };
      })
      .filter(c => c.activeJobMatch)
      .sort((a, b) => (b.activeJobMatch?.score || 0) - (a.activeJobMatch?.score || 0));
  }, [candidates, activeJobId]);

  // Summary statistics
  const summaryStats = useMemo(() => {
    if (!activeJobId) return null;
    const forJob = filteredCandidatesForActiveJob;
    let strong = 0, good = 0, possible = 0, notMatched = 0, shortlisted = 0;
    forJob.forEach(c => {
      const match = c.jobMatches.find(j => j.jobId === activeJobId);
      if (match) {
        switch (match.verdict) {
          case 'Strong Match': strong++; break;
          case 'Good Match': good++; break;
          case 'Possible Match': possible++; break;
          case 'Not Matched': notMatched++; break;
        }
      }
      if (c.shortlistedForJobs.includes(activeJobId)) shortlisted++;
    });
    return { total: forJob.length, strong, good, possible, notMatched, shortlisted };
  }, [filteredCandidatesForActiveJob, activeJobId]);

  // Handle resume files (read as text)
  const handleResumeFileSelect = async (files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    const newParsedTexts: string[] = [];

    for (const file of fileArray) {
      try {
        const text = await file.text();
        newParsedTexts.push(text);
      } catch (e) {
        console.error('Failed to read file:', file.name, e);
      }
    }

    setBulkSources(prev => ({
      ...prev,
      resumeFiles: fileArray,
      resumeParsedTexts: newParsedTexts
    }));
  };

  // Run bulk pipeline
  const runBulkPipeline = async () => {
    setIsProcessing(true);
    setCandidates([]);
    setSelectedCandidates([]);

    try {
      // Step 1: Ingest from all sources
      const rawProfiles: RawCandidateProfile[] = [];

      // CSV Ingest
      if (bulkSources.csvContent.trim()) {
        try {
          const csvResult = parseCSV(bulkSources.csvContent);
          csvResult.profiles.forEach(p => rawProfiles.push({ ...p, source_name: 'Recruiter CSV' }));
          setBulkSources(prev => ({ ...prev, csvIngestedCount: csvResult.profiles.length }));
        } catch (err) {
          console.error('CSV Parse Error:', err);
        }
      }

      // ATS JSON Ingest
      if (bulkSources.atsJsonText.trim()) {
        try {
          const atsProfiles = parseATSJson(bulkSources.atsJsonText);
          atsProfiles.forEach(p => rawProfiles.push({ ...p, source_name: 'ATS JSON' }));
        } catch (err) {
          console.error('ATS Parse Error:', err);
        }
      }

      // Resume Ingest
      bulkSources.resumeParsedTexts.forEach((text, idx) => {
        try {
          const profile = extractFromText(text, `Resume (${bulkSources.resumeFiles[idx].name})`, 0.95);
          rawProfiles.push(profile);
        } catch (err) {
          console.error('Resume Parse Error:', err);
        }
      });

      // LinkedIn Ingest
      if (bulkSources.linkedinText.trim()) {
        try {
          const linkedInBlocks = bulkSources.linkedinText.split('---').map(b => b.trim()).filter(Boolean);
          linkedInBlocks.forEach(block => {
            const profile = extractFromText(block, 'LinkedIn Profile', 0.90);
            rawProfiles.push(profile);
          });
        } catch (err) {
          console.error('LinkedIn Parse Error:', err);
        }
      }

      // Process each candidate with job matches
      setProcessingProgress({
        current: 0,
        total: rawProfiles.length,
        step: 'Ingesting sources...',
        speed: 0,
        eta: 0
      });

      const processedCandidates: ProcessedCandidate[] = [];
      for (let i = 0; i < rawProfiles.length; i++) {
        const rawProfile = rawProfiles[i];
        const candidate_id = generateId();
        const full_name = rawProfile.full_name || 'Unknown Candidate';
        const emails = rawProfile.emails || [];
        const phones = rawProfile.phones || [];
        const location = {
          city: rawProfile.location?.city || '',
          region: rawProfile.location?.region || '',
          country: rawProfile.location?.country || ''
        };
        const links = {
          linkedin: rawProfile.links?.linkedin || null,
          github: rawProfile.links?.github || null,
          portfolio: rawProfile.links?.portfolio || null,
          other: rawProfile.links?.other || []
        };
        const headline = rawProfile.headline || null;
        const years_experience = rawProfile.years_experience || null;
        const skills = rawProfile.skills?.map(name => ({ name, confidence: 0.85, verified: false, sources: [rawProfile.source_name] })) || [];
        const experience = rawProfile.experience || [];
        const education = rawProfile.education || [];
        const projects = rawProfile.projects || [];
        const provenance: any[] = [];
        const overall_confidence = rawProfile.base_confidence || 0.85;
        const primarySkill = rawProfile.skills?.[0];
        const secondarySkill = rawProfile.skills?.[1];
        const sources = rawProfile.source_name ? [rawProfile.source_name] : [];

        const candidateToMatch: CanonicalCandidate & { primarySkill?: string; secondarySkill?: string } = {
          candidate_id,
          full_name,
          emails,
          phones,
          location,
          links,
          headline,
          years_experience,
          skills,
          experience,
          education,
          projects,
          provenance,
          overall_confidence,
          primarySkill,
          secondarySkill
        };

        const processed: ProcessedCandidate = {
          ...candidateToMatch,
          sources,
          jobMatches: jobPosts.map(job => calculateJobMatch(candidateToMatch, job)),
          shortlistedForJobs: [],
          rejected: false
        };
        processedCandidates.push(processed);
        setProcessingProgress({
          current: i + 1,
          total: rawProfiles.length,
          step: `Processing candidate ${i + 1} of ${rawProfiles.length}...`,
          speed: 500,
          eta: Math.max(0, (rawProfiles.length - i - 1) * 0.5)
        });
        await new Promise(r => setTimeout(r, 300));
      }

      setCandidates(processedCandidates);
    } finally {
      setIsProcessing(false);
    }
  };

  // Toggle shortlist
  const toggleShortlist = (candidateId: string, jobId: string) => {
    setCandidates(prev => prev.map(c => {
      if (c.candidate_id !== candidateId) return c;
      const current = c.shortlistedForJobs.includes(jobId);
      return {
        ...c,
        shortlistedForJobs: current
          ? c.shortlistedForJobs.filter(id => id !== jobId)
          : [...c.shortlistedForJobs, jobId]
      };
    }));
  };

  // Session management
  const saveSession = () => {
    const session: CompanySession = {
      company,
      jobPosts,
      candidates,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem('candidateForgeSession', JSON.stringify(session));
    alert('Session saved successfully!');
  };

  const loadSession = () => {
    const saved = localStorage.getItem('candidateForgeSession');
    if (saved) {
      const session: CompanySession = JSON.parse(saved);
      setCompany(session.company);
      setJobPosts(session.jobPosts);
      setCandidates(session.candidates);
      if (session.jobPosts.length > 0) {
        setActiveJobId(session.jobPosts[0].id);
      }
      alert('Session loaded successfully!');
    } else {
      alert('No saved session found');
    }
  };

  // Export functions
  const exportShortlisted = () => {
    if (!activeJobId) return;
    const shortlisted = filteredCandidatesForActiveJob.filter(
      c => c.shortlistedForJobs.includes(activeJobId)
    );
    const csvData = shortlisted.map(c => {
      const jobMatch = c.jobMatches.find(j => j.jobId === activeJobId);
      return {
        candidate_id: c.candidate_id,
        full_name: c.full_name,
        email: c.emails[0] || '',
        phone: c.phones[0] || '',
        current_company: c.experience[0]?.company || '',
        job_title: c.headline || '',
        primary_skill: c.primarySkill || '',
        secondary_skill: c.secondarySkill || '',
        years_experience: c.years_experience || '',
        education: c.education[0]?.degree || '',
        job_match_score: jobMatch?.score || 0,
        verdict: jobMatch?.verdict || '',
        sources: c.sources.join('; ')
      };
    });
    exportToCSV(csvData, `shortlisted_candidates_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportAll = () => {
    const csvData = candidates.map(c => ({
      candidate_id: c.candidate_id,
      full_name: c.full_name,
      email: c.emails[0] || '',
      phone: c.phones[0] || '',
      current_company: c.experience[0]?.company || '',
      job_title: c.headline || '',
      primary_skill: c.primarySkill || '',
      secondary_skill: c.secondarySkill || '',
      years_experience: c.years_experience || '',
      education: c.education[0]?.degree || '',
      sources: c.sources.join('; '),
      overall_confidence: c.overall_confidence
    }));
    exportToCSV(csvData, `all_candidates_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Company Onboarding Panel */}
        <CompanyOnboardingPanel
          companyName={company.name}
          onCompanyNameChange={(name) => setCompany({ ...company, name })}
          jobPosts={jobPosts}
          onJobPostsChange={setJobPosts}
        />

        {/* Right: Main Work Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0B1120]">
          {/* Top Toolbar */}
          <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-[#0F172A]">
            <div className="flex items-center gap-3">
              <button
                onClick={saveSession}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-md text-xs font-bold hover:bg-emerald-600/30 transition-colors"
              >
                <Save size={12} /> Save Session
              </button>
              <button
                onClick={loadSession}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/20 text-slate-300 border border-slate-700 rounded-md text-xs font-bold hover:bg-slate-700/30 transition-colors"
              >
                Load Session
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={exportShortlisted}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 rounded-md text-xs font-bold hover:bg-indigo-600/30 transition-colors"
              >
                Export Shortlisted
              </button>
              <button
                onClick={exportAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/20 text-slate-300 border border-slate-700 rounded-md text-xs font-bold hover:bg-slate-700/30 transition-colors"
              >
                Export All
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Step 1: Bulk Data Ingestion */}
            {candidates.length === 0 && !isProcessing && (
              <div className="max-w-4xl mx-auto">
                <h2 className="text-2xl font-bold text-white mb-6">Bulk Data Ingestion</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
                  {/* CSV Upload */}
                  <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <FileSpreadsheet className="text-green-400" size={18} />
                      <h3 className="font-semibold text-white">Recruiter CSV (Bulk)</h3>
                      {bulkSources.csvIngestedCount > 0 && (
                        <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full border border-green-500/30">
                          {bulkSources.csvIngestedCount} candidates
                        </span>
                      )}
                    </div>
                    <textarea
                      value={bulkSources.csvContent}
                      onChange={(e) => setBulkSources({ ...bulkSources, csvContent: e.target.value })}
                      placeholder="Paste CSV content here (columns: full_name, email, phone, current_company, job_title, skills)"
                      className="w-full h-32 bg-[#1E293B] border border-slate-700 rounded-md p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Resume Upload */}
                  <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="text-cyan-400" size={18} />
                      <h3 className="font-semibold text-white">Resumes (PDF/DOCX)</h3>
                      <span className="text-xs px-2 py-0.5 bg-slate-700/20 text-slate-400 rounded-full border border-slate-700">
                        {bulkSources.resumeFiles.length} files
                      </span>
                    </div>
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-700 rounded-md cursor-pointer hover:border-slate-600 bg-[#1E293B]">
                      <Upload className="w-8 h-8 mb-2 text-slate-500" />
                      <span className="text-xs text-slate-400">Click to upload or drag & drop</span>
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        accept=".pdf,.docx,.txt"
                        onChange={(e) => handleResumeFileSelect(e.target.files)}
                      />
                    </label>
                  </div>

                  {/* GitHub Usernames */}
                  <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Github className="text-gray-400" size={18} />
                      <h3 className="font-semibold text-white">GitHub Usernames</h3>
                    </div>
                    <textarea
                      value={bulkSources.githubUsernames}
                      onChange={(e) => setBulkSources({ ...bulkSources, githubUsernames: e.target.value })}
                      placeholder="Enter one GitHub username per line"
                      className="w-full h-32 bg-[#1E293B] border border-slate-700 rounded-md p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* LinkedIn Bulk */}
                  <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Linkedin className="text-blue-400" size={18} />
                      <h3 className="font-semibold text-white">LinkedIn Profiles</h3>
                    </div>
                    <textarea
                      value={bulkSources.linkedinText}
                      onChange={(e) => setBulkSources({ ...bulkSources, linkedinText: e.target.value })}
                      placeholder="Paste LinkedIn profiles separated by --- divider"
                      className="w-full h-32 bg-[#1E293B] border border-slate-700 rounded-md p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* ATS JSON */}
                  <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Code className="text-purple-400" size={18} />
                      <h3 className="font-semibold text-white">ATS JSON (Array)</h3>
                    </div>
                    <textarea
                      value={bulkSources.atsJsonText}
                      onChange={(e) => setBulkSources({ ...bulkSources, atsJsonText: e.target.value })}
                      placeholder='Paste JSON array of candidate objects (e.g., [{"full_name":"John Doe","email":"john@example.com"}])'
                      className="w-full h-32 bg-[#1E293B] border border-slate-700 rounded-md p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Run Button */}
                <button
                  onClick={runBulkPipeline}
                  className="w-full py-4 bg-gradient-to-r from-[#4F46E5] to-[#22D3EE] text-white rounded-xl font-bold text-lg hover:opacity-90 transition-opacity shadow-lg"
                >
                  <Upload size={18} className="inline mr-2" />
                  Run Bulk Pipeline for All Candidates
                </button>
              </div>
            )}

            {/* Processing State */}
            {isProcessing && (
              <div className="max-w-md mx-auto mt-20 text-center">
                <div className="w-24 h-24 mx-auto mb-6 relative">
                  <svg className="w-24 h-24 animate-spin" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="16" fill="none" stroke="#4F46E5" strokeWidth="3" opacity="0.25"></circle>
                    <circle cx="18" cy="18" r="16" fill="none" stroke="#4F46E5" strokeWidth="3" strokeDasharray="80" strokeDashoffset="40" strokeLinecap="round"></circle>
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Processing Candidates...</h2>
                <p className="text-slate-400 mb-4">{processingProgress.step}</p>
                <div className="w-full bg-slate-700 rounded-full h-3 mb-4">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all"
                    style={{ width: `${(processingProgress.current / processingProgress.total) * 100}%` }}
                  ></div>
                </div>
                <p className="text-xs text-slate-500">
                  {processingProgress.current} of {processingProgress.total} completed · ETA {processingProgress.eta.toFixed(1)}s
                </p>
              </div>
            )}

            {/* Results Panel */}
            {candidates.length > 0 && !isProcessing && (
              <div className="space-y-6">
                {/* Summary Dashboard */}
                {summaryStats && (
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                    <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-white">{summaryStats.total}</p>
                      <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Total Candidates</p>
                    </div>
                    <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-emerald-400">{summaryStats.strong}</p>
                      <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Strong Match</p>
                    </div>
                    <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-cyan-400">{summaryStats.good}</p>
                      <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Good Match</p>
                    </div>
                    <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-amber-400">{summaryStats.possible}</p>
                      <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Possible Match</p>
                    </div>
                    <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-red-400">{summaryStats.notMatched}</p>
                      <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Not Matched</p>
                    </div>
                    <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-white">{summaryStats.shortlisted}</p>
                      <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Shortlisted</p>
                    </div>
                  </div>
                )}

                {/* Job Tabs */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {jobPosts.map(job => (
                    <button
                      key={job.id}
                      onClick={() => setActiveJobId(job.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
                        activeJobId === job.id
                          ? 'bg-[#4F46E5] text-white shadow-md'
                          : 'bg-[#1E293B] text-slate-400 border border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      {job.title}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/20">
                        {filteredCandidatesForActiveJob.length}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Candidate Table */}
                <div className="bg-[#0F172A] border border-slate-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-[#1E293B] border-b border-slate-800">
                        <tr>
                          <th className="px-3 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                            <input type="checkbox" className="rounded bg-slate-700 border-slate-600" />
                          </th>
                          <th className="px-3 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Rank</th>
                          <th className="px-3 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Candidate</th>
                          <th className="px-3 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Contact</th>
                          <th className="px-3 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Skills</th>
                          <th className="px-3 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Exp</th>
                          <th className="px-3 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Match Score</th>
                          <th className="px-3 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Verdict</th>
                          <th className="px-3 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {filteredCandidatesForActiveJob.map((candidate, index) => {
                          const jobMatch = candidate.jobMatches.find(j => j.jobId === activeJobId);
                          const isShortlisted = candidate.shortlistedForJobs.includes(activeJobId!);
                          return (
                            <tr
                              key={candidate.candidate_id}
                              className={`hover:bg-[#1E293B]/50 transition-all ${
                                candidate.rejected ? 'opacity-40' : ''
                              } ${isShortlisted ? 'border-l-4 border-emerald-500' : ''}`}
                            >
                              <td className="px-3 py-3">
                                <input
                                  type="checkbox"
                                  checked={selectedCandidates.includes(candidate.candidate_id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedCandidates([...selectedCandidates, candidate.candidate_id]);
                                    } else {
                                      setSelectedCandidates(selectedCandidates.filter(id => id !== candidate.candidate_id));
                                    }
                                  }}
                                  className="rounded bg-slate-700 border-slate-600"
                                />
                              </td>
                              <td className="px-3 py-3 text-sm text-slate-400 font-mono">{index + 1}</td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                                    style={{ backgroundColor: getAvatarColor(candidate.full_name) }}
                                  >
                                    {candidate.full_name.split(' ').map(n => n[0]).join('')}
                                  </div>
                                  <div>
                                    <button
                                      onClick={() => {
                                        setSelectedCandidate(candidate);
                                        setShowDetailDrawer(true);
                                      }}
                                      className="text-sm font-semibold text-white hover:text-indigo-400 transition-colors"
                                    >
                                      {candidate.full_name}
                                    </button>
                                    <p className="text-xs text-slate-500 truncate max-w-[200px]">
                                      {candidate.headline}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-xs text-slate-400">
                                {candidate.emails[0] && <p>{candidate.emails[0]}</p>}
                                {candidate.phones[0] && <p>{candidate.phones[0]}</p>}
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {candidate.skills.slice(0, 3).map((skill, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-0.5 text-[10px] rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                    >
                                      {skill.name}
                                    </span>
                                  ))}
                                  {candidate.skills.length > 3 && (
                                    <span className="text-[10px] text-slate-500">+{candidate.skills.length - 3}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-sm text-slate-400">{candidate.years_experience} yrs</td>
                              <td className="px-3 py-3">
                                {jobMatch && (
                                  <div className="flex items-center gap-2">
                                    <div className="w-24 bg-slate-700 rounded-full h-2.5 overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                          width: `${jobMatch.score}%`,
                                          backgroundColor: jobMatch.score >= 80 ? '#10B981' : jobMatch.score >= 60 ? '#22D3EE' : '#F59E0B'
                                        }}
                                      ></div>
                                    </div>
                                    <span className="text-xs font-bold" style={{ color: jobMatch.score >= 80 ? '#10B981' : jobMatch.score >= 60 ? '#22D3EE' : '#F59E0B' }}>
                                      {jobMatch.score}%
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {jobMatch && (
                                  <span
                                    className="px-2.5 py-1 rounded-full text-xs font-bold text-white"
                                    style={{ backgroundColor: jobMatch.score >= 80 ? '#10B981' : jobMatch.score >= 60 ? '#22D3EE' : '#F59E0B' }}
                                  >
                                    {jobMatch.verdict}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      setSelectedCandidate(candidate);
                                      setShowDetailDrawer(true);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                                  >
                                    View Profile
                                  </button>
                                  <button
                                    onClick={() => toggleShortlist(candidate.candidate_id, activeJobId!)}
                                    className={`p-1.5 rounded transition-colors ${
                                      isShortlisted
                                        ? 'text-emerald-400 bg-emerald-500/20'
                                        : 'text-slate-400 hover:text-amber-400 hover:bg-amber-500/20'
                                    }`}
                                  >
                                    {isShortlisted ? <CheckCircle2 size={14} /> : 'Shortlist'}
                                  </button>
                                  <button
                                    onClick={() => setCandidates(candidates.map(c => c.candidate_id === candidate.candidate_id ? { ...c, rejected: true } : c))}
                                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors"
                                  >
                                    <XCircle size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Candidate Detail Drawer */}
      {showDetailDrawer && selectedCandidate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-xl h-full bg-[#0F172A] border-l-2 border-indigo-500 overflow-y-auto p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: getAvatarColor(selectedCandidate.full_name) }}
                >
                  {selectedCandidate.full_name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedCandidate.full_name}</h2>
                  <p className="text-sm text-slate-400">{selectedCandidate.headline}</p>
                </div>
              </div>
              <button
                onClick={() => setShowDetailDrawer(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <XCircle size={20} />
              </button>
            </div>

            {activeJobId && (
              <div className="mb-6 p-4 bg-[#1E293B] border border-slate-800 rounded-xl">
                <h3 className="text-sm font-semibold text-slate-300 mb-2">
                  Job Match Score for {jobPosts.find(j => j.id === activeJobId)?.title}
                </h3>
                {(() => {
                  const jobMatch = selectedCandidate.jobMatches.find(j => j.jobId === activeJobId);
                  if (!jobMatch) return null;
                  return (
                    <>
                      <p className="text-4xl font-bold mb-3" style={{ color: jobMatch.score >= 80 ? '#10B981' : jobMatch.score >= 60 ? '#22D3EE' : '#F59E0B' }}>
                        {jobMatch.score}%
                      </p>
                      <div className="space-y-2 mb-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Skill Match</span>
                          <span>{Math.round(jobMatch.skillMatchScore * 100)}%</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Experience Match</span>
                          <span>{Math.round(jobMatch.experienceScore * 100)}%</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Education Match</span>
                          <span>{Math.round(jobMatch.educationScore * 100)}%</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-emerald-400 mb-1">Matched Skills</p>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {jobMatch.matchedSkills.map((s, i) => (
                            <span key={i} className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-xs">
                              {s}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs font-semibold text-red-400 mb-1">Missing Skills</p>
                        <div className="flex flex-wrap gap-1">
                          {jobMatch.missingSkills.map((s, i) => (
                            <span key={i} className="px-2 py-0.5 bg-red-500/20 text-red-300 rounded text-xs">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Quick Actions */}
            <div className="flex gap-2 mb-6">
              {activeJobId && (
                <button
                  onClick={() => {
                    toggleShortlist(selectedCandidate.candidate_id, activeJobId);
                    setSelectedCandidate(
                      candidates.find(c => c.candidate_id === selectedCandidate.candidate_id) || null
                    );
                  }}
                  className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-500 transition-colors"
                >
                  {selectedCandidate.shortlistedForJobs.includes(activeJobId) ? 'Remove from Shortlist' : 'Shortlist for Job'}
                </button>
              )}
              <button
                onClick={() => {
                  setCandidates(candidates.map(c => c.candidate_id === selectedCandidate.candidate_id ? { ...c, rejected: true } : c));
                  setShowDetailDrawer(false);
                }}
                className="px-4 py-2 bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg text-sm font-bold hover:bg-red-600/30 transition-colors"
              >
                Reject
              </button>
            </div>

            {/* Candidate Details */}
            <div className="space-y-4">
              {selectedCandidate.emails.length > 0 && (
                <div className="bg-[#1E293B] border border-slate-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-white mb-2">Email</h3>
                  <div className="text-xs text-slate-400">
                    {selectedCandidate.emails.map((email, i) => <p key={i}>{email}</p>)}
                  </div>
                </div>
              )}

              {selectedCandidate.phones.length > 0 && (
                <div className="bg-[#1E293B] border border-slate-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-white mb-2">Phone</h3>
                  <div className="text-xs text-slate-400">
                    {selectedCandidate.phones.map((phone, i) => <p key={i}>{phone}</p>)}
                  </div>
                </div>
              )}

              {selectedCandidate.experience.length > 0 && (
                <div className="bg-[#1E293B] border border-slate-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-white mb-2">Experience</h3>
                  <div className="space-y-3">
                    {selectedCandidate.experience.map((exp, i) => (
                      <div key={i} className="border-l-2 border-slate-700 pl-3">
                        <p className="text-xs font-semibold text-white">{exp.title}</p>
                        <p className="text-xs text-slate-400">{exp.company} · {exp.start} - {exp.end || 'Present'}</p>
                        {exp.summary && <p className="text-xs text-slate-500 mt-1">{exp.summary}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedCandidate.education.length > 0 && (
                <div className="bg-[#1E293B] border border-slate-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-white mb-2">Education</h3>
                  <div className="space-y-2">
                    {selectedCandidate.education.map((edu, i) => (
                      <div key={i} className="text-xs text-slate-400">
                        <p className="font-semibold text-slate-300">{edu.degree} in {edu.field}</p>
                        <p>{edu.institution}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedCandidate.sources.length > 0 && (
                <div className="bg-[#1E293B] border border-slate-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-white mb-2">Sources</h3>
                  <div className="flex flex-wrap gap-1">
                    {selectedCandidate.sources.map((source, i) => (
                      <span key={i} className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-300">
                        {source}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
