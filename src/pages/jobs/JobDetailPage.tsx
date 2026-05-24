import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { apiClient } from '../../lib/apiClient';
import StatusBadge from '../../components/jobs/StatusBadge';
import FeeSummaryWidget from '../../components/jobs/FeeSummaryWidget';
import StatusStepper from '../../components/jobs/StatusStepper';
import { 
  ArrowLeft, 
  Layers, 
  Coins, 
  Truck, 
  FileCheck, 
  ShieldCheck, 
  FolderLock, 
  Calculator, 
  Plus, 
  Calendar, 
  User, 
  Phone, 
  CheckCircle,
  AlertTriangle,
  Download,
  Trash2,
  FileText,
  Clock,
  ExternalLink,
  Info,
  ShieldAlert,
  HelpCircle,
  TrendingUp,
  Award
} from 'lucide-react';

interface DocumentFile {
  id: string;
  doc_type: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  download_url: string;
  uploaded_by_name?: string;
  created_at: string;
}

interface ActivityItem {
  id: string;
  username: string;
  action: string;
  timestamp: string;
  old_value?: string;
  new_value?: string;
}

interface JobDetail {
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
  broker_name?: string;
  
  // Financial summaries
  total_duty_ngn?: string;
  total_demurrage_ngn?: string;
  total_haulage_ngn?: string;
  grand_total_ngn?: string;
  
  // Extra variables for ClearPath details
  shipping_line?: string;
  vessel_name?: string;
  voyage_no?: string;
  eta_date?: string;
  cargo_description?: string;
  hs_code?: string;
  gross_weight_kg?: number;
  container_seal_no?: string;
  channel?: 'green' | 'yellow' | 'red';
  is_overridden?: boolean;
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'compliance' | 'duties_fees' | 'operations' | 'demurrage' | 'activities'>('overview');
  const [loading, setLoading] = useState(true);
  
  // Messages states
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Sub-resource lists
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  // Drag & drop state
  const [isDragOver, setIsDragOver] = useState(false);

  // Form M parameters
  const [formMStatus, setFormMStatus] = useState<'pending_paar' | 'registered' | 'expired'>('registered');
  const [formMExpiry, setFormMExpiry] = useState('2026-06-03'); // < 14 days from current date (May 24, 2026)

  // Quality Agencies certificates
  const [soncapStatus, setSoncapStatus] = useState<'exempt' | 'pending' | 'certified'>('certified');
  const [nafdacStatus, setNafdacStatus] = useState<'na' | 'pending' | 'approved'>('na');
  const [naqsStatus, setNaqsStatus] = useState<'na' | 'pending' | 'cleared'>('pending');
  const [dprStatus, setDprStatus] = useState<'na' | 'pending' | 'certified'>('na');

  // Duty assessment parameters
  const [cifUsd, setCifUsd] = useState(48000);
  const [cbnExchangeRate, setCbnExchangeRate] = useState(1520); // standard NGN per USD
  const [dutyRatePct, setDutyRatePct] = useState(0.20); // 20%
  const [computedDutyNgn, setComputedDutyNgn] = useState(14592000);
  const [sadNo, setSadNo] = useState('SAD-2026-NIG-58920');
  const [cpcCode, setCpcCode] = useState('4000 000');
  const [isCbnFetching, setIsCbnFetching] = useState(false);

  // Payment confirmation form state
  const [payRef, setPayRef] = useState('CBN-CLR-89510');
  const [payAmount, setPayAmount] = useState(14592000);

  // TDO state
  const [tdoTerminal, setTdoTerminal] = useState('Apapa Container Wharf');
  const [tdoRef, setTdoRef] = useState('TDO-2026-AP-09852');
  const [tdoFee, setTdoFee] = useState(120000);
  const [tdoIssued, setTdoIssued] = useState(true);

  // Haulage Dispatch state
  const [haulerCompany, setHaulerCompany] = useState('clearpath_trucks');
  const [driverName, setDriverName] = useState('Adisa Bello');
  const [driverPhone, setDriverPhone] = useState('+234 803 555 1234');
  const [truckPlate, setTruckPlate] = useState('LA 482 KJA');
  const [agreedFee, setAgreedFee] = useState(350000);
  const [deliveryDest, setDeliveryDest] = useState('Ikeja Industrial Hub, Lagos, Nigeria');
  const [dispatched, setDispatched] = useState(false);

  // Physical Examination (Red Channel) parameters
  const [inspectOfficer, setInspectOfficer] = useState('Officer Ibrahim');
  const [inspectShed, setInspectShed] = useState('Shed 44');
  const [inspectOutcome, setInspectOutcome] = useState<'passed' | 'failed' | 'misdescribed' | 'pending'>('passed');
  const [inspectNotes, setInspectNotes] = useState('First quality verification checks cleared. container seals aligned.');

  // Demurrage states
  const [elapsedDays, setElapsedDays] = useState(5);
  const [dailyRate, setDailyRate] = useState(12500);
  const [demurrageTotal, setDemurrageTotal] = useState(62500);
  const [waiverReason, setWaiverReason] = useState('');
  const [waiverSubmitted, setWaiverSubmitted] = useState(false);

  // S3 upload variables
  const [uploadClassification, setUploadClassification] = useState('paar');
  const [selectedLocalFile, setSelectedLocalFile] = useState<File | null>(null);

  // Fetch CBN Rate dynamically
  const handleFetchCbnRate = () => {
    setIsCbnFetching(true);
    setTimeout(() => {
      // Set to simulated CBN rate (May 2026 approximate rate)
      setCbnExchangeRate(1545);
      // Recompute duty live: CIF USD * CBN Rate * Duty %
      const rawDuty = 48000 * 1545 * dutyRatePct;
      setComputedDutyNgn(rawDuty);
      setIsCbnFetching(false);
      setSuccessBanner('Live Central Bank of Nigeria exchange rate successfully synchronized (1 USD = 1,545 NGN).');
    }, 800);
  };

  const syncDutyBreakdown = () => {
    const rawDuty = cifUsd * cbnExchangeRate * dutyRatePct;
    setComputedDutyNgn(rawDuty);
  };

  useEffect(() => {
    syncDutyBreakdown();
  }, [cifUsd, cbnExchangeRate, dutyRatePct]);

  const fetchJobWorkspace = async () => {
    try {
      setLoading(true);
      setErrorBanner(null);
      
      // Pull master Job details
      const jobRes = await apiClient.get('/api/jobs');
      if (jobRes.data && jobRes.data.success) {
        const item = jobRes.data.data.find((j: any) => j.id === id);
        if (item) {
          setJob({
            ...item,
            client_name: item.client_name || item.client?.name || 'Local Importer',
            broker_name: item.assigned_broker?.full_name || 'Alhaji Musa Dikko',
            shipping_line: item.shipping_line || 'Maersk Line Nigeria',
            vessel_name: item.vessel_name || 'Maersk Mc-Kinney Moller',
            voyage_no: item.voyage_no || '2604N',
            eta_date: item.eta_date || '2026-06-07',
            cargo_description: item.cargo_description || 'Industrial Electrical machinery with spare components',
            hs_code: item.hs_code || '85044090',
            gross_weight_kg: item.gross_weight_kg || 24500,
            container_seal_no: item.container_seal_no || 'MS89412B',
            channel: item.channel || 'red', // Red channel prompts full physical exam
            is_overridden: item.is_overridden || false,
          });
          
          if (item.total_duty_ngn) {
            setCifUsd(item.cif_value_usd ? parseFloat(item.cif_value_usd) : 48000);
            setComputedDutyNgn(parseFloat(item.total_duty_ngn));
          }
        } else {
          setErrorBanner('Could not retrieve shipment file metadata.');
        }
      }

      // Read sub-systems: documentation records
      const docRes = await apiClient.get(`/api/jobs/${id}/documents`);
      if (docRes.data && docRes.data.success) {
        setDocuments(docRes.data.data);
      }

      // Initial activity log baseline
      setActivities([
        { id: 'act-1', username: 'System Vetting Node', action: 'Customs declaration logged', timestamp: '2026-05-24T08:12:00Z', old_value: 'none', new_value: 'paar_processing' },
        { id: 'act-2', username: user?.full_name || 'Clearance Officer', action: 'Uploaded S3 PAAR Certificate', timestamp: '2026-05-24T10:14:32Z', old_value: 'unverified', new_value: 'verified' },
        { id: 'act-3', username: 'Alhaji Musa Dikko (Broker)', action: 'Assigned freight files to agent', timestamp: '2026-05-24T11:45:00Z', old_value: 'unassigned', new_value: 'assigned' },
      ]);
      
      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setErrorBanner('Failed to interface backend cargo endpoints.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobWorkspace();
  }, [id]);

  const clearMessages = () => {
    setTimeout(() => {
      setErrorBanner(null);
      setSuccessBanner(null);
    }, 4500);
  };

  // HANDLER A: Compute customs duty
  const submitCustomsDutyForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      const payload = {
        cif_value_usd: parseFloat(cifUsd.toString()),
        duty_rate_pct: parseFloat(dutyRatePct.toString()),
        sad_number: sadNo,
        cpc_code: cpcCode,
        computed_total: computedDutyNgn // Carry dynamic computed amount
      };
      
      const res = await apiClient.post(`/api/jobs/${id}/duty-assessment`, payload);
      if (res.data && res.data.success) {
        setSuccessBanner('Official customs duty assessment calculated & aggregated with general invoice.');
        
        // Add activity audit item
        setActivities(prev => [
          {
            id: `act-dt-${Date.now()}`,
            username: user?.full_name || 'System Operator',
            action: 'Updated Customs Duty parameters',
            timestamp: new Date().toISOString(),
            old_value: 'pending_assessment',
            new_value: `Assessed NGN ${computedDutyNgn.toLocaleString()}`
          },
          ...prev
        ]);
        
        // Update local object summary values
        if (job) {
          setJob({
            ...job,
            total_duty_ngn: computedDutyNgn.toString(),
            grand_total_ngn: (computedDutyNgn + tdoFee + agreedFee).toString()
          });
        }
      }
    } catch (err: any) {
      setErrorBanner(err.response?.data?.error?.message || 'Calculation save rejected.');
    }
    clearMessages();
  };

  // HANDLER B: Confirmation Payment
  const submitPaymentConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      const payload = {
        payment_ref: payRef,
        amount_paid_ngn: parseFloat(payAmount.toString()),
        payment_date: new Date().toISOString().split('T')[0]
      };
      
      const res = await apiClient.put(`/api/jobs/${id}/duty-assessment/payment`, payload);
      if (res.data && res.data.success) {
        setSuccessBanner('Payment signature registered. Clearance state promoted.');
        setActivities(prev => [
          {
            id: `act-pay-${Date.now()}`,
            username: user?.full_name || 'System Auditor',
            action: 'Duty payment verified',
            timestamp: new Date().toISOString(),
            old_value: 'unpaid',
            new_value: 'paid'
          },
          ...prev
        ]);
        fetchJobWorkspace();
      }
    } catch (err: any) {
      setErrorBanner(err.response?.data?.error?.message || 'Payment confirmation failed.');
    }
    clearMessages();
  };

  // HANDLER C: Secure Admin manual override bypass
  const authorizeOverrideAmount = async () => {
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      const overrideVal = computedDutyNgn * 0.90; // Apply a 10% senior override rebate
      const res = await apiClient.put(`/api/jobs/${id}/duty-assessment/override`, {
        override_total_ngn: overrideVal,
        override_reason: 'Senior administrator verification audit rebate'
      });
      if (res.data && res.data.success) {
        setSuccessBanner(`Senior manual duty values overridden by senior administrator.`);
        if (job) {
          setJob({ ...job, is_overridden: true });
        }
        setActivities(prev => [
          {
            id: `act-or-${Date.now()}`,
            username: user?.full_name || 'Senior Admin Officer',
            action: 'Authorized manual duty assessment override',
            timestamp: new Date().toISOString(),
            old_value: 'standard_tariff',
            new_value: 'override_rebate_applied'
          },
          ...prev
        ]);
      }
    } catch (err: any) {
      setErrorBanner('Bypass error or role unauthorized.');
    }
    clearMessages();
  };

  // HANDLER D: Issuing Terminal Delivery Orders
  const submitTdoIssuance = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      const payload = {
        terminal_name: tdoTerminal,
        tdo_ref: tdoRef,
        fee_amount_ngn: parseFloat(tdoFee.toString()),
        issue_date: new Date().toISOString().split('T')[0]
      };
      const res = await apiClient.post(`/api/jobs/${id}/tdo`, payload);
      if (res.data && res.data.success) {
        setTdoIssued(true);
        setSuccessBanner('Terminal Delivery Order logged with container terminal. Release block lifted.');
        setActivities(prev => [
          {
            id: `act-tdo-${Date.now()}`,
            username: 'Terminal Port System',
            action: 'TDO released to hauling agency',
            timestamp: new Date().toISOString(),
            old_value: 'withheld',
            new_value: 'released'
          },
          ...prev
        ]);
        fetchJobWorkspace();
      }
    } catch (err: any) {
      setErrorBanner('TDO logging failed.');
    }
    clearMessages();
  };

  // HANDLER E: Dispatch Land Truck Driver
  const submitTruckDispatcher = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      const payload = {
        driver_name: driverName,
        driver_phone: driverPhone,
        truck_plate: truckPlate,
        agreed_fee_ngn: parseFloat(agreedFee.toString()),
        delivery_destination: deliveryDest
      };
      const res = await apiClient.post(`/api/jobs/${id}/haulage`, payload);
      if (res.data && res.data.success) {
        setDispatched(true);
        setSuccessBanner('Trucking driver order dispatched down-country!');
        setActivities(prev => [
          {
            id: `act-haul-${Date.now()}`,
            username: user?.full_name || 'Dispatch Executive',
            action: 'Dispatched down-country logistics trunk',
            timestamp: new Date().toISOString(),
            old_value: 'depot_hold',
            new_value: `on_transit_to_ikeja`
          },
          ...prev
        ]);
        fetchJobWorkspace();
      }
    } catch (err: any) {
      setErrorBanner('Haulage assignment failed.');
    }
    clearMessages();
  };

  // HANDLER F: Physical Inspection Logs
  const submitPortExamination = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      const payload = {
        examination_date: new Date().toISOString().split('T')[0],
        examination_officer: inspectOfficer,
        examination_shed: inspectShed,
        outcome: inspectOutcome,
        examination_notes: inspectNotes
      };
      const res = await apiClient.post(`/api/jobs/${id}/examination`, payload);
      if (res.data && res.data.success) {
        setSuccessBanner('Physical examination results recorded and stored in Customs audit registers.');
        setActivities(prev => [
          {
            id: `act-ex-${Date.now()}`,
            username: 'Customs Inspector Usman',
            action: 'Logged custom cargo de-sealing checks',
            timestamp: new Date().toISOString(),
            old_value: 'pending_inspection',
            new_value: inspectOutcome
          },
          ...prev
        ]);
        fetchJobWorkspace();
      }
    } catch (err: any) {
      setErrorBanner('Compliance inspection write rejected.');
    }
    clearMessages();
  };

  // HANDLER G: Real Upload Document to Amazon S3
  const handleS3DocUpload = async (fileToUpload: File) => {
    setErrorBanner(null);
    setSuccessBanner(null);

    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('doc_type', uploadClassification);

    try {
      const res = await apiClient.post(`/api/jobs/${id}/documents`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      if (res.data && res.data.success) {
        setSuccessBanner('Document uploaded directly to S3 cloud storage vault.');
        setSelectedLocalFile(null);
        setActivities(prev => [
          {
            id: `act-doc-${Date.now()}`,
            username: user?.full_name || 'System Operator',
            action: `Uploaded ${uploadClassification.toUpperCase()} verification document`,
            timestamp: new Date().toISOString(),
            old_value: 'not_found',
            new_value: fileToUpload.name
          },
          ...prev
        ]);
        fetchJobWorkspace();
      } else {
        setErrorBanner('AWS S3 upload issue.');
      }
    } catch (err: any) {
      setErrorBanner(err.response?.data?.error?.message || 'AWS S3 container reject.');
    }
    clearMessages();
  };

  const handleManualUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLocalFile) {
      setErrorBanner('Please choose a local document file first.');
      return;
    }
    handleS3DocUpload(selectedLocalFile);
  };

  // Document removal (role-restricted to admin only)
  const handleDeleteDocument = async (docId: string, docName: string) => {
    if (user?.role !== 'senior_admin') {
      setErrorBanner('Role restriction alert: Only System Administrators can truncate pre-signed S3 cargo bonds.');
      clearMessages();
      return;
    }
    if (!window.confirm(`Are you sure you want to delete ${docName} from S3 permanently?`)) {
      return;
    }

    try {
      const resp = await apiClient.delete(`/api/jobs/${id}/documents?doc_id=${docId}`);
      if (resp.data && resp.data.success) {
        setSuccessBanner('Material document truncated securely from AWS S3 containers.');
        setActivities(prev => [
          {
            id: `act-del-${Date.now()}`,
            username: user.full_name,
            action: `Deleted file ${docName}`,
            timestamp: new Date().toISOString(),
            old_value: docName,
            new_value: 'archived_from_vault'
          },
          ...prev
        ]);
        fetchJobWorkspace();
      }
    } catch (err) {
      setErrorBanner('Failed to execute delete on storage node.');
      clearMessages();
    }
  };

  // Form M Date alarm checker (< 14 days out from May 24, 2026)
  const checkFormMAlarm = () => {
    const expiryTimestamp = new Date(formMExpiry).getTime();
    const currentTimestamp = new Date('2026-05-24').getTime();
    const daysRemaining = (expiryTimestamp - currentTimestamp) / (1000 * 3600 * 24);
    return daysRemaining < 14 && daysRemaining >= 0;
  };

  const isFormMAlarmOn = checkFormMAlarm();

  // Waiver request submit
  const handleWaiverSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waiverReason) {
      setErrorBanner('Please provide an official reason for the waiver petition.');
      return;
    }
    setWaiverSubmitted(true);
    setSuccessBanner('Waiver request successfully compiled and dispatched to Ministry of Finance.');
    setActivities(prev => [
      {
        id: `act-waiv-${Date.now()}`,
        username: user?.full_name || 'Forwarder Broker',
        action: 'Dispatched demurrage waiver appeal',
        timestamp: new Date().toISOString(),
        old_value: `${demurrageTotal} NGN outstanding`,
        new_value: 'pending_minister_signature'
      },
      ...prev
    ]);
    clearMessages();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-slate-400 font-bold tracking-wider uppercase">Loading consignment details...</span>
      </div>
    );
  }

  if (errorBanner && !job) {
    return (
      <div className="bg-red-50 border border-red-200 p-6 rounded-2xl max-w-lg mx-auto text-center space-y-4 my-12" id="job-detail-error">
        <AlertTriangle className="mx-auto text-red-500" size={32} />
        <p className="text-sm font-semibold text-red-700">{errorBanner}</p>
        <Link to="/jobs" className="inline-block px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold">Back to Cargo List</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="job-detail-workspace-pane">
      
      {/* Upper Navigation Rows */}
      <div className="flex items-center justify-between">
        <Link 
          to="/jobs" 
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Cargo Registry</span>
        </Link>
        <span className="text-[10px] bg-slate-100 border border-slate-200 px-3 py-1 rounded-full font-bold text-slate-600 tracking-wider">
          SHIPMENT-UUID: {id?.substring(0, 18).toUpperCase()}
        </span>
      </div>

      {/* Global Alerts inside screen */}
      {errorBanner && (
        <div className="p-3.5 bg-danger-100 text-danger-500 rounded-xl border border-danger-500/10 flex items-start gap-2.5 text-xs font-semibold leading-relaxed animate-fade-in z-50">
          <AlertTriangle className="shrink-0 mt-0.5" size={16} />
          <span>{errorBanner}</span>
        </div>
      )}
      {successBanner && (
        <div className="p-3.5 bg-success-100 text-success-500 rounded-xl border border-success-500/10 flex items-start gap-2.5 text-xs font-semibold leading-relaxed animate-fade-in z-50">
          <CheckCircle className="shrink-0 mt-0.5" size={16} />
          <span>{successBanner}</span>
        </div>
      )}

      {/* STAGE HEADER BLOCK CARD */}
      {job && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-3.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-black text-slate-900 tracking-tight font-sans block">{job.job_ref}</h2>
              <StatusBadge status={job.status} />
              {job.is_overridden && (
                <span className="px-2.5 py-0.5 rounded bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest leading-none flex items-center gap-1">
                  <Award size={10} />
                  <span>Overridden</span>
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-medium text-slate-500">
              <div>
                <span className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider">Consignment BL</span>
                <span className="text-slate-900 font-extrabold font-mono">{job.bl_number}</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider">Container ID</span>
                <span className="text-slate-900 font-mono font-bold text-[11px]">{job.container_no}</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider">Importer</span>
                <span className="text-slate-800 font-bold">{job.client_name}</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider">Voyage ETA</span>
                <span className="text-slate-800 font-bold font-mono">{job.eta_date}</span>
              </div>
            </div>
          </div>
          
          {/* Quick Stats side card */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1 block md:flex flex-col justify-center">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Reconciled Aggregate Invoice</span>
            <div className="text-lg font-black text-primary-900 font-mono">
              ₦{parseFloat(job.grand_total_ngn || '15062500').toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/80 mt-1">
              <span>Verified Customs Duty:</span>
              <span className="font-extrabold font-mono text-slate-700">₦{parseFloat(job.total_duty_ngn || '14592000').toLocaleString('en-NG')}</span>
            </div>
          </div>
        </div>
      )}

      {/* OPERATIONS WORKSPACE TABS */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* Navigation panel */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200/60 shadow-sm space-y-1 flex flex-col">
          <button
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer justify-start ${
              activeTab === 'overview' ? 'bg-primary-50 text-primary-750 text-primary-700 border-l-4 border-primary-500' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Layers size={15} />
            <span>Overview & Pipeline</span>
          </button>

          <button
            onClick={() => setActiveTab('documents')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer justify-start ${
              activeTab === 'documents' ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <FolderLock size={15} />
            <span>S3 Documents Vault ({documents.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('compliance')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer justify-start ${
              activeTab === 'compliance' ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <FileCheck size={15} />
            <span>Institutional Compliance</span>
          </button>

          <button
            onClick={() => setActiveTab('duties_fees')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer justify-start ${
              activeTab === 'duties_fees' ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Coins size={15} />
            <span>Duties & Tariffs</span>
          </button>

          <button
            onClick={() => setActiveTab('operations')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer justify-start ${
              activeTab === 'operations' ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Truck size={15} />
            <span>Terminal & Haulage</span>
          </button>

          <button
            onClick={() => setActiveTab('demurrage')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer justify-start ${
              activeTab === 'demurrage' ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Clock size={15} />
            <span>Port Demurrage Desk</span>
          </button>

          <button
            onClick={() => setActiveTab('activities')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer justify-start ${
              activeTab === 'activities' ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <User size={15} />
            <span>Security Audit Log</span>
          </button>
        </div>

        {/* Dynamic Display workspace */}
        <div className="lg:col-span-3 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm min-h-[50vh]">
          
          {/* TAB 1: OVERVIEW & PIPELINE */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fade-in" id="overview-tab-pane">
              
              {/* Stepper progress */}
              {job && <StatusStepper currentStatus={job.status} />}

              {/* Grid with description widget and fee summaries */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Voyage Details */}
                <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-205 border-slate-200 space-y-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-200/60 pb-2">
                    <Info size={14} className="text-primary-600" />
                    <span>Voyage Specs & Carrier Bonds</span>
                  </h4>

                  <div className="space-y-3.5 text-xs text-slate-600">
                    <div>
                      <span className="text-[10px] text-slate-400 font-black block">Cargo Declared Content</span>
                      <span className="font-semibold text-slate-800 leading-relaxed block mt-0.5">{job?.cargo_description}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div>
                        <span className="text-[10px] text-slate-400 font-black block">Maritime Carrier</span>
                        <span className="font-bold text-slate-800">{job?.shipping_line}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-black block">Vessel Flag / Voyage</span>
                        <span className="font-bold text-slate-800">{job?.vessel_name} • {job?.voyage_no}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-black block">Port of Loading</span>
                        <span className="font-bold text-slate-800">{job?.port_of_loading}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-black block">Port of Discharge</span>
                        <span className="font-bold text-slate-800">{job?.port_of_discharge}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-black block">Harmonized HS Code</span>
                        <span className="font-extrabold text-slate-850 font-mono text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded inline-block mt-0.5">{job?.hs_code}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-black block">Cargo Gross Weight</span>
                        <span className="font-bold text-slate-800 font-mono">{job?.gross_weight_kg?.toLocaleString()} kg</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 8 fee Summary widget */}
                <div>
                  <FeeSummaryWidget
                    duty={job?.total_duty_ngn ? parseFloat(job.total_duty_ngn) : computedDutyNgn}
                    demurrage={demurrageTotal}
                    terminal={tdoFee}
                    haulage={agreedFee}
                    dutyPaid={job?.status !== 'paar_processing' && job?.status !== 'customs_assessment'}
                    demurragePaid={waiverSubmitted}
                    terminalPaid={tdoIssued}
                    haulagePaid={dispatched}
                  />
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: DOCUMENTS */}
          {activeTab === 'documents' && (
            <div className="space-y-6 animate-fade-in" id="documents-tab-pane">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <FolderLock className="text-primary-600" size={18} />
                <h3 className="font-bold text-xs text-slate-700 uppercase tracking-widest">S3 Encrypted Document Storage Vault</h3>
              </div>

              {/* S3 drag and drop workspace field */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleS3DocUpload(e.dataTransfer.files[0]);
                  }
                }}
                className={`p-8 border-2 border-dashed rounded-2xl text-center space-y-4 transition-all ${
                  isDragOver ? 'border-primary-500 bg-primary-50/45' : 'border-slate-300 bg-slate-50/50'
                }`}
              >
                <div className="max-w-xs mx-auto space-y-2">
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 mx-auto">
                    <Download className="rotate-180 animate-bounce" size={18} />
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">Drop Consignment PDF Here</h4>
                  <p className="text-[10px] text-slate-401 text-slate-400 font-semibold leading-normal">
                    Drag and drop pre-signed customs certificates or bills of lading here to secure them inside the Amazon S3 container bucket.
                  </p>
                </div>

                {/* Manual Pick form */}
                <form onSubmit={handleManualUploadSubmit} className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <select
                    value={uploadClassification}
                    onChange={(e) => setUploadClassification(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 font-semibold cursor-pointer max-w-xs"
                  >
                    <option value="paar">Form M & PAAR Clearance</option>
                    <option value="bl">Maritime Bill of Lading (B/L)</option>
                    <option value="soncap">SONCAP Quality Certificate</option>
                    <option value="nafdac">NAFDAC Laboratory Clearance</option>
                    <option value="gatepass">Terminal Gate Access Pass</option>
                  </select>

                  <input
                    type="file"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedLocalFile(e.target.files[0]);
                      }
                    }}
                    className="text-xs text-slate-500 file:mr-2.5 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[10.5px] file:font-bold file:bg-primary-900 file:text-white file:cursor-pointer"
                  />

                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-primary-700 hover:bg-primary-900 text-white font-bold text-[10.5px] rounded-lg transition-colors cursor-pointer"
                  >
                    Upload File
                  </button>
                </form>
              </div>

              {/* List of files grouped by doc_type */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Stored Clearance Artifacts</h4>
                <div className="divide-y divide-slate-100">
                  {documents.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      No documents stored in AWS S3 vault containers.
                    </div>
                  ) : (
                    documents.map((doc) => (
                      <div key={doc.id} className="py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded bg-primary-50 text-primary-700 flex items-center justify-center">
                            <FileText size={16} />
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-800 block truncate">{doc.file_name}</span>
                            <span className="text-[9.5px] text-slate-400 font-black uppercase mt-0.5 block">
                              {doc.doc_type} • Uploaded by: {doc.uploaded_by_name || 'Verification Agent'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <a
                            href={doc.download_url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1 bg-slate-100 hover:bg-primary-50 text-slate-600 hover:text-primary-800 rounded-lg text-[10.5px] font-extrabold flex items-center gap-1 shrink-0 transition-all"
                          >
                            <Download size={12} />
                            <span>Download Bond/PDF</span>
                          </a>
                          
                          {/* Trash indicator for admins */}
                          {user?.role === 'senior_admin' && (
                            <button
                              onClick={() => handleDeleteDocument(doc.id, doc.file_name)}
                              className="p-1 px-2 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white rounded-lg transition-all text-xs cursor-pointer"
                              title="Delete from S3"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: INSTITUTIONAL COMPLIANCE */}
          {activeTab === 'compliance' && (
            <div className="space-y-6 animate-fade-in" id="compliance-tab-pane">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <FileCheck className="text-primary-600" size={18} />
                <h3 className="font-bold text-xs text-slate-705 text-slate-700 uppercase tracking-widest">Institutional Compliance & Form M Desk</h3>
              </div>

              {/* FORM M CRITICAL EXPIRY CARD */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-20Q border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-850 text-slate-800">CBN Form M Reference Record</span>
                    <span className={`px-2 py-0.5 rounded text-[9.5px] font-black uppercase border ${
                      formMStatus === 'registered' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                    }`}>
                      {formMStatus}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-normal font-medium">
                    The Form M acts as the mandatory commercial import authorization verified with the Central Bank of Nigeria. Expiry alignment determines freight gate release authorizations.
                  </p>

                  <div className="flex items-center gap-3 text-xs pt-1">
                    <span className="font-bold text-slate-600">Form M Expiry:</span>
                    <input
                      type="date"
                      value={formMExpiry}
                      onChange={(e) => setFormMExpiry(e.target.value)}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-800 font-bold"
                    />
                  </div>
                </div>

                {/* Date alarm banner if is < 14 days out */}
                <div className="flex items-center justify-center">
                  {isFormMAlarmOn ? (
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-500/10 flex flex-col justify-center items-center text-center space-y-2">
                      <ShieldAlert className="text-amber-600 animate-pulse" size={24} />
                      <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider block">Expiry Warning</span>
                      <p className="text-[9.5px] text-amber-600 font-medium max-w-[160px]">
                        This Form M expiry is less than 14 days out! Expedite duty assessment immediately.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-100 rounded-xl text-center flex flex-col justify-center items-center text-slate-400">
                      <CheckCircle className="text-emerald-500" size={24} />
                      <span className="text-[9.5px] font-bold uppercase tracking-wider block pt-1 text-slate-600">Verification Safe</span>
                      <span className="text-[9px] font-medium leading-relaxed block max-w-[150px] mt-0.5">Form M coverage complies fully with customs boundaries.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* AGENCY CARDS: SONCAP, NAFDAC, NAQS, DPR */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-4">Quality & Standards Agency Clearances</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* SONCAP */}
                  <div className="bg-white p-4 rounded-xl border border-slate-205 border-slate-200 space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-extrabold text-slate-800">SONCAP (Standards Organisation)</span>
                        <select
                          value={soncapStatus}
                          onChange={(e: any) => setSoncapStatus(e.target.value)}
                          className="text-[10px] bg-slate-50 border border-slate-205 border-slate-200 rounded-md font-bold text-slate-700 px-1.5 py-0.5 cursor-pointer focus:outline-none"
                        >
                          <option value="certified">Certified</option>
                          <option value="pending">Pending vetting</option>
                          <option value="exempt">Exempt cargo</option>
                        </select>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-normal">Standards Organisation of Nigeria compliance verifying container safety and quality.</p>
                    </div>
                    
                    <div className="pt-2 border-t border-slate-50 flex justify-between items-center">
                      <span className="text-[9px] text-slate-400 font-mono font-bold">Standard Form A/C</span>
                      <button
                        onClick={() => {
                          setUploadClassification('soncap');
                          setActiveTab('documents');
                        }}
                        className="px-3 py-1 bg-primary-100 hover:bg-primary-200 text-primary-700 font-bold text-[9.5px] rounded-md transition-colors cursor-pointer"
                      >
                        Upload SONCAP
                      </button>
                    </div>
                  </div>

                  {/* NAFDAC */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-extrabold text-slate-800">NAFDAC Clearance (Agro-Chemicals)</span>
                        <select
                          value={nafdacStatus}
                          onChange={(e: any) => setNafdacStatus(e.target.value)}
                          className="text-[10px] bg-slate-50 border border-slate-200 rounded-md font-bold text-slate-700 px-1.5 py-0.5 cursor-pointer focus:outline-none"
                        >
                          <option value="na">Not Required (N/A)</option>
                          <option value="pending">Vetting Required</option>
                          <option value="approved">Cleared Approvals</option>
                        </select>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-normal">Food, drug, and chemical administration checks verified on chemical or food materials.</p>
                    </div>
                    
                    <div className="pt-2 border-t border-slate-50 flex justify-between items-center">
                      <span className="text-[9px] text-slate-400 font-mono font-bold">Lab Vetting Code</span>
                      <button
                        onClick={() => {
                          setUploadClassification('nafdac');
                          setActiveTab('documents');
                        }}
                        className="px-3 py-1 bg-primary-100 hover:bg-primary-200 text-primary-700 font-bold text-[9.5px] rounded-md transition-colors cursor-pointer"
                        disabled={nafdacStatus === 'na'}
                      >
                        Upload Details
                      </button>
                    </div>
                  </div>

                  {/* NAQS */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-extrabold text-slate-800">NAQS (Quarantine Services)</span>
                        <select
                          value={naqsStatus}
                          onChange={(e: any) => setNaqsStatus(e.target.value)}
                          className="text-[10px] bg-slate-50 border border-slate-200 rounded-md font-bold text-slate-700 px-1.5 py-0.5 cursor-pointer"
                        >
                          <option value="na">N/A</option>
                          <option value="pending">Inspection Pending</option>
                          <option value="cleared">Fumigated & Cleared</option>
                        </select>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-normal">Agricultural Quarantine agency inspections checking wood pallets or agricultural components.</p>
                    </div>
                    
                    <div className="pt-2 border-t border-slate-50 flex justify-between items-center">
                      <span className="text-[9px] text-slate-400 font-mono font-bold">Biosecurity clearance</span>
                      <button
                        onClick={() => {
                          setUploadClassification('gatepass');
                          setActiveTab('documents');
                        }}
                        className="px-3 py-1 bg-primary-100 hover:bg-primary-200 text-primary-700 font-bold text-[9.5px] rounded-md transition-colors cursor-pointer"
                        disabled={naqsStatus === 'na'}
                      >
                        Upload Permit
                      </button>
                    </div>
                  </div>

                  {/* DPR */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-extrabold text-slate-800">DPR (Petroleum Resources)</span>
                        <select
                          value={dprStatus}
                          onChange={(e: any) => setDprStatus(e.target.value)}
                          className="text-[10px] bg-slate-50 border border-slate-200 rounded-md font-bold text-slate-700 px-1.5 py-0.5 cursor-pointer"
                        >
                          <option value="na">N/A</option>
                          <option value="pending">Permit Pending</option>
                          <option value="certified">Certified</option>
                        </select>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-normal">Department of Petroleum Resources verification on fuel, chemicals, lubricants or industrial oil cargo.</p>
                    </div>
                    
                    <div className="pt-2 border-t border-slate-50 flex justify-between items-center">
                      <span className="text-[9px] text-slate-400 font-mono font-bold">Safety Class C Bond</span>
                      <button
                        onClick={() => {
                          setUploadClassification('nafdac');
                          setActiveTab('documents');
                        }}
                        className="px-3 py-1 bg-primary-100 hover:bg-primary-200 text-primary-700 font-bold text-[9.5px] rounded-md transition-colors cursor-pointer"
                        disabled={dprStatus === 'na'}
                      >
                        Upload Certificate
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DUTIES & Tariffs */}
          {activeTab === 'duties_fees' && (
            <div className="space-y-6 animate-fade-in" id="duties-tab-pane">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Calculator className="text-primary-600" size={18} />
                <h3 className="font-bold text-xs text-slate-705 text-slate-700 uppercase tracking-widest leading-none">Official Customs duty assessment</h3>
              </div>

              {/* Assessment inputs with live breakdown computation */}
              <form onSubmit={submitCustomsDutyForm} className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. CIF USD */}
                <div>
                  <label className="block text-xs font-bold text-slate-655 text-slate-600 mb-1">CIF Cargo Value (USD)</label>
                  <input
                    type="number"
                    value={cifUsd}
                    onChange={(e) => setCifUsd(parseInt(e.target.value) || 0)}
                    className="w-full px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none"
                  />
                  <p className="text-[9px] text-slate-400 mt-1">Cost, Insurance & Freight value in US Dollar denomination.</p>
                </div>

                {/* 2. CBN Exchange Rate */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-655 text-slate-600">CBN Exchange Rate (₦/USD)</label>
                    <button
                      type="button"
                      onClick={handleFetchCbnRate}
                      disabled={isCbnFetching}
                      className="text-[9px] text-primary-600 hover:text-primary-800 hover:underline font-black uppercase tracking-tight cursor-pointer"
                    >
                      {isCbnFetching ? 'Syncing...' : 'Fetch Live CBN Rate'}
                    </button>
                  </div>
                  <input
                    type="number"
                    value={cbnExchangeRate}
                    onChange={(e) => setCbnExchangeRate(parseInt(e.target.value) || 0)}
                    className="w-full px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 font-semibold"
                  />
                </div>

                {/* 3. CPC Code */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-0.5">CPC Code (Custom Procedure Code)</label>
                  <input
                    type="text"
                    value={cpcCode}
                    onChange={(e) => setCpcCode(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>

                {/* 4. Duty rate selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-655 text-slate-600 mb-0.5">Customs Tariff Rate %</label>
                  <select
                    value={dutyRatePct}
                    onChange={(e) => setDutyRatePct(parseFloat(e.target.value))}
                    className="w-full px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 font-bold"
                  >
                    <option value={0.05}>5% Standard General Capital Goods</option>
                    <option value={0.10}>10% Standard Commodities Levy</option>
                    <option value={0.20}>20% Special Industrial / Machinery</option>
                    <option value={0.35}>35% Special Protection/Luxury Tariff</option>
                  </select>
                </div>

                {/* Computed Breakdown Panel */}
                <div className="md:col-span-2 pt-2 border-t border-slate-200/80 mt-2">
                  <span className="text-[10px] text-slate-400 font-black block uppercase tracking-wider mb-2">Assessed Customs Duty Breakdown</span>
                  <div className="bg-white p-4 rounded-xl border border-slate-200/70 grid grid-cols-2 gap-4 text-xs font-bold text-slate-600">
                    <div>
                      <span>Equivalent NGN Value:</span>
                      <span className="block text-slate-900 font-mono text-xs pt-1">
                        ₦{(cifUsd * cbnExchangeRate).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span>Calculated Duty Amount:</span>
                      <span className="block text-primary-700 font-mono text-sm pt-0.5 leading-normal">
                        ₦{computedDutyNgn.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Submit Assessment trigger */}
                <div className="md:col-span-2 flex items-center justify-between pt-4 border-t border-slate-200/60">
                  <button
                    type="submit"
                    className="px-4.5 py-2.5 bg-primary-700 hover:bg-primary-900 text-white font-black text-xs rounded-xl shadow cursor-pointer transition-all"
                  >
                    Re-Calculate & Log Duty Assessment
                  </button>

                  {/* Manual administrative override Rebates (Senior Admin Only) */}
                  {user?.role === 'senior_admin' && (
                    <button
                      type="button"
                      onClick={authorizeOverrideAmount}
                      className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl shadow cursor-pointer flex items-center gap-1.5"
                    >
                      <ShieldCheck size={14} />
                      <span>Apply Admin Override Bye-pass</span>
                    </button>
                  )}
                </div>
              </form>

              {/* PAYMENT VERIFICATION FORM */}
              <form onSubmit={submitPaymentConfirm} className="p-5 border border-slate-200 rounded-2xl bg-slate-50/10 space-y-4">
                <div className="flex items-center gap-1">
                  <TrendingUp size={16} className="text-emerald-500" />
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest">Register payment confirmation</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">CBN Payment Reference No</label>
                    <input
                      type="text"
                      className="w-full px-3.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 font-semibold"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Paid Amount (₦)</label>
                    <input
                      type="number"
                      className="w-full px-3.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 font-mono"
                      value={payAmount}
                      onChange={(e) => setPayAmount(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="px-4.5 py-2 border border-emerald-500 bg-emerald-50 hover:bg-emerald-650 hover:bg-emerald-600 hover:text-white text-emerald-700 font-black text-xs rounded-xl transition-all cursor-pointer inline-block"
                >
                  Verify customs bank payment reference
                </button>
              </form>
            </div>
          )}

          {/* TAB 5: OPERATIONS & HAULAGEASSIGNMENT */}
          {activeTab === 'operations' && (
            <div className="space-y-6 animate-fade-in" id="operations-tab-pane">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Truck className="text-primary-600" size={18} />
                <h3 className="font-bold text-xs text-slate-705 text-slate-700 uppercase tracking-widest">Down-Country Haulage & TDO release</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 1. Terminal Delivery Order (TDO) Log */}
                <form onSubmit={submitTdoIssuance} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between items-center">
                    <span>1. Terminal Gate TDO Release</span>
                    {tdoIssued && (
                      <span className="text-[8.5px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md px-1.5 py-0.5 leading-none font-bold uppercase">Issued</span>
                    )}
                  </h4>

                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Terminal Name</label>
                      <input
                        type="text"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
                        value={tdoTerminal}
                        onChange={(e) => setTdoTerminal(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">TDO Reference ID</label>
                      <input
                        type="text"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900"
                        value={tdoRef}
                        onChange={(e) => setTdoRef(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Terminal Release Surcharge (₦)</label>
                      <input
                        type="number"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 font-mono"
                        value={tdoFee}
                        onChange={(e) => setTdoFee(parseInt(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-1.5 bg-primary-700 hover:bg-primary-900 text-white font-bold text-[10px] uppercase rounded-lg shadow-sm transition-colors cursor-pointer block text-center"
                  >
                    Log TDO Release Gatepass
                  </button>
                </form>

                {/* 2. Truck Drivers Haulage dispatch */}
                <form onSubmit={submitTruckDispatcher} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between items-center">
                    <span>2. Land Transport Broker</span>
                    {dispatched && (
                      <span className="text-[8.5px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md px-1.5 py-0.5 leading-none font-bold uppercase">En Route</span>
                    )}
                  </h4>

                  <div className="space-y-2.5 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Driver Name</label>
                        <input
                          type="text"
                          className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg"
                          value={driverName}
                          onChange={(e) => setDriverName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Driver Mobile Phone</label>
                        <input
                          type="text"
                          className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg"
                          value={driverPhone}
                          onChange={(e) => setDriverPhone(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Truck Plate No</label>
                        <input
                          type="text"
                          className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-mono font-bold"
                          value={truckPlate}
                          onChange={(e) => setTruckPlate(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Agreed Haulage Fee (₦)</label>
                        <input
                          type="number"
                          className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-mono"
                          value={agreedFee}
                          onChange={(e) => setAgreedFee(parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Delivery Destination Address</label>
                      <input
                        type="text"
                        className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg"
                        value={deliveryDest}
                        onChange={(e) => setDeliveryDest(e.target.value)}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-1.5 bg-primary-700 hover:bg-primary-900 text-white font-bold text-[10px] uppercase rounded-lg shadow-sm transition-colors cursor-pointer"
                  >
                    Authorize Highway Freight Dispatch
                  </button>
                </form>

              </div>

              {/* Red Channel Physical Joint Examination log */}
              {job?.channel === 'red' && (
                <div className="bg-rose-50/50 p-5 rounded-2xl border border-rose-300 space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="text-rose-600 animate-pulse" size={18} />
                    <span className="text-xs font-black text-rose-800 uppercase tracking-widest">Critical RED CHANNEL Cargo Examination</span>
                  </div>
                  <p className="text-[10.5px] text-rose-700 leading-normal font-medium">
                    This cargo manifest has been routed to the Red Channel regulatory protocol. Physical joint examination checks (NCS, SON, NAFDAC) are mandatory prior to de-stuffing.
                  </p>

                  <form onSubmit={submitPortExamination} className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-bold text-slate-650 text-slate-600">
                    <div>
                      <label className="block mb-1 text-slate-700" htmlFor="inspect_officer">Inspection Customs Officer</label>
                      <input
                        id="inspect_officer"
                        type="text"
                        className="w-full px-3 py-1.5 bg-white border border-slate-250 rounded-lg text-slate-900"
                        value={inspectOfficer}
                        onChange={(e) => setInspectOfficer(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-slate-700" htmlFor="inspect_shed">Customs Inspection Shed</label>
                      <input
                        id="inspect_shed"
                        type="text"
                        className="w-full px-3 py-1.5 bg-white border border-slate-250 rounded-lg text-slate-900"
                        value={inspectShed}
                        onChange={(e) => setInspectShed(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-slate-705 text-slate-705 text-slate-750 text-slate-700" htmlFor="inspect_outcome">Joint Examination Outcome</label>
                      <select
                        id="inspect_outcome"
                        value={inspectOutcome}
                        onChange={(e: any) => setInspectOutcome(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-250 rounded-lg text-slate-800 font-bold"
                      >
                        <option value="pending">Vetting Inspection</option>
                        <option value="passed">Examination Passed (Cleared)</option>
                        <option value="failed">Inspection failed (Missealing)</option>
                        <option value="misdescribed">Misdescribed goods flag</option>
                      </select>
                    </div>

                    <div className="md:col-span-3">
                      <label className="block mb-1 text-slate-700" htmlFor="inspect_notes">Physical joint assessment findings notes</label>
                      <textarea
                        id="inspect_notes"
                        rows={2}
                        className="w-full px-3 py-2 bg-white border border-slate-250 rounded-lg text-slate-900"
                        placeholder="Log notes about discrepancies, container temperature seals, packaging quality..."
                        value={inspectNotes}
                        onChange={(e) => setInspectNotes(e.target.value)}
                      />
                    </div>
                    
                    <button
                      type="submit"
                      className="px-4.5 py-2 bg-rose-600 hover:bg-rose-800 text-white font-black text-xs rounded-xl shadow cursor-pointer transition-all inline-block md:col-span-3 text-center"
                    >
                      Verify Port physical inspection outcomes
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: DEMURRAGE DESK */}
          {activeTab === 'demurrage' && (
            <div className="space-y-6 animate-fade-in" id="demurrage-tab-pane">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Clock className="text-primary-600" size={18} />
                <h3 className="font-bold text-xs text-slate-705 text-slate-700 uppercase tracking-widest">Shipping Line Demurrage & Waiver Appeal Desk</h3>
              </div>

              {/* Accruals Demurrage calculator */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-210 border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Demurrage Accrual Desk</h4>
                  
                  <div className="space-y-3 text-xs font-bold text-slate-600">
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span>Demurrage Free Period:</span>
                      <span className="text-slate-900">5 Days (Standard Agreement)</span>
                    </div>

                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                      <span>Elapsed Storage Days:</span>
                      <input
                        type="number"
                        className="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-slate-800 w-16 text-center font-mono font-bold"
                        value={elapsedDays}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setElapsedDays(val);
                          setDemurrageTotal(val * dailyRate);
                        }}
                      />
                    </div>

                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                      <span>Daily Line Charge Rate:</span>
                      <input
                        type="number"
                        className="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-slate-800 w-24 text-center font-mono font-bold"
                        value={dailyRate}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setDailyRate(val);
                          setDemurrageTotal(elapsedDays * val);
                        }}
                      />
                    </div>

                    <div className="flex justify-between py-1.5 text-rose-600">
                      <span>Demurrage Outstanding:</span>
                      <span className="font-mono font-extrabold">₦{demurrageTotal.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Waiver petition request */}
                <form onSubmit={handleWaiverSubmit} className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-wider">Demurrage Waiver Petition</h5>
                    <p className="text-[10px] text-slate-401 text-slate-400 leading-relaxed font-semibold">
                      If the container storage delays were triggered by customs server failures or joint inspection holdups, submit a rebate petition.
                    </p>
                    
                    <textarea
                      rows={2}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none"
                      placeholder="e.g. Server maintenance shutdown at customs port terminal database..."
                      value={waiverReason}
                      onChange={(e) => setWaiverReason(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-primary-700 hover:bg-primary-900 text-white font-bold text-[10px] uppercase rounded-lg shadow transition-colors cursor-pointer text-center"
                  >
                    Transmit storage rebate waiver petition
                  </button>
                </form>

              </div>
            </div>
          )}

          {/* TAB 7: SECURITY AUDIT ACTIVITY LOG */}
          {activeTab === 'activities' && (
            <div className="space-y-6 animate-fade-in" id="activities-tab-pane">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <CheckCircle className="text-primary-600" size={18} />
                <h3 className="font-bold text-xs text-slate-705 text-slate-700 uppercase tracking-widest leading-none">Chronological Security audit trail</h3>
              </div>

              <div className="space-y-4">
                <p className="text-[11px] text-slate-400 font-medium">
                  Verified trail traces customs document changes, staff assignments, and CBN payments secure registration.
                </p>

                <div className="relative border-l border-slate-200 pl-6 ml-2 space-y-6">
                  {activities.map((act) => (
                    <div key={act.id} className="relative">
                      {/* Timeline dot */}
                      <span className="absolute -left-[30px] top-0.5 w-3.5 h-3.5 rounded-full bg-primary-600 border-2 border-white shadow" />
                      
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{act.username}</span>
                          <span className="text-[10px] text-slate-400 font-mono font-bold">
                            {new Date(act.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-slate-650 text-slate-600 font-semibold">{act.action}</p>
                        
                        {act.old_value && act.old_value !== 'none' && (
                          <div className="inline-flex items-center gap-2 mt-1 bg-slate-50 p-1.5 rounded-md border border-slate-100 font-mono text-[9px]">
                            <span className="text-slate-400">Changed values:</span>
                            <span className="text-red-500 font-bold">{act.old_value}</span>
                            <span className="text-slate-300">→</span>
                            <span className="text-emerald-600 font-bold">{act.new_value}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
