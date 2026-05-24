import React, { useState, useEffect } from 'react';
import { apiClient } from '../../lib/apiClient';
import { 
  Users, 
  Mail, 
  Phone, 
  Plus, 
  X, 
  Building, 
  Calendar, 
  ShieldCheck, 
  Activity, 
  FileText, 
  MapPin, 
  ArrowRight,
  Info
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Client {
  id: string;
  name: string;
  type: 'corporate' | 'individual';
  tin: string | null;
  cac_reg_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: 'active' | 'suspended';
  created_at: string;
  active_job_count: number;
}

interface AssociatedJob {
  id: string;
  job_ref: string;
  container_no: string | null;
  status: string;
  date_received: string | null;
  created_at: string;
}

export default function ClientsPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Drawer slider controls
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [associatedJobs, setAssociatedJobs] = useState<AssociatedJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'corporate' | 'individual'>('corporate');
  const [formTin, setFormTin] = useState('');
  const [formCac, setFormCac] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formStatus, setFormStatus] = useState<'active' | 'suspended'>('active');
  
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Fetch clients from backend database
  const fetchClients = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/clients');
      if (res.data && res.data.success) {
        setClients(res.data.data);
      }
    } catch (err) {
      console.error('Failed to retrieve clients list:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  // Fetch associated jobs when editing client
  const fetchClientJobs = async (clientId: string) => {
    setJobsLoading(true);
    setAssociatedJobs([]);
    try {
      const res = await apiClient.get(`/api/clients/${clientId}/jobs`);
      if (res.data && res.data.success) {
        setAssociatedJobs(res.data.data);
      }
    } catch (err) {
      console.error('Failed to retrieve client jobs:', err);
    } finally {
      setJobsLoading(false);
    }
  };

  // Open the slide-over for "Add Client"
  const handleOpenAddPanel = () => {
    setSelectedClient(null);
    setFormName('');
    setFormType('corporate');
    setFormTin('');
    setFormCac('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormStatus('active');
    setAssociatedJobs([]);
    setFormError('');
    setIsPanelOpen(true);
  };

  // Open the slide-over for "Edit Client"
  const handleOpenEditPanel = (client: Client) => {
    setSelectedClient(client);
    setFormName(client.name);
    setFormType(client.type || 'corporate');
    setFormTin(client.tin || '');
    setFormCac(client.cac_reg_number || '');
    setFormPhone(client.phone || '');
    setFormEmail(client.email || '');
    setFormAddress(client.address || '');
    setFormStatus(client.status || 'active');
    setFormError('');
    setIsPanelOpen(true);
    fetchClientJobs(client.id);
  };

  // Submit Handler for Add / Edit
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Company or Individual client name is required.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    const payload = {
      name: formName,
      type: formType,
      tin: formTin || null,
      cac_reg_number: formCac || null,
      phone: formPhone || null,
      email: formEmail || null,
      address: formAddress || null,
      status: formStatus
    };

    try {
      if (selectedClient) {
        // Edit Mode
        const res = await apiClient.put(`/api/clients/${selectedClient.id}`, payload);
        if (res.data && res.data.success) {
          setIsPanelOpen(false);
          fetchClients();
        }
      } else {
        // Add Mode
        const res = await apiClient.post('/api/clients', payload);
        if (res.data && res.data.success) {
          setIsPanelOpen(false);
          fetchClients();
        }
      }
    } catch (err: any) {
      console.error('Failed saving client information:', err);
      setFormError(err.response?.data?.error?.message || 'Failure processing client configuration.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-slate-400 font-bold tracking-widest uppercase">Opening Importer Registry...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="clients-view-panel">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Institutional Importers Registry</h2>
          <p className="text-xs text-slate-400 font-medium">Configure corporate TIN numbers, CAC filings, and active customs clearing jobs.</p>
        </div>
        <button
          onClick={handleOpenAddPanel}
          className="px-4 py-2 bg-primary-700 hover:bg-primary-950 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-colors flex items-center justify-center gap-1.5"
          id="btn-add-client"
        >
          <Plus size={16} />
          <span>Register New Importer</span>
        </button>
      </div>

      {/* Main clients list table */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-500" id="clients-registry-table">
            <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">Client Name</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">TIN Number</th>
                <th className="px-5 py-3">CAC Number</th>
                <th className="px-5 py-3">Active Shipments</th>
                <th className="px-5 py-3">Created Date</th>
                <th className="px-5 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-450 uppercase font-black tracking-widest text-[10px]">
                    No customs importer records filed.
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr 
                    key={client.id}
                    onClick={() => handleOpenEditPanel(client)}
                    className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5 font-bold text-slate-900">{client.name}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        client.type === 'corporate' 
                          ? 'bg-blue-100 text-blue-650' 
                          : 'bg-indigo-100 text-indigo-650'
                      }`}>
                        {client.type || 'corporate'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-650">{client.tin || 'N/A'}</td>
                    <td className="px-5 py-3.5 font-mono text-slate-650">{client.cac_reg_number || 'N/A'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 font-extrabold ${
                        client.active_job_count > 0 ? 'text-primary-700' : 'text-slate-400'
                      }`}>
                        <Activity size={12} className={client.active_job_count > 0 ? 'animate-pulse' : ''} />
                        <span>{client.active_job_count} active</span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-400 font-sans">
                      {client.created_at ? new Date(client.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                        client.status === 'active' ? 'bg-success-100 text-success-600' : 'bg-danger-100 text-danger-500'
                      }`}>
                        {client.status || 'active'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over custom drawer panel overlay */}
      {isPanelOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" id="clients-slide-over-backdrop">
          {/* Gray blur overlay */}
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsPanelOpen(false)}
          />

          <div className="absolute inset-y-0 right-0 max-w-lg w-full bg-white shadow-2xl flex flex-col justify-between" id="client-drawer-container">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Building className="text-primary-500" size={18} />
                <h3 className="font-bold text-sm text-primary-900 uppercase tracking-wider">
                  {selectedClient ? 'Edit Importer Profile' : 'Register New Importer'}
                </h3>
              </div>
              <button 
                onClick={() => setIsPanelOpen(false)}
                className="p-1 rounded-full text-slate-450 hover:bg-slate-200/60 text-slate-500 transition-colors cursor-pointer"
                title="Dismiss panel"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
              <form onSubmit={handleFormSubmit} className="space-y-4" id="client-editor-form">
                
                {/* 1. Importer Name */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider text-slate-400">Importer full Name</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Aliko Solutions Ltd"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>

                {/* 2. Client type Radio option block */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider text-slate-400 block">Registration Category</label>
                  <div className="flex gap-4 pt-1">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="client_type"
                        checked={formType === 'corporate'}
                        onChange={() => setFormType('corporate')}
                        className="rounded-full text-primary-500"
                      />
                      <span>Corporate Company Brokerage</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="client_type"
                        checked={formType === 'individual'}
                        onChange={() => setFormType('individual')}
                        className="rounded-full text-primary-500"
                      />
                      <span>Individual Consul Importer</span>
                    </label>
                  </div>
                </div>

                {/* 3. TIN & CAC Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider text-slate-400">Custom TIN Number</label>
                    <input
                      type="text"
                      value={formTin}
                      onChange={(e) => setFormTin(e.target.value)}
                      placeholder="TIN-7493201"
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-700 bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider text-slate-400">CAC filing No</label>
                    <input
                      type="text"
                      value={formCac}
                      onChange={(e) => setFormCac(e.target.value)}
                      placeholder="RC-2938102"
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-700 bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      disabled={formType === 'individual'}
                    />
                  </div>
                </div>

                {/* 4. Contact Coordinates */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider text-slate-400 flex items-center gap-1">
                      <Phone size={10} />
                      <span>Phone Line</span>
                    </label>
                    <input
                      type="text"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      placeholder="+234 803 111 2222"
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider text-slate-400 flex items-center gap-1">
                      <Mail size={10} />
                      <span>Email address</span>
                    </label>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="importer@aliko.com"
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                </div>

                {/* 5. Address */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider text-slate-400 flex items-center gap-1">
                    <MapPin size={10} />
                    <span>Physical Address</span>
                  </label>
                  <textarea
                    rows={2}
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    placeholder="22 Alfred Rewane Road, Ikoyi, Lagos"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>

                {/* 6. Profile Status (Visible only in Edit mode) */}
                {selectedClient && (
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-450 tracking-wider text-slate-400">Account compliance State</label>
                    <select
                      value={formStatus}
                      onChange={(e: any) => setFormStatus(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 bg-slate-50/50 rounded-lg text-xs font-bold text-slate-700"
                    >
                      <option value="active">Verified Compliant (Active)</option>
                      <option value="suspended">Suspended Verification Required</option>
                    </select>
                  </div>
                )}

                {formError && (
                  <div className="p-3 bg-danger-50 border border-danger-550/10 rounded-xl text-center text-[11px] font-bold text-danger-500 leading-normal flex items-center gap-1 justify-center">
                    <Info size={13} />
                    <span>{formError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 bg-primary-700 hover:bg-primary-950 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50"
                  id="client-drawer-save-btn"
                >
                  {submitting ? 'Updating record...' : selectedClient ? 'Update Importer profile' : 'Register Importer Profile'}
                </button>
              </form>

              {/* LIST OF ASSOCIATED JOBS (Only visible when editing a client) */}
              {selectedClient && (
                <div className="pt-6 border-t border-slate-150/70 space-y-3.5">
                  <div className="space-y-0.5">
                    <h4 className="font-extrabold text-xs uppercase text-slate-900 tracking-wider flex items-center gap-1">
                      <FileText size={14} className="text-slate-400" />
                      <span>Associated Consignments ({associatedJobs.length})</span>
                    </h4>
                    <p className="text-[10px] text-slate-400 font-medium">Clearance jobs logged for {selectedClient.name} across Nigerian ports</p>
                  </div>

                  <div className="space-y-2">
                    {jobsLoading ? (
                      <div className="p-4 text-center text-xs text-slate-400 uppercase font-semibold">
                        Scanning shipping workflows...
                      </div>
                    ) : associatedJobs.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                        No consignments logged under this account.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 border border-slate-200/65 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                        {associatedJobs.map((job) => (
                          <div 
                            key={job.id} 
                            onClick={() => {
                              setIsPanelOpen(false);
                              navigate(`/jobs/${job.id}`);
                            }}
                            className="p-3 hover:bg-slate-50 transition-colors flex items-center justify-between gap-2.5 cursor-pointer text-left"
                          >
                            <div className="min-w-0">
                              <span className="text-xs font-extrabold text-primary-900 block">{job.job_ref}</span>
                              <span className="text-[10px] text-slate-400 block font-mono">Cont: {job.container_no || 'TBA'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                {job.status.replace(/_/g, ' ')}
                              </span>
                              <ArrowRight size={13} className="text-slate-300" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
