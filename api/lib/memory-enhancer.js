// ================================================================
// SURGICAL MEMORY ENHANCEMENT - 20 lines total
// ================================================================

export function enhanceMemoryWithStructure(memoryContext) {
  // If no memory context, return as-is
  if (!memoryContext?.contextFound || !memoryContext?.memories) {
    return memoryContext;
  }

  try {
    const memories = memoryContext.memories;

    // Extract structured data (simple regex patterns)
    const structured = {
      userProfile: {
        company: (memories.match(
          /(?:work at|company is|employed by)\s+([A-Za-z]+)/i,
        ) || [])[1],
        role: (memories.match(/(?:I'm a|I am a|work as)\s+([^.\n]+)/i) ||
          [])[1]?.trim(),
      },
      concerns:
        memories
          .match(/(?:worried about|concerned about|problem with)\s+([^.\n]+)/gi)
          ?.slice(0, 3) || [],
      goals:
        memories
          .match(/(?:want to|need to|goal is)\s+([^.\n]+)/gi)
          ?.slice(0, 3) || [],
      numbers: memories.match(/\$[\d,]+|\d+%|\d+\s+years/gi)?.slice(0, 3) || [],
    };

    // Only add structured data if we found something useful
    const hasData =
      structured.userProfile.company ||
      structured.userProfile.role ||
      structured.concerns.length > 0 ||
      structured.goals.length > 0 ||
      structured.numbers.length > 0;

    if (hasData) {
      return { ...memoryContext, structured, structuredDataAvailable: true };
    }
  } catch (error) {
    // Silent failure - just return original context
  }

  return memoryContext;
}
