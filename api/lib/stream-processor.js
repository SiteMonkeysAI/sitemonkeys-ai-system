// api/lib/stream-processor.js
// STREAM PROCESSOR - Real-time data integration and processing
// Integrates live data streams for current awareness and context

import express from 'express';

class StreamProcessor {
  constructor() {
    this.activeStreams = new Map();
    this.streamHistory = [];
    this.dataProcessors = new Map();
    this.alertThresholds = new Map();
    this.realTimeCache = new Map();
    this.initialized = false;
  }

  async initialize() {
    try {
      console.log('📡 Initializing stream processor...');
      
      // Initialize data processors
      this.initializeDataProcessors();
      
      // Initialize alert thresholds
      this.initializeAlertThresholds();
      
      // Initialize real-time cache
      this.initializeRealTimeCache();
      
      // Setup stream monitoring
      this.setupStreamMonitoring();
      
      this.initialized = true;
      console.log('✅ Stream processor ready - real-time data integration active');
      console.log('📊 Ready to process: market data, financial feeds, business metrics');
      
      return true;
    } catch (error) {
      console.error('❌ Stream processor initialization failed:', error);
      this.initialized = false;
      return false;
    }
  }

  initializeDataProcessors() {
    // Market data processor
    this.dataProcessors.set('market_data', {
      name: 'Market Data Processor',
      process: this.processMarketData.bind(this),
      relevance_detector: this.detectMarketRelevance.bind(this),
      insights_extractor: this.extractMarketInsights.bind(this)
    });

    // Financial data processor
    this.dataProcessors.set('financial_data', {
      name: 'Financial Data Processor',
      process: this.processFinancialData.bind(this),
      relevance_detector: this.detectFinancialRelevance.bind(this),
      insights_extractor: this.extractFinancialInsights.bind(this)
    });

    // Business metrics processor
    this.dataProcessors.set('business_metrics', {
      name: 'Business Metrics Processor',
      process: this.processBusinessMetrics.bind(this),
      relevance_detector: this.detectBusinessRelevance.bind(this),
      insights_extractor: this.extractBusinessInsights.bind(this)
    });

    // Competitive intelligence processor
    this.dataProcessors.set('competitive_intel', {
      name: 'Competitive Intelligence Processor',
      process: this.processCompetitiveIntel.bind(this),
      relevance_detector: this.detectCompetitiveRelevance.bind(this),
      insights_extractor: this.extractCompetitiveInsights.bind(this)
    });

    // News and events processor
    this.dataProcessors.set('news_events', {
      name: 'News and Events Processor',
      process: this.processNewsEvents.bind(this),
      relevance_detector: this.detectNewsRelevance.bind(this),
      insights_extractor: this.extractNewsInsights.bind(this)
    });

    // Customer data processor
    this.dataProcessors.set('customer_data', {
      name: 'Customer Data Processor',
      process: this.processCustomerData.bind(this),
      relevance_detector: this.detectCustomerRelevance.bind(this),
      insights_extractor: this.extractCustomerInsights.bind(this)
    });
  }

  initializeAlertThresholds() {
    // Financial alert thresholds
    this.alertThresholds.set('cash_flow', {
      critical: -50000,  // Monthly burn rate increase
      warning: -25000,
      threshold_type: 'negative_change'
    });

    this.alertThresholds.set('revenue_change', {
      critical: -0.2,    // 20% decrease
      warning: -0.1,     // 10% decrease
      threshold_type: 'percentage_change'
    });

    // Market alert thresholds
    this.alertThresholds.set('competitive_activity', {
      critical: 5,       // Major competitive moves
      warning: 3,
      threshold_type: 'activity_count'
    });

    this.alertThresholds.set('market_volatility', {
      critical: 0.15,    // 15% market movement
      warning: 0.1,      // 10% market movement
      threshold_type: 'volatility_measure'
    });

    // Customer alert thresholds
    this.alertThresholds.set('customer_churn', {
      critical: 0.15,    // 15% monthly churn
      warning: 0.1,      // 10% monthly churn
      threshold_type: 'churn_rate'
    });
  }

  initializeRealTimeCache() {
    // Cache categories for real-time data
    this.realTimeCache.set('market_conditions', {
      data: new Map(),
      ttl: 300000, // 5 minutes
      last_updated: null
    });

    this.realTimeCache.set('financial_metrics', {
      data: new Map(),
      ttl: 600000, // 10 minutes
      last_updated: null
    });

    this.realTimeCache.set('competitive_movements', {
      data: new Map(),
      ttl: 1800000, // 30 minutes
      last_updated: null
    });

    this.realTimeCache.set('customer_signals', {
      data: new Map(),
      ttl: 900000, // 15 minutes
      last_updated: null
    });
  }

  setupStreamMonitoring() {
    // Setup periodic monitoring of data streams
    setInterval(() => {
      this.monitorStreamHealth();
    }, 60000); // Check every minute

    // Setup cache cleanup
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 300000); // Cleanup every 5 minutes
  }

  // MAIN STREAM PROCESSING METHOD
  async enrichWithRealTimeData({ query, context, businessWisdom }) {
    console.log('📊 Enriching with real-time data...');

    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Identify relevant data streams for the query
      const relevantStreams = this.identifyRelevantStreams(query, context);
      
      // Gather real-time data from relevant streams
      const realTimeData = await this.gatherRealTimeData(relevantStreams, query, context);
      
      // Process and analyze the data
      const processedData = await this.processStreamData(realTimeData, query, context);
      
      // Generate real-time insights
      const realTimeInsights = this.generateRealTimeInsights(processedData, businessWisdom);
      
      // Check for alerts
      const alerts = this.checkAlerts(processedData);
      
      const enrichedContext = {
        ...context,
        real_time_data: processedData,
        real_time_insights: realTimeInsights,
        real_time_alerts: alerts,
        real_time_enhancement: true,
        data_freshness: 'current',
        stream_sources: relevantStreams.map(stream => stream.source),
        enrichment_timestamp: new Date().toISOString()
      };

      console.log(`✅ Real-time enrichment complete: ${relevantStreams.length} streams processed`);
      
      return enrichedContext;

    } catch (error) {
      console.error('❌ Real-time enrichment failed:', error);
      return {
        ...context,
        real_time_enhancement: false,
        real_time_error: error.message
      };
    }
  }

  identifyRelevantStreams(query, context) {
    const relevantStreams = [];

    // Market data relevance
    if (this.detectMarketRelevance(query, context)) {
      relevantStreams.push({
        source: 'market_data',
        priority: 'high',
        processor: this.dataProcessors.get('market_data')
      });
    }

    // Financial data relevance
    if (this.detectFinancialRelevance(query, context)) {
      relevantStreams.push({
        source: 'financial_data',
        priority: 'high',
        processor: this.dataProcessors.get('financial_data')
      });
    }

    // Business metrics relevance
    if (this.detectBusinessRelevance(query, context)) {
      relevantStreams.push({
        source: 'business_metrics',
        priority: 'medium',
        processor: this.dataProcessors.get('business_metrics')
      });
    }

    // Competitive intelligence relevance
    if (this.detectCompetitiveRelevance(query, context)) {
      relevantStreams.push({
        source: 'competitive_intel',
        priority: 'high',
        processor: this.dataProcessors.get('competitive_intel')
      });
    }

    // News and events relevance
    if (this.detectNewsRelevance(query, context)) {
      relevantStreams.push({
        source: 'news_events',
        priority: 'medium',
        processor: this.dataProcessors.get('news_events')
      });
    }

    // Customer data relevance
    if (this.detectCustomerRelevance(query, context)) {
      relevantStreams.push({
        source: 'customer_data',
        priority: 'high',
        processor: this.dataProcessors.get('customer_data')
      });
    }

    // Sort by priority
    return relevantStreams.sort((a, b) => {
      const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  async gatherRealTimeData(relevantStreams, query, context) {
    const realTimeData = [];

    for (const stream of relevantStreams) {
      try {
        // Check cache first
        const cachedData = this.getCachedData(stream.source);
        
        if (cachedData && !this.isCacheExpired(stream.source)) {
          realTimeData.push({
            source: stream.source,
            data: cachedData,
            timestamp: new Date().toISOString(),
            from_cache: true
          });
        } else {
          // Fetch fresh data
          const freshData = await this.fetchStreamData(stream.source, query, context);
          
          if (freshData) {
            realTimeData.push({
              source: stream.source,
              data: freshData,
              timestamp: new Date().toISOString(),
              from_cache: false
            });
            
            // Update cache
            this.updateCache(stream.source, freshData);
          }
        }
      } catch (error) {
        console.error(`❌ Failed to gather data from ${stream.source}:`, error);
        // Continue with other streams
      }
    }

    return realTimeData;
  }

  async fetchStreamData(source, query, context) {
    // This would integrate with actual data sources
    // For now, return intelligent placeholder data
    
    switch (source) {
      case 'market_data':
        return this.generateMarketData(query, context);
      case 'financial_data':
        return this.generateFinancialData(query, context);
      case 'business_metrics':
        return this.generateBusinessMetrics(query, context);
      case 'competitive_intel':
        return this.generateCompetitiveIntel(query, context);
      case 'news_events':
        return this.generateNewsEvents(query, context);
      case 'customer_data':
        return this.generateCustomerData(query, context);
      default:
        return null;
    }
  }

  async processStreamData(realTimeData, query, context) {
    const processedData = [];

    for (const streamData of realTimeData) {
      const processor = this.dataProcessors.get(streamData.source);
      
      if (processor) {
        try {
          const processed = await processor.process(streamData.data, query, context);
          
          processedData.push({
            source: streamData.source,
            raw_data: streamData.data,
            processed_data: processed,
            insights: processor.insights_extractor(processed, query, context),
            timestamp: streamData.timestamp,
            from_cache: streamData.from_cache
          });
          
        } catch (error) {
          console.error(`❌ Failed to process ${streamData.source} data:`, error);
        }
      }
    }

    return processedData;
  }

  generateRealTimeInsights(processedData, businessWisdom) {
    const insights = {
      market_insights: [],
      financial_insights: [],
      competitive_insights: [],
      business_insights: [],
      strategic_implications: [],
      immediate_opportunities: [],
      risk_factors: []
    };

    processedData.forEach(data => {
      if (data.insights) {
        switch (data.source) {
          case 'market_data':
            insights.market_insights.push(...data.insights.insights);
            insights.strategic_implications.push(...data.insights.strategic_implications);
            break;
          case 'financial_data':
            insights.financial_insights.push(...data.insights.insights);
            insights.risk_factors.push(...data.insights.risk_factors);
            break;
          case 'competitive_intel':
            insights.competitive_insights.push(...data.insights.insights);
            insights.immediate_opportunities.push(...data.insights.opportunities);
            break;
          case 'business_metrics':
            insights.business_insights.push(...data.insights.insights);
            break;
        }
      }
    });

    // Generate synthesis insights
    insights.synthesis_insights = this.synthesizeRealTimeInsights(insights, businessWisdom);

    return insights;
  }

  synthesizeRealTimeInsights(insights, businessWisdom) {
    const synthesis = [];

    // Synthesize market + financial insights
    if (insights.market_insights.length > 0 && insights.financial_insights.length > 0) {
      synthesis.push({
        type: 'market_financial_synthesis',
        insight: 'Market conditions and financial performance alignment analysis',
        importance: 'high'
      });
    }

    // Synthesize competitive + business insights
    if (insights.competitive_insights.length > 0 && insights.business_insights.length > 0) {
      synthesis.push({
        type: 'competitive_business_synthesis',
        insight: 'Competitive dynamics impact on business performance',
        importance: 'high'
      });
    }

    // Add survival-focused synthesis if business wisdom indicates concern
    if (businessWisdom.applicable_principles?.some(p => p.domain === 'business_survival')) {
      synthesis.push({
        type: 'survival_focused_synthesis',
        insight: 'Real-time data impact on business survival metrics',
        importance: 'critical'
      });
    }

    return synthesis;
  }

  checkAlerts(processedData) {
    const alerts = [];

    processedData.forEach(data => {
      if (data.processed_data && data.processed_data.metrics) {
        Object.entries(data.processed_data.metrics).forEach(([metric, value]) => {
          const threshold = this.alertThresholds.get(metric);
          
          if (threshold) {
            const alert = this.evaluateThreshold(metric, value, threshold);
            if (alert) {
              alerts.push({
                ...alert,
                source: data.source,
                timestamp: data.timestamp
              });
            }
          }
        });
      }
    });

    return alerts;
  }

  evaluateThreshold(metric, value, threshold) {
    switch (threshold.threshold_type) {
      case 'negative_change':
        if (value <= threshold.critical) {
          return { metric, value, level: 'critical', threshold: threshold.critical };
        } else if (value <= threshold.warning) {
          return { metric, value, level: 'warning', threshold: threshold.warning };
        }
        break;
        
      case 'percentage_change':
        if (Math.abs(value) >= Math.abs(threshold.critical)) {
          return { metric, value, level: 'critical', threshold: threshold.critical };
        } else if (Math.abs(value) >= Math.abs(threshold.warning)) {
          return { metric, value, level: 'warning', threshold: threshold.warning };
        }
        break;
        
      case 'activity_count':
        if (value >= threshold.critical) {
          return { metric, value, level: 'critical', threshold: threshold.critical };
        } else if (value >= threshold.warning) {
          return { metric, value, level: 'warning', threshold: threshold.warning };
        }
        break;
    }
    
    return null;
  }

  // STREAM DATA INGESTION API
  async ingestStreamData({ source, data, user_id = 'default', metadata = {} }) {
    console.log(`📡 Ingesting stream data from ${source}...`);

    try {
      const streamEntry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        source,
        data,
        user_id,
        metadata,
        processed: false,
        insights: null
      };

      // Store in stream history
      this.streamHistory.push(streamEntry);

      // Process immediately for real-time use
      const processor = this.dataProcessors.get(source);
      if (processor) {
        streamEntry.processed_data = await processor.process(data);
        streamEntry.insights = processor.insights_extractor(streamEntry.processed_data);
        streamEntry.processed = true;
      }

      // Update cache
      this.updateCache(source, streamEntry.processed_data || data);

      // Check for alerts
      const alerts = this.checkAlerts([streamEntry]);
      if (alerts.length > 0) {
        console.log(`🚨 Alerts generated from ${source} data:`, alerts.length);
      }

      console.log(`✅ Stream data ingested from ${source}`);

      return {
        ingestion_successful: true,
        stream_id: streamEntry.id,
        processed: streamEntry.processed,
        alerts_generated: alerts.length,
        cache_updated: true
      };

    } catch (error) {
      console.error(`❌ Stream data ingestion failed for ${source}:`, error);
      return {
        ingestion_successful: false,
        error: error.message
      };
    }
  }

  // DATA PROCESSOR IMPLEMENTATIONS

  async processMarketData(data, query, context) {
    return {
      metrics: {
        market_volatility: data.volatility || 0.05,
        market_trend: data.trend || 'stable',
        sector_performance: data.sector_performance || {}
      },
      processed_indicators: {
        market_sentiment: data.sentiment || 'neutral',
        economic_indicators: data.economic_indicators || {},
        industry_health: data.industry_health || 'stable'
      }
    };
  }

  async processFinancialData(data, query, context) {
    return {
      metrics: {
        revenue_change: data.revenue_change || 0,
        cash_flow: data.cash_flow || 0,
        burn_rate: data.burn_rate || 0
      },
      processed_indicators: {
        financial_health: data.financial_health || 'stable',
        growth_trajectory: data.growth_trajectory || 'stable',
        profitability_trend: data.profitability_trend || 'stable'
      }
    };
  }

  async processBusinessMetrics(data, query, context) {
    return {
      metrics: {
        customer_acquisition_cost: data.cac || 0,
        customer_lifetime_value: data.ltv || 0,
        monthly_recurring_revenue: data.mrr || 0
      },
      processed_indicators: {
        business_health: data.business_health || 'stable',
        operational_efficiency: data.operational_efficiency || 'stable',
        growth_metrics: data.growth_metrics || {}
      }
    };
  }

  async processCompetitiveIntel(data, query, context) {
    return {
      metrics: {
        competitive_activity: data.competitive_moves || 0,
        market_share_change: data.market_share_change || 0,
        competitive_threats: data.threats || 0
      },
      processed_indicators: {
        competitive_position: data.competitive_position || 'stable',
        threat_level: data.threat_level || 'low',
        opportunities: data.opportunities || []
      }
    };
  }

  async processNewsEvents(data, query, context) {
    return {
      metrics: {
        news_sentiment: data.sentiment_score || 0,
        industry_mentions: data.industry_mentions || 0,
        relevant_events: data.relevant_events || 0
      },
      processed_indicators: {
        public_sentiment: data.public_sentiment || 'neutral',
        industry_trends: data.industry_trends || [],
        market_impact: data.market_impact || 'minimal'
      }
    };
  }

  async processCustomerData(data, query, context) {
    return {
      metrics: {
        customer_churn: data.churn_rate || 0,
        customer_satisfaction: data.satisfaction_score || 0.8,
        support_tickets: data.support_volume || 0
      },
      processed_indicators: {
        customer_health: data.customer_health || 'stable',
        retention_trend: data.retention_trend || 'stable',
        satisfaction_trend: data.satisfaction_trend || 'stable'
      }
    };
  }

  // RELEVANCE DETECTORS

  detectMarketRelevance(query, context) {
    return /market|industry|economy|sector|economic|volatility|trends/i.test(query) ||
           context.competitive_pressure || context.market_analysis_needed;
  }

  detectFinancialRelevance(query, context) {
    return /financial|revenue|cash|profit|cost|budget|burn rate|runway/i.test(query) ||
           context.financial_analysis || context.business_critical;
  }

  detectBusinessRelevance(query, context) {
    return /business|performance|metrics|growth|efficiency|operations/i.test(query) ||
           context.business_context;
  }

  detectCompetitiveRelevance(query, context) {
    return /competitive|competitor|competition|market share|threat/i.test(query) ||
           context.competitive_pressure;
  }

  detectNewsRelevance(query, context) {
    return /news|event|announcement|industry news|market news/i.test(query) ||
           context.external_awareness_needed;
  }

  detectCustomerRelevance(query, context) {
    return /customer|client|user|satisfaction|churn|retention/i.test(query) ||
           context.customer_analysis;
  }

  // INSIGHTS EXTRACTORS

  extractMarketInsights(processedData, query, context) {
    return {
      insights: [
        `Market volatility at ${(processedData.metrics.market_volatility * 100).toFixed(1)}%`,
        `Market trend: ${processedData.processed_indicators.market_sentiment}`
      ],
      strategic_implications: [
        'Monitor market conditions for strategic timing',
        'Adjust risk exposure based on volatility'
      ]
    };
  }

  extractFinancialInsights(processedData, query, context) {
    return {
      insights: [
        `Revenue change: ${(processedData.metrics.revenue_change * 100).toFixed(1)}%`,
        `Cash flow status: ${processedData.processed_indicators.financial_health}`
      ],
      risk_factors: [
        processedData.metrics.cash_flow < 0 ? 'Negative cash flow detected' : null,
        processedData.metrics.burn_rate > 50000 ? 'High burn rate detected' : null
      ].filter(Boolean)
    };
  }

  extractCompetitiveInsights(processedData, query, context) {
    return {
      insights: [
        `Competitive activity level: ${processedData.metrics.competitive_activity}`,
        `Competitive position: ${processedData.processed_indicators.competitive_position}`
      ],
      opportunities: processedData.processed_indicators.opportunities || []
    };
  }

  extractBusinessInsights(processedData, query, context) {
    return {
      insights: [
        `Business health: ${processedData.processed_indicators.business_health}`,
        `Operational efficiency: ${processedData.processed_indicators.operational_efficiency}`
      ]
    };
  }

  extractNewsInsights(processedData, query, context) {
    return {
      insights: [
        `Industry sentiment: ${processedData.processed_indicators.public_sentiment}`,
        `Market impact: ${processedData.processed_indicators.market_impact}`
      ]
    };
  }

  extractCustomerInsights(processedData, query, context) {
    return {
      insights: [
        `Customer health: ${processedData.processed_indicators.customer_health}`,
        `Churn rate: ${(processedData.metrics.customer_churn * 100).toFixed(1)}%`
      ]
    };
  }

  // DATA GENERATORS (Placeholders for real integrations)

  generateMarketData(query, context) {
    return {
      volatility: Math.random() * 0.1 + 0.02,
      trend: ['bullish', 'bearish', 'stable'][Math.floor(Math.random() * 3)],
      sentiment: ['positive', 'negative', 'neutral'][Math.floor(Math.random() * 3)],
      sector_performance: {
        technology: Math.random() * 0.1 - 0.05,
        healthcare: Math.random() * 0.1 - 0.05,
        finance: Math.random() * 0.1 - 0.05
      }
    };
  }

  generateFinancialData(query, context) {
    return {
      revenue_change: Math.random() * 0.4 - 0.2, // -20% to +20%
      cash_flow: Math.random() * 200000 - 100000, // -100k to +100k
      burn_rate: Math.random() * 100000, // 0 to 100k
      financial_health: ['excellent', 'good', 'stable', 'concerning'][Math.floor(Math.random() * 4)]
    };
  }

  generateBusinessMetrics(query, context) {
    return {
      cac: Math.random() * 500 + 100, // $100-600 CAC
      ltv: Math.random() * 5000 + 1000, // $1000-6000 LTV
      mrr: Math.random() * 100000 + 50000, // $50k-150k MRR
      business_health: ['excellent', 'good', 'stable'][Math.floor(Math.random() * 3)]
    };
  }

  generateCompetitiveIntel(query, context) {
    return {
      competitive_moves: Math.floor(Math.random() * 5),
      market_share_change: Math.random() * 0.1 - 0.05,
      threats: Math.floor(Math.random() * 3),
      competitive_position: ['strong', 'stable', 'challenged'][Math.floor(Math.random() * 3)],
      opportunities: ['Market expansion', 'Product differentiation', 'Cost advantage']
    };
  }

  generateNewsEvents(query, context) {
    return {
      sentiment_score: Math.random() * 2 - 1, // -1 to 1
      industry_mentions: Math.floor(Math.random() * 20),
      relevant_events: Math.floor(Math.random() * 5),
      public_sentiment: ['positive', 'neutral', 'negative'][Math.floor(Math.random() * 3)]
    };
  }

  generateCustomerData(query, context) {
    return {
      churn_rate: Math.random() * 0.15, // 0-15% churn
      satisfaction_score: Math.random() * 0.3 + 0.7, // 0.7-1.0 satisfaction
      support_volume: Math.floor(Math.random() * 100),
      customer_health: ['excellent', 'good', 'stable'][Math.floor(Math.random() * 3)]
    };
  }

  // CACHE MANAGEMENT

  getCachedData(source) {
    const cache = this.realTimeCache.get(this.getCacheKey(source));
    return cache ? cache.data.get('latest') : null;
  }

  isCacheExpired(source) {
    const cache = this.realTimeCache.get(this.getCacheKey(source));
    if (!cache || !cache.last_updated) return true;
    
    const now = Date.now();
    const age = now - new Date(cache.last_updated).getTime();
    return age > cache.ttl;
  }

  updateCache(source, data) {
    const cacheKey = this.getCacheKey(source);
    const cache = this.realTimeCache.get(cacheKey);
    
    if (cache) {
      cache.data.set('latest', data);
      cache.last_updated = new Date().toISOString();
    }
  }

  getCacheKey(source) {
    const mapping = {
      'market_data': 'market_conditions',
      'financial_data': 'financial_metrics',
      'competitive_intel': 'competitive_movements',
      'customer_data': 'customer_signals'
    };
    return mapping[source] || 'general';
  }

  cleanupExpiredCache() {
    this.realTimeCache.forEach((cache, key) => {
      if (cache.last_updated) {
        const age = Date.now() - new Date(cache.last_updated).getTime();
        if (age > cache.ttl) {
          cache.data.clear();
          cache.last_updated = null;
        }
      }
    });
  }

  // STREAM MONITORING

  monitorStreamHealth() {
    // Monitor active streams and data freshness
    const health = {
      total_streams: this.activeStreams.size,
      healthy_streams: 0,
      stale_streams: 0,
      error_streams: 0
    };

    this.realTimeCache.forEach((cache, key) => {
      if (cache.last_updated) {
        const age = Date.now() - new Date(cache.last_updated).getTime();
        if (age < cache.ttl) {
          health.healthy_streams++;
        } else {
          health.stale_streams++;
        }
      }
    });

    // Log health status
    if (health.stale_streams > 0) {
      console.log(`⚠️ Stream health: ${health.stale_streams} stale streams detected`);
    }
  }

  // WEBHOOK ROUTER FOR EXTERNAL INTEGRATIONS
  createWebhookRouter() {
    const router = express.Router();

    // Generic stream ingestion endpoint
    router.post('/ingest', async (req, res) => {
      try {
        const { source = 'unknown', user_id = 'default_user', data = {} } = req.body || {};
        
        const result = await this.ingestStreamData({
          source,
          data,
          user_id,
          metadata: { webhook: true, ip: req.ip }
        });

        res.json({ success: true, ...result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Market data webhook
    router.post('/market', async (req, res) => {
      try {
        const result = await this.ingestStreamData({
          source: 'market_data',
          data: req.body,
          user_id: req.body.user_id || 'default_user'
        });

        res.json({ success: true, ...result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Financial data webhook
    router.post('/financial', async (req, res) => {
      try {
        const result = await this.ingestStreamData({
          source: 'financial_data',
          data: req.body,
          user_id: req.body.user_id || 'default_user'
        });

        res.json({ success: true, ...result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    return router;
  }

  // STREAM PROCESSOR STATUS AND DIAGNOSTICS
  getStreamStatus() {
    const cacheStatus = {};
    this.realTimeCache.forEach((cache, key) => {
      cacheStatus[key] = {
        has_data: cache.data.size > 0,
        last_updated: cache.last_updated,
        age_minutes: cache.last_updated ? 
          Math.floor((Date.now() - new Date(cache.last_updated).getTime()) / 60000) : null,
        is_fresh: !this.isCacheExpired(key)
      };
    });

    return {
      initialized: this.initialized,
      active_processors: this.dataProcessors.size,
      stream_history_size: this.streamHistory.length,
      alert_thresholds: this.alertThresholds.size,
      cache_status: cacheStatus,
      monitoring_active: true,
      webhook_endpoints: ['/ingest', '/market', '/financial']
    };
  }

  // TEST STREAM PROCESSING
  async testStreamProcessing() {
    const testStreams = [
      {
        source: 'market_data',
        data: { volatility: 0.08, trend: 'bullish', sentiment: 'positive' }
      },
      {
        source: 'financial_data',
        data: { revenue_change: 0.15, cash_flow: 75000, burn_rate: 45000 }
      }
    ];

    const results = [];

    for (const stream of testStreams) {
      try {
        const result = await this.ingestStreamData(stream);
        results.push({
          source: stream.source,
          ingestion_successful: result.ingestion_successful,
          processed: result.processed,
          alerts_generated: result.alerts_generated
        });
      } catch (error) {
        results.push({
          source: stream.source,
          ingestion_successful: false,
          error: error.message
        });
      }
    }

    // Test real-time enrichment
    const testQuery = "What is our competitive position?";
    const testContext = { competitive_pressure: true };

    try {
      const enrichedContext = await this.enrichWithRealTimeData({
        query: testQuery,
        context: testContext,
        businessWisdom: {}
      });

      return {
        test_completed: true,
        stream_ingestion_results: results,
        real_time_enrichment: {
          success: enrichedContext.real_time_enhancement,
          data_sources: enrichedContext.stream_sources?.length || 0,
          insights_generated: enrichedContext.real_time_insights ? 
            Object.values(enrichedContext.real_time_insights).flat().length : 0,
          alerts_triggered: enrichedContext.real_time_alerts?.length || 0
        }
      };

    } catch (error) {
      return {
        test_completed: false,
        stream_ingestion_results: results,
        enrichment_error: error.message
      };
    }
  }
}

// Create singleton instance
const streamProcessor = new StreamProcessor();
const streamRouter = streamProcessor.createWebhookRouter();

export { 
  StreamProcessor,
  streamProcessor,
  streamRouter
};
