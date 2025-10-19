// api/test-deploy.js
// Simple test to see if new files get deployed

console.log("🚀 TEST FILE LOADED - Deployment is working!");

export default function testDeploy(req, res) {
  res.json({
    status: "SUCCESS",
    message: "Test deployment file is working",
    timestamp: new Date().toISOString(),
    test: "If you see this, file deployment works",
  });
}

console.log("✅ Test deployment file loaded successfully");
