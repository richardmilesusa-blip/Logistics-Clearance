import React from 'react';
import { Landmark, ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';

export interface FeeLine {
  name: string;
  amount: number;
  status: 'paid' | 'outstanding';
  category: string;
}

interface FeeSummaryWidgetProps {
  fees?: FeeLine[];
  // Fallbacks if parents supply direct values
  duty?: number;
  demurrage?: number;
  terminal?: number;
  haulage?: number;
  inspection?: number;
  soncap?: number;
  agency?: number;
  misc?: number;
  
  // Outstanding states
  dutyPaid?: boolean;
  demurragePaid?: boolean;
  terminalPaid?: boolean;
  haulagePaid?: boolean;
  inspectionPaid?: boolean;
  soncapPaid?: boolean;
  agencyPaid?: boolean;
  miscPaid?: boolean;
}

export default function FeeSummaryWidget({
  fees,
  duty = 2450000,
  demurrage = 450000,
  terminal = 120000,
  haulage = 350000,
  inspection = 35000,
  soncap = 85000,
  agency = 150000,
  misc = 40000,
  
  dutyPaid = true,
  demurragePaid = false,
  terminalPaid = false,
  haulagePaid = false,
  inspectionPaid = true,
  soncapPaid = true,
  agencyPaid = false,
  miscPaid = false,
}: FeeSummaryWidgetProps) {
  
  // Resolve fee lines into a clean array of 8 components
  const resolvedFees: FeeLine[] = fees || [
    { name: 'Customs Import Duty', amount: duty, status: dutyPaid ? 'paid' : 'outstanding', category: 'Government' },
    { name: 'Shipping Line Demurrage', amount: demurrage, status: demurragePaid ? 'paid' : 'outstanding', category: 'Shipping Line' },
    { name: 'Terminal Handling (TDO)', amount: terminal, status: terminalPaid ? 'paid' : 'outstanding', category: 'Terminal' },
    { name: 'Down-Country Haulage Dispatch', amount: haulage, status: haulagePaid ? 'paid' : 'outstanding', category: 'Logistics' },
    { name: 'Joint Inspection & Exam Fee', amount: inspection, status: inspectionPaid ? 'paid' : 'outstanding', category: 'Customs' },
    { name: 'SONCAP Quality Certification', amount: soncap, status: soncapPaid ? 'paid' : 'outstanding', category: 'Compliance' },
    { name: 'Customs Brokerage Agency Fee', amount: agency, status: agencyPaid ? 'paid' : 'outstanding', category: 'Brokerage' },
    { name: 'Institutional Misc/Admin Levy', amount: misc, status: miscPaid ? 'paid' : 'outstanding', category: 'Miscellaneous' },
  ];

  const grandTotal = resolvedFees.reduce((sum, f) => sum + f.amount, 0);
  const totalPaid = resolvedFees.filter(f => f.status === 'paid').reduce((sum, f) => sum + f.amount, 0);
  const totalOutstanding = grandTotal - totalPaid;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-xs overflow-hidden" id="fee-summary-widget">
      {/* Widget Header */}
      <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="text-primary-600 w-4 h-4" />
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Fee Reconciliations Ledger</h4>
        </div>
        <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">8 Component Audit</span>
      </div>

      {/* Grid for Quick Financial Sums */}
      <div className="grid grid-cols-3 divide-x divide-slate-105 border-b border-slate-100 bg-slate-50/20 text-center py-2.5">
        <div>
          <span className="text-[9px] text-slate-400 font-bold uppercase block tracking-wider">Grand Total</span>
          <span className="text-xs font-extrabold text-slate-900 font-mono">
            ₦{grandTotal.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div>
          <span className="text-[9px] text-slate-400 font-bold uppercase block tracking-wider text-emerald-600">Reconciled</span>
          <span className="text-xs font-extrabold text-emerald-600 font-mono">
            ₦{totalPaid.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div>
          <span className="text-[9px] text-slate-400 font-bold uppercase block tracking-wider text-amber-600">Pending</span>
          <span className="text-xs font-extrabold text-amber-600 font-mono">
            ₦{totalOutstanding.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Fee Items List */}
      <div className="p-4 space-y-2 max-h-[320px] overflow-y-auto">
        {resolvedFees.map((fee, idx) => (
          <div 
            key={idx} 
            className="flex items-center justify-between py-2 px-3 hover:bg-slate-50 rounded-xl transition-all border border-slate-50"
          >
            <div className="space-y-0.5 min-w-0 pr-2">
              <span className="text-[11px] font-bold text-slate-800 block truncate">{fee.name}</span>
              <span className="text-[9px] text-slate-400 font-bold uppercase block">{fee.category}</span>
            </div>
            
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-xs font-mono font-bold text-slate-900">
                ₦{fee.amount.toLocaleString('en-NG')}
              </span>
              
              {fee.status === 'paid' ? (
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[9px] font-bold uppercase border border-emerald-100">
                  <CheckCircle2 size={10} className="stroke-[3]" />
                  <span>Paid</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[9px] font-bold uppercase border border-amber-100">
                  <AlertCircle size={10} className="stroke-[3]" />
                  <span>Pending</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Summary Footer Warning */}
      <div className="p-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
        <span className="font-semibold select-none">Consignment clearance gatepass release block status:</span>
        <span className={totalOutstanding > 0 ? 'text-amber-600 font-black uppercase' : 'text-emerald-600 font-black uppercase'}>
          {totalOutstanding > 0 ? '⛔ Locked on unpaid fees' : '✅ Clear for release'}
        </span>
      </div>
    </div>
  );
}
