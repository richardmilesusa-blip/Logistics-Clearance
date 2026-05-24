export interface DutyCalculationInput {
  cifValueUsd: number;
  exchangeRate: number;
  dutyRatePct: number;
  etlsLevyNgn?: number;
}

export interface DutyCalculationResult {
  cifValueNgn: number;
  dutyAmountNgn: number;
  vatAmountNgn: number;
  cissLevyNgn: number;
  etlsLevyNgn: number;
  totalDutyNgn: number;
}

/**
 * Calculates Nigerian Customs Duty and associated levies.
 * All amounts are computed in NGN and rounded to 2 decimal places.
 */
export function calculateDuty(input: DutyCalculationInput): DutyCalculationResult {
  const { cifValueUsd, exchangeRate, dutyRatePct, etlsLevyNgn = 0 } = input;

  if (cifValueUsd <= 0) {
    throw new Error('CIF Value in USD must be a positive value greater than zero.');
  }

  if (exchangeRate <= 0) {
    throw new Error('Exchange rate must be a positive value greater than zero.');
  }

  if (dutyRatePct < 0) {
    throw new Error('Duty rate percentage cannot be negative.');
  }

  if (etlsLevyNgn < 0) {
    throw new Error('ETLS Levy in NGN cannot be negative.');
  }

  // 1. Convert CIF to NGN
  const cifValueNgn = Math.round((cifValueUsd * exchangeRate) * 100) / 100;

  // 2. Base Customs Import Duty (Surface Duty) = CIF NGN * Duty Rate
  const dutyAmountNgn = Math.round((cifValueNgn * dutyRatePct) * 100) / 100;

  // 3. VAT (Value Added Tax) in Nigeria = 7.5% of surface duty
  const vatAmountNgn = Math.round((dutyAmountNgn * 0.075) * 100) / 100;

  // 4. CISS (Comprehensive Import Supervision Scheme) Levy = 1% of CIF NGN
  const cissLevyNgn = Math.round((cifValueNgn * 0.01) * 100) / 100;

  // 5. ETLS (ECOWAS Trade Liberalization Scheme) Levy = explicitly passed levy rate or 0
  const etlsLevyValue = Math.round(etlsLevyNgn * 100) / 100;

  // 6. Total Duties and Levies aggregate
  const totalDutyNgn = Math.round((dutyAmountNgn + vatAmountNgn + cissLevyNgn + etlsLevyValue) * 100) / 100;

  return {
    cifValueNgn,
    dutyAmountNgn,
    vatAmountNgn,
    cissLevyNgn,
    etlsLevyNgn: etlsLevyValue,
    totalDutyNgn
  };
}
