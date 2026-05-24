import { useState, useEffect } from 'react';
import { apiClient } from '../../lib/apiClient';
import { useAuthStore } from '../../store/authStore';
import { 
  FileText, 
  Download, 
  Calendar, 
  TrendingUp, 
  AlertTriangle, 
  Sparkles, 
  FileCheck2,
  PieChart as PieIcon,
  BarChart2
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip as ChartTooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Legend 
} from 'recharts';

interface LevyData {
  ciss_total: number;
  etls_total: number;
}

interface PerformanceData {
  week: string;
  created: number;
  completed: number;
}

export default function ReportsPage() {
  const { user } = useAuthStore();
  
  // Report 1 states: Financial Summary
  const [dateFrom, setDateFrom] = useState('2026-01-01');
  const [dateTo, setDateTo] = useState('2026-12-31');
  const [financialLoading, setFinancialLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Report 2 states: Monthly Levy Summary
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const [levyMonth, setLevyMonth] = useState(String(currentMonth));
  const [levyYear, setLevyYear] = useState(String(currentYear));
  const [levyData, setLevyData] = useState<LevyData | null>(null);
  const [levyLoading, setLevyLoading] = useState(true);

  // Report 3 states: Jobs Performance
  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([]);
  const [performanceLoading, setPerformanceLoading] = useState(true);

  // Fetch Levy Summary data
  const fetchLevySummary = async () => {
    setLevyLoading(true);
    try {
      const res = await apiClient.get('/api/reports/levy', {
        params: { month: levyMonth, year: levyYear }
      });
      if (res.data && res.data.success) {
        setLevyData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load Monthly Levy Summary details:', err);
    } finally {
      setLevyLoading(false);
    }
  };

  // Fetch Jobs Performance data
  const fetchPerformance = async () => {
    setPerformanceLoading(true);
    try {
      const res = await apiClient.get('/api/reports/performance');
      if (res.data && res.data.success) {
        setPerformanceData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load Weekly Performance Logs:', err);
    } finally {
      setPerformanceLoading(false);
    }
  };

  useEffect(() => {
    fetchLevySummary();
  }, [levyMonth, levyYear]);

  useEffect(() => {
    fetchPerformance();
  }, []);

  // Handler for secure report triggers
  const executeDownload = async (format: 'pdf' | 'csv') => {
    setFinancialLoading(true);
    setErrorMessage('');
    try {
      const response = await apiClient.get('/api/reports/financial', {
        params: {
          date_from: dateFrom,
          date_to: dateTo,
          format
        },
        responseType: 'blob'
      });

      // Spawn blob and trigger browser automated anchor click download
      const mimeType = format === 'pdf' ? 'application/pdf' : 'text/csv';
      const fileBlob = new Blob([response.data], { type: mimeType });
      const downloadUrl = window.URL.createObjectURL(fileBlob);
      const tempLink = document.createElement('a');
      tempLink.href = downloadUrl;
      tempLink.setAttribute('download', `clearpath-financial-report.${format}`);
      document.body.appendChild(tempLink);
      tempLink.click();
      tempLink.parentNode?.removeChild(tempLink);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      console.error('Failed compiling financial ledger files:', err);
      setErrorMessage(
        user?.role !== 'senior_admin' 
          ? 'Access denied. Only Senior Administrators of ClearPath are corporate-entitled to fetch financial reports.'
          : 'Failed compiling spreadsheet audit ledger check. Please verify date bounds.'
      );
    } finally {
      setFinancialLoading(false);
    }
  };

  // Pie chart variables mapping for Report 2
  const pieData = levyData ? [
    { name: 'CISS (1% CIF)', value: levyData.ciss_total, color: '#3b82f6' },
    { name: 'ETLS (ECOWAS)', value: levyData.etls_total, color: '#10b981' }
  ] : [];

  const totalLevy = levyData ? (levyData.ciss_total + levyData.etls_total) : 0;

  // Month select options helper
  const MONTHS = [
    { value: '1', label: 'January' },
    { value: '2', label: 'February' },
    { value: '3', label: 'March' },
    { value: '4', label: 'April' },
    { value: '5', label: 'May' },
    { value: '6', label: 'June' },
    { value: '7', label: 'July' },
    { value: '8', label: 'August' },
    { value: '9', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];

  return (
    <div className="space-y-6" id="reports-view-panel">
      {/* Banner */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Institutional Compliance & Audit Reports</h2>
        <p className="text-xs text-slate-400 font-medium">Export general clearance ledgers, aggregate port levies, and review weekly creation velocities.</p>
      </div>

      {/* Grid of Report Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. FINANCIAL SUMMARY REPORT */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 md:p-6 flex flex-col justify-between space-y-4" id="report-card-financial">
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <FileText className="text-primary-500" size={18} />
              <h3 className="text-xs font-extrabold text-primary-900 uppercase tracking-widest">1. Financial Summary Report</h3>
            </div>
            <p className="text-xs text-slate-400 leading-normal">
              Retrieve full shipment invoices audits covering custom duties, SON, NAFDAC, demurrage and carriage fees within dynamic dates range limits.
            </p>

            <div className="grid grid-cols-2 gap-3.5 pt-1.5">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-extrabold text-slate-400 tracking-widest flex items-center gap-1">
                  <Calendar size={11} />
                  <span>From Date</span>
                </label>
                <input 
                  type="date"
                  value={dateFrom} 
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary-500 bg-slate-50/50"
                  title="Filter from"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-extrabold text-slate-400 tracking-widest flex items-center gap-1">
                  <Calendar size={11} />
                  <span>To Date</span>
                </label>
                <input 
                  type="date"
                  value={dateTo} 
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary-500 bg-slate-50/50"
                  title="Filter to"
                />
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 bg-danger-50 border border-danger-500/10 rounded-xl text-[11px] font-semibold text-danger-500 leading-relaxed flex items-start gap-1.5">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => executeDownload('csv')}
              disabled={financialLoading}
              className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all border border-slate-200/50 shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download size={13} />
              <span>{financialLoading ? 'Exporting...' : 'Export CSV'}</span>
            </button>
            <button
              onClick={() => executeDownload('pdf')}
              disabled={financialLoading}
              className="py-2.5 bg-primary-700 hover:bg-primary-950 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <FileCheck2 size={13} />
              <span>{financialLoading ? 'Building PDF...' : 'Export PDF'}</span>
            </button>
          </div>
        </div>

        {/* 2. MONTHLY LEVY SUMMARY (CISS & ETLS Breakdown) */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 md:p-6 flex flex-col justify-between space-y-4" id="report-card-levies">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <PieIcon className="text-success-500" size={18} />
                <h3 className="text-xs font-extrabold text-primary-900 uppercase tracking-widest">2. Monthly Levy Summary</h3>
              </div>

              {/* Day/Year Selectors */}
              <div className="flex gap-1.5">
                <select 
                  value={levyMonth} 
                  onChange={(e) => setLevyMonth(e.target.value)}
                  className="px-2 py-1 border border-slate-200 bg-white rounded-lg text-[10px] font-bold text-slate-700"
                  aria-label="Select month"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <select 
                  value={levyYear} 
                  onChange={(e) => setLevyYear(e.target.value)}
                  className="px-2 py-1 border border-slate-200 bg-white rounded-lg text-[10px] font-bold text-slate-700"
                  aria-label="Select year"
                >
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                </select>
              </div>
            </div>

            {levyLoading ? (
              <div className="h-44 flex items-center justify-center text-xs text-slate-400 font-bold uppercase tracking-wider">
                Rebuilding Levy charts...
              </div>
            ) : totalLevy === 0 ? (
              <div className="h-44 flex items-center justify-center text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                No custom duty levies processed this period.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                {/* Recharts Pie Breakdown */}
                <div className="h-40 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={30}
                        outerRadius={55}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <ChartTooltip formatter={(val: number) => `₦${val.toLocaleString()}`} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Totals</span>
                    <span className="text-xs font-extrabold text-slate-800">₦{totalLevy > 1000000 ? `${(totalLevy / 1000000).toFixed(1)}M` : totalLevy.toLocaleString()}</span>
                  </div>
                </div>

                {/* Legend list */}
                <div className="space-y-3.5">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Comprehensive Port Levy</span>
                    <h4 className="text-lg font-black text-slate-800">
                      ₦{totalLevy.toLocaleString('en-NG', { maximumFractionDigits: 0 })}
                    </h4>
                  </div>
                  <div className="space-y-1.5">
                    {pieData.map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-xs font-semibold p-1 bg-slate-50/75 rounded-md">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="text-slate-500 font-medium">{item.name}</span>
                        </div>
                        <span className="text-slate-900 font-bold">₦{item.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 3. JOBS PERFORMANCE REPORT */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 md:p-6 space-y-4" id="report-card-performance">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
          <BarChart2 className="text-accent-500" size={18} />
          <h3 className="text-xs font-extrabold text-primary-900 uppercase tracking-widest">3. Jobs Performance Report</h3>
        </div>
        <p className="text-xs text-slate-450 text-slate-400 leading-normal max-w-xl">
          Weekly shipping workloads velocity statistics for the last 12 weeks showing number of jobs created vs successfully delivered.
        </p>

        {performanceLoading ? (
          <div className="h-56 flex items-center justify-center text-center text-xs text-slate-400 font-bold uppercase tracking-wider">
            Compiling Jobs Performance Bars...
          </div>
        ) : (
          <div className="h-64 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="week" 
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} 
                  axisLine={false} 
                  tickLine={false} 
                />
                <YAxis 
                  allowDecimals={false}
                  tick={{ fill: '#64748b', fontSize: 10 }} 
                  axisLine={false} 
                  tickLine={false} 
                />
                <ChartTooltip contentStyle={{ background: '#0D2B4E', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '11px' }} />
                <Legend 
                  verticalAlign="top" 
                  height={32} 
                  iconType="circle" 
                  wrapperStyle={{ fontSize: '11px', fontWeight: 600 }} 
                />
                <Bar dataKey="created" name="Created Jobs" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="completed" name="Delivered Jobs" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
