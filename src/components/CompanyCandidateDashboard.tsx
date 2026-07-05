import React, { useState, useMemo } from 'react';
import { CanonicalCandidate } from '../pipeline/types';
import ConfidenceRing from './ConfidenceRing';
import { Users, Filter, Search, Briefcase, TrendingUp } from 'lucide-react';

interface CompanyCandidateDashboardProps {
  candidates: CanonicalCandidate[];
  activeCandidateIndex: number;
  onSelectCandidate: (index: number) => void;
}

export function CompanyCandidateDashboard({ candidates, activeCandidateIndex, onSelectCandidate }: CompanyCandidateDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');

  const roles = useMemo(() => {
    const roleSet = new Set(['all']);
    candidates.forEach(c => {
      if (c.headline) {
        const match = c.headline.match(/(Senior Staff Engineer|Senior Frontend Engineer|Backend Engineer|DevOps Engineer|Machine Learning Engineer|Product Manager|Full Stack Engineer|Software Engineer)/);
        if (match) roleSet.add(match[0]);
      }
    });
    return Array.from(roleSet);
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    return candidates.filter(c => {
      const matchesSearch = !searchQuery || 
        c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (c.headline && c.headline.toLowerCase().includes(searchQuery.toLowerCase())) || 
        c.skills.some(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesRole = selectedRole === 'all' || 
        (c.headline && c.headline.includes(selectedRole));

      return matchesSearch && matchesRole;
    });
  }, [candidates, searchQuery, selectedRole]);

  const scoredCandidates = useMemo(() => {
    return filteredCandidates.map(c => {
      let score = c.overall_confidence * 100;
      if (selectedRole !== 'all' && c.headline && c.headline.includes(selectedRole)) {
        score += 20;
      }
      score += c.skills.length * 2;
      return {
        ...c,
        roleMatchScore: Math.min(100, score)
      };
    }).sort((a, b) => b.roleMatchScore - a.roleMatchScore);
  }, [filteredCandidates, selectedRole]);

  if (candidates.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-7xl mx-auto bg-[#0F172A] border border-slate-800 rounded-xl p-4 animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-cyan-400" />
          <h2 className="text-lg font-bold text-white">Company Talent Dashboard</h2>
          <span className="text-xs px-2 py-1 rounded-full bg-indigo-600/20 text-indigo-300 border border-indigo-500/30">
            {scoredCandidates.length} Candidates
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text"
              placeholder="Search by name, role, or skill..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-3 py-2 bg-[#1E293B] border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Briefcase size={14} className="text-slate-400" />
            <select 
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="px-3 py-2 bg-[#1E293B] border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {roles.map(role => (
                <option key={role} value={role}>{role === 'all' ? 'All Roles' : role}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {scoredCandidates.map((candidate, index) => {
          const originalIndex = candidates.findIndex(c => c.candidate_id === candidate.candidate_id);
          return (
            <div 
              key={candidate.candidate_id}
              onClick={() => onSelectCandidate(originalIndex)}
              className={`
                group relative p-4 rounded-xl border transition-all duration-200 cursor-pointer
                ${activeCandidateIndex === originalIndex 
                  ? 'bg-gradient-to-br from-indigo-600/20 to-cyan-600/20 border-indigo-500 shadow-lg shadow-indigo-500/20' 
                  : 'bg-[#1E293B]/50 border-slate-800 hover:border-slate-600 hover:bg-[#1E293B]'
                }
              `}
            >
              <div className="absolute top-3 right-3">
                <div className="w-10 h-10 rounded-full border-4 flex items-center justify-center" style={{
                  borderColor: candidate.roleMatchScore >= 80 ? '#06b6d4' : candidate.roleMatchScore >= 60 ? '#6366f1' : '#f59e0b',
                  background: `conic-gradient(${candidate.roleMatchScore >= 80 ? '#06b6d4' : candidate.roleMatchScore >= 60 ? '#6366f1' : '#f59e0b'} ${candidate.roleMatchScore * 3.6}deg, #1E293B ${candidate.roleMatchScore * 3.6}deg)`
                }}>
                  <span className="text-xs font-bold text-white" style={{textShadow: '0 0 2px rgba(0,0,0,0.6)'}}>
                    {Math.round(candidate.roleMatchScore)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg">
                  {candidate.full_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{candidate.full_name}</h3>
                  <p className="text-xs text-slate-400 truncate">{candidate.headline || 'Software Engineer'}</p>
                </div>
              </div>

              <div className="mb-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
                  <TrendingUp size={12} />
                  <span>Role Match</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      candidate.roleMatchScore >= 80 ? 'bg-cyan-500' : 
                      candidate.roleMatchScore >= 60 ? 'bg-indigo-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${candidate.roleMatchScore}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-2">
                {candidate.skills.slice(0, 4).map((skill, idx) => (
                  <span 
                    key={idx}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                  >
                    {skill.name}
                  </span>
                ))}
                {candidate.skills.length > 4 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    +{candidate.skills.length - 4} more
                  </span>
                )}
              </div>

              <div className="text-[10px] text-slate-500 flex items-center gap-2">
                {candidate.emails[0] && (
                  <span className="truncate">📧 {candidate.emails[0]}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
