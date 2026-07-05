import React from 'react';
import { Plus, X, Trash2 } from 'lucide-react';
import { JobPost, EducationLevel } from '../pipeline/types';
import { generateId } from '../utils/companyModeUtils';

interface CompanyOnboardingPanelProps {
  companyName: string;
  onCompanyNameChange: (name: string) => void;
  jobPosts: JobPost[];
  onJobPostsChange: (jobs: JobPost[]) => void;
}

export default function CompanyOnboardingPanel({
  companyName,
  onCompanyNameChange,
  jobPosts,
  onJobPostsChange
}: CompanyOnboardingPanelProps) {

  const addJobPost = () => {
    if (jobPosts.length >= 10) {
      alert('Maximum 10 job posts allowed per session');
      return;
    }
    const newJob: JobPost = {
      id: generateId(),
      title: '',
      department: 'Engineering',
      requiredSkills: [],
      minExperience: 0,
      educationRequirement: EducationLevel.ANY
    };
    onJobPostsChange([...jobPosts, newJob]);
  };

  const updateJobPost = (id: string, updates: Partial<JobPost>) => {
    onJobPostsChange(
      jobPosts.map(job => job.id === id ? { ...job, ...updates } : job)
    );
  };

  const deleteJobPost = (id: string) => {
    onJobPostsChange(jobPosts.filter(job => job.id !== id));
  };

  return (
    <div className="h-full flex flex-col bg-[#0F172A] border-r border-slate-800">
      <div className="p-4 border-b border-slate-800">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          Company Setup
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => onCompanyNameChange(e.target.value)}
              placeholder="Enter company name"
              className="w-full px-3 py-2 bg-[#1E293B] border border-slate-700 rounded-md text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300">Job Posts ({jobPosts.length}/10)</h3>
            <button
              onClick={addJobPost}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-bold transition-colors"
            >
              <Plus size={12} /> Add Job
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {jobPosts.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm">
            No job posts added yet. Click "Add Job" to get started.
          </div>
        )}
        {jobPosts.map((job) => (
          <div key={job.id} className="p-3 bg-[#1E293B] border border-slate-700 rounded-md">
            <div className="flex items-start justify-between mb-2">
              <input
                type="text"
                value={job.title}
                onChange={(e) => updateJobPost(job.id, { title: e.target.value })}
                placeholder="Job Title (e.g. Senior Backend Engineer)"
                className="flex-1 px-2 py-1.5 bg-transparent border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 mr-2"
              />
              <button
                onClick={() => deleteJobPost(job.id)}
                className="p-1 text-slate-500 hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-0.5 block">
                  Department
                </label>
                <input
                  type="text"
                  value={job.department}
                  onChange={(e) => updateJobPost(job.id, { department: e.target.value })}
                  placeholder="Department"
                  className="w-full px-2 py-1.5 bg-transparent border border-slate-700 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-0.5 block">
                  Min Experience (years)
                </label>
                <input
                  type="number"
                  min="0"
                  value={job.minExperience}
                  onChange={(e) => updateJobPost(job.id, { minExperience: parseInt(e.target.value) || 0 })}
                  className="w-full px-2 py-1.5 bg-transparent border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="mb-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-0.5 block">
                Education Requirement
              </label>
              <select
                value={job.educationRequirement}
                onChange={(e) => updateJobPost(job.id, { educationRequirement: e.target.value as EducationLevel })}
                className="w-full px-2 py-1.5 bg-transparent border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {Object.values(EducationLevel).map(level => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-0.5 block">
                Required Skills (comma separated)
              </label>
              <input
                type="text"
                value={job.requiredSkills.join(', ')}
                onChange={(e) => updateJobPost(job.id, {
                  requiredSkills: e.target.value.split(/[,]/).map(s => s.trim()).filter(Boolean)
                })}
                placeholder="Java, Spring Boot, AWS"
                className="w-full px-2 py-1.5 bg-transparent border border-slate-700 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
