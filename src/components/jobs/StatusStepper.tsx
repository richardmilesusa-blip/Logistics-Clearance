import React from 'react';
import { CheckCircle2, Circle, HelpCircle } from 'lucide-react';

interface StatusStepperProps {
  currentStatus: string;
}

export interface StepItem {
  id: string;
  label: string;
  description: string;
}

export const CLEARPATH_STAGES: StepItem[] = [
  { id: 'paar_processing', label: 'PAAR', description: 'Document vetting' },
  { id: 'customs_assessment', label: 'Duty Assessment', description: 'Tariffs cleared' },
  { id: 'examination_demurrage', label: 'Verification', description: 'Port inspection & storage' },
  { id: 'tdo_release', label: 'TDO Release', description: 'Gate release approved' },
  { id: 'in_transit', label: 'In Transit', description: 'Trucking to destination' },
  { id: 'delivered', label: 'Delivered', description: 'Warehouse arrived' },
];

export default function StatusStepper({ currentStatus }: StatusStepperProps) {
  const normStatus = (currentStatus || '').toLowerCase();

  // Find index of current status
  let currentIndex = CLEARPATH_STAGES.findIndex((stage) => stage.id === normStatus);
  if (currentIndex === -1) {
    // If exam is written slightly differently
    if (normStatus.includes('exam') || normStatus.includes('demurrage')) {
      currentIndex = 2; // examination_demurrage
    } else {
      currentIndex = 0; // Default to first step
    }
  }

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-xs" id="status-stepper-panel">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs font-bold text-slate-750 uppercase tracking-widest text-slate-700">Clearance Stepper Progress</h4>
        <span className="text-[10px] font-bold text-primary-700 uppercase bg-primary-50 px-2 py-0.5 rounded-md border border-primary-500/10">
          Stage {currentIndex + 1} of 6
        </span>
      </div>

      {/* Horizontal Steps Layout */}
      <div className="relative flex items-center justify-between w-full">
        {/* Background Connecting Line */}
        <div className="absolute left-[30px] right-[30px] top-[22px] h-0.5 bg-slate-100 -z-0" />
        {/* Progress Connecting Line */}
        <div 
          className="absolute left-[30px] top-[22px] h-0.5 bg-primary-600 -z-0 transition-all duration-500 ease-out"
          style={{ 
            width: `${Math.max(0, (currentIndex / (CLEARPATH_STAGES.length - 1)) * 90)}%` 
          }}
        />

        {CLEARPATH_STAGES.map((stage, idx) => {
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          const isFuture = idx > currentIndex;

          return (
            <div key={stage.id} className="relative flex flex-col items-center flex-1 z-10 text-center">
              {/* Stepper Dot */}
              <div 
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isCompleted 
                    ? 'bg-emerald-600 text-white border-4 border-white shadow-md shadow-emerald-600/10' 
                    : isCurrent 
                    ? 'bg-primary-600 text-white border-4 border-white shadow-lg ring-2 ring-primary-500/35' 
                    : 'bg-slate-50 text-slate-400 border-2 border-slate-200'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 size={18} className="stroke-[2.5]" />
                ) : (
                  <span className="text-xs font-black">{idx + 1}</span>
                )}
              </div>

              {/* Stepper Label */}
              <div className="mt-2.5 px-1.5">
                <span className={`text-[11px] font-bold block ${
                  isCurrent ? 'text-primary-800' : isCompleted ? 'text-slate-800' : 'text-slate-400'
                }`}>
                  {stage.label}
                </span>
                <span className="text-[9.5px] text-slate-400 font-medium block mt-0.5 max-w-[110px] mx-auto hidden md:block">
                  {stage.description}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
