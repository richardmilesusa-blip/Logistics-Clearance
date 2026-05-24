import React from 'react';

export type JobStatus =
  | 'paar_processing'
  | 'customs_assessment'
  | 'examination_demurrage'
  | 'tdo_release'
  | 'in_transit'
  | 'delivered'
  | 'cancelled';

interface StatusBadgeProps {
  status: JobStatus | string;
}

export const STATUS_LABELS: Record<string, string> = {
  paar_processing: 'PAAR Processing',
  customs_assessment: 'Customs Assessment',
  examination_demurrage: 'Examination & Demurrage',
  tdo_release: 'TDO Release',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const normStatus = (status || '').toLowerCase();
  
  let classes = 'bg-slate-100 text-slate-705 border border-slate-200';
  
  switch (normStatus) {
    case 'paar_processing':
      classes = 'bg-blue-50 text-blue-700 border border-blue-200';
      break;
    case 'customs_assessment':
      classes = 'bg-indigo-50 text-indigo-700 border border-indigo-200';
      break;
    case 'examination_demurrage':
      classes = 'bg-amber-50 text-amber-700 border border-amber-200';
      break;
    case 'tdo_release':
      classes = 'bg-purple-50 text-purple-700 border border-purple-200';
      break;
    case 'in_transit':
      classes = 'bg-sky-50 text-sky-700 border border-sky-200';
      break;
    case 'delivered':
      classes = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      break;
    case 'cancelled':
      classes = 'bg-rose-50 text-rose-700 border border-rose-200';
      break;
  }

  const label = STATUS_LABELS[normStatus] || status || 'Unknown';

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider leading-none shadow-xs ${classes}`}>
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 currentColor shrink-0" style={{ backgroundColor: 'currentColor' }} />
      {label}
    </span>
  );
}
