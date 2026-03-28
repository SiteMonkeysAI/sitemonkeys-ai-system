/**
 * CLASSIFIER TEST ENDPOINT
 *
 * POST /api/admin/classifier-test
 * Header: x-admin-key: <ADMIN_KEY>
 *
 * Calls classifyQueryComplexity and detectByPattern directly.
 * No AI generation. No memory retrieval. Embedding cost only.
 *
 * Body (optional): { queries: [...] }
 * When called with no body / empty queries array, runs the full
 * CLASSIFIER_VALIDATION_SET (80 queries) automatically.
 */

import { classifyQueryComplexity } from '../core/intelligence/queryComplexityClassifier.js';
import { detectByPattern } from '../core/intelligence/truthTypeDetector.js';
import { CLASSIFIER_VALIDATION_SET } from '../admin/classifier-validation-set.js';

/**
 * POST /api/admin/classifier-test
 */
export async function handleClassifierTest(req, res) {
  const adminKey = req.headers['x-admin-key'] ||
                   req.headers['authorization']?.replace('Bearer ', '');

  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
  const queries = (Array.isArray(body.queries) && body.queries.length > 0)
    ? body.queries
    : CLASSIFIER_VALIDATION_SET;

  console.log(`[CLASSIFIER-TEST] Running ${queries.length} queries`);

  const results = [];
  const failuresByType = {};

  for (const item of queries) {
    const { id, query, expected_classification, expected_truth_type, expected_lookup } = item;

    let actual_classification = null;
    let actual_truth_type = null;
    let actual_lookup = null;
    let confidence = null;
    let failure_reason = null;

    try {
      // Detect truth type via pattern (Stage 1, zero tokens)
      const patternResult = detectByPattern(query);

      // Classify query complexity (may use embeddings)
      const classResult = await classifyQueryComplexity(query, {
        truthType: patternResult.type,
        externalLookupRequired: patternResult.externalLookupRequired
      });

      actual_classification = classResult.classification;
      actual_truth_type = patternResult.type;
      // Decision-making queries (and any classifier that explicitly sets externalLookupRequired: false)
      // must not trigger lookup regardless of truth type.
      actual_lookup = classResult.externalLookupRequired === false
        ? false
        : (patternResult.type === 'VOLATILE' || patternResult.type === 'SEMI_STABLE') &&
          patternResult.skipExternalLookup !== true;
      confidence = typeof classResult.confidence === 'number' ? classResult.confidence : null;

    } catch (err) {
      console.error('[CLASSIFIER-TEST] Error on %s:', id, err.message);
      failure_reason = `classifier_error: ${err.message}`;
    }

    const classMatch = actual_classification === expected_classification;
    const truthMatch = actual_truth_type === expected_truth_type;
    const lookupMatch = actual_lookup === expected_lookup;
    const pass = !failure_reason && classMatch && truthMatch;

    if (!pass && !failure_reason) {
      const reasons = [];
      if (!classMatch) reasons.push(`classification: expected=${expected_classification} actual=${actual_classification}`);
      if (!truthMatch) reasons.push(`truth_type: expected=${expected_truth_type} actual=${actual_truth_type}`);
      if (!lookupMatch) reasons.push(`lookup: expected=${expected_lookup} actual=${actual_lookup}`);
      failure_reason = reasons.join('; ');
    }

    if (!pass) {
      const failureCategory = failure_reason?.includes('classifier_error') ? 'ambiguous' : (expected_truth_type || 'ambiguous');
      failuresByType[failureCategory] = (failuresByType[failureCategory] || 0) + 1;
    }

    results.push({
      id,
      query,
      expected_classification,
      actual_classification,
      expected_truth_type,
      actual_truth_type,
      expected_lookup,
      actual_lookup,
      confidence,
      pass,
      failure_reason: pass ? null : failure_reason
    });
  }

  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = total - passed;

  const summary = {
    total,
    passed,
    failed,
    pass_rate: total > 0 ? Math.round((passed / total) * 1000) / 1000 : 0,
    failures_by_type: failuresByType
  };

  console.log(`[CLASSIFIER-TEST] Complete: ${passed}/${total} passed (${(summary.pass_rate * 100).toFixed(1)}%)`);

  return res.json({ results, summary });
}
