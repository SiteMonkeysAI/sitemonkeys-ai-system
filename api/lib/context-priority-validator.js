// Context Priority Validator - Ensures vault always wins
export function validateContextPriority(contexts) {
  const { vaultContext, documentContext, _mode } = contexts;

  if (vaultContext && vaultContext.healthy) {
    console.log('[PRIORITY] Vault detected - suppressing document context');
    return {
      primaryContext: vaultContext,
      secondaryContext: null,
      contextSource: 'vault',
      documentsIgnored: documentContext ? documentContext.length : 0,
    };
  }

  if (documentContext && documentContext.length > 0) {
    console.log('[PRIORITY] No vault - using document context');
    return {
      primaryContext: null,
      secondaryContext: documentContext,
      contextSource: 'documents',
      documentsUsed: documentContext.length,
    };
  }

  return {
    primaryContext: null,
    secondaryContext: null,
    contextSource: 'none',
    warning: 'No context available',
  };
}
