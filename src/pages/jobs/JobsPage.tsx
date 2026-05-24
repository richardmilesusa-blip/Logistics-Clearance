import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiClient } from '../../lib/apiClient';
import { useAuthStore } from '../../store/authStore';
import { 
  Briefcase, 
  Search, 
  SlidersHorizontal, 
  ArrowUpDown, 
  Anchor, 
  Plus, 
  UserPlus 
} from 'lucide-react';

interface Job {
  id: string;
  job_ref: string;
  bl_number: string;
  container_no: string;
  status: string;
  port_of_loading: string;
  port_of_discharge: string;
  date_received: string;
  client_name: string;
  broker_name?: string;
}

export default function JobsPage() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQ = searchParams.get('q') || '';

  const [jobs, setJobs] = useState<Job[]>([]);
  const [filterQuery, setFilterQuery] = useState(searchQ);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const fetchJobs = () => {
    setLoading(true);
    let path = '/api/jobs';
    const params = [];
    if (filterQuery) {
      params.push(`search=${encodeURIComponent(filterQuery)}`);
    }
    if (statusFilter !== 'all') {
      params.push(`status=${statusFilter}`);
    }
    if (params.length > 0) {
      path += `?${params.join('&')}`;
    }

    apiClient.get(path)
      .then((res) => {
        if (res.data && res.data.success) {
          // Flatten clients objects to client_name if nested, or read directly
          const records = res.data.data.map((j: any) => ({
            ...j,
            client_name: j.client_name || j.client?.name || 'Local Importer',
            broker_name: j.broker_name || j.assigned_broker?.full_name || 'Unassigned'
          }));
          setJobs(records);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to resolve jobs list:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchJobs();
  }, [statusFilter, searchQ]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams({ q: filterQuery });
  };

  // Humanized mapping for cargo progression states
  const getJobStatusStyle = (status: string) => {
    switch (status) {
      case 'paar_processing':
        return 'bg-blue-100 text-blue-700 border border-blue-500/10';
      case 'customs_assessment':
        return 'bg-indigo-100 text-indigo-700 border border-indigo-500/10';
      case 'examination_demurrage':
        return 'bg-accent-100 text-accent-500 border border-accent-500/10';
      case 'tdo_release':
        return 'bg-purple-100 text-purple-700 border border-purple-500/10';
      case 'in_transit':
        return 'bg-sky-100 text-sky-700 border border-sky-500/10';
      case 'delivered':
        return 'bg-success-100 text-success-500 border border-success-500/10';
      case 'cancelled':
        return 'bg-slate-100 text-slate-500 border border-slate-250';
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
  };

  return (
    <div className="space-y-6" id="jobs-control-panel">
      {/* Title Header with Action trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Active Cargo Shipments</h2>
          <p className="text-xs text-slate-400 font-medium">Clearance operations registry for Nigerian ports</p>
        </div>
        {user?.role !== 'client' && (
          <Link
            to="/jobs/new"
            id="btn-create-job"
            className="px-4 py-2 bg-primary-700 hover:bg-primary-900 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-2"
          >
            <Plus size={16} />
            <span>Open New Shipment Job</span>
          </Link>
        )}
      </div>

      {/* FILTER CONTROLS BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search size={16} />
          </div>
          <input
            type="text"
            placeholder="Search job file reference, original BL, container ID..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full pl-9 pr-24 py-2 bg-slate-50 hover:bg-slate-100/50 text-sm border-0 border-b border-transparent focus:border-b focus:border-primary-500 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 transition-all placeholder:text-slate-400 text-slate-900"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1.5 bottom-1.5 px-3 py-1 bg-primary-700 text-white hover:bg-primary-900 text-[10px] font-bold rounded-lg cursor-pointer"
          >
            Update Filter
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-slate-400" />
            <span className="text-xs font-bold text-slate-600">Status Filter:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 font-semibold px-3 py-1.5 rounded-xl text-xs focus:ring-1 focus:ring-primary-500 focus:outline-none text-slate-700 cursor-pointer"
          >
            <option value="all">Display All Lifecycle States</option>
            <option value="paar_processing">PAAR Processing</option>
            <option value="customs_assessment">Customs Assessment</option>
            <option value="examination_demurrage">Examination & Demurrage</option>
            <option value="tdo_release">TDO Release</option>
            <option value="in_transit">In Transit</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* PRIMARY REGISTER TABLE */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[30vh] gap-3">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-400 font-bold tracking-wider uppercase">Loading registry logs...</span>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-500">
              <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Job File reference</th>
                  <th className="px-5 py-3.5">Importer / Client</th>
                  <th className="px-5 py-3.5">Cargo containers details</th>
                  <th className="px-5 py-3.5">Ports of voyage</th>
                  <th className="px-5 py-3.5">Assigned broker</th>
                  <th className="px-5 py-3.5">Workflow state</th>
                  <th className="px-5 py-3.5 text-right">Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <Briefcase size={20} className="text-slate-300" />
                        <span>No active custom clearance jobs match criteria logs.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <span className="font-extrabold text-slate-900 block">{job.job_ref}</span>
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">BL: {job.bl_number || 'TBA'}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-bold text-slate-800">{job.client_name}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Recv: {new Date(job.date_received).toLocaleDateString()}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-[11px] font-semibold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">{job.container_no || 'TBA'}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1 text-slate-500">
                          <span className="text-[10.5px] truncate max-w-[80px]" title={job.port_of_loading}>{job.port_of_loading}</span>
                          <span className="text-[10px] text-slate-300">→</span>
                          <span className="text-[10.5px] font-bold text-slate-700 truncate max-w-[80px]" title={job.port_of_discharge}>{job.port_of_discharge}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs text-slate-600 font-bold">{job.broker_name}</span>
                      </td>
                      <td className="px-5 py-4 font-bold">
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-widest leading-none ${getJobStatusStyle(job.status)}`}>
                          {job.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          to={`/jobs/${job.id}`}
                          id={`btn-view-job-${job.job_ref.toLowerCase()}`}
                          className="px-3 py-1.5 bg-primary-700 hover:bg-primary-900 text-white font-bold text-[10px] rounded-lg shadow-sm transition-all inline-block cursor-pointer text-center"
                        >
                          Workspace
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
