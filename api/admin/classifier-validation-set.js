/**
 * CLASSIFIER VALIDATION SET
 * 80-query test corpus covering all truth types.
 *
 * Used by POST /api/admin/classifier-test to validate
 * classifyQueryComplexity and detectByPattern without
 * triggering full AI generation.
 */

export const CLASSIFIER_VALIDATION_SET = [

  // ── PERMANENT (20 queries) ──────────────────────────────
  { id: 'CLF001', query: 'What is the boiling point of water?', expected_classification: 'medium_complexity', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF002', query: 'How does photosynthesis work?', expected_classification: 'simple_short', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF003', query: 'What is the Pythagorean theorem?', expected_classification: 'medium_complexity', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF004', query: 'When was the Declaration of Independence signed?', expected_classification: 'medium_complexity', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF005', query: 'What is the capital of France?', expected_classification: 'medium_complexity', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF006', query: 'How many feet are in a mile?', expected_classification: 'simple_short', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF007', query: 'What does photon mean?', expected_classification: 'simple_short', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF008', query: 'Who invented the telephone?', expected_classification: 'simple_short', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF009', query: 'What is the speed of light?', expected_classification: 'simple_short', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF010', query: 'How do you boil an egg?', expected_classification: 'simple_short', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF011', query: 'What is DNA?', expected_classification: 'simple_short', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF012', query: 'What year did World War 2 end?', expected_classification: 'simple_factual', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF013', query: 'How does gravity work?', expected_classification: 'simple_short', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF014', query: 'What is the definition of entropy?', expected_classification: 'medium_complexity', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF015', query: 'Who wrote Hamlet?', expected_classification: 'simple_factual', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF016', query: 'What is mitosis?', expected_classification: 'simple_short', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF017', query: 'How many planets are in the solar system?', expected_classification: 'simple_factual', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF018', query: 'What is the chemical formula for water?', expected_classification: 'medium_complexity', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF019', query: 'What causes rainbows?', expected_classification: 'simple_short', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF020', query: 'How does a combustion engine work?', expected_classification: 'medium_complexity', expected_truth_type: 'PERMANENT', expected_lookup: false },

  // ── SEMI_STABLE (20 queries) ────────────────────────────
  { id: 'CLF021', query: 'Who is the CEO of Apple?', expected_classification: 'simple_short', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF022', query: 'What is the current federal minimum wage?', expected_classification: 'simple_factual', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF023', query: 'What are the current COVID vaccine requirements?', expected_classification: 'medium_complexity', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF024', query: 'What version of iPhone is current?', expected_classification: 'simple_factual', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF025', query: 'Who is the current Prime Minister of the UK?', expected_classification: 'simple_factual', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF026', query: 'What are the current interest rates?', expected_classification: 'simple_factual', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF027', query: 'What are the FDA guidelines on sugar intake?', expected_classification: 'medium_complexity', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF028', query: 'Is the Tesla Model 3 still available?', expected_classification: 'simple_factual', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF029', query: 'What are the current travel restrictions to Europe?', expected_classification: 'medium_complexity', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF030', query: 'Who is the current Secretary of State?', expected_classification: 'simple_factual', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF031', query: 'What is the current tax rate for corporations?', expected_classification: 'simple_factual', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF032', query: 'What are the latest Python version features?', expected_classification: 'medium_complexity', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF033', query: 'Who is the chairman of the Federal Reserve?', expected_classification: 'simple_factual', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF034', query: 'What are the current visa requirements for Mexico?', expected_classification: 'medium_complexity', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF035', query: 'Is Netflix still offering a free trial?', expected_classification: 'simple_factual', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF036', query: 'What are the current OSHA safety requirements?', expected_classification: 'medium_complexity', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF037', query: 'Who is the current governor of California?', expected_classification: 'simple_factual', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF038', query: 'What is the current Medicaid eligibility threshold?', expected_classification: 'simple_factual', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF039', query: 'What are the current hours for the DMV?', expected_classification: 'simple_factual', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },
  { id: 'CLF040', query: 'What is the latest macOS version?', expected_classification: 'simple_factual', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },

  // ── VOLATILE (20 queries) ───────────────────────────────
  { id: 'CLF041', query: 'What is the current price of Bitcoin?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF042', query: 'What is the weather like today?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF043', query: 'What is the latest news on Ukraine?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF044', query: 'What is the stock price of Apple right now?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF045', query: 'What happened in the news today?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF046', query: 'What is the current price of gold?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF047', query: 'Is the stock market up or down today?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF048', query: 'What is the latest on the Trump trial?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF049', query: 'What is the current exchange rate for euros?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF050', query: 'What breaking news is happening right now?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF051', query: 'What is the live score of the game?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF052', query: 'What is the current price of oil?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF053', query: 'What are the latest developments in Gaza?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF054', query: 'What is happening with the Fed today?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF055', query: 'What is the current temperature in New York?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF056', query: 'What is the latest Ethereum price?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF057', query: 'What is the current status of the war in Ukraine?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF058', query: 'What are todays top headlines?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF059', query: 'What is the Dow Jones at right now?', expected_classification: 'news_current_events', expected_truth_type: 'VOLATILE', expected_lookup: true },
  { id: 'CLF060', query: 'What is the current mortgage rate?', expected_classification: 'medium_complexity', expected_truth_type: 'SEMI_STABLE', expected_lookup: true },

  // ── AMBIGUOUS (20 queries) ──────────────────────────────
  { id: 'CLF061', query: 'Can hippos have triplets?', expected_classification: 'simple_short', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF062', query: 'Are you sure about that?', expected_classification: 'simple_short', expected_truth_type: 'AMBIGUOUS', expected_lookup: false },
  { id: 'CLF063', query: 'How does that compare to a Rivian?', expected_classification: 'medium_complexity', expected_truth_type: 'AMBIGUOUS', expected_lookup: false },
  { id: 'CLF064', query: 'Which of those fits my budget?', expected_classification: 'decision_making', expected_truth_type: 'AMBIGUOUS', expected_lookup: false },
  { id: 'CLF065', query: 'What about the charging time?', expected_classification: 'simple_short', expected_truth_type: 'AMBIGUOUS', expected_lookup: false },
  { id: 'CLF066', query: 'Is that still true?', expected_classification: 'simple_short', expected_truth_type: 'AMBIGUOUS', expected_lookup: false },
  { id: 'CLF067', query: 'Can you explain that differently?', expected_classification: 'medium_complexity', expected_truth_type: 'AMBIGUOUS', expected_lookup: false },
  { id: 'CLF068', query: 'Do bears hibernate?', expected_classification: 'simple_short', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF069', query: 'What does that mean for my taxes?', expected_classification: 'medium_complexity', expected_truth_type: 'AMBIGUOUS', expected_lookup: false },
  { id: 'CLF070', query: 'Which is better for my situation?', expected_classification: 'decision_making', expected_truth_type: 'VOLATILE', expected_lookup: false },
  { id: 'CLF071', query: 'Can rhinos have twins?', expected_classification: 'simple_short', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF072', query: 'How long does that usually take?', expected_classification: 'medium_complexity', expected_truth_type: 'AMBIGUOUS', expected_lookup: false },
  { id: 'CLF073', query: 'Is that safe to do?', expected_classification: 'simple_short', expected_truth_type: 'AMBIGUOUS', expected_lookup: false },
  { id: 'CLF074', query: 'What would you recommend?', expected_classification: 'decision_making', expected_truth_type: 'AMBIGUOUS', expected_lookup: false },
  { id: 'CLF075', query: 'Does that still apply?', expected_classification: 'simple_short', expected_truth_type: 'AMBIGUOUS', expected_lookup: false },
  { id: 'CLF076', query: 'What are the pros and cons?', expected_classification: 'decision_making', expected_truth_type: 'PERMANENT', expected_lookup: false },
  { id: 'CLF077', query: 'Is it worth it?', expected_classification: 'decision_making', expected_truth_type: 'AMBIGUOUS', expected_lookup: false },
  { id: 'CLF078', query: 'How does that work exactly?', expected_classification: 'simple_short', expected_truth_type: 'AMBIGUOUS', expected_lookup: false },
  { id: 'CLF079', query: 'What should I do next?', expected_classification: 'decision_making', expected_truth_type: 'AMBIGUOUS', expected_lookup: false },
  { id: 'CLF080', query: 'Does it make sense to do both?', expected_classification: 'decision_making', expected_truth_type: 'AMBIGUOUS', expected_lookup: false },
];
