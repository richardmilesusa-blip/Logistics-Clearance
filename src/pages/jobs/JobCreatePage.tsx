import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '../../lib/apiClient';
import { 
  ArrowLeft, 
  ArrowRight, 
  Save, 
  CheckCircle2, 
  AlertTriangle,
  FileText,
  Anchor,
  User,
  ShieldAlert,
  Search,
  Check
} from 'lucide-react';

// Definitions Schema matching 4-step details
const jobCreateSchema = z.object({
  // Step 1
  container_no: z.string().min(4, 'Container ID / number description is required (4+ characters)'),
  bl_number: z.string().min(5, 'Bill of Lading manifest number is required (5+ characters)'),
  shipping_line: z.string().min(3, 'Shipping line is required'),
  vessel_name: z.string().min(2, 'Vessel name is required'),
  voyage_no: z.string().min(2, 'Voyage number is required'),
  port_of_loading: z.string().min(2, 'Port of loading is required'),
  port_of_discharge: z.string().min(2, 'Port of discharge is required'),
  eta_date: z.string().min(5, 'ETA date is mandatory'),

  // Step 2
  cargo_description: z.string().min(5, 'Cargo description is required (5+ characters)'),
  hs_code: z.string().length(8, 'Harmonized System (HS) Tariff Code must be precisely 8 digits'),
  gross_weight_kg: z.preprocess((val) => Number(val), z.number().min(1, 'Gross weight must be greater than 0 kg')),
  container_seal_no: z.string().min(2, 'Container seal number is required'),
  client_id: z.string().min(1, 'Client importer selection is required'),

  // Step 3
  assigned_broker_id: z.string().min(1, 'Assigned Customs Broker is required'),
  assigned_forwarder_id: z.string().min(1, 'Assigned Freight Forwarder is required'),
});

type JobCreateFormFields = z.infer<typeof jobCreateSchema>;

interface SearchableItem {
  id: string;
  name: string;
}

export default function JobCreatePage() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(1);
  const [apiError, setApiError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // States for clients & users options
  const [clients, setClients] = useState<SearchableItem[]>([
    { id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', name: 'Aliko Logistics Ltd' },
    { id: '3d3aef61-da28-4ce6-99dd-62d2d85b1991', name: 'Mainland Commodities Hub' },
    { id: 'e6a86e5c-7f5b-4396-8576-96a928236d81', name: 'West African Agro Trades' }
  ]);
  const [brokers, setBrokers] = useState<SearchableItem[]>([
    { id: '5f34ac24-8f43-4cc0-811c-d7ba395f102c', name: 'Chief Broker Adamu Usman' },
    { id: '6a42ec1b-da28-4ce6-99dd-62d2d85b1991', name: 'Alhaji Musa Dikko' }
  ]);
  const [forwarders, setForwarders] = useState<SearchableItem[]>([
    { id: 'be52dc34-da48-4cb2-8576-e6a928236d81', name: 'ClearPath Cargo Dispatch Ltd' },
    { id: '7aa86e5c-7f5b-4396-8576-96a928236d81', name: 'West Coast Forwarders Corp' }
  ]);

  // Search filter query inputs
  const [clientSearch, setClientSearch] = useState('');
  const [brokerSearch, setBrokerSearch] = useState('');
  const [forwarderSearch, setForwarderSearch] = useState('');

  // Dropdown expansion locks
  const [clientExpanded, setClientExpanded] = useState(false);
  const [brokerExpanded, setBrokerExpanded] = useState(false);
  const [forwarderExpanded, setForwarderExpanded] = useState(false);

  // Retrieve option arrays from servers if possible, otherwise rely on fallbacks securely
  useEffect(() => {
    // Attempt pulling from real APIs
    apiClient.get('/api/jobs')
      .then((res) => {
        if (res.data && res.data.success) {
          // Dynamic list aggregation
          const clientMap = new Map<string, string>();
          res.data.data.forEach((j: any) => {
            if (j.client_id) {
              clientMap.set(j.client_id, j.client_name || j.client?.name || 'Local Importer');
            }
          });
          if (clientMap.size > 0) {
            setClients(Array.from(clientMap.entries()).map(([id, name]) => ({ id, name })));
          }
        }
      })
      .catch((err) => console.log('Using local baseline mock clients.'));
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isValid },
    trigger,
    control,
  } = useForm<any>({
    resolver: zodResolver(jobCreateSchema),
    mode: 'onChange',
    defaultValues: {
      port_of_discharge: 'Apapa Port, Lagos',
      port_of_loading: 'Shanghai Port, China',
      shipping_line: 'Maersk Line Nigeria',
      vessel_name: 'Maersk Mc-Kinney Moller',
      voyage_no: '2604N',
      eta_date: new Date(Date.now() + 86400000 * 14).toISOString().substring(0, 10), // 14 days out default
      container_no: 'MSCU8946250',
      bl_number: 'MSCLN89410A',
      cargo_description: 'Industrial Electrical machinery with spare components',
      hs_code: '85044090', // 8 digits precisely
      gross_weight_kg: 24500,
      container_seal_no: 'MS89412B',
      client_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      assigned_broker_id: '5f34ac24-8f43-4cc0-811c-d7ba395f102c',
      assigned_forwarder_id: 'be52dc34-da48-4cb2-8576-e6a928236d81',
    }
  });

  // Watch values for real-time validation reviews on Step 4
  const formValues = getValues();
  
  // Step navigation gates with manual field validation triggers
  const validateAndProceed = async () => {
    setApiError(null);
    let fieldsToValidate: any[] = [];
    
    if (activeStep === 1) {
      fieldsToValidate = [
        'container_no', 'bl_number', 'shipping_line', 
        'vessel_name', 'voyage_no', 'port_of_loading', 
        'port_of_discharge', 'eta_date'
      ];
    } else if (activeStep === 2) {
      fieldsToValidate = [
        'cargo_description', 'hs_code', 'gross_weight_kg', 
        'container_seal_no', 'client_id'
      ];
    } else if (activeStep === 3) {
      fieldsToValidate = [
        'assigned_broker_id', 'assigned_forwarder_id'
      ];
    }

    const isStepValid = await trigger(fieldsToValidate as any);
    if (isStepValid) {
      setActiveStep((prev) => prev + 1);
    } else {
      setApiError('Please fill or correct the highlighted mandatory fields before proceeding.');
    }
  };

  const stepBackward = () => {
    setApiError(null);
    setActiveStep((prev) => Math.max(1, prev - 1));
  };

  // SUBMIT HANDLER: POST /api/jobs
  const handleFinalSubmit = async (data: JobCreateFormFields) => {
    setApiError(null);
    setSuccessBanner(null);
    
    // Auto-generate ClearPath Reference
    const code = Math.floor(1000 + Math.random() * 9000);
    const jobRef = `CP-2026-${code}`;
    
    const payload = {
      ...data,
      job_ref: jobRef,
      date_received: new Date().toISOString().substring(0, 10),
      status: 'paar_processing'
    };

    try {
      const resp = await apiClient.post('/api/jobs', payload);
      if (resp.data && resp.data.success) {
        setSuccessBanner('Shipment registered successfully! Redirecting down-country...');
        const newJobId = resp.data.data?.id || '';
        setTimeout(() => {
          navigate(`/jobs/${newJobId}`);
        }, 1500);
      } else {
        setApiError(resp.data?.error?.message || 'Shipment submission was rejected.');
      }
    } catch (err: any) {
      setApiError(err.response?.data?.error?.message || 'Failed to authorize voyage with backend nodes.');
    }
  };

  // SAVE AS DRAFT: Allows saving immediately as partial draft
  const handleSaveDraft = async () => {
    setApiError(null);
    setSuccessBanner(null);

    const values = getValues();
    const code = Math.floor(1000 + Math.random() * 9000);
    const jobRef = `CP-2026-${code}-DRAFT`;

    const payload = {
      ...values,
      job_ref: jobRef,
      status: 'paar_processing',
      date_received: new Date().toISOString().substring(0, 10),
      // Set fallbacks for unentered fields on draft save
      container_no: values.container_no || 'TBA-DRAFT',
      bl_number: values.bl_number || 'TBA-DRAFT',
      port_of_loading: values.port_of_loading || 'TBA-DRAFT',
      port_of_discharge: values.port_of_discharge || 'TBA-DRAFT',
      client_id: values.client_id || 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    };

    try {
      const resp = await apiClient.post('/api/jobs', payload);
      if (resp.data && resp.data.success) {
        setSuccessBanner('Draft saved successfully! Returning to custom list.');
        setTimeout(() => {
          navigate('/jobs');
        }, 1205);
      } else {
        setApiError(resp.data?.error?.message || 'Error occurred during draft save.');
      }
    } catch (err: any) {
      setApiError(err.response?.data?.error?.message || 'Draft save rejected: connection down.');
    }
  };

  // Option Search filtering
  const filteredClients = clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()));
  const filteredBrokers = brokers.filter(b => b.name.toLowerCase().includes(brokerSearch.toLowerCase()));
  const filteredForwarders = forwarders.filter(f => f.name.toLowerCase().includes(forwarderSearch.toLowerCase()));

  // Setup current values watchers
  const watchedClientId = useWatch({ control, name: 'client_id' });
  const watchedBrokerId = useWatch({ control, name: 'assigned_broker_id' });
  const watchedForwarderId = useWatch({ control, name: 'assigned_forwarder_id' });

  const activeClientLabel = clients.find(c => c.id === watchedClientId)?.name || 'Select registered client';
  const activeBrokerLabel = brokers.find(b => b.id === watchedBrokerId)?.name || 'Select Customs Broker';
  const activeForwarderLabel = forwarders.find(f => f.id === watchedForwarderId)?.name || 'Select Freight Forwarder';

  return (
    <div className="max-w-3xl mx-auto space-y-6" id="job-booking-wizard">
      {/* Title block */}
      <div className="flex items-center gap-3">
        <Link 
          to="/jobs" 
          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900 shadow-sm transition-all"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight font-sans">Open Clearance File</h2>
          <p className="text-xs text-slate-400 font-medium font-sans">Initialize multi-step carrier shipments & Form M clearances</p>
        </div>
      </div>

      {/* Global Toast boxes */}
      {apiError && (
        <div className="p-3.5 bg-danger-100 text-danger-500 rounded-xl border border-danger-500/10 flex items-start gap-2.5 text-xs font-semibold leading-relaxed animate-fade-in">
          <AlertTriangle className="shrink-0 mt-0.5" size={16} />
          <span>{apiError}</span>
        </div>
      )}
      {successBanner && (
        <div className="p-3.5 bg-success-100 text-success-500 rounded-xl border border-success-500/10 flex items-start gap-2.5 text-xs font-semibold leading-relaxed animate-fade-in">
          <CheckCircle2 className="shrink-0 mt-0.5" size={16} />
          <span>{successBanner}</span>
        </div>
      )}

      {/* PROGRESS INDICATOR */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-xs flex justify-between items-center bg-slate-50/50">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">Booking Progress</span>
          <span className="text-xs font-extrabold text-primary-700">Step {activeStep} of 4</span>
        </div>
        <div className="flex gap-1.5 w-1/2">
          {[1, 2, 3, 4].map((step) => (
            <div 
              key={step} 
              className={`h-2 rounded-full flex-1 transition-all duration-300 ${
                activeStep >= step ? 'bg-primary-600' : 'bg-slate-250 bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* MULTI-STEP FORM CONTAINER */}
      <form onSubmit={handleSubmit(handleFinalSubmit)} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden min-h-[40vh] flex flex-col justify-between">
        
        {/* STEP 1: SHIPMENT DETAILS */}
        {activeStep === 1 && (
          <div className="p-5 md:p-6 space-y-4">
            <h3 className="text-xs font-black text-primary-900 uppercase tracking-wider flex items-center gap-1.5">
              <Anchor size={14} />
              <span>Step 1 — Voyage Manifest & Shipment Identifiers</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* container_no */}
              <div>
                <label className="block text-xs font-bold text-slate-705 text-slate-650 text-slate-600 mb-1" htmlFor="container_no">Container Number ID</label>
                <input
                  {...register('container_no')}
                  type="text"
                  placeholder="e.g. MSCU8946250"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 font-semibold"
                />
                {errors.container_no && (
                  <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.container_no.message}</span>
                )}
              </div>

              {/* bl_number */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="bl_number">Bill of Lading Details (B/L No)</label>
                <input
                  {...register('bl_number')}
                  type="text"
                  placeholder="e.g. MSCLN89410A"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 font-semibold"
                />
                {errors.bl_number && (
                  <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.bl_number.message}</span>
                )}
              </div>

              {/* shipping_line */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="shipping_line">Carrying Maritime Line</label>
                <input
                  {...register('shipping_line')}
                  type="text"
                  placeholder="e.g. Maersk Line Nigeria"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 font-semibold"
                />
                {errors.shipping_line && (
                  <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.shipping_line.message}</span>
                )}
              </div>

              {/* vessel_name */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="vessel_name">Vessel Name</label>
                <input
                  {...register('vessel_name')}
                  type="text"
                  placeholder="e.g. Maersk Mc-Kinney Moller"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none"
                />
                {errors.vessel_name && (
                  <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.vessel_name.message}</span>
                )}
              </div>

              {/* voyage_no */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="voyage_no">Voyage Number</label>
                <input
                  {...register('voyage_no')}
                  type="text"
                  placeholder="e.g. 2604N"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
                {errors.voyage_no && (
                  <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.voyage_no.message}</span>
                )}
              </div>

              {/* eta_date */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="eta_date">Expected Arrival Date (ETA)</label>
                <input
                  {...register('eta_date')}
                  type="date"
                  className="w-full px-3.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
                {errors.eta_date && (
                  <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.eta_date.message}</span>
                )}
              </div>

              {/* port_of_loading */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="port_of_loading">Port of Loading</label>
                <input
                  {...register('port_of_loading')}
                  type="text"
                  placeholder="Shanghai Port"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
                {errors.port_of_loading && (
                  <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.port_of_loading.message}</span>
                )}
              </div>

              {/* port_of_discharge */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="port_of_discharge">Port of Discharge</label>
                <input
                  {...register('port_of_discharge')}
                  type="text"
                  placeholder="Apapa Port, Lagos"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
                {errors.port_of_discharge && (
                  <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.port_of_discharge.message}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: CARGO & CLIENT */}
        {activeStep === 2 && (
          <div className="p-5 md:p-6 space-y-4">
            <h3 className="text-xs font-black text-primary-900 uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={14} />
              <span>Step 2 — Freight Specifications & Consignee</span>
            </h3>

            <div className="space-y-4">
              {/* cargo_description */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Declared Commodity Description</label>
                <textarea
                  {...register('cargo_description')}
                  rows={2}
                  placeholder="Describe goods details accurately..."
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 font-semibold"
                />
                {errors.cargo_description && (
                  <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.cargo_description.message}</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* hs_code */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">HS Code (8 digits)</label>
                  <input
                    {...register('hs_code')}
                    type="text"
                    maxLength={8}
                    placeholder="e.g. 85044090"
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none"
                  />
                  {errors.hs_code && (
                    <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.hs_code.message}</span>
                  )}
                </div>

                {/* gross_weight_kg */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Gross Cargo Weight (kg)</label>
                  <input
                    {...register('gross_weight_kg')}
                    type="number"
                    placeholder="24500"
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                  {errors.gross_weight_kg && (
                    <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.gross_weight_kg.message}</span>
                  )}
                </div>

                {/* container_seal_no */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Carrier Container Seal No</label>
                  <input
                    {...register('container_seal_no')}
                    type="text"
                    placeholder="e.g. MS89412B"
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                  {errors.container_seal_no && (
                    <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.container_seal_no.message}</span>
                  )}
                </div>
              </div>

              {/* SEARCHABLE DRUP LIST Client select */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Registered Consignee (Client)</label>
                <div 
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-bold cursor-pointer flex justify-between items-center"
                  onClick={() => setClientExpanded(!clientExpanded)}
                >
                  <span className="truncate">{activeClientLabel}</span>
                  <Search size={14} className="text-slate-400" />
                </div>

                {clientExpanded && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-3 space-y-2">
                    <input
                      type="text"
                      placeholder="Type component to search client..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-150 rounded-lg"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="max-h-36 overflow-y-auto divide-y divide-slate-50">
                      {filteredClients.map((c) => (
                        <div
                          key={c.id}
                          className="py-1.5 px-2 hover:bg-slate-55 hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer flex justify-between items-center"
                          onClick={() => {
                            setValue('client_id', c.id, { shouldValidate: true });
                            setClientExpanded(false);
                            setClientSearch('');
                          }}
                        >
                          <span>{c.name}</span>
                          {watchedClientId === c.id && <Check size={12} className="text-success-500" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {errors.client_id && (
                  <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.client_id.message}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: WORKFLOW TEAMASSIGNMENTS */}
        {activeStep === 3 && (
          <div className="p-5 md:p-6 space-y-4">
            <h3 className="text-xs font-black text-primary-900 uppercase tracking-wider flex items-center gap-1.5">
              <User size={14} />
              <span>Step 3 — Professional Staff Assignments</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* ASSIGNED BROKER SEARCHABLE */}
              <div className="relative space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Assigned Customs Broker</label>
                <div 
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-bold cursor-pointer flex justify-between items-center"
                  onClick={() => setBrokerExpanded(!brokerExpanded)}
                >
                  <span className="truncate">{activeBrokerLabel}</span>
                  <Search size={14} className="text-slate-400" />
                </div>

                {brokerExpanded && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-3 space-y-2">
                    <input
                      type="text"
                      placeholder="Search Customs Broker..."
                      value={brokerSearch}
                      onChange={(e) => setBrokerSearch(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-150 rounded-lg"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="max-h-36 overflow-y-auto divide-y divide-slate-50">
                      {filteredBrokers.map((b) => (
                        <div
                          key={b.id}
                          className="py-1.5 px-2 hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer flex justify-between items-center"
                          onClick={() => {
                            setValue('assigned_broker_id', b.id, { shouldValidate: true });
                            setBrokerExpanded(false);
                            setBrokerSearch('');
                          }}
                        >
                          <span>{b.name}</span>
                          {watchedBrokerId === b.id && <Check size={12} className="text-success-500" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {errors.assigned_broker_id && (
                  <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.assigned_broker_id.message}</span>
                )}
              </div>

              {/* ASSIGNED FORWARDER SEARCHABLE */}
              <div className="relative space-y-1.5">
                <label className="block text-xs font-bold text-slate-705 text-slate-700">Freight Forwarder Agent</label>
                <div 
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-bold cursor-pointer flex justify-between items-center"
                  onClick={() => setForwarderExpanded(!forwarderExpanded)}
                >
                  <span className="truncate">{activeForwarderLabel}</span>
                  <Search size={14} className="text-slate-400" />
                </div>

                {forwarderExpanded && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-3 space-y-2">
                    <input
                      type="text"
                      placeholder="Search Freight Forwarder..."
                      value={forwarderSearch}
                      onChange={(e) => setForwarderSearch(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-150 rounded-lg"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="max-h-36 overflow-y-auto divide-y divide-slate-50">
                      {filteredForwarders.map((f) => (
                        <div
                          key={f.id}
                          className="py-1.5 px-2 hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer flex justify-between items-center"
                          onClick={() => {
                            setValue('assigned_forwarder_id', f.id, { shouldValidate: true });
                            setForwarderExpanded(false);
                            setForwarderSearch('');
                          }}
                        >
                          <span>{f.name}</span>
                          {watchedForwarderId === f.id && <Check size={12} className="text-success-500" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {errors.assigned_forwarder_id && (
                  <span className="text-[10px] font-bold text-danger-500 mt-1 block">{errors.assigned_forwarder_id.message}</span>
                )}
              </div>
            </div>

            <div className="p-4 bg-amber-50 rounded-xl border border-amber-500/10 flex gap-2.5 text-[11px] text-amber-700 font-semibold leading-relaxed mt-6">
              <ShieldAlert className="shrink-0 mt-0.5" size={16} />
              <p>
                Each broker in ClearPath holds verified credentials linked with the Nigerian Customs Service. Assigned forwarders carry responsibilities for land trucking, gate releases, and terminal delivery order (TDO) logistics.
              </p>
            </div>
          </div>
        )}

        {/* STEP 4: REVIEW SUMMARY */}
        {activeStep === 4 && (
          <div className="p-5 md:p-6 space-y-4">
            <h3 className="text-xs font-black text-primary-900 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="text-emerald-500" size={15} />
              <span>Step 4 — Review Shipment Entry Details</span>
            </h3>

            <div className="border border-slate-100/80 rounded-2xl overflow-hidden divide-y divide-slate-100 text-xs text-slate-600 bg-slate-50/50">
              {/* Section 1 */}
              <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black tracking-wide block">Container Number</span>
                  <span className="font-extrabold text-slate-900 font-mono text-xs">{getValues('container_no')}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black tracking-wide block">Bill of Lading Details</span>
                  <span className="font-extrabold text-slate-950 font-mono text-xs">{getValues('bl_number')}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black tracking-wide block">Carrying Vessel</span>
                  <span className="font-bold text-slate-800">{getValues('vessel_name')}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black tracking-wide block">Maritime Line</span>
                  <span className="font-bold text-slate-800">{getValues('shipping_line')}</span>
                </div>
              </div>

              {/* Section 2 */}
              <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black tracking-wide block">Port Of Loading</span>
                  <span className="font-bold text-slate-800">{getValues('port_of_loading')}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black tracking-wide block">Port of Discharge</span>
                  <span className="font-bold text-slate-800">{getValues('port_of_discharge')}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black tracking-wide block">Expected Arrival (ETA)</span>
                  <span className="font-bold text-slate-800 font-mono">{getValues('eta_date')}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black tracking-wide block">Harmonized HS Code</span>
                  <span className="font-extrabold text-slate-900 font-mono">{getValues('hs_code')}</span>
                </div>
              </div>

              {/* Section 3 */}
              <div className="p-4">
                <span className="text-[10px] text-slate-400 uppercase font-black tracking-wide block">Commodity Declared Contents</span>
                <span className="font-semibold text-slate-800 text-[11px] block mt-1 bg-white p-3.5 border border-slate-150 rounded-lg">{getValues('cargo_description')}</span>
              </div>

              {/* Section 4 */}
              <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black tracking-wide block">Assigned Importer</span>
                  <span className="font-bold text-slate-850 font-sans text-slate-800">{activeClientLabel}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black tracking-wide block">Licensed Broker</span>
                  <span className="font-bold text-slate-800">{activeBrokerLabel}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black tracking-wide block">Primary Forwarder</span>
                  <span className="font-bold text-slate-800">{activeForwarderLabel}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-150 text-[10.5px] text-slate-500 leading-normal font-medium">
              ⚠️ Double-check HS Tariff classification matches SONCAP or Form M specifications. Once submitted, the ClearPath cargo file is pushed to the live database node and initiates the customs PAAR vetting procedure.
            </div>
          </div>
        )}

        {/* BOTTOM STEP CONTROLS BAR */}
        <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={activeStep === 1 ? () => navigate('/jobs') : stepBackward}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
          >
            {activeStep === 1 ? 'Cancel' : 'Back'}
          </button>

          <div className="flex gap-2.5">
            {/* Draft button on all steps */}
            <button
              type="button"
              onClick={handleSaveDraft}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5"
            >
              <Save size={13} />
              <span>Save as Draft</span>
            </button>

            {/* Next or Submit trigger based on wizard status */}
            {activeStep < 4 ? (
              <button
                type="button"
                onClick={validateAndProceed}
                className="px-4 py-2 bg-primary-700 hover:bg-primary-900 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all flex items-center gap-1.5"
                id="btn-create-wizard-next"
              >
                <span>Continue</span>
                <ArrowRight size={13} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit(handleFinalSubmit)}
                className="px-4.5 py-2 bg-emerald-600 hover:bg-emerald-800 text-white font-black text-xs rounded-xl shadow cursor-pointer transition-all flex items-center gap-1.5"
                id="btn-create-wizard-submit"
              >
                <CheckCircle2 size={13} />
                <span>Publish clearance file</span>
              </button>
            )}
          </div>
        </div>

      </form>
    </div>
  );
}
