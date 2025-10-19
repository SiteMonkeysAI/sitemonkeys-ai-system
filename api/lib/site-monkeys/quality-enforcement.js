// SITE MONKEYS QUALITY ENFORCEMENT  
// AI Output Quality Gates and Validation Pipeline

import { callClaudeAPI, callGPT4API, callMistralAPI } from './ai-architecture.js';

const QUALITY_ENFORCEMENT = {  
  // TIER-BASED QUALITY THRESHOLDS  
  thresholds: {  
    boost: 0.85,   // 85% minimum quality threshold  
    climb: 0.90,   // 90% minimum quality threshold    
    lead: 0.92     // 92% minimum quality threshold  
  },  
    
  // AI ARCHITECTURE FAILOVER CHAIN  
  ai_architecture: {  
    primary: "claude-3-sonnet",  
    secondary: "gpt-4",  
    tertiary: "mistral",  
    emergency: "template_library"  
  },  
    
  // QUALITY VALIDATION WEIGHTS  
  validation_criteria: {  
    coherence: 0.25,      // 25% weight  
    relevance: 0.25,      // 25% weight  
    brand_alignment: 0.20, // 20% weight  
    accuracy: 0.20,       // 20% weight  
    completeness: 0.10    // 10% weight  
  },  
    
  // TEMPLATE FALLBACK CATEGORIES  
  template_categories: {  
    seo_audit: "Pre-approved SEO audit templates by industry",  
    blog_content: "Industry-specific blog templates",   
    ppc_campaigns: "Campaign templates by vertical",  
    review_responses: "Professional review response templates",  
    social_content: "Brand-aligned social media templates"  
  },

  // *** CRITICAL: MISSING OBJECTS THAT CHAT.JS REQUIRES ***
  response_standards: {
    vault_based: "QUALITY ENFORCEMENT: Response generated using Site Monkeys business intelligence vault.",
    fallback_mode: "EMERGENCY MODE: Response using hardcoded fallback protocols."
  },

  minimum_standards: {
    response_depth: "QUALITY ENFORCEMENT: Response enhanced for minimum depth requirements."
  }
};

// QUALITY VALIDATION PIPELINE  
async function validateAIOutput(output, customerTier, contentType) {  
  const threshold = QUALITY_ENFORCEMENT.thresholds[customerTier];  
    
  const scores = {  
    coherence: assessCoherence(output),  
    relevance: assessRelevance(output, contentType),  
    brand_alignment: assessBrandAlignment(output),  
    accuracy: assessAccuracy(output),  
    completeness: assessCompleteness(output, contentType)  
  };  
    
  // Calculate weighted score  
  const weightedScore = Object.keys(scores).reduce((total, criterion) => {  
    const weight = QUALITY_ENFORCEMENT.validation_criteria[criterion];  
    return total + (scores[criterion] * weight);  
  }, 0);  
    
  return {  
    score: weightedScore,  
    passes: weightedScore >= threshold,  
    details: scores,  
    threshold: threshold,  
    tier: customerTier  
  };  
}

// AI FAILOVER ORCHESTRATION  
async function processWithFailover(prompt, customerTier, maxAttempts = 3) {  
  const _threshold = QUALITY_ENFORCEMENT.thresholds[customerTier];  
  let attempts = 0;  
    
  while (attempts < maxAttempts) {  
    try {  
      // Primary: Claude 3.5  
      if (attempts === 0) {  
        const claudeResult = await callClaudeAPI(prompt);  
        const quality = await validateAIOutput(claudeResult, customerTier, 'general');  
          
        if (quality.passes) {  
          return { result: claudeResult, source: 'claude', quality: quality };  
        }  
      }  
        
      // Secondary: GPT-4 fallback    
      if (attempts === 1) {  
        const gpt4Result = await callGPT4API(prompt);  
        const quality = await validateAIOutput(gpt4Result, customerTier, 'general');  
          
        if (quality.passes) {  
          return { result: gpt4Result, source: 'gpt4', quality: quality };  
        }  
      }  
        
      // Tertiary: Mistral emergency backup  
      if (attempts === 2) {  
        const mistralResult = await callMistralAPI(prompt);  
        const quality = await validateAIOutput(mistralResult, customerTier, 'general');  
          
        if (quality.score >= 0.80) { // Lower threshold for emergency  
          return { result: mistralResult, source: 'mistral', quality: quality };  
        }  
      }  
        
      attempts++;  
        
    } catch (error) {  
      console.error(`AI API error on attempt ${attempts + 1}:`, error);  
      attempts++;  
    }  
  }  
    
  // Final fallback: Template library  
  console.warn('🚨 All AI models failed - using template fallback');  
  const templateResult = await getEmergencyTemplate(prompt.type, customerTier);  
    
  return {   
    result: templateResult,   
    source: 'template',   
    quality: { score: 0.85, passes: true, fallback: true }  
  };  
}

// QUALITY ASSESSMENT FUNCTIONS  
function assessCoherence(output) {  
  // Basic coherence checks  
  if (!output || output.length < 50) return 0.0;  
    
  const sentences = output.split(/[.!?]+/).filter(s => s.trim().length > 0);  
  if (sentences.length < 2) return 0.6;  
    
  // Check for logical flow, grammar, structure  
  let score = 0.8; // Base score  
    
  // Penalize obvious errors  
  if (output.includes('undefined') || output.includes('null')) score -= 0.3;  
  if (output.match(/\b(um|uh|like)\b/gi)) score -= 0.1;  
    
  return Math.max(0, Math.min(1, score));  
}

function assessRelevance(output, contentType) {  
  // Check if output matches expected content type  
  const contentKeywords = {  
    seo_audit: ['keywords', 'optimization', 'ranking', 'SEO', 'search'],  
    blog_content: ['article', 'content', 'blog', 'information'],  
    ppc_campaigns: ['ads', 'campaign', 'PPC', 'advertising', 'clicks'],  
    review_response: ['thank', 'response', 'feedback', 'review']  
  };  
    
  const keywords = contentKeywords[contentType] || [];  
  const outputLower = output.toLowerCase();  
    
  const keywordMatches = keywords.filter(keyword =>   
    outputLower.includes(keyword.toLowerCase())  
  ).length;  
    
  return Math.min(1, keywordMatches / Math.max(1, keywords.length));  
}

function assessBrandAlignment(output) {  
  // Check for Site Monkeys brand consistency  
  const brandPositive = ['professional', 'quality', 'results', 'success', 'expert'];  
  const brandNegative = ['cheap', 'basic', 'simple', 'easy'];  
    
  const outputLower = output.toLowerCase();  
    
  let score = 0.7; // Base score  
    
  brandPositive.forEach(term => {  
    if (outputLower.includes(term)) score += 0.05;  
  });  
    
  brandNegative.forEach(term => {  
    if (outputLower.includes(term)) score -= 0.1;  
  });  
    
  return Math.max(0, Math.min(1, score));  
}

function assessAccuracy(output) {  
  // Basic accuracy checks - avoid obviously false claims  
  const problematicPhrases = [  
    'guaranteed #1 ranking',  
    'instant results',  
    '100% success rate',  
    'no work required'  
  ];  
    
  let score = 0.9; // High base score  
    
  const outputLower = output.toLowerCase();  
  problematicPhrases.forEach(phrase => {  
    if (outputLower.includes(phrase)) score -= 0.3;  
  });  
    
  return Math.max(0, Math.min(1, score));  
}

function assessCompleteness(output, contentType) {  
  const minLengths = {  
    seo_audit: 300,  
    blog_content: 500,  
    ppc_campaigns: 200,  
    review_response: 100,  
    general: 150  
  };  
    
  const minLength = minLengths[contentType] || minLengths.general;  
    
  if (output.length >= minLength) return 1.0;  
  if (output.length >= minLength * 0.7) return 0.8;  
  if (output.length >= minLength * 0.5) return 0.6;  
    
  return 0.4;  
}

// EMERGENCY TEMPLATE SYSTEM  
async function getEmergencyTemplate(contentType, customerTier) {  
  const templates = {  
    seo_audit: `Professional SEO audit completed for your website. We've identified key optimization opportunities to improve your search rankings and drive more qualified traffic to your business.`,  
      
    blog_content: `Industry insights and expert analysis relevant to your business. Our content team has crafted this piece to establish your authority and engage your target audience.`,  
      
    ppc_campaigns: `Strategic PPC campaign recommendations based on industry best practices and your business objectives. These optimizations will help maximize your advertising ROI.`,  
      
    review_response: `Thank you for your feedback. We appreciate you taking the time to share your experience and will use your input to continue improving our service.`  
  };  
    
  const baseTemplate = templates[contentType] || templates.blog_content;  
    
  // Add tier-specific enhancements  
  if (customerTier === 'lead') {  
    return baseTemplate + " Our premium analysis includes advanced recommendations tailored specifically for your business goals.";  
  }  
    
  return baseTemplate;  
}

export {  
  QUALITY_ENFORCEMENT,  
  validateAIOutput,  
  processWithFailover,  
  getEmergencyTemplate  
};
