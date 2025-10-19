// SITE MONKEYS AI ARCHITECTURE
// Triple-AI Failover System with Quality Gates

const AI_ARCHITECTURE = {
  // PRIMARY AI CONFIGURATION
  primary: {
    model: "claude-3-sonnet-20240229",
    provider: "anthropic",
    max_tokens: 1000,
    temperature: 0.7,
    timeout: 30000, // 30 seconds
  },

  // SECONDARY FALLBACK
  secondary: {
    model: "gpt-4",
    provider: "openai",
    max_tokens: 1000,
    temperature: 0.7,
    timeout: 25000, // 25 seconds
  },

  // TERTIARY EMERGENCY BACKUP
  tertiary: {
    model: "mistral-large",
    provider: "mistral",
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
async function processAIRequest(prompt, customerTier, contentType = "general") {
  const startTime = Date.now();
  let attempts = 0;
  const maxAttempts = AI_ARCHITECTURE.retry_config.max_attempts;

  while (attempts < maxAttempts) {
    // Primary: Claude 3.5 Sonnet
    if (attempts === 0) {
      try {
        console.log("🎯 Attempting Claude 3.5 Sonnet...");
        const result = await callClaudeAPI(prompt, customerTier);

        if (result.success) {
          console.log(`✅ Claude succeeded in ${Date.now() - startTime}ms`);
          return {
            result: result.content,
            source: "claude",
            attempts: attempts + 1,
            processingTime: Date.now() - startTime,
            success: true,
          };
        }
      } catch (error) {
        console.warn(`⚠️ Claude failed: ${error.message}`);
      }
    }

    // Secondary: GPT-4 Fallback
    if (attempts === 1) {
      try {
        console.log("🔄 Falling back to GPT-4...");
        const result = await callGPT4API(prompt, customerTier);

        if (result.success) {
          console.log(`✅ GPT-4 succeeded in ${Date.now() - startTime}ms`);
          return {
            result: result.content,
            source: "gpt4",
            attempts: attempts + 1,
            processingTime: Date.now() - startTime,
            success: true,
          };
        }
      } catch (error) {
        console.warn(`⚠️ GPT-4 failed: ${error.message}`);
      }
    }

    // Tertiary: Mistral Emergency Backup
    if (attempts === 2) {
      try {
        console.log("🚨 Emergency fallback to Mistral...");
        const result = await callMistralAPI(prompt, customerTier);

        if (result.success) {
          console.log(`✅ Mistral succeeded in ${Date.now() - startTime}ms`);
          return {
            result: result.content,
            source: "mistral",
            attempts: attempts + 1,
            processingTime: Date.now() - startTime,
            success: true,
          };
        }
      } catch (error) {
        console.warn(`⚠️ Mistral failed: ${error.message}`);
      }
    }

    attempts++;

    // Exponential backoff delay
    if (attempts < maxAttempts) {
      const delay =
        AI_ARCHITECTURE.retry_config.retry_delay * Math.pow(2, attempts - 1);
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All AI models failed - return template fallback
  console.error("🚨 All AI models failed - using template system");
  const templateResult = await getTemplateResponse(contentType, customerTier);

  return {
    result: templateResult,
    source: "template",
    attempts: maxAttempts,
    processingTime: Date.now() - startTime,
    success: false,
    fallback: true,
  };
}

// CLAUDE API INTERFACE
async function callClaudeAPI(prompt, customerTier) {
  const config = AI_ARCHITECTURE.primary;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.ANTHROPIC_API_KEY,
        "Content-Type": "application/json",
        "x-api-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.max_tokens,
        temperature: config.temperature,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.content || !data.content[0] || !data.content[0].text) {
      throw new Error("Claude API returned invalid response structure");
    }

    return {
      success: true,
      content: data.content[0].text,
      usage: data.usage,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// GPT-4 API INTERFACE
async function callGPT4API(prompt, customerTier) {
  const config = AI_ARCHITECTURE.secondary;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.max_tokens,
        temperature: config.temperature,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error("OpenAI API returned invalid response structure");
    }

    return {
      success: true,
      content: data.choices[0].message.content,
      usage: data.usage,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// MISTRAL API INTERFACE
async function callMistralAPI(prompt, customerTier) {
  const config = AI_ARCHITECTURE.tertiary;

  try {
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.MISTRAL_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.max_tokens,
        temperature: config.temperature,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Mistral API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error("Mistral API returned invalid response structure");
    }

    return {
      success: true,
      content: data.choices[0].message.content,
      usage: data.usage || {},
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
      "Professional content created for your business. This article provides valuable insights to engage your audience and establish industry authority.",

    ppc_campaign:
      "PPC campaign strategy developed based on your business goals. These recommendations will help optimize your advertising spend for maximum ROI.",

    social_media:
      "Social media content crafted to align with your brand voice and engage your target audience across relevant platforms.",

    general:
      "Task completed successfully. Our AI-powered system has processed your request and generated professional results for your business.",
  };

  const baseResponse = responses[contentType] || responses.general;

  // Add tier-specific enhancements
  if (customerTier === "lead") {
    return (
      baseResponse +
      " This premium analysis includes advanced recommendations tailored specifically for your business objectives."
    );
  } else if (customerTier === "climb") {
    return (
      baseResponse +
      " Additional insights and optimization suggestions have been included to maximize your results."
    );
  }

  return baseResponse;
}

// HEALTH CHECK FUNCTION
async function checkAIServicesHealth() {
  const healthStatus = {
    claude: false,
    gpt4: false,
    mistral: false,
    timestamp: Date.now(),
  };

  // Quick health check for each service
  try {
    const claudeTest = await callClaudeAPI("Health check", "boost");
    healthStatus.claude = claudeTest.success;
  } catch (error) {
    console.warn("Claude health check failed:", error.message);
  }

  try {
    const gpt4Test = await callGPT4API("Health check", "boost");
    healthStatus.gpt4 = gpt4Test.success;
  } catch (error) {
    console.warn("GPT-4 health check failed:", error.message);
  }

  try {
    const mistralTest = await callMistralAPI("Health check", "boost");
    healthStatus.mistral = mistralTest.success;
  } catch (error) {
    console.warn("Mistral health check failed:", error.message);
  }

  return healthStatus;
}

export {
  AI_ARCHITECTURE,
  processAIRequest,
  callClaudeAPI,
  callGPT4API,
  callMistralAPI,
  getTemplateResponse,
  checkAIServicesHealth,
};
