import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../../lib/apiClient';
import { useAuthStore } from '../../store/authStore';
import { 
  TrendingUp, 
  CheckCircle, 
  AlertTriangle, 
  Briefcase, 
  Bell, 
  Check, 
  ArrowRight, 
  DollarSign,
  Clock,
  ArrowUpRight,
  Sparkles
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';

interface DashboardData {
  total_outstanding_ngn: number;
  total_collected_this_month_ngn: number;
  overdue_count: number;
  jobs_by_status: Record<string, number>;
  active_jobs_with_duty: {
    job_id: string;
    job_ref: string;
    container_no: string;
    status: string;
    total_duty_ngn: string;
    duty_payment_status: string;
    days_since_assessment: number;
    client_name: string;
  }[];
}

interface NotificationItem {
  id: string;
  job_id: string | null;
  recipient_id: string;
  channel: string;
  type: string;
  message: string;
  is_read: boolean;
  sent_at: string | null;
  created_at: string;
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  
  const [data, setData] = useState<DashboardData | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifLoading, setNotifLoading] = useState(true);

  // Fetch dashboard metrics and notifications
  const fetchDashboardData = async () => {
    try {
      const res = await apiClient.get('/api/reports/dashboard');
      if (res.data && res.data.success) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to pull dashboard KPIs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await apiClient.get('/api/notifications');
      if (res.data && res.data.success) {
        setNotifications(res.data.data);
      }
    } catch (err) {
      console.error('Failed to pull dashboard notifications:', err);
    } finally {
      setNotifLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    fetchNotifications();
  }, []);

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiClient.put(`/api/notifications/${id}/read`);
      // Update local notifications state
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      // Refresh KPIs because notification state changes could affect counts
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient.put('/api/notifications/read-all');
      setNotifications([]);
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-slate-400 font-bold tracking-widest uppercase">Compiling Clearance Analytics...</span>
      </div>
    );
  }

  // Safe Fallback if API lacks data
  const kpis = data || {
    total_outstanding_ngn: 0,
    total_collected_this_month_ngn: 0,
    overdue_count: 0,
    jobs_by_status: {},
    active_jobs_with_duty: []
  };

  // Convert status matrix to list for Recharts
  const chartData = Object.entries(kpis.jobs_by_status).map(([status, count]) => ({
    statusKey: status,
    status: status.toUpperCase().replace(/_/g, ' '),
    count
  }));

  // Map of status values to matching Badge/Bar colours
  const COLOR_MAP: Record<string, string> = {
    cancelled: '#ef4444',            // Red
    delivered: '#10b981',            // Green
    in_transit: '#3b82f6',           // Blue
    customs_assessment: '#f59e0b',   // Orange
    awaiting_assessment: '#cb5c0d',  // Deep Amber
    customs_released: '#14b8a6',     // Teal
    examination_discrepancy: '#a855f7', // Purple
  };

  const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#06b6d4', '#6366f1', '#a855f7', '#ec4899'];

  // Total active jobs calculated as sum of non-completed, non-cancelled states
  const activeJobsCount = Object.entries(kpis.jobs_by_status)
    .filter(([status]) => status !== 'delivered' && status !== 'cancelled')
    .reduce<number>((sum, [, count]) => sum + (count as number), 0);

  // Group notifications by type
  const groupedNotifications: Record<string, NotificationItem[]> = {};
  notifications.forEach((note) => {
    const typeLabel = note.type.replace(/_/g, ' ').toUpperCase();
    if (!groupedNotifications[typeLabel]) {
      groupedNotifications[typeLabel] = [];
    }
    groupedNotifications[typeLabel].push(note);
  });

  const getRelativeTime = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  // Sort assessments by days_since_assessment descending
  const sortedDutyAssessments = [...kpis.active_jobs_with_duty].sort(
    (a, b) => b.days_since_assessment - a.days_since_assessment
  );

  return (
    <div className="space-y-6" id="dashboard-view-panel">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-primary-950 to-indigo-950 p-6 md:p-8 rounded-2xl text-white shadow relative">
        <div className="absolute top-4 right-4 text-primary-500/20">
          <Sparkles size={64} className="animate-pulse" />
        </div>
        <div className="relative z-10 max-w-2xl space-y-2">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">ClearPath Nigerian Ports Compliance Console</h2>
          <p className="text-xs md:text-sm text-slate-350 text-slate-300 font-medium leading-relaxed">
            Monitor real-time custom duty calculations, single-window compliance trackers, CISS/ETLS levy totals, and last-mile dispatch schedules.
          </p>
        </div>
      </div>

      {/* 4 Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="dashboard-kpi-shelf">
        {/* KPI 1: Outstanding Duty */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Outstanding Duty</span>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-extrabold ${kpis.total_outstanding_ngn > 0 ? 'text-danger-600' : 'text-slate-900'}`}>
                ₦{kpis.total_outstanding_ngn.toLocaleString('en-NG', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner shrink-0 ${
            kpis.total_outstanding_ngn > 0 ? 'bg-danger-50 text-danger-500' : 'bg-slate-50 text-slate-400'
          }`}>
            <TrendingUp size={20} />
          </div>
        </div>

        {/* KPI 2: Total Collected */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Collected This Month</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-success-650 text-success-600">
                ₦{kpis.total_collected_this_month_ngn.toLocaleString('en-NG', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-success-50 text-success-500 flex items-center justify-center shadow-inner shrink-0">
            <CheckCircle size={20} />
          </div>
        </div>

        {/* KPI 3: Overdue Assessments */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Overdue Assessments</span>
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold text-slate-900">{kpis.overdue_count}</span>
              {kpis.overdue_count > 0 && (
                <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-danger-100 text-danger-600 rounded-md animate-bounce">
                  URGENT
                </span>
              )}
            </div>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner shrink-0 ${
            kpis.overdue_count > 0 ? 'bg-danger-50 text-danger-500' : 'bg-slate-50 text-slate-400'
          }`}>
            <AlertTriangle size={20} />
          </div>
        </div>

        {/* KPI 4: Active Jobs Count */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Overall Active Jobs</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-slate-900">
                {activeJobsCount} Active
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-500 flex items-center justify-center shadow-inner shrink-0">
            <Briefcase size={20} />
          </div>
        </div>
      </div>

      {/* Two Columns Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="dashboard-graphics-row">
        {/* Left Column (60%): Bar Chart of Jobs by Status */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm lg:col-span-2 space-y-4">
          <div className="space-y-1">
            <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">Clearance Lifecycle Volume</h3>
            <p className="text-[10px] text-slate-400 font-medium">Shipments work distribution counts in clearing stages</p>
          </div>
          <div className="h-64 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="status" 
                  tick={{ fill: '#64748b', fontSize: 9, fontWeight: 600 }} 
                  axisLine={false} 
                  tickLine={false} 
                />
                <YAxis 
                  allowDecimals={false}
                  tick={{ fill: '#64748b', fontSize: 10 }} 
                  axisLine={false} 
                  tickLine={false} 
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }} 
                  contentStyle={{ background: '#0D2B4E', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '11px' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => {
                    const color = COLOR_MAP[entry.statusKey] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
                    return <Cell key={`cell-${index}`} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Column (40%): Notification Feed grouped by type */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4 flex flex-col justify-between h-80 lg:h-auto min-h-[320px]">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Bell size={16} className="text-primary-500" />
                  <span>Notification Feed</span>
                </h3>
                <p className="text-[10px] text-slate-400 font-medium">Unread compliance alerts from custom authorities</p>
              </div>
              {notifications.length > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[10px] font-bold text-primary-500 hover:text-primary-700 cursor-pointer"
                >
                  Clear All
                </button>
              )}
            </div>

            <div className="overflow-y-auto space-y-3.5 pr-1 max-h-56 lg:max-h-[220px]">
              {notifLoading ? (
                <div className="py-8 text-center text-xs text-slate-400 uppercase font-medium">
                  Loading alerts...
                </div>
              ) : Object.keys(groupedNotifications).length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-1">
                  <Clock size={16} className="text-slate-300 mb-1" />
                  <span>Corporate workflow compliant. No unread logs.</span>
                </div>
              ) : (
                Object.entries(groupedNotifications).map(([typeLabel, notes]) => (
                  <div key={typeLabel} className="space-y-1.5">
                    <span className="text-[9px] font-extrabold text-slate-400 tracking-wider uppercase bg-slate-100 px-2 py-0.5 rounded-md inline-block">
                      {typeLabel} ({notes.length})
                    </span>
                    <div className="space-y-1.5 pl-1 border-l border-slate-100">
                      {notes.map((note) => (
                        <div 
                          key={note.id} 
                          className="text-xs p-2 rounded-lg bg-slate-50 border border-slate-100/50 hover:bg-slate-100/50 transition-colors flex justify-between items-start gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-slate-600 leading-normal font-medium">{note.message}</p>
                            <span className="text-[9px] text-slate-400 block mt-1 font-semibold">{getRelativeTime(note.created_at)}</span>
                          </div>
                          <button
                            onClick={(e) => handleMarkAsRead(note.id, e)}
                            className="p-1 text-slate-400 hover:text-success-600 hover:bg-success-50 rounded bg-white border border-slate-200 transition-all shadow-sm flex items-center justify-center shrink-0 cursor-pointer"
                            title="Mark as read"
                          >
                            <Check size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border-t border-slate-100/80 pt-3 text-center">
            <Link 
              to="/jobs" 
              className="text-xs font-bold text-primary-600 hover:text-primary-800 flex items-center justify-center gap-1 group"
            >
              <span>View all notifications in registry</span>
              <ArrowRight size={13} className="text-primary-500 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </div>

      {/* Active Duty Assessments Table */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">Active Duty Assessments compliance list</h3>
            <p className="text-[10px] text-slate-400 font-medium">Click on assessment rows to jump directly to Job assessment fee summaries</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left text-xs text-slate-500" id="assessment-report-table">
            <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3">Job Ref</th>
                <th className="px-4 py-3">Container No</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Total Duty (₦)</th>
                <th className="px-4 py-3">Assessment Age</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Route Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {sortedDutyAssessments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 uppercase font-bold tracking-wider text-[10px]">
                    No active duty assessments compiled.
                  </td>
                </tr>
              ) : (
                sortedDutyAssessments.map((job) => (
                  <tr 
                    key={job.job_id} 
                    onClick={() => navigate(`/jobs/${job.job_id}#duties-fees`)}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3.5 font-bold text-slate-900">{job.job_ref}</td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500">{job.container_no || 'TBA'}</td>
                    <td className="px-4 py-3.5 text-slate-650 truncate max-w-[150px]">{job.client_name || 'Individual Importer'}</td>
                    <td className="px-4 py-3.5 font-extrabold text-slate-900">
                      ₦{parseFloat(job.total_duty_ngn).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        job.days_since_assessment >= 3 ? 'text-danger-600 bg-danger-50 animate-pulse' : 'text-slate-600 bg-slate-100'
                      }`}>
                        {job.days_since_assessment} {job.days_since_assessment === 1 ? 'day ago' : 'days ago'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${
                        job.duty_payment_status === 'paid' ? 'bg-success-100 text-success-600' : 'bg-danger-100 text-danger-600'
                      }`}>
                        {job.duty_payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-250 text-slate-800 text-[10px] font-bold rounded-lg transition-colors">
                        <span>Details</span>
                        <ArrowUpRight size={12} />
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
