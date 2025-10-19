import {
  getRelevantContext,
  storeMemory,
  initializeUser,
} from "./memory_system/memory_api.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    await initializeUser("user_test_001");

    await storeMemory(
      "user_test_001",
      "I'm really stressed about my job and how I'm doing at work.",
      {
        session_id: "test_session_alpha",
        response_type: "truth_general",
      },
    );

    const result = await getRelevantContext(
      "user_test_001",
      "work stress",
      2500,
    );

    res.status(200).json({
      success: true,
      memory_system_working: true,
      categories: result.categories,
      memory_entries: result.memories,
      token_count: result.tokenCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Test Memory Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
}
