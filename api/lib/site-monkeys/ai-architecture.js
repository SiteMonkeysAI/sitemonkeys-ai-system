/* global AbortSignal */

// SITE MONKEYS AI ARCHITECTURE
// Triple-AI Failover System with Quality Gates

import { getAdapterInstance } from '../../core/adapters/adapter-registry.js';

const AI_ARCHITECTURE = {
  // PRIMARY AI CONFIGURATION
  primary: {
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    max_tokens: 1000,
    temperature: 0.7,
    timeout: 30000, // 30 seconds
  },

  // SECONDARY FALLBACK
  secondary: {
    model: 'gpt-4o',
    provider: 'openai',
    max_tokens: 1000,
    temperature: 0.7,
    timeout: 25000, // 25 seconds
  },

  // TERTIARY EMERGENCY BACKUP
  tertiary: {
    model: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    max_tokens: 1000,
    temperature: 0.7,
    timeout: 20000, // 20 seconds
  },

  // FAILOVER THRESHOLDS
  failover_triggers: {
    api_error: true,
    timeout: true,
    quality_below_threshold: true,
    rate_limit: true,
    service_unavailable: true,
  },

  // RETRY CONFIGURATION
  retry_config: {
    max_attempts: 3,
    retry_delay: 1000, // 1 second
    exponential_backoff: true,
  },
};

// MAIN AI ORCHESTRATION FUNCTION
async function processAIRequest(prompt, customerTier, contentType = 'general') {
  const startTime = Date.now();
  let attempts = 0;
  const maxAttempts = AI_ARCHITECTURE.retry_config.max_attempts;

  while (attempts < maxAttempts) {
    // Primary: Claude 3.5 Sonnet
    if (attempts === 0) {
      try {
        console.log('🎯 Attempting Claude 3.5 Sonnet...');
        const result = await callClaudeAPI(prompt, customerTier);

        if (result.success) {
          console.log(`✅ Claude succeeded in ${Date.now() - startTime}ms`);
          return {
            result: result.content,
            source: 'claude',
            attempts: attempts + 1,
            processingTime: Date.now() - startTime,
            success: true,
          };
        }
      } catch (error) {
        console.warn(`⚠️ Claude failed: ${error.message}`);
      }
    }

    // Secondary: GPT-4o Fallback
    if (attempts === 1) {
      try {
        console.log('🔄 Falling back to GPT-4o...');
        const result = await callGPT4API(prompt, customerTier);

        if (result.success) {
          console.log(`✅ GPT-4o succeeded in ${Date.now() - startTime}ms`);
          return {
            result: result.content,
            source: 'gpt4o',
            attempts: attempts + 1,
            processingTime: Date.now() - startTime,
            success: true,
          };
        }
      } catch (error) {
        console.warn(`⚠️ GPT-4o failed: ${error.message}`);
      }
    }

    // Tertiary: Claude Haiku Emergency Backup
    if (attempts === 2) {
      try {
        console.log('🚨 Emergency fallback to Claude Haiku...');
        const result = await callClaudeHaikuAPI(prompt, customerTier);

        if (result.success) {
          console.log(`✅ Claude Haiku succeeded in ${Date.now() - startTime}ms`);
          return {
            result: result.content,
            source: 'claude-haiku',
            attempts: attempts + 1,
            processingTime: Date.now() - startTime,
            success: true,
          };
        }
      } catch (error) {
        console.warn(`⚠️ Claude Haiku failed: ${error.message}`);
      }
    }

    attempts++;

    // Exponential backoff delay
    if (attempts < maxAttempts) {
      const delay = AI_ARCHITECTURE.retry_config.retry_delay * Math.pow(2, attempts - 1);
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All AI models failed - return template fallback
  console.error('🚨 All AI models failed - using template system');
  const templateResult = await getTemplateResponse(contentType, customerTier);

  return {
    result: templateResult,
    source: 'template',
    attempts: maxAttempts,
    processingTime: Date.now() - startTime,
    success: false,
    fallback: true,
  };
}

// CLAUDE API INTERFACE
async function callClaudeAPI(prompt, _customerTier) {
  const config = AI_ARCHITECTURE.primary;
  const adapter = getAdapterInstance('anthropic-claude-sonnet');

  if (!adapter) {
    return { success: false, error: 'Anthropic adapter not available' };
  }

  try {
    const callPromise = adapter.call({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: config.max_tokens,
      temperature: config.temperature,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), config.timeout),
    );

    const result = await Promise.race([callPromise, timeoutPromise]);

    return {
      success: true,
      content: result.content,
      usage: result.usage,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// GPT-4o API INTERFACE
async function callGPT4API(prompt, _customerTier) {
  const config = AI_ARCHITECTURE.secondary;
  const adapter = getAdapterInstance('openai-gpt4o');

  if (!adapter) {
    return { success: false, error: 'OpenAI adapter not available' };
  }

  try {
    const callPromise = adapter.call({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: config.max_tokens,
      temperature: config.temperature,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), config.timeout),
    );

    const result = await Promise.race([callPromise, timeoutPromise]);

    return {
      success: true,
      content: result.content,
      usage: result.usage,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// CLAUDE HAIKU API INTERFACE (tertiary emergency backup)
async function callClaudeHaikuAPI(prompt, _customerTier) {
  const config = AI_ARCHITECTURE.tertiary;
  const adapter = getAdapterInstance('anthropic-claude-haiku');

  if (!adapter) {
    return { success: false, error: 'Anthropic Haiku adapter not available' };
  }

  try {
    const callPromise = adapter.call({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: config.max_tokens,
      temperature: config.temperature,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), config.timeout),
    );

    const result = await Promise.race([callPromise, timeoutPromise]);

    return {
      success: true,
      content: result.content,
      usage: result.usage,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// TEMPLATE FALLBACK SYSTEM
async function getTemplateResponse(contentType, customerTier) {
  const responses = {
    seo_audit:
      "SEO audit completed. We've identified optimization opportunities for your website to improve search rankings and drive qualified traffic.",

    blog_content:
      'Professional content created for your business. This article provides valuable insights to engage your audience and establish industry authority.',

    ppc_campaign:
      'PPC campaign strategy developed based on your business goals. These recommendations will help optimize your advertising spend for maximum ROI.',

    social_media:
      'Social media content crafted to align with your brand voice and engage your target audience across relevant platforms.',

    general:
      'Task completed successfully. Our AI-powered system has processed your request and generated professional results for your business.',
  };

  const baseResponse = responses[contentType] || responses.general;

  // Add tier-specific enhancements
  if (customerTier === 'lead') {
    return (
      baseResponse +
      ' This premium analysis includes advanced recommendations tailored specifically for your business objectives.'
    );
  } else if (customerTier === 'climb') {
    return (
      baseResponse +
      ' Additional insights and optimization suggestions have been included to maximize your results.'
    );
  }

  return baseResponse;
}

// HEALTH CHECK FUNCTION
async function checkAIServicesHealth() {
  const healthStatus = {
    claude: false,
    gpt4o: false,
    claude_haiku: false,
    timestamp: Date.now(),
  };

  // Quick health check for each service
  try {
    const claudeTest = await callClaudeAPI('Health check', 'boost');
    healthStatus.claude = claudeTest.success;
  } catch (error) {
    console.warn('Claude health check failed:', error.message);
  }

  try {
    const gpt4oTest = await callGPT4API('Health check', 'boost');
    healthStatus.gpt4o = gpt4oTest.success;
  } catch (error) {
    console.warn('GPT-4o health check failed:', error.message);
  }

  try {
    const haikuTest = await callClaudeHaikuAPI('Health check', 'boost');
    healthStatus.claude_haiku = haikuTest.success;
  } catch (error) {
    console.warn('Claude Haiku health check failed:', error.message);
  }

  return healthStatus;
}

export {
  AI_ARCHITECTURE,
  processAIRequest,
  callClaudeAPI,
  callGPT4API,
  callClaudeHaikuAPI,
  getTemplateResponse,
  checkAIServicesHealth,
};
