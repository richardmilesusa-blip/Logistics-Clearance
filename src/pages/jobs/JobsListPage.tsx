import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { useAuthStore } from '../../store/authStore';
import StatusBadge from '../../components/jobs/StatusBadge';
import { 
  Search, 
  Plus, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  PlusCircle, 
  Eye, 
  Edit,
  SlidersHorizontal,
  FileSpreadsheet,
  AlertTriangle
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
  client_id: string;
  client_name?: string;
  client?: { name: string };
  assigned_broker?: { full_name: string };
  assigned_broker_id?: string;
  grand_total_ngn?: string;
  total_duty_ngn?: string;
}

export default function JobsListPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Sync filters querying: hit GET /api/jobs
  const fetchJobsParams = {
    search: searchTerm || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  // React Query Fetch Hook
  const { data, isLoading, isError, error, refetch } = useQuery<Job[]>({
    queryKey: ['jobsList', fetchJobsParams],
    queryFn: async () => {
      // Build query string matching endpoint rules
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);

      const resp = await apiClient.get(`/api/jobs?${params.toString()}`);
      if (resp.data && resp.data.success) {
        return resp.data.data.map((item: any) => ({
          ...item,
          client_name: item.client_name || item.client?.name || 'Local Importer',
          broker_name: item.assigned_broker?.full_name || 'Unassigned'
        }));
      }
      return [];
    },
    staleTime: 30000, // 30 seconds stale time instruction
  });

  // Client side or assisted pagination calculations
  const jobsList = data || [];
  const totalRecords = jobsList.length;
  const totalPages = Math.ceil(totalRecords / pageSize) || 1;
  const currentJobs = jobsList.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <div className="space-y-6" id="jobs-list-workspace">
      {/* Upper action header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight font-sans">ClearPath Cargo Registry</h2>
          <p className="text-xs text-slate-400 font-medium">Verify customs records, Form M approvals, and active logistics schedules</p>
        </div>
        {user?.role !== 'client' && (
          <Link
            to="/jobs/new"
            id="btn-jobslist-new"
            className="px-4 py-2 bg-primary-700 hover:bg-primary-900 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-1.5"
          >
            <Plus size={15} />
            <span>Open Clearance File</span>
          </Link>
        )}
      </div>

      {/* FILTER BAR CONTAINER */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
          <SlidersHorizontal size={15} className="text-primary-600" />
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Multi-Criteria Search & Filters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Keyword Search Input */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
              <Search size={15} />
            </span>
            <input
              type="text"
              placeholder="Search Container, BL, Ref..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 hover:bg-slate-100/40 text-xs border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 transition-all text-slate-900/90 placeholder:text-slate-400 font-medium"
            />
          </div>

          {/* Workflow Status Dropdown */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/40 text-xs border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 text-slate-700 font-bold cursor-pointer"
            >
              <option value="all">Display All Lifecycle States</option>
              <option value="paar_processing">PAAR Processing</option>
              <option value="customs_assessment">Customs Duty Assessment</option>
              <option value="examination_demurrage">Examination & Demurrage</option>
              <option value="tdo_release">Terminal Release (TDO)</option>
              <option value="in_transit">In Transit (Dispatch)</option>
              <option value="delivered">Delivered to warehouse</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Date from selector */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
              <Calendar size={14} />
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none text-slate-800"
              title="Arrival start date"
            />
          </div>

          {/* Date to selector */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
              <Calendar size={14} />
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none text-slate-800"
              title="Arrival end date"
            />
          </div>
        </div>
      </div>

      {/* ERROR DISPLAY */}
      {isError && (
        <div className="p-3.5 bg-danger-50 border border-danger-200 text-danger-600 rounded-xl flex items-center gap-2 text-xs font-semibold leading-relaxed">
          <AlertTriangle size={16} />
          <span>Error pulling from registry: {error?.message || 'Access rejected.'}</span>
        </div>
      )}

      {/* DATA GRID TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-500">
            <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">Job File reference</th>
                <th className="px-5 py-3.5">Cargo container ID</th>
                <th className="px-5 py-3.5">Importer / Client</th>
                <th className="px-5 py-3.5">Workflow state</th>
                <th className="px-5 py-3.5">Aggregate invoice (₦)</th>
                <th className="px-5 py-3.5">Receipt Date</th>
                <th className="px-5 py-3.5">Assigned broker</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {/* SKELETON LOADER STATE */}
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded w-24" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded w-16" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded w-32" /></td>
                    <td className="px-5 py-4"><div className="h-5 bg-slate-150 rounded-full w-20" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded w-16" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-slate-100 rounded w-24" /></td>
                    <td className="px-5 py-4 text-right"><div className="h-6 bg-slate-100 rounded w-12 ml-auto" /></td>
                  </tr>
                ))
              ) : currentJobs.length === 0 ? (
                /* EMPTY RECRUITMENT STATE */
                <tr id="empty-shipment-tr">
                  <td colSpan={8} className="px-5 py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-3 max-w-sm mx-auto">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-350">
                        <FileSpreadsheet size={24} className="text-slate-300" />
                      </div>
                      <div className="space-y-1">
                        <span className="text-sm font-bold text-slate-800 block">No jobs found. Create your first shipment.</span>
                        <p className="text-[11px] text-slate-400 leading-normal">
                          There are no freight forwarding records registered inside this directory. Click below to initiate PAAR, form M, and customs assessments.
                        </p>
                      </div>
                      {user?.role !== 'client' && (
                        <button
                          onClick={() => navigate('/jobs/new')}
                          className="px-4 py-2 bg-primary-700 hover:bg-primary-900 text-white font-black text-xs rounded-xl shadow cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                        >
                          <PlusCircle size={15} />
                          <span>Instantiate Shipment</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                /* REGULAR JOBS LIST */
                currentJobs.map((job) => {
                  const hasInvoiceSum = job.grand_total_ngn ? parseFloat(job.grand_total_ngn) : 0;
                  const formattedTotal = hasInvoiceSum.toLocaleString('en-NG', { minimumFractionDigits: 2 });

                  return (
                    <tr key={job.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <span className="font-extrabold text-slate-900 block">{job.job_ref}</span>
                        <span className="text-[10px] text-slate-400 font-mono block mt-0.5">B/L: {job.bl_number || 'TBA'}</span>
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-[11px] text-slate-800">
                        {job.container_no || 'TBA'}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-bold text-slate-900">{job.client_name}</span>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-slate-950">
                        ₦{formattedTotal}
                      </td>
                      <td className="px-5 py-4 text-slate-500 font-semibold">
                        {job.date_received ? new Date(job.date_received).toLocaleDateString() : 'TBA'}
                      </td>
                      <td className="px-5 py-4 text-slate-600 font-extrabold text-xs">
                        {job.assigned_broker?.full_name || job.assigned_broker_id || 'Unassigned'}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex gap-1">
                          <Link
                            to={`/jobs/${job.id}`}
                            className="p-1.5 bg-slate-100 hover:bg-primary-50 text-slate-600 hover:text-primary-800 rounded-lg transition-colors"
                            title="Open detailed workspace"
                          >
                            <Eye size={13} />
                          </Link>
                          <Link
                            to={`/jobs/${job.id}`} // View details also includes edit assessment tab
                            className="p-1.5 bg-slate-a00 bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-800 rounded-lg transition-colors"
                            title="Update custom variables"
                          >
                            <Edit size={13} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION PANEL */}
        {jobsList.length > 0 && (
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold text-slate-500 uppercase tracking-wider select-none">
            {/* Page Limit selector */}
            <div className="flex items-center gap-2">
              <span>Show entries:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs cursor-pointer focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            {/* Current status display */}
            <div>
              <span>Records {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalRecords)} of {totalRecords} entries</span>
            </div>

            {/* Controls numbers */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>

              {Array.from({ length: totalPages }).map((_, idx) => {
                const pageNum = idx + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`px-3 py-1 rounded-lg border text-xs font-black transition-all ${
                      currentPage === pageNum
                        ? 'bg-primary-700 text-white border-primary-700 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
