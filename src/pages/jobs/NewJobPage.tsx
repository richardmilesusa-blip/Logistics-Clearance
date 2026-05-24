import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '../../lib/apiClient';
import { 
  ArrowLeft, 
  Save, 
  Briefcase, 
  Grid2X2, 
  Anchor, 
  Calendar,
  AlertTriangle
} from 'lucide-react';

interface ClientEntry {
  id: string;
  name: string;
  email: string;
}

const jobSchema = z.object({
  job_ref: z.string().min(4, 'Job file reference is required (minimum 4 characters)'),
  bl_number: z.string().min(5, 'Bill of Lading number is required'),
  container_no: z.string().min(4, 'Container ID / numbers details are required'),
  port_of_loading: z.string().min(2, 'Port of Loading is required'),
  port_of_discharge: z.string().min(2, 'Port of Discharge is required'),
  client_id: z.string().min(1, 'Client importer is required'),
  date_received: z.string().min(5, 'Cargo arrival date is required')
});

type JobFormFields = z.infer<typeof jobSchema>;

export default function NewJobPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientEntry[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);

  // Pull existing client dropdown list
  useEffect(() => {
    // Falls back gracefully if clients aren't set
    apiClient.get('/api/jobs')
      .then((res) => {
        if (res.data && res.data.success) {
          // Extra duplicates filters helper
          const clientMap = new Map<string, ClientEntry>();
          res.data.data.forEach((j: any) => {
            if (j.client_id) {
              clientMap.set(j.client_id, {
                id: j.client_id,
                name: j.client_name || j.client?.name || 'Local Importer'
              } as ClientEntry);
            }
          });
          // Add default fallback if none
          if (clientMap.size === 0) {
            clientMap.set('f47ac10b-58cc-4372-a567-0e02b2c3d479', {
              id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
              name: 'Nigerian Import Ltd (Default)'
            } as ClientEntry);
          }
          setClients(Array.from(clientMap.values()));
        }
      })
      .catch((err) => {
        console.error('Failed to grab client lists:', err);
        // Fallback default list
        setClients([
          { id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', name: 'Aliko Logistics Ltd' },
          { id: '3d3aef61-da28-4ce6-99dd-62d2d85b1991', name: 'Mainland Commodities Hub' }
        ]);
      });
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<JobFormFields>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      date_received: new Date().toISOString().substring(0, 10),
      port_of_discharge: 'Apapa Port, Lagos'
    }
  });

  // Hot helper: Auto generator for standard ClearPath Job reference
  const generateRandomJobRef = () => {
    const code = Math.floor(1000 + Math.random() * 9000);
    setValue('job_ref', `CP-2026-${code}`);
  };

  const onSubmit = async (data: JobFormFields) => {
    setApiError(null);
    try {
      const payload = {
        ...data,
        status: 'paar_processing'
      };
      const response = await apiClient.post('/api/jobs', payload);
      if (response.data && response.data.success) {
        navigate('/jobs');
      } else {
        setApiError(response.data?.error?.message || 'Error occurred during job save.');
      }
    } catch (err: any) {
      setApiError(err.response?.data?.error?.message || 'Connection breakdown with database hosts.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6" id="new-job-view">
      {/* Title Nav block */}
      <div className="flex items-center gap-3">
        <Link 
          to="/jobs" 
          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900 shadow-sm transition-all"
          title="Back to grid"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Open Clearance File</h2>
          <p className="text-xs text-slate-400 font-medium">Create single or bulk container tracking files</p>
        </div>
      </div>

      {apiError && (
        <div className="p-3.5 bg-danger-100 text-danger-500 rounded-xl border border-danger-500/10 flex items-start gap-2.5 text-xs font-semibold leading-relaxed animate-fade-in">
          <AlertTriangle className="shrink-0 mt-0.5 animate-bounce" size={16} />
          <span>{apiError}</span>
        </div>
      )}

      {/* CORE INPUTS FORM */}
      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden divide-y divide-slate-100">
        
        {/* Step A: Identifications code generator */}
        <div className="p-5 md:p-6 space-y-4">
          <h3 className="text-xs font-extrabold text-primary-900 uppercase tracking-wider">A. Identity & Consignment Manifest</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Job Ref */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700" htmlFor="new-job-ref">
                  ClearPath Reference
                </label>
                <button
                  type="button"
                  onClick={generateRandomJobRef}
                  className="text-[10px] text-primary-500 hover:text-primary-700 font-bold tracking-tight hover:underline cursor-pointer"
                >
                  Generate Ref Code
                </button>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                  <Briefcase size={16} />
                </span>
                <input
                  {...register('job_ref')}
                  type="text"
                  id="new-job-ref"
                  placeholder="e.g. CP-2026-9042"
                  className={`w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border ${
                    errors.job_ref ? 'border-danger-500' : 'border-slate-200 focus:ring-primary-500'
                  } rounded-xl focus:border-transparent focus:ring-1 focus:bg-white focus:outline-none transition-all placeholder:text-slate-400/80 text-slate-900`}
                />
              </div>
              {errors.job_ref && (
                <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.job_ref.message}</span>
              )}
            </div>

            {/* Importer drop list */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="new-job-client">
                Importer (Registered Client)
              </label>
              <select
                {...register('client_id')}
                id="new-job-client"
                className={`w-full px-3.5 py-2 text-sm bg-slate-50 border ${
                  errors.client_id ? 'border-danger-500' : 'border-slate-200 focus:ring-primary-500'
                } rounded-xl focus:outline-none focus:bg-white focus:ring-1 transition-all text-slate-700 font-semibold cursor-pointer`}
              >
                <option value="">Choose partner importer</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {errors.client_id && (
                <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.client_id.message}</span>
              )}
            </div>

            {/* Bill of Lading BL */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="new-job-bl">
                Bill of Lading Details (B/L No)
              </label>
              <input
                {...register('bl_number')}
                type="text"
                id="new-job-bl"
                placeholder="e.g. MSCUNY89472"
                className={`w-full px-4 py-2 text-sm bg-slate-50 border ${
                  errors.bl_number ? 'border-danger-500' : 'border-slate-200 focus:ring-primary-500'
                } rounded-xl focus:border-transparent focus:ring-1 focus:bg-white focus:outline-none transition-all placeholder:text-slate-400/80 text-slate-900`}
              />
              {errors.bl_number && (
                <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.bl_number.message}</span>
              )}
            </div>

            {/* Containers ID */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="new-job-container">
                Containers Registry (Size e.g. 1x40ft MSCU908240)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                  <Grid2X2 size={16} />
                </span>
                <input
                  {...register('container_no')}
                  type="text"
                  id="new-job-container"
                  placeholder="MSCU908240, TGHU908722"
                  className={`w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border ${
                    errors.container_no ? 'border-danger-500' : 'border-slate-200 focus:ring-primary-500'
                  } rounded-xl focus:border-transparent focus:ring-1 focus:bg-white focus:outline-none transition-all placeholder:text-slate-400/80 text-slate-900`}
                />
              </div>
              {errors.container_no && (
                <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.container_no.message}</span>
              )}
            </div>

          </div>
        </div>

        {/* Step B: Routing voyage */}
        <div className="p-5 md:p-6 space-y-4">
          <h3 className="text-xs font-extrabold text-primary-900 uppercase tracking-wider">B. Voyage & Schedule</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Loading */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="new-job-loading-port">
                Port of Loading
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-450 pointer-events-none">
                  <Anchor size={16} className="text-slate-400" />
                </span>
                <input
                  {...register('port_of_loading')}
                  type="text"
                  id="new-job-loading-port"
                  placeholder="e.g. Shanghai Port"
                  className={`w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border ${
                    errors.port_of_loading ? 'border-danger-500' : 'border-slate-200 focus:ring-primary-500'
                  } rounded-xl focus:border-transparent focus:ring-1 focus:bg-white focus:outline-none transition-all placeholder:text-slate-400/80 text-slate-900`}
                />
              </div>
              {errors.port_of_loading && (
                <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.port_of_loading.message}</span>
              )}
            </div>

            {/* Discharge */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="new-job-discharge-port">
                Port of Discharge
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-450 pointer-events-none">
                  <Anchor size={16} className="text-slate-400" />
                </span>
                <input
                  {...register('port_of_discharge')}
                  type="text"
                  id="new-job-discharge-port"
                  className={`w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border ${
                    errors.port_of_discharge ? 'border-danger-500' : 'border-slate-200 focus:ring-primary-500'
                  } rounded-xl focus:border-transparent focus:ring-1 focus:bg-white focus:outline-none transition-all text-slate-900`}
                />
              </div>
              {errors.port_of_discharge && (
                <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.port_of_discharge.message}</span>
              )}
            </div>

            {/* Received Date */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="new-job-arrival">
                Manifest Registration Date
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                  <Calendar size={16} />
                </span>
                <input
                  {...register('date_received')}
                  type="date"
                  id="new-job-arrival"
                  className={`w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border ${
                    errors.date_received ? 'border-danger-500' : 'border-slate-200 focus:ring-primary-500'
                  } rounded-xl focus:border-transparent focus:ring-1 focus:bg-white focus:outline-none transition-all text-slate-900`}
                />
              </div>
              {errors.date_received && (
                <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.date_received.message}</span>
              )}
            </div>

          </div>
        </div>

        {/* Form panel footer trigger buttons */}
        <div className="p-5 bg-slate-50 flex items-center justify-end gap-3.5">
          <Link
            to="/jobs"
            className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            id="new-job-submit"
            className="px-4 py-2 bg-primary-700 hover:bg-primary-900 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-colors flex items-center justify-center gap-1.5"
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Save size={14} />
                <span>Initialize Shipment</span>
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
