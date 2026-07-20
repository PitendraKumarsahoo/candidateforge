import React, { useState, useEffect, useRef } from 'react';
import { CanonicalCandidate } from '../pipeline/types';
import ConfidenceRing from './ConfidenceRing';
import { DEFAULT_JOB_DESCRIPTIONS } from '../services/modelClient';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Copy, 
  Check, 
  Download, 
  ShieldAlert, 
  ExternalLink, 
  BadgeHelp, 
  Briefcase, 
  CheckCircle,
  FileJson,
  History,
  ChevronDown,
  Edit2,
  FileSpreadsheet,
  FileText,
  GitCompare,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  User,
  PlusCircle,
  Eye,
  Bot,
  XCircle,
  Calendar,
  Clock
} from 'lucide-react';

interface OutputViewerPanelProps {
  candidate: CanonicalCandidate | null;
  originalCandidate: CanonicalCandidate | null;
  projectedOutput: any;
  isProcessing: boolean;
  onDownloadProfile: (type: 'canonical' | 'projected') => void;
  onDownloadTrace: () => void;
  onCandidateChange?: (updated: CanonicalCandidate) => void;
}

export default function OutputViewerPanel({
  candidate,
  originalCandidate,
  projectedOutput,
  isProcessing,
  onDownloadProfile,
  onDownloadTrace,
  onCandidateChange
}: OutputViewerPanelProps) {
  const [copied, setCopied] = useState(false);
  const [jsonTab, setJsonTab] = useState<'canonical' | 'projected' | 'editor' | 'diff'>('canonical');
  const [downloadOpen, setDownloadOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isScreeningLoading, setIsScreeningLoading] = useState(false);
  const [screeningError, setScreeningError] = useState<string | null>(null);

  const compileResumeText = (c: CanonicalCandidate): string => {
    let text = `Name: ${c.full_name}\n`;
    if (c.headline) text += `Headline: ${c.headline}\n`;
    if (c.years_experience !== null) text += `Years of Experience: ${c.years_experience}\n`;
    
    text += `\nSkills:\n` + c.skills.map(s => s.name).join(', ') + `\n`;
    
    if (c.experience.length > 0) {
      text += `\nWork Experience:\n`;
      c.experience.forEach(e => {
        text += `- ${e.title} at ${e.company} (${e.start} - ${e.end || 'Present'})\n  ${e.summary || ''}\n`;
      });
    }
    
    if (c.education.length > 0) {
      text += `\nEducation:\n`;
      c.education.forEach(edu => {
        text += `- ${edu.degree} in ${edu.field} from ${edu.institution} (Graduated: ${edu.end_year || 'N/A'})\n`;
      });
    }
    
    if (c.projects.length > 0) {
      text += `\nProjects:\n`;
      c.projects.forEach(p => {
        text += `- ${p.name}: ${p.description || ''}\n`;
      });
    }
    
    return text;
  };

  const handleRunScreening = async () => {
    if (!candidate || !onCandidateChange) return;
    
    setIsScreeningLoading(true);
    setScreeningError(null);
    
    try {
      const resumeText = compileResumeText(candidate);
      const category = candidate.headline || "Senior Frontend Engineer";
      const jobDescription = DEFAULT_JOB_DESCRIPTIONS[category] || DEFAULT_JOB_DESCRIPTIONS["Senior Frontend Engineer"];
      const mlScore = Math.round(candidate.overall_confidence * 100);
      
      const res = await fetch('/api/agent/screen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          resumeText,
          jobDescription,
          mlScore
        })
      });
      
      if (!res.ok) {
        throw new Error(`Screening failed: Server returned error status ${res.status}`);
      }
      
      const decision = await res.json();
      onCandidateChange({
        ...candidate,
        agent_decision: decision
      });
    } catch (err: any) {
      console.error("Screening Agent Run Error:", err);
      setScreeningError(err.message || "Failed to contact screening agent.");
    } finally {
      setIsScreeningLoading(false);
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDownloadOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!candidate) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[480px] p-8 text-center bg-[#0B1120] border border-indigo-500/10 rounded-xl shadow-xl">
        <div className="w-14 h-14 rounded-full bg-indigo-950/40 border border-indigo-500/20 flex items-center justify-center mb-4 text-[#22D3EE] shadow-lg shadow-indigo-500/5 animate-pulse">
          <FileJson size={24} />
        </div>
        <h3 className="font-display font-semibold text-white tracking-tight mb-2">
          Workspace Awaiting Data
        </h3>
        <p className="text-xs text-slate-400 max-w-sm leading-relaxed mb-6 font-sans">
          Select and populate at least one structured (CSV/ATS) and one unstructured (GitHub/Resume/LinkedIn) source in the Ingestion Panel, then execute the Pipeline Transformation.
        </p>
        <div className="text-[9px] font-mono text-slate-500 bg-slate-950/30 px-3 py-1.5 rounded border border-slate-800">
          PROVENANCE SYSTEM READY
        </div>
      </div>
    );
  }

  const handleCopy = () => {
    const dataToCopy = jsonTab === 'projected' ? projectedOutput : candidate;
    if (!dataToCopy) return;
    
    navigator.clipboard.writeText(JSON.stringify(dataToCopy, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to extract unique active source names
  const getUniqueSources = (c: CanonicalCandidate) => {
    const sources = new Set<string>();
    c.provenance.forEach(p => {
      p.source.split(',').forEach(s => sources.add(s.trim()));
    });
    return Array.from(sources);
  };

  // Helper to color confidence badges in tables
  const getConfidenceBadgeColor = (conf: number) => {
    if (conf >= 0.8) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (conf >= 0.5) return 'text-[#22D3EE] bg-cyan-500/10 border-cyan-500/20';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  };

  // Calculate verification summary
  const getVerificationSummary = (c: CanonicalCandidate) => {
    const total = c.provenance.length;
    const verifiedCount = c.provenance.filter(p => p.verified).length;
    return { verified: verifiedCount, total };
  };

  const formatFieldLabel = (f: string) => {
    return f.split('.').map(part => part.replace(/_/g, ' ')).join(' → ').toUpperCase();
  };

  const getFieldDisplayValue = (c: CanonicalCandidate, field: string): string => {
    try {
      if (field === 'full_name') return c.full_name;
      if (field === 'emails') return c.emails.join(', ');
      if (field === 'phones') return c.phones.join(', ');
      if (field === 'location.city' || field === 'city') return c.location.city || 'N/A';
      if (field === 'location.country' || field === 'country') return c.location.country || 'N/A';
      if (field === 'links.linkedin' || field === 'links') return c.links.linkedin || c.links.github || 'N/A';
      if (field === 'headline') return c.headline || 'N/A';
      if (field === 'years_experience') return c.years_experience !== null ? `${c.years_experience} years` : 'N/A';
      if (field === 'skills') return c.skills.slice(0, 5).map(s => s.name).join(', ') + (c.skills.length > 5 ? '...' : '');
      if (field === 'experience') return c.experience.length > 0 ? `${c.experience[0].title} at ${c.experience[0].company}` : 'N/A';
      if (field === 'education') return c.education.length > 0 ? `${c.education[0].degree} from ${c.education[0].institution}` : 'N/A';
      return 'Parsed Field';
    } catch {
      return 'N/A';
    }
  };

  // --- Download Exporters ---
  const triggerDownload = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloadOpen(false);
  };

  const downloadCSV = (c: CanonicalCandidate) => {
    const headers = [
      'Candidate ID', 'Full Name', 'Headline', 'Emails', 'Phones', 
      'City', 'Region', 'Country', 'Years Experience', 'Skills', 
      'LinkedIn', 'GitHub', 'Portfolio', 'Experience Count', 'Education Count'
    ];
    
    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const row = [
      c.candidate_id,
      c.full_name,
      c.headline || '',
      c.emails.join(', '),
      c.phones.join(', '),
      c.location.city,
      c.location.region,
      c.location.country,
      c.years_experience !== null ? c.years_experience : '',
      c.skills.map(s => s.name).join(', '),
      c.links.linkedin || '',
      c.links.github || '',
      c.links.portfolio || '',
      c.experience.length,
      c.education.length
    ];

    const csvContent = [headers.join(','), row.map(escapeCSV).join(',')].join('\n');
    triggerDownload(csvContent, `${c.full_name.replace(/\s+/g, '_')}_profile.csv`, 'text/csv');
  };

  const downloadExcel = (c: CanonicalCandidate) => {
    const name = c.full_name.replace(/\s+/g, '_');
    const htmlContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
      <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Profile</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      <style>
        th { background-color: #4F46E5; color: white; font-weight: bold; }
        td, th { border: 1px solid #CBD5E1; padding: 6px; font-family: sans-serif; font-size: 11px; }
        .section-header { background-color: #0F172A; color: #22D3EE; font-weight: bold; }
      </style>
      </head>
      <body>
      <table>
        <tr><th colspan="2" style="font-size: 14px; text-align: center;">CANDIDATE PROFILE: ${c.full_name}</th></tr>
        <tr><td><strong>Candidate ID</strong></td><td>${c.candidate_id}</td></tr>
        <tr><td><strong>Full Name</strong></td><td>${c.full_name}</td></tr>
        <tr><td><strong>Headline</strong></td><td>${c.headline || 'N/A'}</td></tr>
        <tr><td><strong>Emails</strong></td><td>${c.emails.join(', ') || 'N/A'}</td></tr>
        <tr><td><strong>Phones</strong></td><td>${c.phones.join(', ') || 'N/A'}</td></tr>
        <tr><td><strong>Location</strong></td><td>${c.location.city || 'Unknown'}, ${c.location.region || ''} ${c.location.country || ''}</td></tr>
        <tr><td><strong>Years Experience</strong></td><td>${c.years_experience ?? 'N/A'}</td></tr>
        <tr><td><strong>LinkedIn</strong></td><td>${c.links.linkedin || 'N/A'}</td></tr>
        <tr><td><strong>GitHub</strong></td><td>${c.links.github || 'N/A'}</td></tr>
        <tr><td><strong>Skills</strong></td><td>${c.skills.map(s => `${s.name} (${Math.round(s.confidence * 100)}%)`).join(', ')}</td></tr>
        
        <tr><td colspan="2" class="section-header">WORK EXPERIENCE</td></tr>
        ${c.experience.map(exp => `
          <tr><td><strong>${exp.title} at ${exp.company}</strong><br/>(${exp.start} to ${exp.end || 'Present'})</td><td>${exp.summary}</td></tr>
        `).join('')}

        <tr><td colspan="2" class="section-header">EDUCATION</td></tr>
        ${c.education.map(edu => `
          <tr><td><strong>${edu.institution}</strong></td><td>${edu.degree} in ${edu.field} (Class of ${edu.end_year || 'N/A'})</td></tr>
        `).join('')}
      </table>
      </body>
      </html>
    `;
    triggerDownload(htmlContent, `${name}_profile.xls`, 'application/vnd.ms-excel');
  };

  const downloadMarkdown = (c: CanonicalCandidate) => {
    const name = c.full_name.replace(/\s+/g, '_');
    const md = `# Candidate Profile: ${c.full_name}

| Field | Value |
| --- | --- |
| **Candidate ID** | \`${c.candidate_id}\` |
| **Full Name** | **${c.full_name}** |
| **Headline** | ${c.headline || '*N/A*'} |
| **Emails** | ${c.emails.join(', ') || '*N/A*'} |
| **Phones** | ${c.phones.join(', ') || '*N/A*'} |
| **Location** | ${c.location.city || 'Unknown'}, ${c.location.country || 'Unknown'} |
| **Years Experience** | ${c.years_experience ?? '*N/A*'} years |
| **LinkedIn** | [LinkedIn](${c.links.linkedin || '#'}) |
| **GitHub** | [GitHub](${c.links.github || '#'}) |

## 🛠️ Core Skills
${c.skills.map(s => `- **${s.name}** - ${Math.round(s.confidence * 100)}% Confidence`).join('\n')}

## 💼 Experience
${c.experience.map(exp => `### ${exp.title} @ ${exp.company}
*${exp.start} to ${exp.end || 'Present'}*

${exp.summary}`).join('\n\n')}

## 🎓 Education
${c.education.map(edu => `- **${edu.degree}** in *${edu.field}* from **${edu.institution}** (Graduation: ${edu.end_year || 'N/A'})`).join('\n')}
`;
    triggerDownload(md, `${name}_profile.md`, 'text/markdown');
  };

  // --- Manual Override handlers ---
  const handleFieldChange = (fieldPath: string, value: any) => {
    if (!onCandidateChange) return;

    // Create deep copy
    const updated = JSON.parse(JSON.stringify(candidate)) as CanonicalCandidate;

    if (fieldPath === 'full_name') {
      updated.full_name = value;
    } else if (fieldPath === 'headline') {
      updated.headline = value || null;
    } else if (fieldPath === 'emails') {
      updated.emails = String(value).split(',').map(s => s.trim()).filter(Boolean);
    } else if (fieldPath === 'phones') {
      updated.phones = String(value).split(',').map(s => s.trim()).filter(Boolean);
    } else if (fieldPath === 'location.city') {
      updated.location.city = value;
    } else if (fieldPath === 'location.country') {
      updated.location.country = value;
    } else if (fieldPath === 'years_experience') {
      updated.years_experience = value === '' ? null : Number(value);
    } else if (fieldPath === 'links.linkedin') {
      updated.links.linkedin = value || null;
    } else if (fieldPath === 'links.github') {
      updated.links.github = value || null;
    }

    // Upsert Manual Override provenance item
    const provIndex = updated.provenance.findIndex(p => p.field === fieldPath);
    if (provIndex >= 0) {
      updated.provenance[provIndex] = {
        field: fieldPath,
        source: 'Manual Override',
        method: 'manual_override',
        confidence: 1.0,
        verified: true
      };
    } else {
      updated.provenance.push({
        field: fieldPath,
        source: 'Manual Override',
        method: 'manual_override',
        confidence: 1.0,
        verified: true
      });
    }

    onCandidateChange(updated);
  };

  const isOverridden = (fieldPath: string) => {
    return candidate.provenance.some(p => p.field === fieldPath && p.method === 'manual_override');
  };

  const activeSources = getUniqueSources(candidate);

  // --- Real-time comparative Diff view items ---
  const fieldsToDiff = [
    { path: 'full_name', label: 'Full Name', getValue: (c: CanonicalCandidate) => c.full_name },
    { path: 'headline', label: 'Headline', getValue: (c: CanonicalCandidate) => c.headline || 'N/A' },
    { path: 'emails', label: 'Emails', getValue: (c: CanonicalCandidate) => c.emails.join(', ') || 'N/A' },
    { path: 'phones', label: 'Phones', getValue: (c: CanonicalCandidate) => c.phones.join(', ') || 'N/A' },
    { path: 'location.city', label: 'City', getValue: (c: CanonicalCandidate) => c.location.city || 'N/A' },
    { path: 'location.country', label: 'Country', getValue: (c: CanonicalCandidate) => c.location.country || 'N/A' },
    { path: 'years_experience', label: 'Years Experience', getValue: (c: CanonicalCandidate) => c.years_experience !== null ? `${c.years_experience} years` : 'N/A' },
    { path: 'links.linkedin', label: 'LinkedIn URL', getValue: (c: CanonicalCandidate) => c.links.linkedin || 'N/A' },
    { path: 'links.github', label: 'GitHub URL', getValue: (c: CanonicalCandidate) => c.links.github || 'N/A' },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0B1120] border border-indigo-500/10 rounded-xl overflow-hidden shadow-xl">
      
      {/* Header containing dropdown menu and Trace Download */}
      <div className="px-5 py-4 bg-[#0F172A]/80 border-b border-indigo-500/10 flex items-center justify-between">
        <h2 className="font-display font-bold text-[#F0F4FF] tracking-widest text-[10px] uppercase">
          Canonical Profile
        </h2>
        
        <div className="flex items-center gap-2">
          {/* Historical Trace download */}
          <button
            id="btn-download-trace"
            onClick={onDownloadTrace}
            title="Download Trace Execution Metrics"
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 rounded-lg transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <History size={14} />
          </button>
          
          {/* "Download As" drop-down trigger button group */}
          <div className="relative" ref={dropdownRef}>
            <button
              id="btn-download-dropdown-trigger"
              onClick={() => setDownloadOpen(!downloadOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4F46E5] hover:bg-[#4F46E5]/80 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-md shadow-indigo-500/15 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <Download size={11} />
              <span>Download As</span>
              <ChevronDown size={10} className={`transition-transform duration-200 ${downloadOpen ? 'rotate-180' : ''}`} />
            </button>

            {downloadOpen && (
              <div 
                id="download-as-dropdown-menu"
                className="absolute right-0 mt-1.5 w-44 bg-[#1E293B] border border-indigo-500/20 rounded-lg overflow-hidden shadow-2xl z-50 animate-in fade-in-50 slide-in-from-top-1 duration-150"
              >
                <div className="p-1.5 flex flex-col gap-1 text-[10px] font-bold tracking-wider uppercase text-slate-400">
                  <button
                    onClick={() => {
                      onDownloadProfile(jsonTab === 'projected' ? 'projected' : 'canonical');
                      setDownloadOpen(false);
                    }}
                    className="flex items-center gap-2 px-2.5 py-2 text-slate-200 hover:text-white hover:bg-slate-800 rounded transition-all text-left"
                  >
                    <FileJson size={12} className="text-indigo-400" />
                    <span>JSON Schema</span>
                  </button>
                  <button
                    onClick={() => downloadCSV(candidate)}
                    className="flex items-center gap-2 px-2.5 py-2 text-slate-200 hover:text-white hover:bg-slate-800 rounded transition-all text-left"
                  >
                    <FileText size={12} className="text-emerald-400" />
                    <span>Standard CSV</span>
                  </button>
                  <button
                    onClick={() => downloadExcel(candidate)}
                    className="flex items-center gap-2 px-2.5 py-2 text-slate-200 hover:text-white hover:bg-slate-800 rounded transition-all text-left"
                  >
                    <FileSpreadsheet size={12} className="text-cyan-400" />
                    <span>Excel Worksheet</span>
                  </button>
                  <button
                    onClick={() => downloadMarkdown(candidate)}
                    className="flex items-center gap-2 px-2.5 py-2 text-slate-200 hover:text-white hover:bg-slate-800 rounded transition-all text-left"
                  >
                    <FileText size={12} className="text-amber-400" />
                    <span>Markdown Table</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Right Scrollable body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        
        {/* Profile Card Header with Confidence Ring */}
        <div className="bg-[#0F172A]/70 border border-indigo-500/5 rounded-xl p-5 flex flex-col sm:flex-row gap-5 items-center justify-between">
          <div className="space-y-3 flex-1 text-center sm:text-left">
            <div className="space-y-1">
              <h3 className="text-lg font-bold font-display text-white tracking-tight flex items-center justify-center sm:justify-start gap-2">
                {candidate.full_name || "Unidentified Candidate"}
                {candidate.provenance.some(p => p.method === 'manual_override') && (
                  <span className="text-[9px] px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono flex items-center gap-1 uppercase tracking-wider">
                    <AlertTriangle size={10} /> Edited
                  </span>
                )}
              </h3>
              <p className="text-xs text-[#22D3EE] font-sans">
                {candidate.headline || "No Professional Headline Specified"}
              </p>
            </div>

            {/* Ingested Source Badges and Verification Summary */}
            <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start items-center">
              {activeSources.map((src, idx) => (
                <span 
                  key={idx} 
                  className="text-[9px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-slate-300 shadow-xs"
                >
                  {src}
                </span>
              ))}
              <span className="text-[9px] px-2 py-0.5 rounded bg-indigo-950/40 border border-indigo-500/20 font-mono text-indigo-300">
                {activeSources.length} Source(s) Merged
              </span>
              {/* Verification Summary Badge */}
              <span className={`text-[9px] px-2 py-0.5 rounded font-mono flex items-center gap-1 border ${
                getVerificationSummary(candidate).verified === getVerificationSummary(candidate).total 
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" 
                  : "bg-amber-500/10 border-amber-500/20 text-amber-300"
              }`}>
                <CheckCircle size={10} className={
                  getVerificationSummary(candidate).verified === getVerificationSummary(candidate).total 
                    ? "text-emerald-400" 
                    : "text-amber-400"
                } />
                {getVerificationSummary(candidate).verified}/{getVerificationSummary(candidate).total} Verified
              </span>
            </div>
          </div>

          {/* Progress Ring */}
          <div className="shrink-0">
            <ConfidenceRing confidence={candidate.overall_confidence} size={100} />
          </div>
        </div>

        {/* HireFlow Autonomous Agent Screening Report Card */}
        {candidate.agent_decision ? (
          <div className="bg-[#0F172A]/90 border border-indigo-500/20 rounded-xl p-5 shadow-lg space-y-4 relative overflow-hidden">
            {/* Ambient Background Glow effect for premium look */}
            <div className="absolute -right-24 -top-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="text-indigo-400 animate-pulse animate-duration-3000" size={18} />
                <h4 className="text-[10px] text-indigo-300 font-bold tracking-widest uppercase">
                  HireFlow Screening Agent Report
                </h4>
              </div>
              <span className="text-[8px] text-slate-500 font-mono tracking-wider uppercase bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                Autopilot Track 4 Active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
              {/* Left Side: Large Badge decision outcome */}
              <div className="md:col-span-4 flex flex-col items-center justify-center p-4 bg-[#0B1120] border border-slate-800 rounded-lg space-y-2 text-center">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Screening Decision</span>
                {candidate.agent_decision.decision === 'shortlist' && (
                  <div className="flex flex-col items-center space-y-1">
                    <CheckCircle className="text-emerald-400 shrink-0" size={32} />
                    <span className="text-xs font-bold uppercase tracking-widest px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400">
                      Shortlisted
                    </span>
                  </div>
                )}
                {candidate.agent_decision.decision === 'reject' && (
                  <div className="flex flex-col items-center space-y-1">
                    <XCircle className="text-rose-400 shrink-0" size={32} />
                    <span className="text-xs font-bold uppercase tracking-widest px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-full text-rose-400">
                      Rejected
                    </span>
                  </div>
                )}
                {candidate.agent_decision.decision === 'human_review' && (
                  <div className="flex flex-col items-center space-y-1">
                    <AlertTriangle className="text-amber-400 shrink-0" size={32} />
                    <span className="text-xs font-bold uppercase tracking-widest px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400">
                      Human Review
                    </span>
                  </div>
                )}
              </div>

              {/* Center Side: Confidence progress bar & ML Agreement */}
              <div className="md:col-span-8 space-y-3 col-span-1 min-w-0">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase">
                    <span className="text-slate-400 tracking-wider">Agent Confidence</span>
                    <span className="text-white font-mono">{candidate.agent_decision.confidence}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        candidate.agent_decision.decision === 'shortlist' ? 'bg-emerald-500' :
                        candidate.agent_decision.decision === 'reject' ? 'bg-rose-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${candidate.agent_decision.confidence}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">ML Score Agreement:</span>
                    <span className={`font-semibold uppercase px-1.5 py-0.5 rounded text-[9px] border ${
                      candidate.agent_decision.ml_score_agreement === 'agree' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                      candidate.agent_decision.ml_score_agreement === 'disagree' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    }`}>
                      {candidate.agent_decision.ml_score_agreement}
                    </span>
                  </div>

                  {candidate.agent_decision.suggested_slot && (
                    <div className="flex items-center gap-1.5 text-[#22D3EE]">
                      <Calendar size={12} />
                      <span className="text-[10px] text-slate-500">Suggested Slot:</span>
                      <span className="font-semibold text-[#22D3EE]">{candidate.agent_decision.suggested_slot}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Explanation / Reasoning block */}
            <div className="bg-[#0B1120] border border-slate-800/80 rounded-lg p-3.5 space-y-1.5">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Decision Reasoning</span>
              <p className="text-xs text-slate-300 leading-relaxed font-sans font-normal">
                {candidate.agent_decision.reason}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-[#0F172A]/40 border border-slate-800/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <Bot className={`text-slate-600 ${isScreeningLoading ? 'animate-spin text-indigo-400' : 'animate-pulse'}`} size={20} />
              <div>
                <h4 className="text-xs font-bold text-slate-400">
                  {isScreeningLoading ? 'HireFlow Screening Agent: Running LLM Verdict...' : 'HireFlow Screening Agent Offline'}
                </h4>
                <p className="text-[10px] text-slate-500">
                  {screeningError ? (
                    <span className="text-rose-400 font-semibold">{screeningError}</span>
                  ) : (
                    'Analyze candidate qualification and role match using the Qwen autonomous agent.'
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={handleRunScreening}
              disabled={isScreeningLoading}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md ${
                isScreeningLoading
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer active:scale-95'
              }`}
            >
              {isScreeningLoading ? (
                <>
                  <RefreshCw className="animate-spin" size={12} /> Running...
                </>
              ) : (
                'Run Agent'
              )}
            </button>
          </div>
        )}

        {/* View Selection Bar with all interactive toggles */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1 items-center bg-slate-900/40 p-1 border border-indigo-500/10 rounded-lg">
            <button
              id="tab-btn-canonical"
              onClick={() => setJsonTab('canonical')}
              className={`text-[9px] font-bold px-3 py-1.5 rounded-md tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1 ${
                jsonTab === 'canonical'
                  ? 'bg-[#4F46E5] text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileJson size={10} /> Default Schema
            </button>
            <button
              id="tab-btn-projected"
              onClick={() => setJsonTab('projected')}
              className={`text-[9px] font-bold px-3 py-1.5 rounded-md tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1 ${
                jsonTab === 'projected'
                  ? 'bg-[#4F46E5] text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles size={10} /> Projected Schema
            </button>
            <button
              id="tab-btn-interactive-editor"
              onClick={() => setJsonTab('editor')}
              className={`text-[9px] font-bold px-3 py-1.5 rounded-md tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1 ${
                jsonTab === 'editor'
                  ? 'bg-[#4F46E5] text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Edit2 size={10} /> Interactive Editor
            </button>
            <button
              id="tab-btn-comparative-diff"
              onClick={() => setJsonTab('diff')}
              className={`text-[9px] font-bold px-3 py-1.5 rounded-md tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1 ${
                jsonTab === 'diff'
                  ? 'bg-[#4F46E5] text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <GitCompare size={10} /> Diff View
            </button>
          </div>

          {/* Tab 1: Default Canonical View */}
          {jsonTab === 'canonical' && (
            <div className="relative border border-slate-800/80 rounded-lg overflow-hidden bg-[#0B1120] shadow-md group animate-in fade-in duration-150">
              <button
                id="btn-copy-json"
                onClick={handleCopy}
                className="absolute top-3 right-3 p-1.5 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 rounded-md transition-colors z-20 cursor-pointer"
                title="Copy JSON to Clipboard"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
              <div className="max-h-80 overflow-y-auto font-mono text-xs select-all">
                <SyntaxHighlighter 
                  language="json" 
                  style={tomorrow} 
                  customStyle={{ background: '#0B1120', padding: '16px', margin: 0, fontSize: '11px' }}
                >
                  {JSON.stringify(candidate, null, 2)}
                </SyntaxHighlighter>
              </div>
            </div>
          )}

          {/* Tab 2: Projected Config View */}
          {jsonTab === 'projected' && (
            <div className="relative border border-slate-800/80 rounded-lg overflow-hidden bg-[#0B1120] shadow-md group animate-in fade-in duration-150">
              <button
                id="btn-copy-json"
                onClick={handleCopy}
                className="absolute top-3 right-3 p-1.5 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 rounded-md transition-colors z-20 cursor-pointer"
                title="Copy JSON to Clipboard"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
              <div className="max-h-80 overflow-y-auto font-mono text-xs select-all">
                <SyntaxHighlighter 
                  language="json" 
                  style={tomorrow} 
                  customStyle={{ background: '#0B1120', padding: '16px', margin: 0, fontSize: '11px' }}
                >
                  {JSON.stringify(projectedOutput || { message: "No custom configuration project output available" }, null, 2)}
                </SyntaxHighlighter>
              </div>
            </div>
          )}

          {/* Tab 3: Interactive Override Form Editor */}
          {jsonTab === 'editor' && (
            <div className="border border-indigo-500/10 rounded-xl p-5 bg-[#0F172A]/40 space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] text-[#22D3EE] font-bold tracking-widest uppercase">
                  Workspace Override Canvas
                </h4>
                <span className="text-[9px] text-slate-500 font-mono">
                  EDITS INJECTED IN REAL-TIME
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Full Name field */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold tracking-wider uppercase flex justify-between">
                    <span>Full Name</span>
                    {isOverridden('full_name') && <span className="text-amber-400 text-[9px] lowercase font-mono">Edited</span>}
                  </label>
                  <input
                    type="text"
                    value={candidate.full_name}
                    onChange={(e) => handleFieldChange('full_name', e.target.value)}
                    className={`w-full px-3 py-2 bg-[#0B1120] text-slate-200 border rounded-lg text-xs outline-none focus:ring-1 transition-all ${
                      isOverridden('full_name')
                        ? 'border-amber-500/50 focus:border-amber-500 focus:ring-amber-500/20 bg-amber-950/5'
                        : 'border-slate-800 focus:border-[#4F46E5] focus:ring-[#4F46E5]/20'
                    }`}
                  />
                </div>

                {/* Headline field */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold tracking-wider uppercase flex justify-between">
                    <span>Professional Headline</span>
                    {isOverridden('headline') && <span className="text-amber-400 text-[9px] lowercase font-mono">Edited</span>}
                  </label>
                  <input
                    type="text"
                    value={candidate.headline || ''}
                    onChange={(e) => handleFieldChange('headline', e.target.value)}
                    className={`w-full px-3 py-2 bg-[#0B1120] text-slate-200 border rounded-lg text-xs outline-none focus:ring-1 transition-all ${
                      isOverridden('headline')
                        ? 'border-amber-500/50 focus:border-amber-500 focus:ring-amber-500/20 bg-amber-950/5'
                        : 'border-slate-800 focus:border-[#4F46E5] focus:ring-[#4F46E5]/20'
                    }`}
                    placeholder="e.g. Lead Software Architect"
                  />
                </div>

                {/* Emails field */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold tracking-wider uppercase flex justify-between">
                    <span>Email Addresses (comma separated)</span>
                    {isOverridden('emails') && <span className="text-amber-400 text-[9px] lowercase font-mono">Edited</span>}
                  </label>
                  <input
                    type="text"
                    value={candidate.emails.join(', ')}
                    onChange={(e) => handleFieldChange('emails', e.target.value)}
                    className={`w-full px-3 py-2 bg-[#0B1120] text-slate-200 border rounded-lg text-xs outline-none focus:ring-1 transition-all ${
                      isOverridden('emails')
                        ? 'border-amber-500/50 focus:border-amber-500 focus:ring-amber-500/20 bg-amber-950/5'
                        : 'border-slate-800 focus:border-[#4F46E5] focus:ring-[#4F46E5]/20'
                    }`}
                  />
                </div>

                {/* Phones field */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold tracking-wider uppercase flex justify-between">
                    <span>Phone Numbers (comma separated)</span>
                    {isOverridden('phones') && <span className="text-amber-400 text-[9px] lowercase font-mono">Edited</span>}
                  </label>
                  <input
                    type="text"
                    value={candidate.phones.join(', ')}
                    onChange={(e) => handleFieldChange('phones', e.target.value)}
                    className={`w-full px-3 py-2 bg-[#0B1120] text-slate-200 border rounded-lg text-xs outline-none focus:ring-1 transition-all ${
                      isOverridden('phones')
                        ? 'border-amber-500/50 focus:border-amber-500 focus:ring-amber-500/20 bg-amber-950/5'
                        : 'border-slate-800 focus:border-[#4F46E5] focus:ring-[#4F46E5]/20'
                    }`}
                  />
                </div>

                {/* Location City field */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold tracking-wider uppercase flex justify-between">
                    <span>City</span>
                    {isOverridden('location.city') && <span className="text-amber-400 text-[9px] lowercase font-mono">Edited</span>}
                  </label>
                  <input
                    type="text"
                    value={candidate.location.city}
                    onChange={(e) => handleFieldChange('location.city', e.target.value)}
                    className={`w-full px-3 py-2 bg-[#0B1120] text-slate-200 border rounded-lg text-xs outline-none focus:ring-1 transition-all ${
                      isOverridden('location.city')
                        ? 'border-amber-500/50 focus:border-amber-500 focus:ring-amber-500/20 bg-amber-950/5'
                        : 'border-slate-800 focus:border-[#4F46E5] focus:ring-[#4F46E5]/20'
                    }`}
                  />
                </div>

                {/* Location Country field */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold tracking-wider uppercase flex justify-between">
                    <span>Country (ISO 2-Letter Code)</span>
                    {isOverridden('location.country') && <span className="text-amber-400 text-[9px] lowercase font-mono">Edited</span>}
                  </label>
                  <input
                    type="text"
                    value={candidate.location.country}
                    onChange={(e) => handleFieldChange('location.country', e.target.value)}
                    className={`w-full px-3 py-2 bg-[#0B1120] text-slate-200 border rounded-lg text-xs outline-none focus:ring-1 transition-all ${
                      isOverridden('location.country')
                        ? 'border-amber-500/50 focus:border-amber-500 focus:ring-amber-500/20 bg-amber-950/5'
                        : 'border-slate-800 focus:border-[#4F46E5] focus:ring-[#4F46E5]/20'
                    }`}
                  />
                </div>

                {/* Years Experience field */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold tracking-wider uppercase flex justify-between">
                    <span>Years of Experience</span>
                    {isOverridden('years_experience') && <span className="text-amber-400 text-[9px] lowercase font-mono">Edited</span>}
                  </label>
                  <input
                    type="number"
                    value={candidate.years_experience !== null ? candidate.years_experience : ''}
                    onChange={(e) => handleFieldChange('years_experience', e.target.value)}
                    className={`w-full px-3 py-2 bg-[#0B1120] text-slate-200 border rounded-lg text-xs outline-none focus:ring-1 transition-all ${
                      isOverridden('years_experience')
                        ? 'border-amber-500/50 focus:border-amber-500 focus:ring-amber-500/20 bg-amber-950/5'
                        : 'border-slate-800 focus:border-[#4F46E5] focus:ring-[#4F46E5]/20'
                    }`}
                  />
                </div>

                {/* LinkedIn field */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold tracking-wider uppercase flex justify-between">
                    <span>LinkedIn URL</span>
                    {isOverridden('links.linkedin') && <span className="text-amber-400 text-[9px] lowercase font-mono">Edited</span>}
                  </label>
                  <input
                    type="text"
                    value={candidate.links.linkedin || ''}
                    onChange={(e) => handleFieldChange('links.linkedin', e.target.value)}
                    className={`w-full px-3 py-2 bg-[#0B1120] text-slate-200 border rounded-lg text-xs outline-none focus:ring-1 transition-all ${
                      isOverridden('links.linkedin')
                        ? 'border-amber-500/50 focus:border-amber-500 focus:ring-amber-500/20 bg-amber-950/5'
                        : 'border-slate-800 focus:border-[#4F46E5] focus:ring-[#4F46E5]/20'
                    }`}
                    placeholder="https://linkedin.com/in/username"
                  />
                </div>

                {/* GitHub field */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[10px] text-slate-400 font-bold tracking-wider uppercase flex justify-between">
                    <span>GitHub URL</span>
                    {isOverridden('links.github') && <span className="text-amber-400 text-[9px] lowercase font-mono">Edited</span>}
                  </label>
                  <input
                    type="text"
                    value={candidate.links.github || ''}
                    onChange={(e) => handleFieldChange('links.github', e.target.value)}
                    className={`w-full px-3 py-2 bg-[#0B1120] text-slate-200 border rounded-lg text-xs outline-none focus:ring-1 transition-all ${
                      isOverridden('links.github')
                        ? 'border-amber-500/50 focus:border-amber-500 focus:ring-amber-500/20 bg-amber-950/5'
                        : 'border-slate-800 focus:border-[#4F46E5] focus:ring-[#4F46E5]/20'
                    }`}
                    placeholder="https://github.com/username"
                  />
                </div>

              </div>
            </div>
          )}

          {/* Tab 4: Side-by-Side Diff Comparative View */}
          {jsonTab === 'diff' && (
            <div className="border border-indigo-500/10 rounded-xl p-5 bg-[#0F172A]/40 space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] text-[#22D3EE] font-bold tracking-widest uppercase">
                  Comparative State Workspace
                </h4>
                <span className="text-[9px] text-slate-500 font-mono">
                  ORIGINAL Baseline vs CURRENT Canvas
                </span>
              </div>

              {!originalCandidate ? (
                <div className="text-center py-6 text-xs text-slate-400">
                  Execute the transformation pipeline to build the original comparative baseline.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 border-b border-slate-800/80 pb-2 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    <div>Original Parser Outputs</div>
                    <div>Active Workspace Canvas</div>
                  </div>

                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {fieldsToDiff.map((field, idx) => {
                      const origVal = field.getValue(originalCandidate);
                      const currVal = field.getValue(candidate);
                      const isFieldChanged = String(origVal).trim() !== String(currVal).trim();

                      return (
                        <div key={idx} className="space-y-1">
                          <span className="text-[9px] font-mono font-bold text-indigo-400 uppercase tracking-wide">
                            {field.label}
                          </span>
                          <div className="grid grid-cols-2 gap-4">
                            {/* Original */}
                            <div className={`p-2 rounded border text-xs font-mono break-all ${
                              isFieldChanged 
                                ? 'bg-rose-950/10 border-rose-500/20 text-rose-300 line-through' 
                                : 'bg-slate-900/30 border-slate-800/50 text-slate-400'
                            }`}>
                              {String(origVal)}
                            </div>
                            {/* Edited */}
                            <div className={`p-2 rounded border text-xs font-mono break-all ${
                              isFieldChanged 
                                ? 'bg-emerald-950/15 border-emerald-500/30 text-emerald-300 font-semibold' 
                                : 'bg-slate-900/30 border-slate-800/50 text-slate-300'
                            }`}>
                              {String(currVal)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Provenance Audit Table */}
        <div className="space-y-2">
          <span className="text-[10px] text-slate-500 font-bold block tracking-widest uppercase">
            Data Attribution Map
          </span>
          <div className="border border-indigo-500/10 rounded-lg overflow-hidden bg-[#0F172A]/30">
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] font-sans text-slate-300">
                <thead className="bg-[#0F172A] text-slate-400 uppercase tracking-wider border-b border-indigo-500/10">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-mono text-[9px]">Verified</th>
                    <th className="px-3 py-2.5 text-left font-mono text-[9px]">Canonical Field</th>
                    <th className="px-3 py-2.5 text-left font-mono text-[9px]">Resolved Value</th>
                    <th className="px-3 py-2.5 text-left font-mono text-[9px]">Source</th>
                    <th className="px-3 py-2.5 text-left font-mono text-[9px]">Method</th>
                    <th className="px-3 py-2.5 text-left font-mono text-[9px]">Confidence & Heatmap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {candidate.provenance.map((prov, idx) => {
                    const relativeConfidence = prov.method === 'Manual Override'
                      ? 1.0 // Overrides are definitive (100% confidence)
                      : prov.field.startsWith('skills') 
                        ? (candidate.skills.find(s => s.name === prov.source)?.confidence || candidate.overall_confidence)
                        : candidate.overall_confidence;

                    const isManualRow = prov.method === 'Manual Override';

                    return (
                      <tr 
                        key={idx} 
                        className={`transition-colors hover:bg-slate-850/50 ${
                          isManualRow ? 'bg-amber-500/5 border-l-2 border-l-amber-500' : 
                          prov.verified ? 'bg-emerald-500/5' : 'bg-rose-500/5'
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          {prov.verified ? (
                            <CheckCircle size={14} className="text-emerald-400" />
                          ) : (
                            <AlertTriangle size={14} className="text-rose-400" />
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-medium text-slate-200">
                          {formatFieldLabel(prov.field)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-400 max-w-[140px] truncate">
                          {getFieldDisplayValue(candidate, prov.field)}
                        </td>
                        <td className="px-3 py-2.5">
                          {isManualRow ? (
                            <span className="text-amber-400 font-mono font-bold flex items-center gap-1">
                              <User size={10} /> User Overridden
                            </span>
                          ) : (
                            <span className="text-slate-400 truncate max-w-[100px] block font-mono">
                              {prov.source}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${
                            isManualRow 
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-bold'
                              : 'bg-indigo-950/20 border-indigo-500/10 text-indigo-300'
                          }`}>
                            {prov.method}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold shrink-0 ${
                                isManualRow
                                  ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                                  : getConfidenceBadgeColor(relativeConfidence)
                              }`}>
                                {Math.round(relativeConfidence * 100)}%
                              </span>
                              <span className={`px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold shrink-0 ${
                                prov.verified 
                                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' 
                                  : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                              }`}>
                                {prov.verified ? 'True' : 'False'}
                              </span>
                            </div>
                            {/* Trust Visual Heatmap bar */}
                            <div className="w-16 h-2 bg-slate-900 rounded-full overflow-hidden shrink-0 border border-slate-800">
                              <div 
                                className={`h-full rounded-full transition-all duration-300 ${
                                  isManualRow 
                                    ? 'bg-amber-400' 
                                    : relativeConfidence >= 0.8
                                      ? 'bg-gradient-to-r from-[#4F46E5] to-[#22D3EE]'
                                      : relativeConfidence >= 0.5
                                        ? 'bg-indigo-500'
                                        : 'bg-indigo-900 opacity-60'
                                }`}
                                style={{
                                  width: `${Math.round(relativeConfidence * 100)}%`,
                                  boxShadow: isManualRow 
                                    ? '0 0 4px rgba(245, 158, 11, 0.5)' 
                                    : relativeConfidence >= 0.8 
                                      ? '0 0 4px rgba(34, 211, 238, 0.4)' 
                                      : 'none'
                                }}
                              />
                            </div>
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

      </div>
    </div>
  );
}
