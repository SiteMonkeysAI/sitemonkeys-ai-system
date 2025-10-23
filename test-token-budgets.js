// Token Budget Verification Script
// Tests the 3 required scenarios to verify token efficiency mechanisms

import Orchestrator from "./api/core/orchestrator.js";

// Test configuration
const TEST_USER_ID = "test-user-budget-verification";
const TEST_SESSION_ID = "budget-test-session";

// Mock vault content for testing (simulating 135K chars / ~34K tokens)
const MOCK_VAULT_CONTENT = `
${"=".repeat(80)}
SITE MONKEYS VAULT - BUSINESS KNOWLEDGE BASE
${"=".repeat(80)}

[DOCUMENT: Founder's Directive v3.2]
The founder's directive establishes core principles for Site Monkeys operations:
1. Truth-first communication in all client interactions
2. No pricing below established minimums ($697 base)
3. Quality over speed in all deliverables
4. Transparent risk assessment for all projects
5. Client education as part of service delivery

[DOCUMENT: Pricing Policy]
MINIMUM SERVICE PRICES:
- Basic Website: $1,497
- E-commerce Site: $2,997
- Custom Application: $4,997
- Hourly Rate Floor: $89/hour

Never quote below these minimums. Any pricing discussion below $697 must be flagged.

[DOCUMENT: Client Onboarding Process]
Deposit Required: 50% upfront
Payment Terms: Net 15
Scope Change Policy: Additional work requires new Statement of Work

RED FLAGS:
- Requests for free work or trial projects
- Pricing pressure below established minimums
- Scope creep without compensation discussion
- Payment term extensions beyond Net 30

[DOCUMENT: Project Management Framework]
Communication Policy: Slack for urgent, email for formal
Meeting Cadence: Weekly check-ins for active projects
Deliverable Timeline: 2-week sprints with client review

RISK INDICATORS:
- Client non-responsive for >48 hours
- Scope expansion without documentation
- Technical requirements beyond agreed capability
- Timeline compression requests

[DOCUMENT: Financial Intelligence]
MONTHLY TARGETS:
- Revenue: $15,000
- New Clients: 3
- Project Completion: 4

CASH FLOW RULES:
- Maintain 3-month operating expense reserve
- No project >40% of monthly revenue target
- Collect deposits before work begins
- Invoice immediately upon milestone completion

[DOCUMENT: Marketing Strategy]
Track ROI on all channels
Pause channels with <2x return
Focus on referral network development
Content marketing for thought leadership

[DOCUMENT: Technical Standards]
All projects must include:
- Responsive design
- Security best practices
- Performance optimization
- Accessibility compliance
- Documentation

[DOCUMENT: Quality Assurance]
Testing requirements:
- Cross-browser compatibility
- Mobile responsiveness
- Load time <3 seconds
- Security audit completion
- Client acceptance testing

[DOCUMENT: Risk Management]
Identify and document risks:
- Technical complexity risks
- Timeline risks
- Budget risks
- Dependency risks
- Communication risks

[DOCUMENT: Client Communication]
Response times:
- Urgent: Within 2 hours
- Important: Within 4 hours
- Routine: Within 24 hours

Always document decisions and next steps.

[DOCUMENT: Business Development]
Lead qualification criteria:
- Budget alignment with minimums
- Timeline realistic for scope
- Decision-maker engagement
- Clear project requirements
- Cultural fit assessment

[DOCUMENT: Service Delivery]
Milestone structure:
1. Discovery & Planning (20%)
2. Design & Prototype (30%)
3. Development (30%)
4. Testing & Launch (20%)

Payment tied to milestone completion.

[DOCUMENT: Competitive Positioning]
Key differentiators:
- Truth-first consulting
- Risk-aware project management
- Quality-focused delivery
- Transparent pricing
- Long-term partnership approach

[DOCUMENT: Operational Procedures]
Daily standup: 9am
Weekly review: Fridays
Monthly planning: First Monday
Quarterly strategy: First week of quarter

[DOCUMENT: Team Guidelines]
Work hours: Flexible with core hours 10am-3pm
Response expectations during core hours
Deep work time protection
Meeting efficiency standards

[DOCUMENT: Client Success Metrics]
Track for each project:
- On-time delivery rate
- Budget adherence
- Client satisfaction score
- Referral generation
- Long-term retention

[DOCUMENT: Growth Strategy]
Focus areas:
- Expand service offerings
- Build referral network
- Develop passive income streams
- Strategic partnerships
- Thought leadership content

[DOCUMENT: Emergency Procedures]
Critical issue response:
1. Assess severity
2. Notify client immediately
3. Deploy fix team
4. Document incident
5. Conduct post-mortem

[DOCUMENT: Legal Framework]
All contracts must include:
- Scope of work
- Payment terms
- Intellectual property rights
- Termination clauses
- Liability limitations

${"=".repeat(80)}
END OF VAULT CONTENT
${"=".repeat(80)}
`.repeat(5); // Repeat to simulate ~135K chars

console.log("\n" + "=".repeat(80));
console.log("TOKEN BUDGET VERIFICATION TESTS");
console.log("=".repeat(80) + "\n");

console.log(`Mock vault size: ${MOCK_VAULT_CONTENT.length} chars (~${Math.ceil(MOCK_VAULT_CONTENT.length / 4)} tokens)\n`);

// Initialize orchestrator
const orchestrator = new Orchestrator();

async function runTests() {
  try {
    console.log("Initializing orchestrator...");
    await orchestrator.initialize();
    console.log("✅ Orchestrator initialized\n");

    // Mock global vault content
    global.vaultContent = MOCK_VAULT_CONTENT;
    console.log(`✅ Mock vault loaded (${MOCK_VAULT_CONTENT.length} chars)\n`);

    const results = {
      test1: null,
      test2: null,
      test3: null,
    };

    // =============================================================================
    // TEST 1: Simple Query (no vault)
    // Expected: Memory ≤2,500 tokens, Total ≤3,000 tokens, Model: GPT-4
    // =============================================================================
    console.log("=".repeat(80));
    console.log("TEST 1: Simple Query (No Vault)");
    console.log("=".repeat(80));
    console.log("Query: 'What are my kids' names?'");
    console.log("Expected: Memory ≤2,500 tokens, Total ≤3,000 tokens\n");

    try {
      const result1 = await orchestrator.processRequest({
        message: "What are my kids' names?",
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        mode: "truth_general",
        vaultEnabled: false,
        conversationHistory: [],
      });

      const memoryTokens = result1.metadata.memoryTokens || 0;
      const totalTokens = result1.metadata.totalContextTokens || 0;
      const model = result1.metadata.model;

      results.test1 = {
        memoryTokens,
        totalTokens,
        model,
        memoryPass: memoryTokens <= 2500,
        totalPass: totalTokens <= 3000,
        budgetCompliance: result1.metadata.budgetCompliance || {},
      };

      console.log("Results:");
      console.log(`  Memory tokens: ${memoryTokens} (Budget: ≤2,500)`);
      console.log(`  Total tokens: ${totalTokens} (Budget: ≤3,000)`);
      console.log(`  Model used: ${model}`);
      console.log(`  Memory compliance: ${results.test1.memoryPass ? "✅ PASS" : "❌ FAIL"}`);
      console.log(`  Total compliance: ${results.test1.totalPass ? "✅ PASS" : "❌ FAIL"}`);
      
      if (result1.metadata.budgetCompliance) {
        console.log("\n  Budget Compliance Details:");
        console.log(`    - Memory: ${result1.metadata.budgetCompliance.memory ? "✅" : "❌"}`);
        console.log(`    - Documents: ${result1.metadata.budgetCompliance.documents ? "✅" : "❌"}`);
        console.log(`    - Vault: ${result1.metadata.budgetCompliance.vault ? "✅" : "❌"}`);
        console.log(`    - Total: ${result1.metadata.budgetCompliance.total ? "✅" : "❌"}`);
      }
      
      console.log("\n  Overall: " + (results.test1.memoryPass && results.test1.totalPass ? "✅ PASS" : "❌ FAIL"));
    } catch (error) {
      console.log(`❌ Test 1 failed: ${error.message}`);
      results.test1 = { error: error.message };
    }

    console.log("\n");

    // =============================================================================
    // TEST 2: Vault Query (Site Monkeys mode)
    // Expected: Memory ≤2,500 tokens, Vault ≤9,000 tokens, Total ≤12,000 tokens
    // =============================================================================
    console.log("=".repeat(80));
    console.log("TEST 2: Vault Query (Site Monkeys Mode)");
    console.log("=".repeat(80));
    console.log("Query: 'What's in the vault?'");
    console.log("Expected: Memory ≤2,500 tokens, Vault ≤9,000 tokens, Total ≤12,000 tokens\n");

    try {
      const result2 = await orchestrator.processRequest({
        message: "What's in the vault?",
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        mode: "site_monkeys",
        vaultEnabled: true,
        conversationHistory: [],
      });

      const memoryTokens = result2.metadata.memoryTokens || 0;
      const vaultTokens = result2.metadata.vaultTokens || 0;
      const totalTokens = result2.metadata.totalContextTokens || 0;
      const model = result2.metadata.model;
      const sectionsSelected = result2.metadata.vaultSectionsSelected;
      const selectionReason = result2.metadata.vaultSelectionReason;

      results.test2 = {
        memoryTokens,
        vaultTokens,
        totalTokens,
        model,
        sectionsSelected,
        selectionReason,
        memoryPass: memoryTokens <= 2500,
        vaultPass: vaultTokens <= 9000,
        totalPass: totalTokens <= 12000,
        budgetCompliance: result2.metadata.budgetCompliance || {},
      };

      console.log("Results:");
      console.log(`  Memory tokens: ${memoryTokens} (Budget: ≤2,500)`);
      console.log(`  Vault tokens: ${vaultTokens} (Budget: ≤9,000) 🎯 CRITICAL TEST`);
      console.log(`  Total tokens: ${totalTokens} (Budget: ≤12,000)`);
      console.log(`  Model used: ${model}`);
      console.log(`  Sections selected: ${sectionsSelected || 'N/A'}`);
      console.log(`  Selection reason: ${selectionReason || 'N/A'}`);
      console.log(`  Memory compliance: ${results.test2.memoryPass ? "✅ PASS" : "❌ FAIL"}`);
      console.log(`  Vault compliance: ${results.test2.vaultPass ? "✅ PASS" : "❌ FAIL"}`);
      console.log(`  Total compliance: ${results.test2.totalPass ? "✅ PASS" : "❌ FAIL"}`);
      
      if (result2.metadata.budgetCompliance) {
        console.log("\n  Budget Compliance Details:");
        console.log(`    - Memory: ${result2.metadata.budgetCompliance.memory ? "✅" : "❌"}`);
        console.log(`    - Documents: ${result2.metadata.budgetCompliance.documents ? "✅" : "❌"}`);
        console.log(`    - Vault: ${result2.metadata.budgetCompliance.vault ? "✅" : "❌"}`);
        console.log(`    - Total: ${result2.metadata.budgetCompliance.total ? "✅" : "❌"}`);
      }

      console.log("\n  Overall: " + (results.test2.memoryPass && results.test2.vaultPass && results.test2.totalPass ? "✅ PASS" : "❌ FAIL"));
    } catch (error) {
      console.log(`❌ Test 2 failed: ${error.message}`);
      results.test2 = { error: error.message };
    }

    console.log("\n");

    // =============================================================================
    // TEST 3: Document Query
    // Expected: Memory ≤2,500 tokens, Document ≤3,000 tokens, Total ≤6,000 tokens
    // =============================================================================
    console.log("=".repeat(80));
    console.log("TEST 3: Document Query");
    console.log("=".repeat(80));
    console.log("Query: 'What's in this document?' (with uploaded prenup)");
    console.log("Expected: Memory ≤2,500 tokens, Document ≤3,000 tokens, Total ≤6,000 tokens\n");

    // Mock document upload
    const { extractedDocuments } = await import("./api/upload-for-analysis.js");
    
    const mockDocument = `
PRENUPTIAL AGREEMENT

This Prenuptial Agreement is entered into on [DATE] between [PARTY A] and [PARTY B].

RECITALS:
The parties intend to marry and wish to establish their respective rights and obligations regarding property.

ARTICLE 1: SEPARATE PROPERTY
Each party shall retain all property owned prior to marriage as separate property.

ARTICLE 2: MARITAL PROPERTY
Property acquired during marriage shall be owned according to title.

ARTICLE 3: INCOME
Income earned during marriage shall be separate property of the earning spouse.

ARTICLE 4: DEBTS
Each party is responsible for debts incurred in their name.

ARTICLE 5: ESTATE PLANNING
This agreement supersedes state intestacy laws regarding property distribution.

ARTICLE 6: MODIFICATIONS
This agreement may only be modified in writing by both parties.

ARTICLE 7: SEVERABILITY
If any provision is invalid, remaining provisions remain in effect.

ARTICLE 8: GOVERNING LAW
This agreement is governed by the laws of [STATE].

IN WITNESS WHEREOF, the parties have executed this agreement.

[Signatures and notarization follow]
`.repeat(20); // Repeat to simulate a longer document

    extractedDocuments.set("latest", {
      filename: "prenup.pdf",
      content: mockDocument.substring(0, 1000), // Preview
      fullContent: mockDocument, // Full content
      extracted: true,
    });

    try {
      const result3 = await orchestrator.processRequest({
        message: "What's in this document?",
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        mode: "truth_general",
        vaultEnabled: false,
        conversationHistory: [],
      });

      const memoryTokens = result3.metadata.memoryTokens || 0;
      const documentTokens = result3.metadata.documentTokens || 0;
      const totalTokens = result3.metadata.totalContextTokens || 0;
      const model = result3.metadata.model;

      results.test3 = {
        memoryTokens,
        documentTokens,
        totalTokens,
        model,
        memoryPass: memoryTokens <= 2500,
        documentPass: documentTokens <= 3000,
        totalPass: totalTokens <= 6000,
        budgetCompliance: result3.metadata.budgetCompliance || {},
      };

      console.log("Results:");
      console.log(`  Memory tokens: ${memoryTokens} (Budget: ≤2,500)`);
      console.log(`  Document tokens: ${documentTokens} (Budget: ≤3,000)`);
      console.log(`  Total tokens: ${totalTokens} (Budget: ≤6,000)`);
      console.log(`  Model used: ${model}`);
      console.log(`  Memory compliance: ${results.test3.memoryPass ? "✅ PASS" : "❌ FAIL"}`);
      console.log(`  Document compliance: ${results.test3.documentPass ? "✅ PASS" : "❌ FAIL"}`);
      console.log(`  Total compliance: ${results.test3.totalPass ? "✅ PASS" : "❌ FAIL"}`);
      
      if (result3.metadata.budgetCompliance) {
        console.log("\n  Budget Compliance Details:");
        console.log(`    - Memory: ${result3.metadata.budgetCompliance.memory ? "✅" : "❌"}`);
        console.log(`    - Documents: ${result3.metadata.budgetCompliance.documents ? "✅" : "❌"}`);
        console.log(`    - Vault: ${result3.metadata.budgetCompliance.vault ? "✅" : "❌"}`);
        console.log(`    - Total: ${result3.metadata.budgetCompliance.total ? "✅" : "❌"}`);
      }

      console.log("\n  Overall: " + (results.test3.memoryPass && results.test3.documentPass && results.test3.totalPass ? "✅ PASS" : "❌ FAIL"));
    } catch (error) {
      console.log(`❌ Test 3 failed: ${error.message}`);
      results.test3 = { error: error.message };
    }

    // =============================================================================
    // FINAL REPORT
    // =============================================================================
    console.log("\n");
    console.log("=".repeat(80));
    console.log("FINAL VERIFICATION REPORT");
    console.log("=".repeat(80));
    console.log("\n## Test 1: Simple Query");
    if (results.test1?.error) {
      console.log(`- ❌ Error: ${results.test1.error}`);
    } else {
      console.log(`- Memory tokens: ${results.test1.memoryTokens} (${results.test1.memoryPass ? "✅" : "❌"} meets budget)`);
      console.log(`- Total: ${results.test1.totalTokens} (${results.test1.totalPass ? "✅" : "❌"} meets budget)`);
      console.log(`- ${results.test1.memoryPass && results.test1.totalPass ? "✅" : "❌"} Meets budget\n`);
    }

    console.log("\n## Test 2: Vault Query");
    if (results.test2?.error) {
      console.log(`- ❌ Error: ${results.test2.error}`);
    } else {
      console.log(`- Memory tokens: ${results.test2.memoryTokens} (${results.test2.memoryPass ? "✅" : "❌"} meets budget)`);
      console.log(`- Vault tokens: ${results.test2.vaultTokens} (${results.test2.vaultPass ? "✅" : "❌"} meets ≤9,000 budget) 🎯`);
      console.log(`- Total: ${results.test2.totalTokens} (${results.test2.totalPass ? "✅" : "❌"} meets budget)`);
      console.log(`- Sections selected: ${results.test2.sectionsSelected || 'N/A'}`);
      console.log(`- Selection: ${results.test2.selectionReason || 'N/A'}`);
      console.log(`- ${results.test2.memoryPass && results.test2.vaultPass && results.test2.totalPass ? "✅" : "❌"} Meets budget\n`);
    }

    console.log("\n## Test 3: Document Query");
    if (results.test3?.error) {
      console.log(`- ❌ Error: ${results.test3.error}`);
    } else {
      console.log(`- Memory tokens: ${results.test3.memoryTokens} (${results.test3.memoryPass ? "✅" : "❌"} meets budget)`);
      console.log(`- Document tokens: ${results.test3.documentTokens} (${results.test3.documentPass ? "✅" : "❌"} meets budget)`);
      console.log(`- Total: ${results.test3.totalTokens} (${results.test3.totalPass ? "✅" : "❌"} meets budget)`);
      console.log(`- ${results.test3.memoryPass && results.test3.documentPass && results.test3.totalPass ? "✅" : "❌"} Meets budget\n`);
    }

    // Overall pass/fail
    const allPassed = 
      (results.test1?.memoryPass && results.test1?.totalPass) &&
      (results.test2?.memoryPass && results.test2?.vaultPass && results.test2?.totalPass) &&
      (results.test3?.memoryPass && results.test3?.documentPass && results.test3?.totalPass);

    console.log("\n" + "=".repeat(80));
    console.log(allPassed ? "✅ ALL TESTS PASSED - READY FOR MERGE" : "❌ SOME TESTS FAILED - NEEDS FIXES");
    console.log("=".repeat(80) + "\n");

    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    console.error("\n❌ Test suite failed:", error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
