import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Calendar } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';

interface SearchedJob {
  id: string;
  job_ref: string;
  container_no: string | null;
  status: string;
  client_name: string | null;
}

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchedJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const navigate = useNavigate();
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Debounce search query
  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const handler = setTimeout(async () => {
      try {
        const res = await apiClient.get(`/api/jobs?search=${encodeURIComponent(query)}&limit=5`);
        if (res.data && res.data.success) {
          // The backend structure contains: { success: true, data: { jobs: [...], meta: [...] } }
          const jobsList = res.data.data?.jobs || [];
          setResults(jobsList);
        }
      } catch (err) {
        console.error('Failed to resolve global search query:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [query]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation logic
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsOpen(true);
      setActiveIndex((prevIndex) => (prevIndex + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsOpen(true);
      setActiveIndex((prevIndex) => (prevIndex - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < results.length) {
        handleSelectJob(results[activeIndex].id);
      } else if (results.length > 0) {
        handleSelectJob(results[0].id);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const handleSelectJob = (id: string) => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
    setActiveIndex(-1);
    navigate(`/jobs/${id}`);
  };

  const getStatusBadgeClasses = (status: string) => {
    const raw = String(status).toLowerCase();
    switch (raw) {
      case 'cancelled':
        return 'bg-danger-50 text-danger-500 border border-danger-500/10';
      case 'delivered':
        return 'bg-success-50 text-success-600 border border-success-600/10';
      case 'in_transit':
        return 'bg-primary-50 text-primary-700 border border-primary-500/10';
      case 'customs_assessment':
      case 'awaiting_assessment':
        return 'bg-accent-50 text-accent-700 border border-accent-500/10';
      default:
        return 'bg-slate-50 text-slate-600 border border-slate-200';
    }
  };

  return (
    <div className="relative w-full max-w-md" ref={searchContainerRef} id="header-global-search-container">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
          {loading ? <Loader2 size={16} className="animate-spin text-primary-500" /> : <Search size={16} />}
        </div>
        <input
          type="text"
          placeholder="Search jobs ref, container numbers..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          id="header-global-search"
          className="w-full pl-9 pr-4 py-1.5 bg-slate-100 hover:bg-slate-100/80 focus:bg-white text-sm border-0 rounded-lg focus:ring-1 focus:ring-primary-500 focus:outline-none transition-all placeholder:text-slate-400 text-slate-900"
          autoComplete="off"
        />
      </div>

      {isOpen && query.trim().length > 0 && (
        <div 
          className="absolute left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden" 
          id="global-search-results-overlay"
        >
          {loading && results.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5 font-medium uppercase tracking-wider">
              <Loader2 size={14} className="animate-spin" />
              <span>Scanning clearance registry...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">
              No matching clearance references found.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {results.map((job, idx) => (
                <div
                  key={job.id}
                  onClick={() => handleSelectJob(job.id)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`p-3 transition-colors cursor-pointer text-left flex flex-col gap-1 ${
                    idx === activeIndex ? 'bg-slate-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{job.job_ref}</span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${getStatusBadgeClasses(job.status)}`}>
                      {job.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-500 font-mono truncate max-w-[150px]">
                      Cont: {job.container_no || 'TBA'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-sans truncate max-w-[180px]">
                      {job.client_name || 'Individual Importer'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
