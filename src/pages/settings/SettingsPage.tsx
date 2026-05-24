import { useAuthStore } from '../../store/authStore';
import { ShieldCheck, User, Mail, ShieldAlert, Award } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuthStore();

  const getRoleBadgeClasses = (role: string) => {
    switch (role) {
      case 'senior_admin':
        return 'bg-danger-100 text-danger-500 border border-danger-500/10';
      case 'customs_broker':
        return 'bg-accent-100 text-accent-500 border border-accent-500/10';
      case 'freight_forwarder':
        return 'bg-primary-50 text-primary-700 border border-primary-500/10';
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6" id="settings-view-panel">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Institutional Account Settings</h2>
        <p className="text-xs text-slate-400 font-medium">Manage security details, credentials and role permissions</p>
      </div>

      {user && (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden divide-y divide-slate-100">
          
          <div className="p-5 md:p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-primary-900 border border-slate-200 shadow-sm font-extrabold text-lg">
                <User size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 leading-none">{user.full_name}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded font-extrabold inline-block mt-1.5 ${getRoleBadgeClasses(user.role)}`}>
                  {user.role.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 md:p-6 space-y-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Credential Specifications</h4>
            
            <div className="grid grid-cols-1 gap-4 text-xs font-medium text-slate-600">
              <div className="flex items-center justify-between py-2 border-b border-slate-50">
                <div className="flex items-center gap-2">
                  <Mail size={15} className="text-slate-400" />
                  <span>Institutional Email:</span>
                </div>
                <span className="font-bold text-slate-950 truncate max-w-[200px]">{user.email}</span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-50">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={15} className="text-slate-400" />
                  <span>Logistics Authorization:</span>
                </div>
                <span className="text-success-500 font-extrabold">Active Status Granted</span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-50">
                <div className="flex items-center gap-2">
                  <Award size={15} className="text-slate-400" />
                  <span>RBAC Privileges Level:</span>
                </div>
                <span className="font-mono text-[10.5px] font-bold text-slate-800 uppercase bg-slate-100 px-2 py-0.5 rounded">
                  {user.role}
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 bg-slate-50/50 flex items-center gap-2.5">
            <ShieldAlert className="text-accent-500 shrink-0" size={16} />
            <p className="text-[10.5px] text-slate-500 font-medium leading-relaxed">
              If an administrative credentials revision or organization reallocation is mandated, please summon a System Supervisor to log the adjustments securely.
            </p>
          </div>

        </div>
      )}
    </div>
  );
}
