import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ConfigModal, { DEFAULT_CONFIG } from './components/ConfigModal';
import SourceInputsPanel from './components/SourceInputsPanel';
import PipelineTracePanel from './components/PipelineTracePanel';
import OutputViewerPanel from './components/OutputViewerPanel';
import LandingPage from './components/LandingPage';
import CompanyHiringMode from './components/CompanyHiringMode';
import { CompanyCandidateDashboard } from './components/CompanyCandidateDashboard';
import { CanonicalCandidate, RuntimeConfig, PipelineTraceStep } from './pipeline/types';
import { projectCandidate } from './pipeline/projector';
import { Menu, FileJson, Cpu, History, FileSpreadsheet, Sparkles, Send, X } from 'lucide-react';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { pingModelHealth } from './services/modelClient';

interface SourceInputs {
  csv: string;
  ats_json: string;
  github_url: string;
  linkedin_text: string;
  resume_base64: string;
  resume_filename: string;
  notes: string;
}

const INITIAL_INPUTS: SourceInputs = {
  csv: "",
  ats_json: "",
  github_url: "",
  linkedin_text: "",
  resume_base64: "",
  resume_filename: "",
  notes: ""
};

const INITIAL_STEPS: PipelineTraceStep[] = [
  { step: 'Ingest', status: 'pending', duration_ms: 0 },
  { step: 'Extract', status: 'pending', duration_ms: 0 },
  { step: 'Model Inference', status: 'pending', duration_ms: 0 },
  { step: 'Normalize', status: 'pending', duration_ms: 0 },
  { step: 'Merge', status: 'pending', duration_ms: 0 },
  { step: 'Validate', status: 'pending', duration_ms: 0 },
  { step: 'Project', status: 'pending', duration_ms: 0 }
];

export default function App() {
  const [showLandingPage, setShowLandingPage] = useState(true);
  const [mode, setMode] = useState<'single' | 'company'>('single');
  
  // Single Candidate Mode State
  const [inputs, setInputs] = useState<SourceInputs>(INITIAL_INPUTS);
  const [config, setConfig] = useState<RuntimeConfig>(DEFAULT_CONFIG);
  const [candidate, setCandidate] = useState<CanonicalCandidate | null>(null);
  const [originalCandidate, setOriginalCandidate] = useState<CanonicalCandidate | null>(null);
  const [projectedOutput, setProjectedOutput] = useState<any>(null);
  const [allCandidates, setAllCandidates] = useState<CanonicalCandidate[]>([]);
  const [activeCandidateIndex, setActiveCandidateIndex] = useState<number>(0);
  const [traceSteps, setTraceSteps] = useState<PipelineTraceStep[]>(INITIAL_STEPS);
  const [logs, setLogs] = useState<string[]>(["Workspace initialized. Enter source inputs and run transformation pipeline."]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Modals & Viewport Toggles
  const [configOpen, setConfigOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false); // Tablet sidebar drawer
  const [mobileTab, setMobileTab] = useState<'sources' | 'trace' | 'output'>('sources'); // Mobile tabs
  const [width, setWidth] = useState(window.innerWidth);

  // ML Model Connection Status State
  const [modelStatus, setModelStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');

  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      try {
        const isHealthy = await pingModelHealth();
        if (active) {
          setModelStatus(isHealthy ? 'connected' : 'disconnected');
        }
      } catch {
        if (active) {
          setModelStatus('disconnected');
        }
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Sample Data Loader ---
  const handleLoadSample = () => {
    const sampleCSV = `full_name,email,phone,current_company,title,skills
Jordan Patel,jordan.patel@example.com,+1-555-0101,Netflix,Senior Frontend Engineer,TypeScript,React,Next.js
Alex Morgan,alex.morgan@example.com,+1-555-0102,Amazon,Backend Engineer,Python,Django,AWS
Priya Sharma,priya.sharma@example.com,+1-555-0103,Microsoft,DevOps Engineer,Kubernetes,Docker,Terraform
David Chen,david.chen@example.com,+1-555-0104,Meta,Machine Learning Engineer,Python,TensorFlow,PyTorch
Jessica Lee,jessica.lee@example.com,+1-555-0105,Apple,Product Manager,Agile,Product Strategy`;
    const sampleATS = `[
  {
    "fullname": "Sarah Jenkins",
    "email": "sarah.jenkins@example.com",
    "phone": "+1-555-0122",
    "current_company": "Google",
    "title": "Senior Staff Engineer",
    "skills": ["TypeScript", "Go", "Kubernetes", "System Design"],
    "experience": [
      {
        "company": "Google",
        "title": "Senior Staff Engineer",
        "start": "2019-03",
        "end": null,
        "summary": "Tech lead for container orchestration platforms and globally distributed microservices."
      }
    ],
    "projects": [
      {
        "name": "KubeScale Orchestrator",
        "description": "An open source automated scaling agent for Kubernetes workloads that handles flash traffic loads."
      }
    ]
  },
  {
    "fullname": "Michael Brown",
    "email": "michael.brown@example.com",
    "phone": "+1-555-0123",
    "current_company": "Stripe",
    "title": "Full Stack Engineer",
    "skills": ["JavaScript", "React", "Node.js", "PostgreSQL"],
    "experience": [
      {
        "company": "Stripe",
        "title": "Full Stack Engineer",
        "start": "2020-05",
        "end": null,
        "summary": "Built payment processing APIs and frontends used by millions of businesses."
      }
    ],
    "projects": [
      {
        "name": "Stripe Checkout",
        "description": "Simplified payment integration for developers."
      }
    ]
  }
]`;
    const sampleGitHub = "https://github.com/torvalds";
    const sampleLinkedIn = `Jordan Patel
Senior Frontend Engineer at Netflix
Location: San Francisco, California, US
Email: jordan.patel@example.com
LinkedIn: linkedin.com/in/jordanpatel

Experience:
Netflix | Senior Frontend Engineer | Mar 2021 - Present
Engineered next-gen streaming dashboard rendering UI with extreme low latency and sub-50ms paint times.

Education:
Stanford University | M.S. Computer Science | 2020

Skills: TypeScript, React, Next.js, GraphQL, Performance Engineering, Tailwind CSS`;

    // Authentic base64 TXT resume file
    const sampleResumeBase64 = "Sm9yZGFuIFBhdGVsIHwgam9yZGFuLnBhdGVsQGV4YW1wbGUuY29tIHwgKzEtNTU1LTAxMDEKU2VuaW9yIEZyb250ZW5kIEVuZ2luZWVyIGF0IE5ldGZsaXgKRWR1Y2F0aW9uOiBTdGFuZm9yZCBVbml2ZXJzaXR5LCAyMDIwClNraWxsczogVHlwZVNjcmlwdCwgUmVhY3QsIE5leHQuanMsIEdyYXBocUwsIFRhaWx3aW5kIENTUw==";
    const sampleResumeFilename = "jordan_patel_resume.txt";

    const sampleNotes = `Candidate Jordan Patel completed the technical challenge. He holds a degree from Stanford University, class of 2020.
Since then, he has worked at Netflix as a Senior Frontend Engineer. Strong expertise in TypeScript, React, and performance rendering optimization. Ready for immediate onboarding.`;

    setInputs({
      csv: sampleCSV,
      ats_json: sampleATS,
      github_url: sampleGitHub,
      linkedin_text: sampleLinkedIn,
      resume_base64: sampleResumeBase64,
      resume_filename: sampleResumeFilename,
      notes: sampleNotes
    });

    setLogs([
      "Company sample data loaded! Multiple candidate records across multiple sources including multiple candidates!",
      "Ready for pipeline execution to cluster profiles and rank candidates for open roles!"
    ]);
    setWarnings([]);
  };

  // --- Clear Sources ---
  const handleClearSources = () => {
    setInputs(INITIAL_INPUTS);
    setCandidate(null);
    setOriginalCandidate(null);
    setProjectedOutput(null);
    setAllCandidates([]);
    setActiveCandidateIndex(0);
    setTraceSteps(INITIAL_STEPS);
    setLogs(["Workspace cleared. Awaiting source inputs."]);
    setWarnings([]);
  };

  // --- Select Candidate ---
  const handleSelectCandidate = (idx: number) => {
    if (idx < 0 || idx >= allCandidates.length) return;
    setActiveCandidateIndex(idx);
    const selected = allCandidates[idx];
    setCandidate(selected);
    setOriginalCandidate(JSON.parse(JSON.stringify(selected)));
    
    // Project output for this candidate
    try {
      const proj = projectCandidate(selected, config);
      setProjectedOutput(proj);
      setLogs(prev => [...prev, `Swapped active view to candidate: ${selected.full_name}`]);
    } catch (e: any) {
      console.error("Projection failed on candidate select:", e);
    }
  };

  // --- Run Transformation Pipeline ---
  const handleRunPipeline = async () => {
    setIsProcessing(true);
    setCandidate(null);
    setOriginalCandidate(null);
    setProjectedOutput(null);
    setAllCandidates([]);
    setActiveCandidateIndex(0);
    // Initialize all steps as pending at the start
    setTraceSteps(INITIAL_STEPS.map(s => ({ ...s, status: 'pending', duration_ms: 0, message: undefined })));
    setLogs(["Pipeline execution command triggered.", "Sending payload to transformation server..."]);
    setWarnings([]);

    try {
      const payload = {
        sources: inputs,
        config: config
      };

      const res = await fetch('/api/pipeline/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Server returned error code ${res.status}`);
      }

      const responseData = await res.json();
      
      const getStepForLog = (log: string): string => {
        const l = log.toLowerCase();
        if (l.includes("applying deep field-level") || l.includes("heuristics")) return "Extract";
        if (l.includes("model inference") || l.includes("calling model") || l.includes("model extracted") || l.includes("model unavailable") || l.includes("inference failed")) return "Model Inference";
        if (l.includes("normalization") || l.includes("standardization") || l.includes("type and format")) return "Normalize";
        if (l.includes("grouping and merging") || l.includes("merging candidate") || l.includes("conflict") || l.includes("clustered")) return "Merge";
        if (l.includes("validation") || l.includes("schema validations") || l.includes("auditing")) return "Validate";
        if (l.includes("projecting") || l.includes("projection")) return "Project";
        return "Ingest";
      };

      if (responseData.success) {
        // Successful Run
        const profiles = responseData.canonicalProfiles || (responseData.canonical ? [responseData.canonical] : []);
        const targetSteps = responseData.trace.steps;
        const targetLogs = responseData.trace.logs;
        const targetWarnings = responseData.trace.warnings;

        setLogs([]);

        // Progressive playback loop
        for (let i = 0; i < targetSteps.length; i++) {
          const stepName = targetSteps[i].step;
          // Set this step to running
          setTraceSteps(prev => prev.map(s => s.step === stepName ? { ...s, status: 'running' } : s));
          
          // Print logs for this step
          const stepLogs = targetLogs.filter(log => getStepForLog(log) === stepName);
          if (stepLogs.length > 0) {
            setLogs(prev => [...prev, ...stepLogs]);
          }

          // Small delay for visibility of running status
          const duration = Math.min(600, Math.max(250, targetSteps[i].duration_ms || 250));
          await new Promise(resolve => setTimeout(resolve, duration));

          // Set this step to its final status (done)
          setTraceSteps(prev => prev.map(s => s.step === stepName ? { 
            ...s, 
            status: targetSteps[i].status, 
            duration_ms: targetSteps[i].duration_ms,
            message: targetSteps[i].message
          } : s));
        }

        // Add overall complete logs
        const overallLogs = targetLogs.filter(log => {
          const matchedStep = getStepForLog(log);
          return !targetSteps.some(s => s.step === matchedStep);
        });
        if (overallLogs.length > 0) {
          setLogs(prev => [...prev, ...overallLogs]);
        }

        setAllCandidates(profiles);
        setActiveCandidateIndex(0);

        const firstProfile = profiles[0] || null;
        setCandidate(firstProfile);
        setOriginalCandidate(firstProfile ? JSON.parse(JSON.stringify(firstProfile)) : null);
        setProjectedOutput(responseData.output);
        setWarnings(targetWarnings);
        
        // Auto navigate to output view on small viewports
        if (width < 768) {
          setMobileTab('output');
        }
      } else {
        // Validation/Schema config error from pipeline
        const targetSteps = responseData.trace?.steps || INITIAL_STEPS.map(s => ({ ...s, status: 'error' }));
        const targetLogs = responseData.trace?.logs || [responseData.error];
        const targetWarnings = responseData.trace?.warnings || [responseData.error];

        setLogs([]);

        // Playback up to error
        for (let i = 0; i < targetSteps.length; i++) {
          const stepName = targetSteps[i].step;
          
          // Set running
          setTraceSteps(prev => prev.map(s => s.step === stepName ? { ...s, status: 'running' } : s));
          
          const stepLogs = targetLogs.filter(log => getStepForLog(log) === stepName);
          if (stepLogs.length > 0) {
            setLogs(prev => [...prev, ...stepLogs]);
          }

          await new Promise(resolve => setTimeout(resolve, 250));

          // Set final status (done or error)
          setTraceSteps(prev => prev.map(s => s.step === stepName ? { 
            ...s, 
            status: targetSteps[i].status, 
            duration_ms: targetSteps[i].duration_ms,
            message: targetSteps[i].message
          } : s));

          if (targetSteps[i].status === 'error') {
            break;
          }
        }

        setWarnings(targetWarnings);
        
        if (width < 768) {
          setMobileTab('trace');
        }
      }
    } catch (e: any) {
      // Hard Connection / Server Crashed Error
      setTraceSteps(INITIAL_STEPS.map(s => ({ ...s, status: 'error', message: e.message })));
      setLogs([`Server Connection Error: ${e.message}`, "Please verify the dev server is active and port is accessible."]);
      setWarnings([`Failed to execute pipeline: ${e.message}`]);
      
      if (width < 768) {
        setMobileTab('trace');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Download Final Candidate Profile ---
  const handleDownloadProfile = (type: 'canonical' | 'projected') => {
    const data = type === 'canonical' ? candidate : projectedOutput;
    if (!data) return;

    const name = candidate?.full_name?.replace(/\s+/g, '_') || "candidate";
    const filename = `${name}_profile.json`;
    const jsonStr = JSON.stringify(data, null, 2);
    
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- Download Full Pipeline Trace Metrics ---
  const handleDownloadTrace = () => {
    if (!candidate) return;

    const name = candidate.full_name?.replace(/\s+/g, '_') || "candidate";
    const filename = `${name}_trace.json`;

    const traceData = {
      timestamp: new Date().toISOString(),
      candidate_id: candidate.candidate_id,
      overall_confidence: candidate.overall_confidence,
      steps: traceSteps,
      warnings,
      logs
    };

    const jsonStr = JSON.stringify(traceData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSaveConfig = (newConfig: RuntimeConfig) => {
    setConfig(newConfig);
    setLogs(prev => [...prev, "Custom runtime projection configuration schema updated successfully."]);
  };

  const handleCandidateChange = (updatedCandidate: CanonicalCandidate) => {
    setCandidate(updatedCandidate);
    try {
      const updatedProjected = projectCandidate(updatedCandidate, config);
      setProjectedOutput(updatedProjected);
    } catch (e: any) {
      console.warn("Projection failed after override:", e);
    }
  };

  // --- Export Workflow Session Snapshot ---
  const handleExportWorkflow = () => {
    const sessionSnapshot = {
      version: "2.0",
      timestamp: new Date().toISOString(),
      inputs,
      config,
      trace: {
        steps: traceSteps,
        logs,
        warnings
      }
    };

    const jsonStr = JSON.stringify(sessionSnapshot, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `candidateforge_workflow_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setLogs(prev => [...prev, "Workflow snapshot exported successfully as session file."]);
  };

  // Global Keyboard Shortcuts
  useKeyboardShortcuts({
    onRunPipeline: handleRunPipeline,
    onSaveConfig: () => {
      setConfigOpen(true);
      setLogs(prev => [...prev, "Config editor opened via shortcut (Cmd/Ctrl+S). Press Cmd/Ctrl+S again to Save."]);
    },
    onLoadSample: handleLoadSample
  });

  // Viewport Responsive Decision Gates
  const isDesktop = width >= 1200;
  const isTablet = width >= 768 && width < 1200;
  const isMobile = width < 768;

  if (showLandingPage) {
    return <LandingPage onEnterWorkspace={() => setShowLandingPage(false)} />;
  }

  if (mode === 'company') {
    return (
      <div className="flex flex-col h-screen bg-[#0B1120] text-slate-100 font-sans antialiased overflow-hidden">
        <Header
          onOpenConfig={() => setConfigOpen(true)}
          onExportWorkflow={() => {}}
          modelStatus={modelStatus}
          mode={mode}
          onModeChange={setMode}
          companyName="TechCorp Inc."
        />
        <CompanyHiringMode onExportReport={() => {}} />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0B1120] text-slate-100 font-sans antialiased overflow-hidden">
      
      {/* Header bar */}
      <Header
        onOpenConfig={() => setConfigOpen(true)}
        onExportWorkflow={handleExportWorkflow}
        modelStatus={modelStatus}
        mode={mode}
        onModeChange={setMode}
      />

      {/* Main Workspace Frame */}
      <main className="flex-1 overflow-y-auto relative p-4 sm:p-6">
        
        {/* Company Talent Dashboard (When multiple candidates are loaded) */}
        {allCandidates.length > 0 && (
          <div className="max-w-7xl mx-auto mb-4 animate-in fade-in duration-300">
            <CompanyCandidateDashboard 
              candidates={allCandidates}
              activeCandidateIndex={activeCandidateIndex}
              onSelectCandidate={handleSelectCandidate}
            />
          </div>
        )}
        
        {/* DESKTOP VIEW: 3-PANEL SIDE-BY-SIDE */}
        {isDesktop && (
          <div className="grid grid-cols-3 gap-6 h-[calc(100vh-140px)] max-w-7xl mx-auto">
            <SourceInputsPanel
              inputs={inputs}
              setInputs={setInputs}
              onLoadSample={handleLoadSample}
              onClear={handleClearSources}
              onRunPipeline={handleRunPipeline}
              isProcessing={isProcessing}
            />
            <PipelineTracePanel
              steps={traceSteps}
              logs={logs}
              warnings={warnings}
              isProcessing={isProcessing}
            />
            <OutputViewerPanel
              candidate={candidate}
              originalCandidate={originalCandidate}
              projectedOutput={projectedOutput}
              isProcessing={isProcessing}
              onDownloadProfile={handleDownloadProfile}
              onDownloadTrace={handleDownloadTrace}
              onCandidateChange={handleCandidateChange}
            />
          </div>
        )}

        {/* TABLET VIEW: 2-COLUMN LAYOUT WITH DRAWER FOR LEFT PANEL */}
        {isTablet && (
          <div className="flex flex-col h-[calc(100vh-130px)] space-y-4 max-w-5xl mx-auto">
            {/* Toggle Drawer bar */}
            <div className="flex items-center justify-between bg-[#1E293B]/60 border border-slate-800 rounded-lg p-3">
              <span className="text-xs text-slate-400 font-mono">
                TABLET HYBRID VIEWPORT ACTIVE
              </span>
              <button
                id="btn-toggle-drawer"
                onClick={() => setIsDrawerOpen(true)}
                className="flex items-center gap-2 px-3.5 py-2 bg-[#4F46E5] text-white hover:bg-[#4F46E5]/80 rounded-lg text-xs font-semibold tracking-wide transition-all shadow-md shadow-indigo-500/15"
              >
                <Menu size={14} /> Open Ingestion Drawer
              </button>
            </div>

            <div className="grid grid-cols-2 gap-5 flex-1 overflow-hidden">
              <PipelineTracePanel
                steps={traceSteps}
                logs={logs}
                warnings={warnings}
                isProcessing={isProcessing}
              />
              <OutputViewerPanel
                candidate={candidate}
                originalCandidate={originalCandidate}
                projectedOutput={projectedOutput}
                isProcessing={isProcessing}
                onDownloadProfile={handleDownloadProfile}
                onDownloadTrace={handleDownloadTrace}
                onCandidateChange={handleCandidateChange}
              />
            </div>

            {/* Ingestion Drawer backdrop/drawer */}
            {isDrawerOpen && (
              <div className="fixed inset-0 z-40 flex justify-start bg-black/60 backdrop-blur-xs">
                <div className="w-[360px] h-full bg-[#0B1120] border-r border-slate-800 shadow-2xl p-4 flex flex-col relative animate-in slide-in-from-left duration-250">
                  <button
                    id="btn-close-drawer"
                    onClick={() => setIsDrawerOpen(false)}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors z-50"
                  >
                    <X size={18} />
                  </button>
                  <div className="flex-1 mt-6 overflow-hidden">
                    <SourceInputsPanel
                      inputs={inputs}
                      setInputs={setInputs}
                      onLoadSample={handleLoadSample}
                      onClear={handleClearSources}
                      onRunPipeline={() => {
                        handleRunPipeline();
                        setIsDrawerOpen(false); // Auto close drawer on run
                      }}
                      isProcessing={isProcessing}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MOBILE VIEW: SINGLE COLUMN TABBED WORKSPACE */}
        {isMobile && (
          <div className="flex flex-col h-[calc(100vh-180px)] space-y-3">
            
            {/* Tab contents */}
            <div className="flex-1 overflow-hidden">
              {mobileTab === 'sources' && (
                <SourceInputsPanel
                  inputs={inputs}
                  setInputs={setInputs}
                  onLoadSample={handleLoadSample}
                  onClear={handleClearSources}
                  onRunPipeline={handleRunPipeline}
                  isProcessing={isProcessing}
                />
              )}
              {mobileTab === 'trace' && (
                <PipelineTracePanel
                  steps={traceSteps}
                  logs={logs}
                  warnings={warnings}
                  isProcessing={isProcessing}
                />
              )}
              {mobileTab === 'output' && (
                <OutputViewerPanel
                  candidate={candidate}
                  originalCandidate={originalCandidate}
                  projectedOutput={projectedOutput}
                  isProcessing={isProcessing}
                  onDownloadProfile={handleDownloadProfile}
                  onDownloadTrace={handleDownloadTrace}
                  onCandidateChange={handleCandidateChange}
                />
              )}
            </div>

            {/* Bottom Tab Select buttons */}
            <div className="flex bg-[#0F172A] border border-slate-800 p-1.5 rounded-xl shadow-lg">
              <button
                id="btn-mobile-tab-sources"
                onClick={() => setMobileTab('sources')}
                className={`flex-1 flex flex-col items-center justify-center py-2 text-[10px] font-bold tracking-wider uppercase rounded-lg transition-all ${
                  mobileTab === 'sources'
                    ? 'bg-[#4F46E5] text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet size={14} className="mb-1" />
                Sources
              </button>
              <button
                id="btn-mobile-tab-trace"
                onClick={() => setMobileTab('trace')}
                className={`flex-1 flex flex-col items-center justify-center py-2 text-[10px] font-bold tracking-wider uppercase rounded-lg transition-all ${
                  mobileTab === 'trace'
                    ? 'bg-[#4F46E5] text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles size={14} className="mb-1" />
                Trace
              </button>
              <button
                id="btn-mobile-tab-output"
                onClick={() => setMobileTab('output')}
                className={`flex-1 flex flex-col items-center justify-center py-2 text-[10px] font-bold tracking-wider uppercase rounded-lg transition-all ${
                  mobileTab === 'output'
                    ? 'bg-[#4F46E5] text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Cpu size={14} className="mb-1" />
                Output
              </button>
            </div>

          </div>
        )}

      </main>

      {/* Schema Config Modal */}
      <ConfigModal
        isOpen={configOpen}
        onClose={() => setConfigOpen(false)}
        config={config}
        onSave={handleSaveConfig}
      />
    </div>
  );
}
