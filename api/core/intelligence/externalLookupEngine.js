/**
 * externalLookupEngine.js
 * Phase 4: Dual Hierarchy Truth Validation
 * 
 * Purpose: Fetch and validate information from external sources
 * Automatic triggers: freshness markers, high-stakes domains, low confidence
 * Graceful degradation: disclose failure, provide internal answer, give verification path
 * 
 * Location: /api/core/intelligence/externalLookupEngine.js
 */

/* global fetch, AbortController */

import { detectTruthType, TRUTH_TYPES } from './truthTypeDetector.js';
import { get as cacheGet, set as cacheSet } from './ttlCacheManager.js';

// External lookup configuration
export const LOOKUP_CONFIG = {
  MAX_SOURCES_PER_QUERY: 3,
  MAX_FETCHED_TEXT: 15000,
  MAX_LOOKUPS_PER_REQUEST: 1,
  HIGH_STAKES_MAX_LOOKUPS: 2,
  TIMEOUT_MS: 5000,
  CONFIDENCE_THRESHOLD: 0.70
};

// Company name → stock ticker map for Yahoo Finance lookups
const COMPANY_TICKER_MAP = {
  'walmart': 'WMT', 'wal-mart': 'WMT',
  'apple': 'AAPL',
  'google': 'GOOGL', 'alphabet': 'GOOGL',
  'microsoft': 'MSFT',
  'amazon': 'AMZN',
  'tesla': 'TSLA',
  'meta': 'META', 'facebook': 'META',
  'netflix': 'NFLX',
  'nvidia': 'NVDA',
  'amd': 'AMD',
  'intel': 'INTC',
  'disney': 'DIS',
  'nike': 'NKE',
  'coca-cola': 'KO', 'coke': 'KO',
  'pepsi': 'PEP', 'pepsico': 'PEP',
  'exxon': 'XOM', 'exxonmobil': 'XOM',
  'jpmorgan': 'JPM', 'jp morgan': 'JPM',
  'bank of america': 'BAC',
  'wells fargo': 'WFC',
  'visa': 'V',
  'mastercard': 'MA',
  'paypal': 'PYPL',
  'uber': 'UBER',
  'lyft': 'LYFT',
  'airbnb': 'ABNB',
  'spotify': 'SPOT',
  'snap': 'SNAP', 'snapchat': 'SNAP',
  'palantir': 'PLTR',
  'salesforce': 'CRM',
  'oracle': 'ORCL',
  'ibm': 'IBM',
  'qualcomm': 'QCOM',
  'broadcom': 'AVGO',
  'boeing': 'BA',
  'ford': 'F',
  'general motors': 'GM',
  'caterpillar': 'CAT',
  'home depot': 'HD',
  'target': 'TGT',
  'costco': 'COST',
  'starbucks': 'SBUX',
  "mcdonald's": 'MCD', 'mcdonalds': 'MCD',
  'chevron': 'CVX',
  'pfizer': 'PFE',
  'moderna': 'MRNA',
  'merck': 'MRK',
  'unitedhealth': 'UNH',
  'ups': 'UPS',
  'fedex': 'FDX'
};

/**
 * Extract stock ticker symbol from a user query.
 * Maps common company names to tickers; also looks for explicit uppercase tickers
 * adjacent to financial keywords. Avoids false positives from abbreviations like USA, CEO.
 * @param {string} query
 * @returns {string|null} Ticker symbol (e.g. 'AAPL') or null if not found
 */
function extractTicker(query) {
  const lower = query.toLowerCase();
  // Multi-word company names must be checked before single-word names to avoid partial matches
  const sortedEntries = Object.entries(COMPANY_TICKER_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [name, ticker] of sortedEntries) {
    if (lower.includes(name)) return ticker;
  }
  // Look for explicit uppercase ticker (2-5 chars) adjacent to stock-related financial keywords
  const tickerNearStock = query.match(/\b([A-Z]{2,5})\b[\s\w]{0,30}\b(?:stock|share|price|equity)\b/);
  if (tickerNearStock) return tickerNearStock[1];
  // Reverse: stock keyword before ticker (e.g. "stock price AAPL")
  const stockNearTicker = query.match(/\b(?:stock|share|price|equity)\b[\s\w]{0,30}\b([A-Z]{2,5})\b/);
  if (stockNearTicker) return stockNearTicker[1];
  return null;
}

// WMO weather interpretation codes for Open-Meteo responses
const WMO_WEATHER_CODES = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Slight showers', 81: 'Moderate showers', 82: 'Violent showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail'
};

// API-based sources with proper parsing (returns structured data)
export const API_SOURCES = {
  CRYPTO: [
    // ISSUE #908 FIX 3: Coinbase public endpoint (no key, no rate limits) — primary crypto source
    // Response format: {"data":{"amount":"97234.50","base":"BTC","currency":"USD"}}
    {
      name: 'Coinbase',
      type: 'api',
      fetchData: async (query, abortSignal) => {
        const lowerQuery = query.toLowerCase();
        const wantsBTC = /\b(bitcoin|btc)\b/.test(lowerQuery);
        const wantsETH = /\b(ethereum|eth)\b/.test(lowerQuery);
        const wantsAll = !wantsBTC && !wantsETH; // generic "crypto" query

        const fetchPrice = async (symbol) => {
          try {
            const resp = await fetch(`https://api.coinbase.com/v2/prices/${symbol}-USD/spot`, {
              signal: abortSignal,
              headers: { 'User-Agent': 'SiteMonkeys-AI-System/1.0', 'Accept': 'application/json' }
            });
            if (!resp.ok) {
              console.log(`[externalLookupEngine] Coinbase ${symbol}: HTTP ${resp.status}`);
              return null;
            }
            const json = await resp.json();
            if (!json?.data?.amount) return null;
            const amount = parseFloat(json.data.amount);
            const name = symbol === 'BTC' ? 'Bitcoin' : 'Ethereum';
            return `${name} (${symbol}): $${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
          } catch (e) {
            if (e.name !== 'AbortError') console.log(`[externalLookupEngine] Coinbase ${symbol} error: ${e.message}`);
            return null;
          }
        };

        const results = [];
        if (wantsBTC || wantsAll) {
          const btcPrice = await fetchPrice('BTC');
          if (btcPrice) results.push(btcPrice);
        }
        if (wantsETH || wantsAll) {
          const ethPrice = await fetchPrice('ETH');
          if (ethPrice) results.push(ethPrice);
        }

        if (results.length === 0) return null;
        console.log(`[externalLookupEngine] Coinbase: retrieved ${results.length} price(s)`);
        return `Live cryptocurrency prices from Coinbase (public API, no authentication required): ${results.join('; ')}. Prices reflect real-time spot market data. Coinbase is one of the largest regulated cryptocurrency exchanges in the world. All prices are denominated in US dollars (USD) and are updated in real-time during market hours.`;
      }
    },
    // ISSUE #908: CoinGecko kept as secondary fallback after Coinbase
    {
      name: 'CoinGecko',
      url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd',
      parser: 'json',
      type: 'api',
      extract: (json) => {
        if (!json) return null;
        const btc = json.bitcoin?.usd;
        const eth = json.ethereum?.usd;
        if (!btc && !eth) return null;
        const btcStr = btc ? `Bitcoin (BTC): $${parseFloat(btc).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD` : null;
        const ethStr = eth ? `Ethereum (ETH): $${parseFloat(eth).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD` : null;
        const prices = [btcStr, ethStr].filter(Boolean).join('; ');
        return `Live cryptocurrency spot prices from CoinGecko market data aggregator: ${prices}. CoinGecko aggregates prices from hundreds of exchanges globally. Bitcoin is the largest cryptocurrency by market cap; Ethereum is the second largest. Prices are in US dollars and reflect real-time global trading activity.`;
      }
    }
  ],
  CURRENCY: [
    {
      name: 'Exchange Rates API',
      buildUrl: (query) => {
        // Extract currency pairs from query (e.g., EUR/USD, GBP/USD, EUR to USD)
        const pairMatch = query.match(/([A-Z]{3})[\/\s-]?(?:to\s+)?([A-Z]{3})/i);
        if (!pairMatch) return null;

        const fromCurrency = pairMatch[1].toUpperCase();
        const toCurrency = pairMatch[2].toUpperCase();

        // Using exchangerate-api.com free tier
        return `https://open.er-api.com/v6/latest/${fromCurrency}`;
      },
      parser: 'json',
      type: 'api',
      extract: (json, query) => {
        if (!json || !json.rates) return null;

        // Extract target currency from query again
        const pairMatch = query.match(/([A-Z]{3})[\/\s-]?(?:to\s+)?([A-Z]{3})/i);
        if (!pairMatch) return null;

        const fromCurrency = pairMatch[1].toUpperCase();
        const toCurrency = pairMatch[2].toUpperCase();
        const rate = json.rates[toCurrency];

        if (!rate) return null;

        return `${fromCurrency}/${toCurrency} exchange rate: ${rate.toFixed(4)} (as of ${json.time_last_update_utc || 'now'})`;
      }
    }
  ],
  // STOCKS: Yahoo Finance v8 chart API (no key, no auth cookies required)
  // Uses query2.finance.yahoo.com/v8/finance/chart which is more accessible than the v7
  // quote endpoint (which requires session cookies). Falls through to news RSS if ticker
  // cannot be extracted or the API returns no price data.
  STOCKS: [
    {
      name: 'Yahoo Finance Quote',
      buildUrl: (query) => {
        const ticker = extractTicker(query);
        if (!ticker) {
          console.log('[externalLookupEngine] Yahoo Finance: could not extract ticker from query');
          return null;
        }
        console.log(`[externalLookupEngine] Yahoo Finance: resolved ticker "${ticker}" from query`);
        return `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
      },
      parser: 'json',
      type: 'api',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      extract: (json) => {
        const result = json?.chart?.result?.[0];
        if (!result) return null;
        const meta = result.meta;
        if (!meta || meta.regularMarketPrice == null) return null;
        const price = meta.regularMarketPrice;
        const symbol = meta.symbol || '';
        const name = meta.longName || meta.shortName || symbol;
        const change = meta.regularMarketChange != null ? meta.regularMarketChange.toFixed(2) : null;
        const changePct = meta.regularMarketChangePercent != null ? meta.regularMarketChangePercent.toFixed(2) : null;
        const currency = meta.currency || 'USD';
        const sign = change != null && parseFloat(change) >= 0 ? '+' : '';
        const changePart = change != null ? ` (${sign}${change}, ${sign}${changePct}%)` : '';
        return `${name} (${symbol}): ${currency} $${price.toFixed(2)}${changePart}`;
      }
    }
  ],
  // COMMODITIES: Using Metals-Live API (free tier, no auth required)
  // Note: These APIs use free/demo keys with rate limits. For production use:
  // - Set METALS_API_KEY environment variable for metals-api.com
  // - Set GOLDAPI_KEY environment variable for goldapi.io
  COMMODITIES: [
    {
      name: 'Metals-Live Gold/Silver API',
      url: () => {
        const apiKey = process.env.METALS_API_KEY;
        // ISSUE #776 FIX 3: Don't use fake 'FREE' key - let selectSourcesForQuery skip if not set
        if (!apiKey) {
          console.log('[externalLookupEngine] METALS_API_KEY not set, this source should be skipped');
          return null;
        }
        return `https://www.metals-api.com/api/latest?access_key=${apiKey}&base=USD&symbols=XAU,XAG`;
      },
      parser: 'json',
      type: 'api',
      extract: (json) => {
        if (!json || !json.rates) return null;
        const goldPrice = json.rates.XAU ? `Gold: $${(1 / json.rates.XAU).toFixed(2)}/oz` : null;
        const silverPrice = json.rates.XAG ? `Silver: $${(1 / json.rates.XAG).toFixed(2)}/oz` : null;
        return [goldPrice, silverPrice].filter(Boolean).join(', ');
      }
    },
    {
      name: 'Goldapi.io Free Tier',
      buildUrl: (query) => {
        const apiKey = process.env.GOLDAPI_KEY;
        // ISSUE #776 FIX 3: Don't use fake demo key - let selectSourcesForQuery skip if not set
        if (!apiKey) {
          console.log('[externalLookupEngine] GOLDAPI_KEY not set, this source should be skipped');
          return null;
        }
        const lowerQuery = query.toLowerCase();
        let symbol = 'XAU'; // Gold default
        if (lowerQuery.includes('silver')) symbol = 'XAG';
        if (lowerQuery.includes('platinum')) symbol = 'XPT';
        if (lowerQuery.includes('palladium')) symbol = 'XPD';
        // Correct endpoint: /api/{symbol}/USD — API key goes in x-access-token header
        return `https://www.goldapi.io/api/${symbol}/USD`;
      },
      parser: 'json',
      type: 'api',
      // ISSUE #908 FIX 1: x-access-token header is sent via getHeaders() called in performLookup
      getHeaders: () => ({
        'x-access-token': process.env.GOLDAPI_KEY || '',
        'Content-Type': 'application/json'
      }),
      extract: (json) => {
        if (!json || !json.price) return null;
        const METAL_NAMES = { XAU: 'Gold', XAG: 'Silver', XPT: 'Platinum', XPD: 'Palladium' };
        const metalName = METAL_NAMES[json.metal] || json.metal || 'Metal';
        const price = json.price;
        const priceGram = json.price_gram_24k ? ` ($${json.price_gram_24k.toFixed(2)}/gram 24k)` : '';
        const change = json.ch != null ? ` change: ${json.ch >= 0 ? '+' : ''}${json.ch.toFixed(2)}` : '';
        const changePct = json.chp != null ? ` (${json.chp >= 0 ? '+' : ''}${json.chp.toFixed(2)}%)` : '';
        const ask = json.ask ? ` Ask: $${json.ask.toFixed(2)}/oz.` : '';
        const bid = json.bid ? ` Bid: $${json.bid.toFixed(2)}/oz.` : '';
        return `${metalName} spot price: $${price.toFixed(2)}/troy oz${priceGram}.${change}${changePct}.${ask}${bid} Live precious metals price from GoldAPI.io (authenticated). 1 troy oz = 31.1035 grams. ${metalName} is traded globally as a commodity and safe-haven asset. Prices updated continuously during market hours (Mon–Fri).`;
      }
    },
    // ISSUE #908 FIX 2: metals.live free fallback (no API key required, <30k req/month free)
    // Supports gold and silver. Also handles weight-based price queries with unit conversion.
    // Conversion constants: 1 lb = 14.5833 troy oz, 1 kg = 32.1507 troy oz,
    //   1 gram = 0.0321507 troy oz, 1 avoirdupois oz = 0.911458 troy oz
    {
      name: 'metals.live',
      type: 'api',
      fetchData: async (query, abortSignal) => {
        const lowerQuery = query.toLowerCase();

        // Detect metal type — metals.live supports gold and silver
        let metalType = null;
        if (/\bgold\b/.test(lowerQuery)) metalType = 'gold';
        else if (/\bsilver\b/.test(lowerQuery)) metalType = 'silver';
        else return null; // metals.live only covers gold and silver

        // ISSUE #908 FIX 4: Detect weight-based query (semantic + pattern)
        // Patterns: "50 lbs of gold", "2 kg of silver", "10 ounces of platinum", etc.
        const TROY_OZ_CONVERSIONS = {
          'lb': 14.5833, 'lbs': 14.5833, 'pound': 14.5833, 'pounds': 14.5833,
          'kg': 32.1507, 'kilogram': 32.1507, 'kilograms': 32.1507, 'kilo': 32.1507, 'kilos': 32.1507,
          'gram': 0.0321507, 'grams': 0.0321507,
          'oz': 0.911458, 'ounce': 0.911458, 'ounces': 0.911458,
          'troy oz': 1, 'troy ounce': 1, 'troy ounces': 1, 'toz': 1
        };
        // Value/worth context guard — must indicate the user wants a dollar value
        const hasValueIntent = /\b(worth|value|cost|price|total|how much)\b/i.test(lowerQuery);
        let weightInfo = null;
        if (hasValueIntent) {
          const weightPattern = /(\d+(?:\.\d+)?)\s*(pound|lb|lbs|kilogram|kilo|kg|gram|grams|troy\s+oz(?:ces?)?|troy\s+ounce|ounce|oz)/i;
          const wMatch = lowerQuery.match(weightPattern);
          if (wMatch) {
            const qty = parseFloat(wMatch[1]);
            const unitRaw = wMatch[2].replace(/\s+/g, ' ').toLowerCase().trim();
            // Try the raw unit first, then without trailing 's'
            const convFactor = TROY_OZ_CONVERSIONS[unitRaw] || TROY_OZ_CONVERSIONS[unitRaw.replace(/s$/, '')];
            if (convFactor && qty > 0) {
              weightInfo = { qty, unitRaw, troyOz: qty * convFactor };
            }
          }
        }

        try {
          const url = `https://api.metals.live/v1/spot/${metalType}`;
          const resp = await fetch(url, {
            signal: abortSignal,
            headers: { 'User-Agent': 'SiteMonkeys-AI-System/1.0', 'Accept': 'application/json' }
          });
          if (!resp.ok) {
            console.log(`[externalLookupEngine] metals.live ${metalType}: HTTP ${resp.status}`);
            return null;
          }
          const json = await resp.json();
          if (!json || !Array.isArray(json) || !json[0]) return null;
          const price = parseFloat(json[0][metalType]);
          if (!price || isNaN(price)) return null;

          const capitalMetal = metalType.charAt(0).toUpperCase() + metalType.slice(1);
          const priceFormatted = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          if (weightInfo) {
            // Weight-based calculation: show full math as required by issue #908
            const totalValue = weightInfo.troyOz * price;
            const troyOzFormatted = weightInfo.troyOz.toFixed(2);
            const totalFormatted = totalValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            console.log(`[externalLookupEngine] metals.live weight calc: ${weightInfo.qty} ${weightInfo.unitRaw} ${metalType} = ${troyOzFormatted} troy oz × $${priceFormatted} = $${totalFormatted}`);
            return `${capitalMetal} weight calculation: ${weightInfo.qty} ${weightInfo.unitRaw} = ${troyOzFormatted} troy oz × $${priceFormatted}/troy oz = $${totalFormatted} USD total value. Current ${capitalMetal} spot price: $${priceFormatted} per troy ounce (live market data from metals.live, no API key required). 1 troy oz = 31.1035 grams. Note: physical metal products (coins, bars) typically trade at a premium above spot price due to fabrication and dealer margins.`;
          }

          console.log(`[externalLookupEngine] metals.live ${metalType}: $${priceFormatted}/troy oz`);
          return `${capitalMetal} spot price: $${priceFormatted} per troy ounce (live precious metals market data from metals.live, no API key required). 1 troy oz = 31.1035 grams = 0.0685 lbs. ${capitalMetal} is traded globally as a commodity and safe-haven asset. Prices reflect real-time precious metals markets and are updated continuously during trading hours (Mon–Fri, global markets).`;
        } catch (err) {
          if (err.name !== 'AbortError') console.log(`[externalLookupEngine] metals.live error: ${err.message}`);
          return null;
        }
      }
    }
  ],
  GOVERNMENT: [
    {
      name: 'Wikipedia Political Leaders',
      buildUrl: (query) => {
        // Extract country and position from query
        const ukMatch = query.match(/\b(UK|United Kingdom|Britain|British)\b.*?(prime minister|PM)/i);
        const usMatch = query.match(/\b(US|USA|United States|America|American)\b.*?(president)/i);
        const germanyMatch = query.match(/\b(Germany|German)\b.*?(chancellor)/i);
        const franceMatch = query.match(/\b(France|French)\b.*?(president)/i);

        if (ukMatch) {
          return 'https://en.wikipedia.org/api/rest_v1/page/summary/Prime_Minister_of_the_United_Kingdom';
        } else if (usMatch) {
          return 'https://en.wikipedia.org/api/rest_v1/page/summary/President_of_the_United_States';
        } else if (germanyMatch) {
          return 'https://en.wikipedia.org/api/rest_v1/page/summary/Chancellor_of_Germany';
        } else if (franceMatch) {
          return 'https://en.wikipedia.org/api/rest_v1/page/summary/President_of_France';
        }

        // Generic country lookup: build position-of-country Wikipedia URL
        // Handles "who is the president of Venezuela" → President_of_Venezuela
        // Handles "prime minister of Canada" → Prime_Minister_of_Canada
        const leaderMatch = query.match(/\b(prime\s+minister|president|chancellor|leader)\s+of\s+([a-zA-Z][a-zA-Z\s]+?)(?:\?|$|,|\s{2})/i);
        if (leaderMatch) {
          const rawPosition = leaderMatch[1].trim();
          const rawCountry = leaderMatch[2].trim();
          // Title-case each word in position (handles "prime minister" → "Prime_Minister")
          const posTitle = rawPosition.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('_');
          const country = rawCountry.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('_');
          console.log(`[externalLookupEngine] GOVERNMENT: looking up ${posTitle}_of_${country}`);
          return `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(`${posTitle}_of_${country}`)}`;
        }

        return null;
      },
      parser: 'json',
      type: 'api',
      extract: (json) => {
        if (!json || !json.extract) return null;

        // Extract current leader name from Wikipedia summary
        // This will get the first few sentences which usually mention the current holder
        return json.extract.substring(0, 500);
      }
    }
  ],
  MEDICAL: [
    {
      name: 'FDA Drug Labels',
      buildUrl: (query) => {
        // PRINCIPLE (Issue #402 Finding #11): Extract drug name from query dynamically
        // Use pattern matching, not hardcoded drug lists (CEO approach)
        
        // Pattern 1: "What is X used for?" or "Side effects of X"
        let drugMatch = query.match(/(?:what is|about|regarding|side effects of|information on)\s+([a-z]{3,20})\b/i);
        
        // Pattern 2: Drug name followed by medical terms
        if (!drugMatch) {
          drugMatch = query.match(/\b([a-z]{3,20})\s+(?:drug|medication|medicine|pill|tablet|capsule|dosage|prescription)\b/i);
        }
        
        // Pattern 3: Medical context followed by drug name  
        if (!drugMatch) {
          drugMatch = query.match(/(?:drug|medication|medicine)\s+(?:called|named)\s+([a-z]{3,20})\b/i);
        }
        
        const drugName = drugMatch ? drugMatch[1].toLowerCase() : null;
        
        if (!drugName) {
          // If we can't extract a drug name, return null to skip this source
          return null;
        }
        
        return `https://api.fda.gov/drug/label.json?search=openfda.generic_name:${encodeURIComponent(drugName)}&limit=1`;
      },
      parser: 'json',
      type: 'api',
      extract: (json) => {
        const result = json.results?.[0];
        if (!result) return null;
        return [
          result.warnings?.[0]?.substring(0, 1000),
          result.adverse_reactions?.[0]?.substring(0, 1000),
          result.indications_and_usage?.[0]?.substring(0, 500)
        ].filter(Boolean).join('\n\n');
      }
    }
  ],
  // WEATHER: Open-Meteo (free, no key needed) — uses geocoding step to resolve city to lat/lon
  // fetchData handles both geocoding and weather fetch internally (async multi-step source)
  WEATHER: [
    {
      name: 'Open-Meteo',
      type: 'api',
      fetchData: async (query, abortSignal) => {
        // Extract city/location from query using multiple patterns.
        // Patterns are tried in order; first match wins.
        const cityPatterns = [
          // Pattern 1: "weather in/at/for [city]" — direct preposition (most precise)
          /(?:weather|temperature|forecast|rain|snow|storm)\s+(?:in|at|for)\s+([A-Za-z][A-Za-z\s,]+?)(?:\?|$|today|now|right|currently|\d)/i,
          // Pattern 2: "[city] weather/temperature/forecast" — city then weather word
          /(?:in|at|for)\s+([A-Za-z][A-Za-z\s,]+?)\s+(?:weather|temperature|forecast)/i,
          // Pattern 3: city at start "Miami weather"
          /^([A-Za-z][A-Za-z\s,]+?)\s+weather/i,
          // Pattern 4: "weather [1–3 modifier words] in/at/for [city]"
          // Handles "weather currently in Miami", "weather right now in Paris", "weather here in London"
          /(?:weather|temperature|forecast|rain|snow|storm)\s+(?:\S+\s+){1,3}(?:in|at|for)\s+([A-Za-z][A-Za-z\s,]+?)(?:\?|$|today|now|right|currently|\d)/i,
          // Pattern 5: loose "in/at/for [City]" anywhere — two distinct termination forms to avoid ambiguity
          // 5a: city terminated by punctuation or end of string
          /\b(?:in|at|for)\s+([A-Z][a-zA-Z\s,]{2,30}?)(?:\?|$|,)/,
          // 5b: city terminated by a weather/freshness word (so the city doesn't consume those words)
          /\b(?:in|at|for)\s+([A-Z][a-zA-Z\s,]{2,30}?)\s+(?:weather|temperature|right now|now|today|currently)/i,
        ];
        let cityQuery = null;
        for (const pattern of cityPatterns) {
          const m = query.match(pattern);
          if (m) { cityQuery = m[1].trim().replace(/,$/, ''); break; }
        }
        // Pattern 6 (last resort): trailing proper-noun — the city is often the last
        // capitalised word in cleaned queries like "weather currently Miami"
        if (!cityQuery) {
          const trailing = query.match(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)\s*(?:\?|$)/);
          if (trailing) {
            const COMMON_NON_CITIES = /^(What|How|Is|Are|Was|Were|Will|Would|Could|Should|The|This|That|Currently|Today|Right|Now|Here)$/i;
            if (!COMMON_NON_CITIES.test(trailing[1].trim())) {
              cityQuery = trailing[1].trim();
            }
          }
        }
        if (!cityQuery) {
          console.log('[externalLookupEngine] Open-Meteo: could not extract city from query');
          return null;
        }
        try {
          // Step 1: Geocode city name to lat/lon
          const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQuery)}&count=1&language=en&format=json`;
          const geoResp = await fetch(geoUrl, { signal: abortSignal, headers: { 'User-Agent': 'SiteMonkeys-AI-System/1.0' } });
          if (!geoResp.ok) { console.log(`[externalLookupEngine] Open-Meteo geocoding failed: ${geoResp.status}`); return null; }
          const geoData = await geoResp.json();
          const loc = geoData.results?.[0];
          if (!loc) { console.log(`[externalLookupEngine] Open-Meteo: no geocoding result for "${cityQuery}"`); return null; }
          // Step 2: Fetch current weather using lat/lon
          const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current_weather=true&temperature_unit=fahrenheit`;
          const weatherResp = await fetch(weatherUrl, { signal: abortSignal, headers: { 'User-Agent': 'SiteMonkeys-AI-System/1.0' } });
          if (!weatherResp.ok) { console.log(`[externalLookupEngine] Open-Meteo weather fetch failed: ${weatherResp.status}`); return null; }
          const weatherData = await weatherResp.json();
          const current = weatherData.current_weather;
          if (!current) return null;
          const condition = WMO_WEATHER_CODES[current.weathercode] || `Code ${current.weathercode}`;
          const locationName = [loc.name, loc.admin1, loc.country_code].filter(Boolean).join(', ');
          return `Weather in ${locationName}: ${current.temperature}°F, ${condition}, Wind: ${current.windspeed} km/h`;
        } catch (err) {
          if (err.name !== 'AbortError') console.log(`[externalLookupEngine] Open-Meteo error: ${err.message}`);
          return null;
        }
      }
    }
  ],
  // FACTUAL_ENTITY: Wikipedia REST article summary — for "who is", "what is", entity questions
  // Replaces the near-always-null Portal:Current_events endpoint for factual queries
  FACTUAL_ENTITY: [
    {
      name: 'Wikipedia Article Summary',
      buildUrl: (query) => {
        // Strip question framing and conversational wrappers to extract the core entity/topic
        let topic = query
          .replace(/^(who is|who was|who are|what is|what are|what does|what did|tell me about|is|does|do|how does|explain)\s+/i, '')
          .replace(/\b(the|a|an|some|any|currently|right now|today|please|can you|could you)\b/gi, ' ')
          .replace(/\?+$/, '')
          // Strip indirect reference framing ("that we took into custody", "that is/was [verb]ed")
          .replace(/\b(that (we|i|they|he|she|you)\s+\w+(\s+\w+){0,3})\b/gi, ' ')
          .replace(/\b(we (took|put|had|have|placed|brought|captured|arrested|detained))\b/gi, ' ')
          .replace(/\b(in(to)? custody|under arrest|who (was|is) (arrested|detained|captured))\b/gi, ' ')
          // Strip conversational framing ("what is the most up to date info going on with him")
          .replace(/\b(most up[- ]to[- ]date information|going on with|what is happening|bring me up to speed)\b/gi, ' ')
          .replace(/\b(with him|with her|with them|about him|about her|about them)\b/gi, ' ')
          // Remove trailing action verbs from "what does X do" → "X"
          .replace(/\s+(do|does|offer|provide|make|sell|produce|have)\s*$/i, '')
          .replace(/\s+/g, ' ')
          .trim();

        // Extract proper nouns from the original query as a smarter fallback
        // for indirect references like "the former leader of Venezuela"
        const excludedProperNouns = /^(The|A|An|Who|What|Where|When|Why|How|Is|Are|Was|Were|We|I|They|He|She|It|This|That|These|Those|Former|Current|Previous|Last|Most|Some|Any|All|No|Not|New|Old|Big|Small|Great|Good|Bad)$/;
        const properNouns = query.split(/\s+/)
          .filter(w => /^[A-Z][a-z]{2,}/.test(w) && !excludedProperNouns.test(w));

        // Limit to first 5 words; if still too long and we have proper nouns, prefer them
        const words = topic.split(' ').filter(Boolean);
        if (words.length > 5) {
          if (properNouns.length > 0) {
            // Use the proper nouns (named entities) for a more precise Wikipedia lookup
            topic = properNouns.slice(0, 3).join(' ');
            console.log(`[externalLookupEngine] FACTUAL_ENTITY: indirect reference — using proper nouns: "${topic}"`);
          } else {
            topic = words.slice(0, 5).join(' ');
          }
        }

        if (!topic || topic.length < 2) return null;
        return `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
      },
      parser: 'json',
      type: 'api',
      extract: (json) => {
        if (!json || !json.extract) return null;
        const title = json.title || '';
        const desc = json.description ? ` (${json.description})` : '';
        const extract = json.extract.substring(0, 1000);
        return `${title}${desc}: ${extract}`;
      }
    }
  ],
  // GENERAL_FALLBACK: DuckDuckGo Instant Answer — broad factual fallback, no key needed
  // Coverage is inconsistent but returns structured data when it matches
  GENERAL_FALLBACK: [
    {
      name: 'DuckDuckGo Instant Answer',
      buildUrl: (query) => {
        const cleanQuery = query.replace(/\s+/g, ' ').trim().substring(0, 100);
        return `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1&skip_disambig=1`;
      },
      parser: 'json',
      type: 'api',
      extract: (json) => {
        if (!json) return null;
        const parts = [];
        if (json.Answer && json.Answer.length > 0) parts.push(`Answer: ${json.Answer}`);
        if (json.Abstract && json.Abstract.length > 0) parts.push(json.Abstract.substring(0, 500));
        if (json.RelatedTopics?.length > 0) {
          const related = json.RelatedTopics.filter(t => t.Text).slice(0, 3).map(t => t.Text);
          if (related.length > 0) parts.push(`Related: ${related.join('; ')}`);
        }
        return parts.length > 0 ? parts.join('\n\n') : null;
      }
    }
  ],
  NEWS: [
    // ISSUE #877: Reprioritized news sources based on production reliability.
    // Priority: NewsAPI → Serper → TheNewsAPI → Google News RSS → GDELT (last resort)
    // Each source has a 200-char minimum content threshold enforced in performLookup.

    // 1. NewsAPI — highest priority: returns full article summaries with dates and sources
    // Requires NEWS_API_KEY environment variable (set in Railway)
    {
      name: 'NewsAPI',
      buildUrl: (query) => {
        const apiKey = process.env.NEWS_API_KEY;
        if (!apiKey) {
          console.log('[externalLookupEngine] NEWS_API_KEY not set, skipping NewsAPI source');
          return null;
        }
        const cleanedQuery = ensureQueryViability(cleanNewsQuery(query), query); // ISSUE #897 FIX
        const searchQuery = cleanedQuery.length >= 3 ? cleanedQuery : query.substring(0, 40).trim();
        console.log(`[externalLookupEngine] NewsAPI query: "${searchQuery}"`);
        return `https://newsapi.org/v2/everything?q=${encodeURIComponent(searchQuery)}&sortBy=publishedAt&pageSize=5&apiKey=${apiKey}`;
      },
      parser: 'json',
      type: 'api',
      extract: (json) => {
        if (!json || !json.articles || !Array.isArray(json.articles)) return null;
        const articles = json.articles
          .filter(a => a.title && a.title !== '[Removed]')
          .filter(a => !isSourceBanned(a.source?.name || '') && !isSourceBanned(a.url || ''))
          .slice(0, 5);
        if (articles.length === 0) return null;
        return articles.map(a => {
          const source = a.source?.name || '[unknown source]';
          const date = a.publishedAt ? a.publishedAt.substring(0, 10) : '[date unknown]';
          const description = a.description ? ` — ${a.description.substring(0, 200)}` : '';
          return `[${source}] ${a.title} (${date})${description}`;
        }).join('\n\n');
      }
    },

    // 2. Serper — second: returns real Google Search results
    // Requires SERPER_API_KEY environment variable (set in Railway)
    {
      name: 'Serper',
      buildUrl: (query) => {
        const apiKey = process.env.SERPER_API_KEY;
        if (!apiKey) {
          console.log('[externalLookupEngine] SERPER_API_KEY not set, skipping Serper source');
          return null;
        }
        return null; // Serper uses POST, handled via fetchData below
      },
      fetchData: async (query, abortSignal) => {
        const apiKey = process.env.SERPER_API_KEY;
        if (!apiKey) {
          console.log('[externalLookupEngine] SERPER_API_KEY not set, skipping Serper source');
          return null;
        }
        const cleanedQuery = ensureQueryViability(cleanNewsQuery(query), query); // ISSUE #897 FIX
        const searchQuery = cleanedQuery.length >= 3 ? cleanedQuery : query.substring(0, 60).trim();
        console.log(`[externalLookupEngine] Serper query: "${searchQuery}"`);
        try {
          const response = await fetch('https://google.serper.dev/news', {
            method: 'POST',
            signal: abortSignal,
            headers: {
              'X-API-KEY': apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ q: searchQuery, num: 5 })
          });
          if (!response.ok) {
            console.log(`[externalLookupEngine] Serper returned ${response.status}`);
            return null;
          }
          const json = await response.json();
          if (!json || !json.news || !Array.isArray(json.news)) return null;
          const items = json.news
            .filter(a => a.title)
            .filter(a => !isSourceBanned(a.source || '') && !isSourceBanned(a.link || ''))
            .slice(0, 5);
          if (items.length === 0) return null;
          const text = items.map(a => {
            const source = a.source || '[unknown source]';
            const date = a.date || '[date unknown]';
            const snippet = a.snippet ? ` — ${a.snippet.substring(0, 200)}` : '';
            return `[${source}] ${a.title} (${date})${snippet}`;
          }).join('\n\n');
          return text.length >= 200 ? text : null;
        } catch (err) {
          if (err.name !== 'AbortError') console.log(`[externalLookupEngine] Serper error: ${err.message}`);
          return null;
        }
      },
      type: 'api'
    },

    // 3. TheNewsAPI — third: additional coverage and redundancy
    // Requires THE_NEWS_API_KEY environment variable (set in Railway)
    {
      name: 'TheNewsAPI',
      buildUrl: (query) => {
        const apiKey = process.env.THE_NEWS_API_KEY;
        if (!apiKey) {
          console.log('[externalLookupEngine] THE_NEWS_API_KEY not set, skipping TheNewsAPI source');
          return null;
        }
        const cleanedQuery = ensureQueryViability(cleanNewsQuery(query), query); // ISSUE #897 FIX
        const searchQuery = cleanedQuery.length >= 3 ? cleanedQuery : query.substring(0, 40).trim();
        console.log(`[externalLookupEngine] TheNewsAPI query: "${searchQuery}"`);
        return `https://api.thenewsapi.com/v1/news/all?api_token=${apiKey}&search=${encodeURIComponent(searchQuery)}&limit=5&language=en&sort=published_at`;
      },
      parser: 'json',
      type: 'api',
      extract: (json) => {
        if (!json || !json.data || !Array.isArray(json.data)) return null;
        const articles = json.data
          .filter(a => a.title)
          .filter(a => !isSourceBanned(a.source || '') && !isSourceBanned(a.url || ''))
          .slice(0, 5);
        if (articles.length === 0) return null;
        return articles.map(a => {
          const source = a.source || '[unknown source]';
          const date = a.published_at ? a.published_at.substring(0, 10) : '[date unknown]';
          const description = a.description ? ` — ${a.description.substring(0, 200)}` : '';
          return `[${source}] ${a.title} (${date})${description}`;
        }).join('\n\n');
      }
    },

    // 4. Google News RSS — fourth/last resort: only consistently working free source
    // ISSUE #814 ITEM 3 (Post-Review): Apply entity extraction to ALL RSS queries, not just stock fallback.
    // Extract the topic/entity from conversational messages before sending to Google News.
    {
      name: 'Google News RSS',
      buildUrl: (query) => {
        // Extract clean search query from conversational input using shared cleanNewsQuery helper,
        // then apply the #897 viability check to catch noise-heavy thin queries.
        const cleanedQuery = ensureQueryViability(cleanNewsQuery(query), query); // ISSUE #897 FIX
        const searchQuery = cleanedQuery.length >= 3 ? cleanedQuery : query.substring(0, 40).trim();
        console.log(`[externalLookupEngine] News RSS query cleaned: "${query.substring(0, 60)}..." → "${searchQuery}"`);
        return `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=en-US&gl=US&ceid=US:en`;
      },
      parser: 'rss',
      type: 'api',
      extract: (text) => {
        const items = [];
        const itemRegex = /<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>[\s\S]*?<source[^>]*>(.*?)<\/source>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<\/item>/gi;
        let match;
        while ((match = itemRegex.exec(text)) !== null) {
          const source = match[2];
          if (isSourceBanned(source)) {
            console.log(`[externalLookupEngine] Filtered banned RSS source: "${source}"`);
            continue;
          }
          items.push({ title: match[1], source, date: match[3] });
          if (items.length >= 5) break;
        }
        return items.length > 0 ? items.map(i => `[${i.source}] ${i.title} (${i.date})`).join('\n\n') : null;
      }
    },

    // 5. GDELT — deprioritized: consistent HTTP 429 / timeouts in production
    // GDELT is free to use with attribution; see https://www.gdeltproject.org/about.html
    // ISSUE #877: Moved to last position due to rate limiting/timeout issues in production.
    {
      name: 'GDELT News',
      buildUrl: (query) => {
        const cleanedQuery = ensureQueryViability(cleanNewsQuery(query), query); // ISSUE #897 FIX
        const searchQuery = cleanedQuery.length >= 3 ? cleanedQuery : query.substring(0, 40).trim();
        console.log(`[externalLookupEngine] GDELT query cleaned: "${query.substring(0, 60)}..." → "${searchQuery}"`);
        return `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(searchQuery)}&mode=artlist&maxrecords=5&format=json`;
      },
      parser: 'json',
      type: 'api',
      extract: (json) => {
        if (!json || !json.articles || !Array.isArray(json.articles)) return null;
        const articles = json.articles
          .filter(a => a.title)
          .filter(a => !isSourceBanned(a.domain || ''))
          .slice(0, 5);
        if (articles.length === 0) return null;
        return articles.map(a => `[${a.domain || '[unknown source]'}] ${a.title} (${a.seendate || '[date unknown]'})`).join('\n\n');
      }
    }
  ]
};

// Domain-specific authoritative sources (non-API fallbacks)
export const AUTHORITATIVE_SOURCES = {
  MEDICAL: [
    { name: 'FDA', url: 'https://www.fda.gov', type: 'government', parseable: false },
    { name: 'NIH', url: 'https://www.nih.gov', type: 'government', parseable: false },
    { name: 'CDC', url: 'https://www.cdc.gov', type: 'government', parseable: false },
    { name: 'Mayo Clinic', url: 'https://www.mayoclinic.org', type: 'medical', parseable: false },
    { name: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov', type: 'research', parseable: false }
  ],
  LEGAL: [
    { name: 'Congress.gov', url: 'https://www.congress.gov', type: 'government', parseable: false },
    { name: 'Supreme Court', url: 'https://www.supremecourt.gov', type: 'government', parseable: false },
    { name: 'Federal Register', url: 'https://www.federalregister.gov', type: 'government', parseable: false },
    { name: 'Cornell Law', url: 'https://www.law.cornell.edu', type: 'legal', parseable: false }
  ],
  FINANCIAL: [
    { name: 'SEC', url: 'https://www.sec.gov', type: 'government', parseable: false },
    { name: 'IRS', url: 'https://www.irs.gov', type: 'government', parseable: false },
    { name: 'Federal Reserve', url: 'https://www.federalreserve.gov', type: 'government', parseable: false },
    { name: 'Treasury', url: 'https://home.treasury.gov', type: 'government', parseable: false }
  ],
  SAFETY: [
    { name: 'CPSC', url: 'https://www.cpsc.gov', type: 'government', parseable: false },
    { name: 'NHTSA', url: 'https://www.nhtsa.gov', type: 'government', parseable: false },
    { name: 'OSHA', url: 'https://www.osha.gov', type: 'government', parseable: false },
    { name: 'FDA Recalls', url: 'https://www.fda.gov/safety/recalls', type: 'government', parseable: false }
  ],
  GENERAL: [
    {
      name: 'Wikipedia',
      buildUrl: (query) => {
        // Extract key term from query for Wikipedia lookup
        const cleanQuery = query.replace(/\b(what is|define|definition of|meaning of|explain)\b/gi, '').trim();
        const keyTerm = cleanQuery.split(' ').slice(0, 3).join(' ');
        return `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(keyTerm)}`;
      },
      parser: 'json',
      type: 'api',
      parseable: true,
      extract: (json) => json.extract?.substring(0, 2000) || null
    }
  ]
};

// ISSUE #885 FIX: Institution abbreviation expansion map for fallback query construction.
// When cleanNewsQuery strips a conversational query down to a single institution name,
// this map expands abbreviations to their full form so the search is more useful.
const INSTITUTION_EXPANSION_MAP = {
  'fed': 'Federal Reserve',
  'federal reserve': 'Federal Reserve',
  'scotus': 'Supreme Court',
  'potus': 'President',
  'dhs': 'Department of Homeland Security',
  'fbi': 'FBI',
  'cia': 'CIA',
  'nsa': 'NSA',
  'nato': 'NATO',
  'un': 'United Nations',
  'eu': 'European Union',
  'imf': 'IMF',
  'who': 'WHO',
  'cdc': 'CDC',
  'irs': 'IRS',
  'sec': 'SEC',
  'doj': 'Department of Justice',
  'pentagon': 'Pentagon',
  'congress': 'Congress',
  'senate': 'Senate',
  'white house': 'White House',
  'kremlin': 'Kremlin',
  'vatican': 'Vatican',
  'opec': 'OPEC',
  'fdic': 'FDIC',
  'cfpb': 'CFPB',
  'fda': 'FDA',
  'ftc': 'FTC',
  'epa': 'EPA',
  'fcc': 'FCC',
  'fema': 'FEMA',
  'atf': 'ATF',
  'dea': 'DEA',
  'cbp': 'CBP',
  'ice': 'ICE',
  'treasury': 'US Treasury',
  'interpol': 'Interpol',
  'europol': 'Europol',
  'cftc': 'CFTC',
  'nlrb': 'NLRB',
  'omb': 'OMB',
  'cbo': 'CBO',
  'gao': 'GAO',
  'dnc': 'DNC',
  'rnc': 'RNC',
  'oecd': 'OECD',
  'wto': 'WTO',
  'iaea': 'IAEA',
};

/**
 * ISSUE #897 FIX: Post-cleaning viability check for institution-heavy conversational queries.
 * Runs AFTER cleanNewsQuery() returns its result. If the cleaned query still contains
 * conversational noise words that leave fewer than 2 truly meaningful search terms,
 * and the original query references a known institution, construct a focused fallback.
 *
 * This is intentionally separate from cleanNewsQuery() — it validates the output without
 * altering the cleaning logic. The noise list here is broader than the TIME_FILLER_WORDS
 * inside cleanNewsQuery: it also covers conversational filler words ("seems", "like",
 * "something") that pass the stop-word cleaning step but have no value as news search terms.
 *
 * @param {string} cleanedQuery - Result from cleanNewsQuery()
 * @param {string} originalQuery - The original user query (before cleaning)
 * @returns {string} A viable search query (fallback or original cleaned query)
 */
function ensureQueryViability(cleanedQuery, originalQuery) {
  // Expanded noise word list for viability counting.
  // Includes TIME_FILLER_WORDS plus common conversational words that cleanNewsQuery
  // intentionally leaves in (to avoid over-stripping) but that are useless in a
  // news API query string.
  const VIABILITY_NOISE = /^(seems?|looks?|like|something|anything|everything|nothing|happen(?:ed|ing)?|makes?|think(?:ing)?|heard|feels?|believe|wonder|suggest(?:ing)?|lately|recently|nowadays|days|weeks|months|soon|ago|before|after|times|currently|today|now)$/i;

  const meaningfulWords = cleanedQuery
    ? cleanedQuery.split(' ').filter(w => w.length > 2 && !VIABILITY_NOISE.test(w))
    : [];

  // If fewer than 2 truly meaningful words remain, check for a known institution
  // in the original query and construct a focused fallback query.
  if (meaningfulWords.length < 2) {
    const INSTITUTION_PATTERN = /\b(Fed(?:eral\s+Reserve)?|FBI|CIA|NSA|NATO|UN|EU|IMF|WHO|CDC|IRS|SEC|DOJ|DHS|Pentagon|Congress|Senate|SCOTUS|White\s+House|Kremlin|Vatican|OPEC|FDIC|CFPB|FDA|FTC|EPA|FCC|FEMA|ATF|DEA|CBP|ICE|Treasury|Interpol|Europol|CFTC|NLRB|OMB|CBO|GAO|DNC|RNC|OECD|WTO|IAEA)\b/i;
    const institutionMatch = originalQuery.match(INSTITUTION_PATTERN);
    if (institutionMatch) {
      const rawName = institutionMatch[1].replace(/\s+/g, ' ').trim();
      const expanded = INSTITUTION_EXPANSION_MAP[rawName.toLowerCase()] || rawName;
      console.log(`[externalLookupEngine] ensureQueryViability: thin result "${cleanedQuery}" → "${expanded} latest news"`);
      return `${expanded} latest news`;
    }
  }

  return cleanedQuery;
}

/**
 * Clean a conversational query into a concise news search string.
 * Strips first-person pronouns, contractions, framing phrases, and filler words.
 * Returns at most 6 topic keywords with no stray punctuation.
 * Used by both GDELT and Google News RSS buildUrl functions.
 * @param {string} query - Raw user query
 * @returns {string} Cleaned search query (3-60 chars)
 */
function cleanNewsQuery(query) {
  let cleaned = query;

  // Step 1: Strip first/second person pronouns and contractions FIRST to avoid stray apostrophe
  // artifacts (e.g. "I'm" → "'" when only "I" is removed by stop-word pass)
  cleaned = cleaned.replace(/\b(I'm|I've|I'd|I'll|we're|we've|we'd|we'll|you're|you've|you'd|you'll)\b/gi, ' ');
  cleaned = cleaned.replace(/\b(I|we|you|me|my|our|your|us)\b/gi, ' ');

  // Step 2: Strip conversational framing phrases before stop-word removal
  cleaned = cleaned.replace(/\b(specifically wondering|bring (me |us )?up[- ]to[- ](date|speed)|catch (me |us )?up (on|with|about|to)?|fill (me |us )?in (on|about)?|what'?s going on with|what is going on with|can you tell me|could you tell me|let me know about|clue (me |us )?in on|give me an update on|keep me informed about|going on with|in relationship to|in relation to)\b/gi, ' ');

  // Step 3: Strip stop words and filler words (expanded list)
  cleaned = cleaned.replace(/\b(what|what's|whats|is|the|are|there|anything|going|on|with|latest|newest|most|recent|up|to|date|information|from|news|about|tell|can|please|how|has|been|no|yes|specifically|basically|really|actually|right|now|currently|in|relationship|relation|of|and|but|or|so|if|that|this|these|those|a|an|any|some|all|not|do|did|was|were|will|would|could|should|have|had|get|got|just|very|quite|rather|pretty|much|more|most|lot|lots|many|few|little|big|great|good|bad|well|make|made|let|see|know|think|want|need|getting|having|doing|being|am|be|they|he|she|it|new|bring|speed|catch|fill|serious|very|really|lot|particularly|especially|highly)\b/gi, ' ');

  // Step 4: Clean stray punctuation (apostrophes, commas, quotes left over from contractions)
  cleaned = cleaned.replace(/['"`,;:!?()\[\]{}]/g, ' ');

  // Step 5: Strip 1-2 char fragments
  cleaned = cleaned.replace(/\b\w{1,2}\b/g, ' ');

  // Step 6: Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Step 7: Limit to 6 keywords maximum (improves search quality)
  const words = cleaned.split(' ').filter(w => w.length > 2);
  if (words.length > 6) {
    cleaned = words.slice(0, 6).join(' ');
  } else {
    cleaned = words.join(' ');
  }

  // ISSUE #885 FIX: Fallback query for institution-only or too-thin results.
  // Time fillers like "lately" or "recently" are not meaningful search terms.
  // If the cleaned result has fewer than 2 meaningful (non-filler) words, construct a
  // fallback query using the detected institution name expanded to its full form + "latest news".
  const TIME_FILLER_WORDS = /^(lately|recently|nowadays|days|weeks|months|soon|ago|before|after|times|currently|today|now)$/i;
  const meaningfulWords = cleaned ? cleaned.split(' ').filter(w => w.length > 2 && !TIME_FILLER_WORDS.test(w)) : [];
  if (meaningfulWords.length < 2) {
    const INSTITUTION_PATTERN = /\b(Fed(?:eral\s+Reserve)?|FBI|CIA|NSA|NATO|UN|EU|IMF|WHO|CDC|IRS|SEC|DOJ|DHS|Pentagon|Congress|Senate|SCOTUS|White\s+House|Kremlin|Vatican|OPEC|FDIC|CFPB|FDA|FTC|EPA|FCC|FEMA|ATF|DEA|CBP|ICE|Treasury|Interpol|Europol|CFTC|NLRB|OMB|CBO|GAO|DNC|RNC|OECD|WTO|IAEA)\b/i;
    const institutionMatch = query.match(INSTITUTION_PATTERN);
    if (institutionMatch) {
      const rawName = institutionMatch[1].replace(/\s+/g, ' ').trim();
      const expanded = INSTITUTION_EXPANSION_MAP[rawName.toLowerCase()] || rawName;
      console.log(`[externalLookupEngine] cleanNewsQuery fallback: thin result "${cleaned}" → "${expanded} latest news"`);
      return `${expanded} latest news`;
    }
  }

  return cleaned;
}

// Freshness markers that trigger automatic lookup
const FRESHNESS_MARKERS = [
  /\b(current|latest|today|now|live|real-?time)\b/i,
  /\b(price|stock|rate|value|cost|worth)\b/i,
  /\b(weather|forecast|temperature)\b/i,
  /\b(news|update|announcements?|breaking|situation|happening)\b/i,
  /\b(available|in stock|open|closed)\b/i,
  // Issue #861 Fix: Conversational freshness phrases
  /\bbring (me |us )?(up[- ]to[- ]date|up to speed)\b/i,
  /\bcatch (me |us )?up (on|with|about|to)?\b/i,
  /\bfill (me |us )?in (on|about)?\b/i,
  /\bwhat'?s (new|the latest) (with|in|on|about)\b/i,
  /\bany recent\b/i,
  /\b(made|making) (a lot of )?(announcements?|news|headlines)\b/i,
  /\brecently\b/i,
];

// High-stakes news markers that require corroboration
const HIGH_STAKES_NEWS_MARKERS = /attack|bombing|invasion|coup|killed|missile|war|strike|assassination|military action|troops|casualties/i;

// News intent structural patterns - detect news queries by STRUCTURE, not specific names
// PRINCIPLE: News intent = question structure + proper nouns, NOT hardcoded name lists
// ISSUE #406 FIX: Added patterns for "top news", "news stories", "headlines"
const NEWS_STRUCTURE_PATTERNS = [
  // "What's the situation with X" patterns
  /\bwhat'?s\s+(the\s+)?(situation|happening|going\s+on|news|latest|update)\s+(with|about|regarding|on|in)\b/i,
  /\bwhat\s+is\s+(the\s+)?(situation|happening|going\s+on|news|latest|update)\s+(with|about|regarding|on|in)\b/i,

  // "Tell me about X" patterns
  /\btell\s+me\s+(about|regarding)\b/i,

  // "Any news about X" patterns
  /\bany\s+(news|updates?|developments?)\s+(about|on|regarding)\b/i,

  // "What's happening with X" variants
  /\b(news|situation|update|happening|development)\s+(with|about|regarding|on|in)\b/i,

  // ISSUE #779 FIX: "X in the news" patterns (e.g., "Trump's been in the news")
  /\bin\s+the\s+(news|headlines|media)\b/i,
  /\bmade\s+(news|headlines)\b/i,

  // Current event queries
  /\b(current\s+events?|breaking|this\s+morning|today|yesterday|just\s+now)\b/i,

  // Direct "what happened" patterns
  /\bwhat\s+happened\s+(with|to|in)\b/i,
  /\bwhat'?s\s+going\s+on\s+(with|in)\b/i,

  // ISSUE #406 FIX: "What are..." news patterns
  /\bwhat\s+(are|is)\s+(the\s+)?(top|latest|today'?s|recent)\s+(news|stories|headlines|updates)\b/i,

  // ISSUE #406 FIX: General news request patterns
  /\b(top|latest|recent|breaking)\s+(news|stories|headlines|updates)\b/i,

  // ISSUE #406 FIX: Weather queries
  /\bwhat'?s\s+the\s+weather\b/i,
  /\bweather\s+(in|at|for)\b/i,

  // ISSUE #406 FIX: Celebrity/entertainment news
  /\b(latest|recent)\s+(celebrity|entertainment)\s+(news|gossip|stories)\b/i,

  // Issue #861 Fix: Conversational freshness phrases with proper nouns indicate news intent
  /\bbring (me |us )?(up[- ]to[- ]date|up to speed)\b/i,
  /\bcatch (me |us )?up (on|with|about|to)?\b/i,
  /\bfill (me |us )?in (on|about)?\b/i,
  /\bwhat'?s (new|the latest) (with|in|on|about)\b/i,
  /\b(made|making) (a lot of )?(announcements?|news|headlines)\b/i,
];

// Geopolitical context markers (not entity names, but CONTEXT indicators)
// These indicate geopolitical context without hardcoding specific names
const GEOPOLITICAL_CONTEXT_MARKERS = [
  /\b(election|diplomatic|military|conflict|treaty|summit|sanctions|trade\s+war)\b/i,
  /\b(president|prime\s+minister|chancellor|leader|government|parliament|congress|senate)\b/i,
  /\b(country|nation|state|territory|border|international)\b/i
];

// Reputable news sources for corroboration
const REPUTABLE_SOURCES = /reuters|associated press|ap news|bbc|afp|npr|guardian|new york times|nytimes|washington post|wall street journal|wsj|cnn|abc news|cbs news|nbc news/i;

// Known satirical, parody, and unreliable news sources that must never be injected as fact.
// Display names (lowercase) used by Google News RSS <source> tags and API source fields.
// Domains used by GDELT which returns article domains directly.
export const BANNED_NEWS_SOURCES = new Set([
  // Satirical / parody outlets
  'the babylon bee', 'babylon bee',
  'the onion',
  'clickhole',
  'the beaverton',
  'the daily mash',
  'waterford whispers news',
  'reductress',
  'hard times',
  'the hard times',
  'duffel blog',
  'the spoof',
  'the borowitz report',
  'newsthump',
  'newsbiscuit',
  'the science post',
  'private eye',
  'the daily squib',
  'world news daily report',
  'national report',
  // Known misinformation / conspiracy outlets
  'infowars',
  'natural news',
  'naturalnews',
  'before its news',
  'beforeitsnews',
  'yournewswire',
  'newspunch',
  'newswars',
  'veterans today',
  'americas last line of defense',
  "america's last line of defense",
  'freedom daily',
  'the free thought project',
  'activist post',
  'shtfplan',
  'zero hedge',       // frequent misinformation/conspiracy framing on geopolitical topics
  'the epoch times',  // state-linked misinformation concerns
  'ntd news',         // affiliated with epoch times
  'gateway pundit',
  'the gateway pundit',
  'breitbart',
  'breitbart news',
  'worldnetdaily',
  'wnd',
  'oann',
  'one america news',
  'one america news network',
  'newsmax',          // frequent unverified geopolitical claims
]);

// Domain-based ban list for sources that provide domains (e.g. GDELT)
export const BANNED_NEWS_DOMAINS = new Set([
  'babylonbee.com',
  'theonion.com',
  'clickhole.com',
  'thebeaverton.com',
  'thedailymash.co.uk',
  'waterfordwhispersnews.com',
  'reductress.com',
  'thehardtimes.net',
  'duffelblog.com',
  'thespoof.com',
  'newsthump.com',
  'newsbiscuit.com',
  'thesciencepost.com',
  'dailysquib.co.uk',
  'worldnewsdailyreport.com',
  'nationalreport.net',
  'infowars.com',
  'naturalnews.com',
  'beforeitsnews.com',
  'yournewswire.com',
  'newspunch.com',
  'newswars.com',
  'veteranstoday.com',
  'freedomdaily.com',
  'thefreethoughtproject.com',
  'activistpost.com',
  'shtfplan.com',
  'zerohedge.com',
  'theepochtimes.com',
  'ntd.com',
  'thegatewaypundit.com',
  'breitbart.com',
  'wnd.com',
  'oann.com',
  'newsmax.com',
]);

/**
 * Pre-compiled domain regex for isSourceBanned — avoids recompilation on every call.
 * Matches bare domains like "babylonbee.com" or "www.babylonbee.com".
 */
const _BANNED_DOMAIN_PATTERN = /^(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})$/;

/**
 * Check whether a news source name or domain is on the banned list.
 * Accepts the display name (from RSS <source> or API source field) or a domain string.
 * @param {string} sourceName - Source display name or domain
 * @returns {boolean} True if the source is banned
 */
export function isSourceBanned(sourceName) {
  if (!sourceName || typeof sourceName !== 'string') return false;
  const lower = sourceName.toLowerCase().trim();
  if (BANNED_NEWS_SOURCES.has(lower)) return true;
  // Strip www prefix and check the cleaned value as a bare domain
  const domainMatch = _BANNED_DOMAIN_PATTERN.exec(lower);
  if (domainMatch) {
    // domainMatch[1] is the bare domain (e.g. "babylonbee.com")
    if (BANNED_NEWS_DOMAINS.has(domainMatch[1])) return true;
  } else {
    // Input is not a bare domain (e.g. a URL like "https://babylonbee.com/story/…").
    // Fall back to substring search so domain fragments embedded in URLs are caught.
    for (const domain of BANNED_NEWS_DOMAINS) {
      if (lower.includes(domain)) return true;
    }
  }
  return false;
}

/**
 * Extract clean search query from conversational input
 * Removes filler words and conversational phrasing to create better search queries
 * @param {string} query - The user's conversational query
 * @returns {string} Cleaned search query
 */
export function extractSearchQuery(query) {
  if (!query || typeof query !== 'string') {
    return query;
  }

  let cleaned = query.trim();

  // Remove conversational filler at the start
  cleaned = cleaned.replace(/^(well|so|um|uh|okay|ok|now|hey|listen|look),?\s+/i, '');
  cleaned = cleaned.replace(/^(what's even|what is even|that's|that is)\s+/i, '');

  // Remove phrases like "someone told me that", "I heard that", etc.
  cleaned = cleaned.replace(/\b(someone told me that|I heard( that)?|I saw( that)?|they say|apparently|supposedly)\s+/gi, '');

  // For very long queries (>200 chars), try to extract the core topic
  if (cleaned.length > 200) {
    // Look for quoted phrases (likely the core topic)
    const quotedMatch = cleaned.match(/"([^"]+)"/);
    if (quotedMatch) {
      return quotedMatch[1];
    }

    // Look for company/product names + key action words
    const entityMatch = cleaned.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(released|announced|launched|unveiled|introduced|created|built|developed|acquired|bought|sold|hired|fired|quit)\s+([^.?,]+)/);
    if (entityMatch) {
      return `${entityMatch[1]} ${entityMatch[2]} ${entityMatch[3]}`.trim();
    }

    // Fallback: Take first 100 characters
    cleaned = cleaned.substring(0, 100);
  }

  // Remove trailing incomplete sentences
  cleaned = cleaned.replace(/\s+and\s*$/, '');
  cleaned = cleaned.replace(/\s+or\s*$/, '');
  cleaned = cleaned.replace(/\s+but\s*$/, '');

  return cleaned.trim();
}

/**
 * Detect proper nouns in query (capitalized words that likely represent named entities)
 * PRINCIPLE: Proper nouns + news structure = news query (CEO approach, not warehouse worker)
 * @param {string} query - The user's query
 * @returns {boolean} True if proper nouns detected
 */
export function hasProperNouns(query) {
  if (!query || typeof query !== 'string') {
    return false;
  }

  // Look for capitalized words that aren't at sentence start
  // Pattern: word boundary, capital letter, lowercase letters
  // Exclude common sentence starters and question words
  const excludeWords = /^(What|Where|When|Who|Why|How|Is|Are|Does|Do|Can|Could|Would|Should|Tell|Please|The|A|An|I|You|We|They|He|She|It)$/;

  const words = query.split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^\w]/g, ''); // Remove punctuation

    // Skip if empty or too short
    if (!word || word.length < 2) continue;

    // Check if word starts with capital and has lowercase letters
    if (/^[A-Z][a-z]+/.test(word)) {
      // If it's the first word, check if it's a common sentence starter
      if (i === 0 && excludeWords.test(word)) {
        continue;
      }

      // Found a proper noun
      return true;
    }

    // Also check for all-caps acronyms (UK, USA, CEO, etc.)
    if (/^[A-Z]{2,}$/.test(word)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if query is a factual entity query requiring external lookup
 * Detects "who is/was X", "what is/does [ProperNoun]" patterns.
 * Used by both isLookupRequired() and the orchestrator's shouldLookup check
 * to avoid duplicating this logic in two places.
 * "who are" requires a proper noun to avoid triggering for "who are you".
 * Personal possessive queries ("what are my pets names") are explicitly excluded —
 * these are memory-recall requests, not external entity lookups.
 * Organizational possessive queries ("what is our network monitoring system") are also excluded —
 * "our" and possessive "we" indicate internal organizational context, never external entities.
 * @param {string} query - The user's query
 * @returns {boolean} True if query is a factual entity question about a named entity
 */
export function isFactualEntityQuery(query) {
  if (!query || typeof query !== 'string') return false;
  // Personal possessive queries always refer to the user's own memories, not external entities.
  // Even if pet names (Bella, Max) look like proper nouns, the presence of "my" means this is
  // a personal memory recall request that must never trigger an external lookup.
  if (/\bmy\b/i.test(query)) return false;
  // Organizational possessive queries refer to internal systems, teams, or processes.
  // "our network monitoring system", "our team's deployment", "our current policy" — these are
  // internal operational context queries; external lookup adds zero value and inflates token cost.
  if (/\bour\b/i.test(query)) return false;
  // "we" as organizational first-person possessive: "what are we using for monitoring",
  // "how do we handle incidents", "what do we have for backup" all refer to internal context.
  // Guard uses word boundary + verb pattern to distinguish possessive "we" from incidental use
  // (e.g. "We asked the vendor about their system" won't match because "their" follows, not a
  // possessive referencing the org's own assets).
  if (/\bwe\b.{0,40}\b(our|use|have|do|handle|follow|track|monitor|deploy|run|manage|support|own|maintain|build|store|send|process|host|operate|call|report|log|test|review|schedule)\b/i.test(query)) return false;
  return (
    /\b(who is|who was)\b/i.test(query) ||
    (/\b(who are)\b/i.test(query) && hasProperNouns(query)) ||
    (/\b(what is|what are|what does|what did)\b/i.test(query) && hasProperNouns(query))
  );
}

/**
 * ISSUE #881 FIX: Detect if query is about a named entity's recent actions or current events.
 * Semantic structural detection: proper noun + action intent = current event query.
 * Does NOT rely on hardcoded entity names — uses hasProperNouns() + action structure patterns.
 * Catches conversational current-event queries that lack explicit freshness markers:
 *   "Did Saudi Arabia make a big commitment"
 *   "Did the Coast Guard have anything really big happen"
 *   "Seems like Elon Musk has something going on, what is it"
 *   "What is Schumer demanding from Trump"
 * @param {string} query - The user's query
 * @returns {boolean} True if query is about a named entity's current/recent actions
 */
export function isCurrentEventQuery(query) {
  if (!query || typeof query !== 'string') return false;

  // Must have a proper noun (named entity) — structural, not specific names
  if (!hasProperNouns(query)) return false;

  // Pattern 1: "Did [entity] [action verb]" — interrogative about named entity's past action
  // Catches: "Did Saudi Arabia make a commitment", "Did the Coast Guard have anything happen"
  if (/\bdid\b.{2,80}\b(make|have|do|sign|commit|announce|launch|attack|strike|deploy|declare|pass|release|invest|pledge|agree|demand|arrest|fire|hire|resign|cancel|approve|reject|sanction|win|lose|reach|expand|impose|lift|grant|file|enter|leave|join|break|end|start|build|buy|sell|acquire|merge|cut|raise|drop|fall|rise|hit|happen|occur|create|form|lead|push|back|support|oppose|call|force|allow|ban|extend|suspend|halt|resume|begin|complete|close|open|fund|warn|threaten|withdraw|issue|send|meet|visit|submit|accomplish|achieve|secure|confirm|deny|reveal|report|claim|say|address|propose|order|request|receive|gain|boost|increase|reduce)\b/i.test(query)) {
    return true;
  }

  // Pattern 2: "[entity] has something/anything going on/happening"
  // Catches: "Seems like Elon Musk has something going on"
  if (/\b(has|have|had)\b.{1,60}\b(something|anything|big|major|significant|serious|important|happening)\b.{0,40}\b(going on|happening|happen|occurred|went down)\b/i.test(query)) {
    return true;
  }

  // Pattern 3: "Seems like / I heard / apparently [entity] is doing something"
  // Catches: "Seems like Elon Musk has something going on, what is it"
  if (/\b(seems? like|looks? like|i heard|apparently|i read|i saw|they say|word is)\b.{0,80}\b(is|has|have|had|was|were|did|does|doing|making|getting|facing|dealing|happening|going)\b/i.test(query)) {
    return true;
  }

  // Pattern 4: "What is/What's [entity] [action gerund]" — current-state, NOT definitional
  // Catches: "What is Schumer demanding from Trump", "What's the fed doing these days"
  // Distinguished from definitions by action gerunds vs static nouns.
  // ISSUE #899 FIX (Bug 2): Extended to handle "What's" contraction (what'?s) in addition to
  // "what is/was/are/were" so informal phrasings are not missed.
  if (/\bwhat(?:'?s| is| was| are| were)\b.{0,60}\b(demanding|doing|planning|saying|claiming|proposing|pushing|seeking|pursuing|blocking|calling|threatening|warning|fighting|preparing|negotiating|forcing|opposing|supporting|backing|leading|facing|dealing|managing|running|holding|trying|attempting|making|accusing|denying|defending|arguing|advocating|endorsing|announcing|declaring|building|developing|creating|launching|expanding|increasing|reducing|cutting|raising|ordering|requesting|filing)\b/i.test(query)) {
    return true;
  }

  return false;
}

/**
 * Check if query has news intent (general news query)
 * PRINCIPLE-BASED: Detects news intent through STRUCTURE + PROPER NOUNS, not hardcoded name lists
 * @param {string} query - The user's query
 * @returns {boolean} True if news intent detected
 */
export function hasNewsIntent(query) {
  if (!query || typeof query !== 'string') {
    return false;
  }

  const normalizedQuery = query.toLowerCase().trim();

  // Check for news structural patterns
  const hasNewsStructure = NEWS_STRUCTURE_PATTERNS.some(pattern => pattern.test(normalizedQuery));

  // Check for proper nouns (named entities)
  const hasNamedEntity = hasProperNouns(query);

  // Check for geopolitical context markers
  const hasGeopoliticalContext = GEOPOLITICAL_CONTEXT_MARKERS.some(pattern => pattern.test(normalizedQuery));

  // Check for time markers indicating current events
  const hasTimeMarker = /\b(today|this morning|yesterday|right now|currently|latest|recent|just now)\b/i.test(normalizedQuery);

  // NEWS INTENT LOGIC (Principle-Based):
  // 1. News structure + proper noun = news query (e.g., "What's the situation with Starmer")
  // 2. News structure + geopolitical context = news query (e.g., "What's happening with the election")
  // 3. Proper noun + time marker = likely news (e.g., "Scholz today")
  // 4. Explicit news structure alone = news (e.g., "breaking news", "current events")

  return (
    (hasNewsStructure && hasNamedEntity) ||
    (hasNewsStructure && hasGeopoliticalContext) ||
    (hasNamedEntity && hasTimeMarker && hasGeopoliticalContext) ||
    (hasNewsStructure && /\b(breaking|current\s+events?)\b/i.test(normalizedQuery))
  );
}

/**
 * Check if query contains freshness markers
 * @param {string} query - The user's query
 * @returns {object} { hasFreshnessMarkers: boolean, markers: array }
 */
export function checkFreshnessMarkers(query) {
  if (!query || typeof query !== 'string') {
    return { hasFreshnessMarkers: false, markers: [] };
  }

  const normalizedQuery = query.toLowerCase().trim();
  const matchedMarkers = [];

  for (const pattern of FRESHNESS_MARKERS) {
    if (pattern.test(normalizedQuery)) {
      matchedMarkers.push(pattern.toString());
    }
  }

  return {
    hasFreshnessMarkers: matchedMarkers.length > 0,
    markers: matchedMarkers
  };
}

/**
 * Check if query requires corroboration (high-stakes news)
 * @param {string} query - The user's query
 * @param {string} truthType - Truth type (VOLATILE, SEMI_STABLE, PERMANENT)
 * @returns {boolean} True if corroboration required
 */
export function requiresCorroboration(query, truthType) {
  return truthType === 'VOLATILE' && HIGH_STAKES_NEWS_MARKERS.test(query);
}

/**
 * Check if fetched content contains reputable sources
 * @param {string} fetchedContent - Combined text from all sources
 * @returns {boolean} True if reputable source found
 */
export function hasReputableSource(fetchedContent) {
  return REPUTABLE_SOURCES.test(fetchedContent);
}

/**
 * Determine if external lookup is required
 * @param {string} query - The user's query
 * @param {object} truthTypeResult - Result from truthTypeDetector
 * @param {number} internalConfidence - Confidence in internal answer (0-1)
 * @returns {object} { required: boolean, reasons: array, priority: string }
 */
export function isLookupRequired(query, truthTypeResult, internalConfidence = 0.5) {
  // Ensure query is a string to avoid type confusion (arrays, objects, etc.)
  if (typeof query !== 'string') {
    console.warn('[externalLookupEngine] isLookupRequired called with non-string query, skipping lookup check');
    return {
      required: false,
      reasons: ['Invalid query type for lookup; expected string'],
      priority: 'none',
      max_lookups: 0
    };
  }

  // HARD BLOCK: Never lookup for document reviews (Issue #380 Fix 2)
  if (truthTypeResult.type === 'DOCUMENT_REVIEW') {
    console.log('[externalLookupEngine] Skipping lookup for document review');
    return {
      required: false,
      reasons: ['Document review requests do not require external lookup'],
      priority: 'none',
      max_lookups: 0
    };
  }

  // HARD BLOCK: Never lookup for personal memory recall queries (Issue #824 Fix)
  // "Do you recall names of my monkeys?" should use ONLY persistent memory, never external lookup.
  // These queries contain memory-recall verbs + possessive pronouns indicating personal context.
  // Previously "recall" matched the SAFETY domain and triggered Google News RSS — now blocked.
  // Extended patterns also catch "what are my pets names", "what is my dog's name", etc. where
  // the "my" possessive makes clear this is a personal memory question, not an external lookup.
  // Organizational context patterns block "our network monitoring system" style queries —
  // "our" always indicates internal organizational systems, never external lookup candidates.
  const isPersonalMemoryRecall = (
    /\b(do you (recall|remember)|can you (recall|remember))\b.{0,60}\bmy\b/i.test(query) ||
    /\b(what do you (know|have|remember) about my|tell me (what you know about |about )?my)\b/i.test(query) ||
    /\b(what'?s? my|recall|remember).{0,40}\bmy\b/i.test(query) ||
    /\b(from our (previous )?conversations?|i told you|we (discussed|talked) about)\b/i.test(query) ||
    // Broad possessive patterns: "what are my pets names", "what is my dog called", "who are my friends"
    /\b(what (are|is|were|was)|who (are|is|were|was)) my\b/i.test(query) ||
    // "my [personal topic]" — user asking about their own stored information.
    // 'allerg' and 'medic' are intentional prefix matches: they match 'allergy', 'allergies',
    // 'medication', 'medicine', 'medical' etc. so no personal health queries slip through.
    /\bmy\b.{0,50}\b(pet|dog|cat|fish|bird|rabbit|horse|hamster|name|kid|child|son|daughter|family|friend|boss|job|salary|email|phone|address|birthday|anniversary|allerg|medic|prescription)\b/i.test(query) ||
    // ORGANIZATIONAL CONTEXT: "our [system/service/infrastructure]" — internal operational queries.
    // These refer to systems and processes owned by the user's organization.
    // External lookup adds zero value (and wastes tokens) for all of these patterns.
    /\b(what is|what'?s?) (the )?current status of our\b/i.test(query) ||
    /\bhow is our\b.{0,60}\b(team|division|department|staff|group|org|service|system|infrastructure|process|project|product|platform|pipeline|deployment|environment|setup|monitoring|network|database|server|cluster|instance|stack|build|release|app|application)\b/i.test(query) ||
    /\bwhat are our\b.{0,60}\b(polic|procedur|protocol|process|standard|guideline|rule|practice|workflow|sop|step|requirement|objective|goal|plan|sprint|backlog|ticket|issue|incident|milestone|metric|kpi|sla|ola)\b/i.test(query) ||
    /\b(summarize|describe|explain|review) our\b.{0,60}\b(incident|situation|problem|issue|outage|alert|status|update|report|meeting|discussion|deployment|release|change|event|timeline|runbook|postmortem|root cause)\b/i.test(query) ||
    /\bwhat happened (with|to) our\b.{0,60}\b(service|system|deployment|release|build|server|network|database|pipeline|app|application|platform|environment|cluster|instance|monitor|alert)\b/i.test(query) ||
    // Catch-all: any query that starts with "our [owned noun]" framing (e.g. "our network monitoring system")
    /\bour\b.{0,30}\b(system|service|infrastructure|network|monitoring|team|policy|process|procedure|database|server|cluster|platform|pipeline|deployment|environment|setup|stack|product|project|application|app|tool|vendor|provider|contract|budget|incident|alert|oncall|on-call|runbook|dashboard|metric|kpi|sla|ola|backup|recovery|failover|config|configuration|architecture|design|plan|roadmap|sprint|backlog|ticket|repo|repository|codebase|code|branch|pr|pull request|ci|cd|build|release|version|changelog|log|audit)\b/i.test(query)
  );
  if (isPersonalMemoryRecall) {
    console.log('[externalLookupEngine] Skipping lookup — personal/organizational memory recall query (use persistent memory only)');
    return {
      required: false,
      reasons: ['Personal memory recall — use persistent memory retrieval, no external lookup'],
      priority: 'none',
      max_lookups: 0
    };
  }

  // HARD BLOCK: Never lookup for queries > 10K characters (Issue #380 Fix 2)
  if (query.length > 10000) {
    console.log('[externalLookupEngine] Skipping lookup for long input');
    return {
      required: false,
      reasons: ['Long-form inputs are not lookup candidates'],
      priority: 'none',
      max_lookups: 0
    };
  }

  const reasons = [];
  let priority = 'normal';
  let maxSources = LOOKUP_CONFIG.MAX_LOOKUPS_PER_REQUEST;

  // Check freshness markers
  const freshnessCheck = checkFreshnessMarkers(query);
  if (freshnessCheck.hasFreshnessMarkers) {
    reasons.push('freshness_markers_detected');
  }

  // Check news intent (NEW)
  if (hasNewsIntent(query)) {
    reasons.push('news_intent_detected');
    priority = 'high';
  }

  // Check truth type
  if (truthTypeResult.type === TRUTH_TYPES.VOLATILE) {
    reasons.push('volatile_truth_type');
    priority = 'high';
  }

  // Check high-stakes domains
  if (truthTypeResult.high_stakes && truthTypeResult.high_stakes.isHighStakes) {
    reasons.push('high_stakes_domain: ' + truthTypeResult.high_stakes.domains.join(', '));
    priority = 'high';
  }

  // Check if corroboration required (high-stakes news)
  if (requiresCorroboration(query, truthTypeResult.type)) {
    reasons.push('news_corroboration_required');
    priority = 'high';
    maxSources = 2; // Fetch from 2 sources for corroboration
  }

  // Check confidence threshold
  if (internalConfidence < LOOKUP_CONFIG.CONFIDENCE_THRESHOLD) {
    reasons.push('low_internal_confidence: ' + internalConfidence);
  }

  // ISSUE #859 FIX: Factual entity queries about named entities (people, companies, political figures)
  // "Who is the president of Venezuela", "What is Amazon Logistics", "What does Tesla do"
  // These may lack explicit freshness markers but still require external verification because
  // the information can change (leaders change, companies evolve). SEMI_STABLE + entity intent
  // is sufficient to warrant an external lookup.
  // NOTE: personal memory recall queries already return early above so this won't double-trigger.
  if (isFactualEntityQuery(query)) {
    reasons.push('factual_entity_query');
  }

  // ISSUE #881 FIX: Current event queries about named entities' recent actions
  // Catches conversational phrasing that lacks explicit freshness markers:
  // "Did Saudi Arabia make a big commitment", "Seems like Elon Musk has something going on"
  // "What is Schumer demanding from Trump", "Did the Coast Guard have anything really big happen"
  if (isCurrentEventQuery(query)) {
    reasons.push('current_event_query_named_entity');
    priority = 'high';
  }

  return {
    required: reasons.length > 0,
    reasons: reasons,
    priority: priority,
    max_lookups: priority === 'high' ? LOOKUP_CONFIG.HIGH_STAKES_MAX_LOOKUPS : maxSources
  };
}

/**
 * Select sources for query - prioritize API-based sources with reliable parsers
 * PRINCIPLE-BASED: Uses news intent detection, not hardcoded name lists
 * @param {string} query - The user's query
 * @param {string} truthType - Truth type (VOLATILE, SEMI_STABLE, PERMANENT)
 * @param {object} highStakesResult - Result from detectHighStakesDomain
 * @returns {array} Array of source objects (empty if no reliable source)
 */
export function selectSourcesForQuery(query, truthType, highStakesResult) {
  const lowerQuery = query.toLowerCase();

  // Currency exchange rates - use Exchange Rates API
  if (lowerQuery.match(/exchange rate|currency|EUR|USD|GBP|JPY|CHF|CAD|AUD/) &&
      lowerQuery.match(/current|rate|price|convert|exchange/i)) {
    return API_SOURCES.CURRENCY;
  }

  // Stock prices - prefer Yahoo Finance; fall through to Google News RSS if ticker can't be resolved
  // ISSUE #804 FIX (Area 2): Use Yahoo Finance structured API first to get actual quote numbers.
  // ISSUE #814 FIX (FAILURE 8): Broadened matching — "going for", "what's it", "at" as price indicators.
  // ISSUE #859 FIX: Added "now|today|right|worth" so "stock right now" and "stock today" trigger this path.
  if (lowerQuery.match(/\bstock\b/) &&
      lowerQuery.match(/price|value|trading|current|going for|what'?s it|how much|at\b|now\b|today\b|right\b|worth\b/i)) {
    console.log('[externalLookupEngine] Stock price query detected - using Yahoo Finance with news fallback');
    // Yahoo Finance is tried first; if buildUrl returns null (no ticker found) it is skipped
    // and the news RSS fallback handles the query.
    return [
      ...API_SOURCES.STOCKS,
      {
        name: 'Google News RSS (stock price fallback)',
        // ISSUE #810 FIX D: Extract entity name from conversational query instead of passing raw query.
        // ISSUE #814 FIX (FAILURE 6): Also strip apostrophe-s ('s / 's) to avoid "'s Walmart" artifacts.
        buildUrl: (query) => {
          // Strip question/price words to extract just the company/ticker name
          const entityQuery = query
            .replace(/\b(what|is|the|are|current|stock|share|price|of|today|now|currently|how|much|does|cost|worth|trading|value|market|tell|me|about|please|can|you|could|would|going|for|it|at|about|how)\b/gi, ' ')
            .replace(/'s\b/g, ' ')   // strip possessive 's (e.g. "What's" → "What " then strip "What ")
            .replace(/\b\w{1,2}\b/g, ' ')  // strip 1-2 char fragments left over (e.g. "s", "it")
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 40)
            .trim();
          const searchTerm = entityQuery.length >= 2 ? entityQuery : query.substring(0, 40).trim();
          console.log(`[externalLookupEngine] Stock RSS query extracted: "${searchTerm}" (from: "${query.substring(0, 60)}")`);
          return `https://news.google.com/rss/search?q=${encodeURIComponent(searchTerm + ' stock price')}&hl=en-US&gl=US&ceid=US:en`;
        },
        parser: 'rss',
        type: 'news_fallback',
        extract: (text) => {
          const items = [];
          const itemRegex = /<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>[\s\S]*?<source[^>]*>(.*?)<\/source>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<\/item>/gi;
          let match;
          while ((match = itemRegex.exec(text)) !== null && items.length < 5) {
            items.push({ title: match[1], source: match[2], date: match[3] });
          }
          return items.length > 0 ? items.map(i => `[${i.source}] ${i.title} (${i.date})`).join('\n\n') : null;
        }
      }
    ];
  }

  // Commodity prices - use metals/commodity API with news fallback
  // ISSUE #776 FIX 3: Add Google News RSS as fallback when commodity APIs fail
  // ISSUE #804 REVIEW FIX: Added 'gas' to cover "natural gas" queries
  if (lowerQuery.match(/gold|silver|platinum|palladium|copper|oil|gas|commodity|commodities/) &&
      lowerQuery.match(/price|cost|value|worth|ounce|barrel/i)) {
    console.log('[externalLookupEngine] Commodity price query detected - using COMMODITIES sources with news fallback');

    // Build sources array: commodity APIs first, news RSS as fallback
    const commoditySources = [];

    // Only add Metals-API if key is set
    if (process.env.METALS_API_KEY) {
      commoditySources.push(API_SOURCES.COMMODITIES[0]);
    } else {
      console.log('[externalLookupEngine] METALS_API_KEY not set, skipping Metals-API source');
    }

    // Only add Goldapi.io if key is set
    if (process.env.GOLDAPI_KEY) {
      commoditySources.push(API_SOURCES.COMMODITIES[1]);
    } else {
      console.log('[externalLookupEngine] GOLDAPI_KEY not set, skipping Goldapi.io source');
    }

    // ISSUE #908 FIX 2: Always add metals.live (free tier, no API key required, <30k req/month)
    // Covers gold and silver. Cascades here if GoldAPI fails, rate-limits, or key is not set.
    // Also handles weight-based queries (e.g. "50 lbs of gold worth") with unit conversion.
    commoditySources.push(API_SOURCES.COMMODITIES[2]);

    // FALLBACK: Add Google News RSS for commodity price queries
    // Commodity prices are newsworthy and often appear in news articles
    commoditySources.push({
      name: 'Google News RSS (commodity fallback)',
      // ISSUE #810 FIX D: Extract commodity name from conversational query
      buildUrl: (query) => {
        const entityQuery = query
          .replace(/\b(what|is|the|are|current|price|of|today|now|currently|how|much|does|cost|worth|tell|me|about|please|can|you|could|would|ounce|barrel|pound)\b/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 40)
          .trim();
        const searchTerm = entityQuery.length >= 2 ? entityQuery : query.substring(0, 40).trim();
        return `https://news.google.com/rss/search?q=${encodeURIComponent(searchTerm + ' price')}&hl=en-US&gl=US&ceid=US:en`;
      },
      parser: 'rss',
      type: 'news_fallback',
      extract: (text) => {
        const items = [];
        const itemRegex = /<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>[\s\S]*?<source[^>]*>(.*?)<\/source>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<\/item>/gi;
        let match;
        while ((match = itemRegex.exec(text)) !== null && items.length < 5) {
          items.push({ title: match[1], source: match[2], date: match[3] });
        }
        return items.length > 0 ? items.map(i => `[${i.source}] ${i.title} (${i.date})`).join('\n\n') : null;
      }
    });

    return commoditySources;
  }

  // Note: Oil/gas/crude are handled by the commodity block above (line 659 includes 'oil')
  // which falls back to Google News RSS when no API keys are configured.

  // Government/political positions - use Wikipedia API
  if (lowerQuery.match(/prime minister|president|chancellor|leader|government/) &&
      lowerQuery.match(/current|who is|UK|United Kingdom|USA|United States|Germany|France/i)) {
    return API_SOURCES.GOVERNMENT;
  }

  // ISSUE #899 FIX (Bug 1): Institution news queries must route to NEWS, not financial/crypto sources.
  // "the fed has something going on" was routing to CoinGecko because "eth" (no word boundaries)
  // matched the substring inside "something" (somETHing). Guard: if the query references a known
  // institution and shows current-event structure, route to NEWS before any financial/crypto checks.
  // Reuses the INSTITUTION_PATTERN that already exists in ensureQueryViability / cleanNewsQuery.
  // ISSUE #901 FIX: Added third condition — guard must NOT fire on genuine crypto queries.
  // "What's the current price of Bitcoin" has current-event structure but is a crypto query;
  // excluding crypto tokens here ensures CoinGecko is always reached for crypto price lookups.
  const _INSTITUTION_NEWS_GUARD = /\b(Fed(?:eral\s+Reserve)?|FBI|CIA|NSA|NATO|UN|EU|IMF|WHO|CDC|IRS|SEC|DOJ|DHS|Pentagon|Congress|Senate|SCOTUS|White\s+House|Kremlin|Vatican|OPEC|FDIC|CFPB|FDA|FTC|EPA|FCC|FEMA|ATF|DEA|CBP|ICE|Treasury|Interpol|Europol|CFTC|NLRB|OMB|CBO|GAO|DNC|RNC|OECD|WTO|IAEA)\b/i;
  if (_INSTITUTION_NEWS_GUARD.test(query) && (isCurrentEventQuery(query) || hasNewsIntent(query)) && !lowerQuery.match(/\b(bitcoin|btc|ethereum|eth|crypto|cryptocurrency)\b/)) {
    console.log('[externalLookupEngine] Institution news query detected — routing to NEWS sources (not financial/crypto)');
    return API_SOURCES.NEWS;
  }

  // Crypto - use API
  // ISSUE #899 FIX (Bug 1): Added \b word boundaries to prevent "eth" matching inside words
  // like "something" (somETHing), which was causing Federal Reserve queries to route to CoinGecko.
  if (lowerQuery.match(/\b(bitcoin|btc|ethereum|eth|crypto|cryptocurrency)\b/)) {
    return API_SOURCES.CRYPTO;
  }

  // Medical drug queries - use FDA API with specific field extraction
  if (lowerQuery.match(/side effects?|dosage|drug interactions?/) &&
      lowerQuery.match(/aspirin|ibuprofen|acetaminophen|tylenol|advil/)) {
    return API_SOURCES.MEDICAL;
  }

  // Weather queries - use Open-Meteo (free, no key) with news as fallback
  // ISSUE #406 FIX: Now has a real weather API instead of falling back to news RSS
  // ISSUE #810 FIX E: Use word boundaries to prevent false positives (e.g. "Ukraine" contains "rain")
  if (lowerQuery.match(/\b(weather|temperature|forecast|rain|snow|storm)\b/i)) {
    console.log('[externalLookupEngine] Weather query detected - using Open-Meteo with news fallback');
    return [...API_SOURCES.WEATHER, ...API_SOURCES.NEWS];
  }

  // News/current events queries - PRINCIPLE-BASED DETECTION
  // Use hasNewsIntent() which detects structure + proper nouns, not hardcoded names
  // ISSUE #406 FIX: Also check for generic news queries without proper nouns
  const isGenericNewsQuery = lowerQuery.match(/\b(top|latest|recent|breaking)\s+(news|stories|headlines|updates)\b/i);
  const isEntertainmentQuery = lowerQuery.match(/\b(celebrity|entertainment|gossip)\b/i);
  
  // Note: Weather queries are already handled above
  // ISSUE #881 FIX: Current event queries about named entities' actions go directly to NEWS
  // "Did Saudi Arabia make a commitment", "What is Schumer demanding from Trump"
  if (hasNewsIntent(query) || isGenericNewsQuery || isEntertainmentQuery || isCurrentEventQuery(query)) {
    return API_SOURCES.NEWS;
  }

  // Additional news patterns (attacks, breaking events, etc.)
  if (lowerQuery.match(/attack|breaking|killed|died|war|invasion|military|bombing|coup|strike/i)) {
    return API_SOURCES.NEWS;
  }

  // ISSUE #406 FIX: Celebrity/entertainment news
  if (lowerQuery.match(/celebrity|entertainment|gossip|hollywood/i) && lowerQuery.match(/news|latest|recent|stories/i)) {
    return API_SOURCES.NEWS;
  }

  // Factual entity queries - Wikipedia REST article summary + DuckDuckGo fallback
  // Applies to "who is X", "what is X", "does X do Y", entity description queries
  // This comes after news routing so news-flavoured queries (latest, breaking) go to GDELT/RSS
  if (lowerQuery.match(/\b(who is|who was|who are|what is|what are|what does|what did)\b/i) ||
      lowerQuery.match(/\bdoes\s+\w+(\s+\w+)?\s+(do|offer|provide|make|sell|produce|have)\b/i) ||
      lowerQuery.match(/\bis\s+\w+(\s+\w+)?\s+(a|an)\s+\w+/i)) {
    console.log('[externalLookupEngine] Factual entity query detected - using Wikipedia REST + DuckDuckGo + news fallback');
    return [...API_SOURCES.FACTUAL_ENTITY, ...API_SOURCES.GENERAL_FALLBACK, ...API_SOURCES.NEWS];
  }

  // Wikipedia ONLY for PERMANENT definition/history queries, NOT high-stakes
  if (truthType === TRUTH_TYPES.PERMANENT && !highStakesResult?.isHighStakes) {
    return [...AUTHORITATIVE_SOURCES.GENERAL, ...API_SOURCES.GENERAL_FALLBACK];
  }

  // ISSUE #814 FIX: Broadened fallback for VOLATILE/SEMI_STABLE queries
  // Per specification: any VOLATILE/SEMI_STABLE query should attempt structured sources then news when no
  // structured API exists, not only when specific freshness words appear.
  // This covers "When is Apple's new event", "Is there anything new going on with Greenland",
  // and similar queries that have current-events intent but don't use the exact freshness words.
  if (truthType === TRUTH_TYPES.VOLATILE || truthType === TRUTH_TYPES.SEMI_STABLE) {
    console.log('[externalLookupEngine] Using DuckDuckGo + news fallback for volatile/semi-stable query');
    return [...API_SOURCES.GENERAL_FALLBACK, ...API_SOURCES.NEWS];
  }

  // No reliable source available - return empty, trigger graceful degradation
  return [];
}

/**
 * Get authoritative sources for a query based on detected domains (legacy)
 * @param {object} highStakesResult - Result from detectHighStakesDomain
 * @returns {array} Array of source objects
 */
export function getSourcesForQuery(highStakesResult) {
  if (!highStakesResult || !highStakesResult.isHighStakes) {
    return AUTHORITATIVE_SOURCES.GENERAL;
  }

  const sources = [];
  for (const domain of highStakesResult.domains) {
    if (AUTHORITATIVE_SOURCES[domain]) {
      sources.push(...AUTHORITATIVE_SOURCES[domain]);
    }
  }

  // Add general sources as fallback
  if (sources.length < LOOKUP_CONFIG.MAX_SOURCES_PER_QUERY) {
    sources.push(...AUTHORITATIVE_SOURCES.GENERAL);
  }

  // Limit to max sources
  return sources.slice(0, LOOKUP_CONFIG.MAX_SOURCES_PER_QUERY);
}

/**
 * Perform external lookup with real HTTP fetches and proper parsing
 * @param {string} query - The user's query
 * @param {array} sources - Sources to consult
 * @param {string} truthType - Truth type for corroboration check
 * @returns {Promise<object>} Lookup result
 */
export async function performLookup(query, sources, truthType = null) {
  const startTime = Date.now();

  // Extract clean search query from conversational input
  const searchQuery = extractSearchQuery(query);
  const queryWasCleaned = searchQuery !== query;

  if (queryWasCleaned) {
    console.log(`[externalLookupEngine] Cleaned query: "${query.substring(0, 80)}..." → "${searchQuery}"`);
  } else {
    console.log(`[externalLookupEngine] Performing lookup for: "${searchQuery.substring(0, 50)}..."`);
  }
  console.log(`[externalLookupEngine] Sources: ${sources.map(s => s.name).join(', ')}`);

  // Check cache using original query as key (not cleaned query)
  const cached = cacheGet(query);
  if (cached) {
    console.log(`[externalLookupEngine] Cache hit for query`);
    return {
      success: true,
      from_cache: true,
      data: cached.data,
      sources_used: cached.sources_used,
      verified_at: cached.verified_at,
      cache_valid_until: cached.cache_valid_until,
      lookup_time_ms: Date.now() - startTime
    };
  }

  // Perform actual external lookups using cleaned query
  const results = [];
  const sourcesUsed = [];
  let totalTextFetched = 0;

  try {
    // Fetch from each source with timeout
    for (const source of sources.slice(0, LOOKUP_CONFIG.MAX_SOURCES_PER_QUERY)) {
      if (totalTextFetched >= LOOKUP_CONFIG.MAX_FETCHED_TEXT) {
        console.log(`[externalLookupEngine] Reached max fetched text limit`);
        break;
      }

      try {
        // Handle sources with async multi-step fetch (e.g., Open-Meteo requires geocoding first)
        if (source.fetchData) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), LOOKUP_CONFIG.TIMEOUT_MS);
          let fetchedData;
          try {
            fetchedData = await source.fetchData(searchQuery, controller.signal);
          } finally {
            clearTimeout(timeoutId);
          }
          if (!fetchedData) {
            console.log(`[externalLookupEngine] ${source.name} fetchData returned null`);
            sourcesUsed.push({ name: source.name, type: source.type || 'api', status: 'no_data', success: false });
            continue;
          }
          const remaining = LOOKUP_CONFIG.MAX_FETCHED_TEXT - totalTextFetched;
          const bounded = fetchedData.length > remaining ? fetchedData.substring(0, remaining) : fetchedData;
          totalTextFetched += bounded.length;
          results.push({ source: source.name, text: bounded, length: bounded.length, type: source.type || 'api' });
          sourcesUsed.push({ name: source.name, type: source.type || 'api', status: 'success', text_length: bounded.length, success: true });
          console.log(`[externalLookupEngine] ✓ ${source.name}: ${bounded.length} chars extracted`);
          continue;
        }

        // Build URL if function provided - use cleaned search query
        // Handle url as function (for dynamic API keys) or buildUrl function
        let fetchUrl;
        if (source.buildUrl) {
          fetchUrl = source.buildUrl(searchQuery);
        } else if (typeof source.url === 'function') {
          fetchUrl = source.url(searchQuery);
        } else {
          fetchUrl = source.url;
        }
        
        // Skip this source if buildUrl/url returned null (couldn't extract required info)
        if (!fetchUrl) {
          console.log(`[externalLookupEngine] ${source.name} buildUrl returned null - skipping source`);
          continue;
        }
        
        console.log(`[externalLookupEngine] Fetching from ${source.name} (${fetchUrl})`);

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), LOOKUP_CONFIG.TIMEOUT_MS);

        // Perform fetch with timeout; merge source-specific headers (e.g. GoldAPI x-access-token)
        // getHeaders() is called at request time (supports env vars set after module load)
        const sourceHeaders = typeof source.getHeaders === 'function' ? source.getHeaders() : (source.headers || {});
        const response = await fetch(fetchUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'SiteMonkeys-AI-System/1.0',
            'Accept': 'application/json,text/html,text/plain',
            ...sourceHeaders
          }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.log(`[externalLookupEngine] ${source.name} returned ${response.status}`);
          sourcesUsed.push({
            name: source.name,
            type: source.type || 'unknown',
            status: `error_${response.status}`,
            success: false
          });
          continue;
        }

        // Parse response based on source parser type
        let parsedData = null;
        let extractedText = null;

        if (source.parser === 'rss') {
          // RSS feed parsing
          const text = await response.text();
          if (source.extract && typeof source.extract === 'function') {
            extractedText = source.extract(text);
          } else {
            extractedText = text.substring(0, 2000);
          }

          // If extraction failed, mark as failed
          if (!extractedText) {
            console.log(`[externalLookupEngine] ${source.name} extraction returned null`);
            sourcesUsed.push({
              name: source.name,
              type: source.type || 'api',
              status: 'extraction_failed',
              success: false
            });
            continue;
          }

          parsedData = extractedText;
        } else if (source.parser === 'json') {
          // JSON API response
          const jsonData = await response.json();

          // Apply extractor if provided
          if (source.extract && typeof source.extract === 'function') {
            // Pass both jsonData and query to extractor (some extractors need query context)
            extractedText = source.extract(jsonData, searchQuery);
          } else {
            extractedText = JSON.stringify(jsonData).substring(0, 1000);
          }

          // If extraction failed, mark as failed
          if (!extractedText) {
            console.log(`[externalLookupEngine] ${source.name} extraction returned null`);
            sourcesUsed.push({
              name: source.name,
              type: source.type || 'api',
              status: 'extraction_failed',
              success: false
            });
            continue;
          }

          parsedData = extractedText;
        } else {
          // HTML or plain text - only if parseable flag is true
          if (source.parseable === false) {
            console.log(`[externalLookupEngine] ${source.name} marked as non-parseable, skipping`);
            sourcesUsed.push({
              name: source.name,
              type: source.type || 'unknown',
              status: 'non_parseable',
              success: false
            });
            continue;
          }

          let text = await response.text();

          // Apply extractor if provided
          if (source.extract && typeof source.extract === 'function') {
            try {
              parsedData = source.extract({ text });
            } catch (extractError) {
              console.log(`[externalLookupEngine] ${source.name} extractor failed: ${extractError.message}`);
              sourcesUsed.push({
                name: source.name,
                type: source.type || 'unknown',
                status: 'extractor_error',
                success: false
              });
              continue;
            }
          } else {
            // No extractor - use raw text (bounded)
            parsedData = text.substring(0, 2000);
          }
        }

        if (!parsedData) {
          console.log(`[externalLookupEngine] ${source.name} produced no usable data`);
          sourcesUsed.push({
            name: source.name,
            type: source.type || 'unknown',
            status: 'no_data',
            success: false
          });
          continue;
        }

        // ISSUE #877: Minimum content threshold — if source returns under 200 chars of usable
        // content, treat it as a failure and cascade to the next source rather than injecting
        // thin data into the prompt (e.g. DuckDuckGo null responses, GDELT title-only results).
        const MIN_CONTENT_THRESHOLD = 200;
        if (parsedData.length < MIN_CONTENT_THRESHOLD) {
          console.log(`[externalLookupEngine] ${source.name} returned only ${parsedData.length} chars (below ${MIN_CONTENT_THRESHOLD} threshold), cascading to next source`);
          sourcesUsed.push({
            name: source.name,
            type: source.type || 'unknown',
            status: 'below_threshold',
            text_length: parsedData.length,
            success: false
          });
          continue;
        }

        // Track text length
        const textLength = parsedData.length;
        const remainingBudget = LOOKUP_CONFIG.MAX_FETCHED_TEXT - totalTextFetched;
        if (textLength > remainingBudget) {
          parsedData = parsedData.substring(0, remainingBudget);
        }

        totalTextFetched += parsedData.length;

        // Store result
        results.push({
          source: source.name,
          text: parsedData,
          length: parsedData.length,
          type: source.type || 'api'
        });

        sourcesUsed.push({
          name: source.name,
          type: source.type || 'api',
          status: 'success',
          text_length: parsedData.length,
          success: true
        });

        console.log(`[externalLookupEngine] ✓ ${source.name}: ${parsedData.length} chars extracted`);

      } catch (fetchError) {
        if (fetchError.name === 'AbortError') {
          console.log(`[externalLookupEngine] ${source.name} timed out`);
          sourcesUsed.push({
            name: source.name,
            type: source.type || 'unknown',
            status: 'timeout',
            success: false
          });
        } else {
          console.log(`[externalLookupEngine] ${source.name} fetch error: ${fetchError.message}`);
          sourcesUsed.push({
            name: source.name,
            type: source.type || 'unknown',
            status: 'error',
            error: fetchError.message,
            success: false
          });
        }
      }
    }

    // If we got any results, consider it a success
    if (results.length > 0) {
      const combinedData = {
        query: query,
        sources: results,
        total_text_length: totalTextFetched,
        timestamp: new Date().toISOString()
      };

      // Check for news corroboration if required
      const phase4Metadata = {};
      if (truthType && requiresCorroboration(query, truthType)) {
        // Combine all fetched content for reputable source check
        const fetchedContent = results.map(r => r.text).join(' ');
        phase4Metadata.news_corroborated = hasReputableSource(fetchedContent);
        phase4Metadata.news_sources_checked = sourcesUsed.map(s => s.name);

        // Add disclosure if corroboration failed
        if (!phase4Metadata.news_corroborated) {
          phase4Metadata.disclosure = "Multiple outlets are reporting this, but I cannot confirm from reputable sources like Reuters or AP. Please verify independently.";
        }
      }

      // ISSUE #790 FIX: Detect if this is a price query using only RSS sources
      // RSS headlines don't contain live spot prices, so we must disclose this
      // NOTE: "value" removed - too broad (causes false positives for "value of my contract", "value of my home")
      const isPriceQuery = query.match(/\b(price|cost|quote|trading|today)\b/i) &&
                          (query.match(/\b(gold|silver|platinum|palladium|copper|oil|crude|commodity)\b/i) ||
                           query.match(/\b(stock|share|apple|google|microsoft|tesla)\b/i));

      const onlyRssSources = results.every(r => r.type === 'news_fallback' || r.source.includes('RSS'));
      const hasNumericQuote = results.some(r => {
        // Check if the text contains price patterns like "$123.45" or "123.45 USD"
        return /\$\d+\.?\d*|\d+\.?\d*\s*(USD|usd|dollars?|ounce|oz)/i.test(r.text);
      });

      // ISSUE #810 CHANGE 1: Add structured metadata flags for RSS clamp (replaces string-matching)
      // Determine source type based on what sources were actually used
      let sourceType = 'unknown';
      if (onlyRssSources) {
        sourceType = 'headlines';
      } else if (results.some(r => r.type === 'api')) {
        sourceType = 'structured_api';
      } else {
        sourceType = 'mixed';
      }

      if (isPriceQuery && onlyRssSources && !hasNumericQuote) {
        console.log('[MARKET-DATA] source=rss has_numeric_quote=false fallback=headlines_summary');
        phase4Metadata.disclosure = (phase4Metadata.disclosure ? phase4Metadata.disclosure + ' ' : '') +
          "No live quote source configured; headlines don't include spot price. The response is based on market direction and drivers from recent news.";
      } else if (isPriceQuery && results.some(r => r.type === 'api')) {
        // Log when we have actual price data from API
        console.log('[MARKET-DATA] source=api has_numeric_quote=true');
      }

      return {
        success: true,
        from_cache: false,
        lookup_attempted: true,
        lookup_completed: true,
        data: combinedData,
        sources_consulted: sourcesUsed,
        sources_succeeded: results.length,
        total_text_fetched: totalTextFetched,
        verified_at: new Date().toISOString(),
        lookup_time_ms: Date.now() - startTime,
        sourceType: sourceType,           // ISSUE #810 CHANGE 1: Structured metadata flag
        hasNumericQuote: hasNumericQuote, // ISSUE #810 CHANGE 1: Structured metadata flag
        ...phase4Metadata
      };
    }

    // No results - all sources failed
    return {
      success: false,
      from_cache: false,
      lookup_attempted: true,
      lookup_completed: false,
      error: 'All sources failed or returned no data',
      sources_consulted: sourcesUsed,
      verified_at: new Date().toISOString(),
      lookup_time_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error(`[externalLookupEngine] Lookup failed:`, error);
    return {
      success: false,
      from_cache: false,
      lookup_attempted: true,
      lookup_completed: false,
      error: error.message,
      sources_consulted: sourcesUsed || [],
      verified_at: new Date().toISOString(),
      lookup_time_ms: Date.now() - startTime
    };
  }
}

/**
 * Get appropriate verification sources based on query type
 * @param {string} query - The user's query
 * @returns {array} Array of verification sources with URLs
 */
function getVerificationSources(query) {
  const lowerQuery = query.toLowerCase();

  // Currency exchange rates
  if (lowerQuery.match(/exchange rate|currency|EUR|USD|GBP/i)) {
    return [
      { name: 'XE.com', url: 'https://www.xe.com' },
      { name: 'Google Finance', url: 'https://www.google.com/finance' }
    ];
  }

  // Stock prices
  if (lowerQuery.includes('stock') || lowerQuery.includes('share') || 
      (lowerQuery.includes('market') && lowerQuery.includes('price'))) {
    return [
      { name: 'Yahoo Finance', url: 'https://finance.yahoo.com' },
      { name: 'Google Finance', url: 'https://www.google.com/finance' }
    ];
  }

  // Commodity prices
  if (lowerQuery.includes('gold') || lowerQuery.includes('silver') || 
      (lowerQuery.includes('oil') && lowerQuery.includes('price'))) {
    return [
      { name: 'Kitco', url: 'https://www.kitco.com' },
      { name: 'Bloomberg', url: 'https://www.bloomberg.com/markets/commodities' }
    ];
  }

  // Government/political positions
  if (lowerQuery.match(/prime minister|president|chancellor/i)) {
    return [
      { name: 'Wikipedia', url: 'https://en.wikipedia.org' },
      { name: 'Official government website', url: 'Search for official gov site' }
    ];
  }

  // News queries
  if (hasNewsIntent(query)) {
    return [
      { name: 'Reuters', url: 'https://www.reuters.com' },
      { name: 'Associated Press', url: 'https://apnews.com' }
    ];
  }

  // Default general sources
  return [
    { name: 'Google Search', url: 'https://www.google.com' },
    { name: 'Wikipedia', url: 'https://en.wikipedia.org' }
  ];
}

/**
 * Execute graceful degradation when lookup fails
 * PRINCIPLE: When you can't answer, be SHORT and direct - point to where they CAN get the answer
 * @param {string} query - The user's query
 * @param {object} lookupResult - Failed lookup result
 * @param {object} internalAnswer - Best internal answer available
 * @returns {object} Degraded response with proper disclosure
 */
export function gracefulDegradation(query, lookupResult, internalAnswer = null) {
  const sources = getVerificationSources(query);

  // CRITICAL: Minimal disclosure for failed lookups
  // The user needs to know quickly they should look elsewhere, not read 200 words about why we failed
  const disclosure = "I can't access current data for this query.";

  return {
    success: true,
    degraded: true,
    disclosure: disclosure,
    minimal_response_required: true, // Signal to response generator: keep it SHORT
    max_response_words: 30, // Maximum words for the response
    internal_answer: internalAnswer,
    internal_answer_labeled: internalAnswer ? {
      data: internalAnswer,
      label: 'Based on training data (as of early 2024) - may be outdated',
      confidence: 'unverified'
    } : null,
    verification_path: {
      message: 'Check current information at:',
      sources: sources.slice(0, 2) // Max 2 sources for brevity
    },
    lookup_error: lookupResult.error || 'No reliable source available',
    timestamp: new Date().toISOString()
  };
}

/**
 * Main entry point: Execute external lookup with full pipeline
 * @param {string} query - The user's query
 * @param {object} options - Options { internalConfidence, internalAnswer, forceRefresh }
 * @returns {Promise<object>} Complete lookup result with telemetry
 */
export async function lookup(query, options = {}) {
  const startTime = Date.now();
  const {
    internalConfidence = 0.5,
    internalAnswer = null,
    forceRefresh = false
  } = options;

  // Input sanitization - Prevent ReDoS and injection
  if (typeof query !== 'string') {
    query = String(query || '');
  }
  query = query.slice(0, 500).replace(/[\x00-\x1F\x7F]/g, '');

  // Validate query is not empty after sanitization
  if (!query || query.trim().length === 0) {
    return {
      success: false,
      lookup_performed: false,
      reason: 'Invalid or empty query after sanitization',
      truth_type: null,
      internal_confidence: internalConfidence,
      total_time_ms: Date.now() - startTime
    };
  }

  console.log(`[externalLookupEngine] Lookup requested for: "${query.substring(0, 50)}..."`);

  // Get truth type for the query
  const truthTypeResult = await detectTruthType(query);

  // Check if lookup is required
  const lookupCheck = isLookupRequired(query, truthTypeResult, internalConfidence);

  if (!lookupCheck.required && !forceRefresh) {
    console.log(`[externalLookupEngine] Lookup not required: ${lookupCheck.reasons.length === 0 ? 'no triggers matched' : 'skipped'}`);
    return {
      success: true,
      lookup_performed: false,
      reason: 'Lookup not required - no triggers matched',
      truth_type: truthTypeResult.type,
      internal_confidence: internalConfidence,
      total_time_ms: Date.now() - startTime
    };
  }

  // Select appropriate sources using new query-to-source matching
  const sources = selectSourcesForQuery(query, truthTypeResult.type, truthTypeResult.high_stakes);

  // Handle no reliable source available
  if (sources.length === 0) {
    console.log(`[externalLookupEngine] No reliable parseable source available for this query type`);
    const degraded = gracefulDegradation(query, { error: 'No reliable parseable source available for this query type' }, internalAnswer);
    return {
      ...degraded,
      success: true,
      lookup_performed: false,
      lookup_attempted: true,
      failure_reason: 'No reliable parseable source available for this query type',
      truth_type: truthTypeResult.type,
      lookup_reasons: lookupCheck.reasons,
      total_time_ms: Date.now() - startTime
    };
  }

  // Perform lookup with truth type for corroboration
  const lookupResult = await performLookup(query, sources, truthTypeResult.type);

  // Handle failure with graceful degradation
  if (!lookupResult.success) {
    console.log(`[externalLookupEngine] Lookup failed, executing graceful degradation`);
    const degraded = gracefulDegradation(query, lookupResult, internalAnswer);
    return {
      ...degraded,
      truth_type: truthTypeResult.type,
      lookup_reasons: lookupCheck.reasons,
      total_time_ms: Date.now() - startTime
    };
  }

  // Cache successful result if we have data
  let cacheEntry = null;
  if (lookupResult.data && !lookupResult.from_cache) {
    cacheEntry = cacheSet(
      query,
      lookupResult.data,
      truthTypeResult.type,
      lookupResult.sources_consulted || sources,
      0.8 // Default confidence for external data
    );
  }

  // Pass through corroboration metadata if present
  const corroborationMetadata = {};
  if (lookupResult.news_corroborated !== undefined) {
    corroborationMetadata.news_corroborated = lookupResult.news_corroborated;
  }
  if (lookupResult.news_sources_checked !== undefined) {
    corroborationMetadata.news_sources_checked = lookupResult.news_sources_checked;
  }
  if (lookupResult.disclosure !== undefined) {
    corroborationMetadata.disclosure = lookupResult.disclosure;
  }

  return {
    success: true,
    lookup_performed: true,
    from_cache: lookupResult.from_cache,
    data: lookupResult.data,
    sources_used: lookupResult.sources_consulted || sources,
    verified_at: lookupResult.verified_at,
    cache_valid_until: cacheEntry?.cache_valid_until || lookupResult.cache_valid_until || null,
    truth_type: truthTypeResult.type,
    truth_ttl_ms: truthTypeResult.ttl_ms,
    lookup_reasons: lookupCheck.reasons,
    lookup_priority: lookupCheck.priority,
    lookup_time_ms: lookupResult.lookup_time_ms,
    total_time_ms: Date.now() - startTime,
    ...corroborationMetadata
  };
}

/**
 * Test endpoint handler for /api/test-semantic?action=external-lookup
 * @param {string} query - Query to test
 * @param {object} options - Test options
 * @returns {Promise<object>} Lookup result with telemetry
 */
export async function testLookup(query, options = {}) {
  console.log(`[externalLookupEngine] Test lookup for: "${query}"`);

  if (!query) {
    return {
      success: true,
      message: 'External Lookup Engine operational',
      usage: 'Add &q=your+query to test lookup',
      examples: [
        '?action=external-lookup&q=What%20is%20the%20current%20price%20of%20Bitcoin',
        '?action=external-lookup&q=What%20are%20the%20side%20effects%20of%20aspirin',
        '?action=external-lookup&q=What%20is%20the%20Pythagorean%20theorem'
      ],
      config: LOOKUP_CONFIG
    };
  }

  // Ensure query is a string before passing to lookup to avoid type confusion
  if (typeof query !== 'string') {
    return {
      success: false,
      message: 'Invalid query type; expected string parameter "q"',
      received_type: typeof query
    };
  }

  const result = await lookup(query, options);

  return {
    query: query,
    result: result,
    telemetry: {
      lookup_performed: result.lookup_performed,
      from_cache: result.from_cache || false,
      truth_type: result.truth_type,
      lookup_reasons: result.lookup_reasons || [],
      degraded: result.degraded || false,
      total_time_ms: result.total_time_ms
    }
  };
}

// Default export
export default {
  LOOKUP_CONFIG,
  API_SOURCES,
  AUTHORITATIVE_SOURCES,
  extractSearchQuery,
  hasProperNouns,
  hasNewsIntent,
  checkFreshnessMarkers,
  requiresCorroboration,
  hasReputableSource,
  isCurrentEventQuery,
  isLookupRequired,
  selectSourcesForQuery,
  getSourcesForQuery,
  performLookup,
  gracefulDegradation,
  lookup,
  testLookup
};
