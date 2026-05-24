import winston from 'winston';

const cbnLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

export interface CbnRateResult {
  rate: number;
  rateDate: string;
  source: 'cbn_auto' | 'manual';
}

/**
 * Feeds current daily USD to NGN exchange rates from Nigerian Central Bank.
 * Features automatic HTML regex extraction and safe environments fallback guards.
 */
export async function fetchCbnRate(): Promise<CbnRateResult> {
  const fallbackRateStr = process.env.FALLBACK_CBN_RATE || '1560.00';
  const fallbackRate = parseFloat(fallbackRateStr);
  const currentDateStr = new Date().toISOString().split('T')[0];

  try {
    cbnLogger.info('Querying official Central Bank of Nigeria exchange rates page...');
    
    // Add short timeout protection to keep the app highly responsive
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch('https://www.cbn.gov.ng/rates/ExchRates.asp', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'text/html'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`CBN returned secondary response status: ${response.status}`);
    }

    const htmlText = await response.text();

    // Parse CBN HTML table search for USD row or regex matching rates
    // Typical cell format: <td>US DOLLAR</td><td>1560.2500</td>
    const usdRegex = /US\s+DOLLAR.*?<td>([\d,.]+?)<\/td>/is;
    const match = htmlText.match(usdRegex);

    if (match && match[1]) {
      const parsedRate = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(parsedRate) && parsedRate > 0) {
        cbnLogger.info('Successfully automatically scraped USD Exchange Rate from CBN feeds.', { rate: parsedRate });
        return {
          rate: parsedRate,
          rateDate: currentDateStr,
          source: 'cbn_auto'
        };
      }
    }

    throw new Error('Could not identify valid USD conversion rows inside scraped CBN rate page.');
  } catch (error: any) {
    cbnLogger.warn('Failed to dynamically fetch rate from CBN rates service. Reverting to manual/fallback configurations.', {
      errorMessage: error.message
    });

    // Provide automatic recovery fallback rate rather than completely breaking clients
    return {
      rate: fallbackRate,
      rateDate: currentDateStr,
      source: 'manual'
    };
  }
}
