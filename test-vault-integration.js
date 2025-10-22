// Test vault loading endpoint
import { loadVaultContent } from './lib/vault-loader.js';

console.log('Testing vault loading...');

try {
  const result = await loadVaultContent();
  console.log('✅ Vault loaded successfully');
  console.log(`- Folders: ${result.loadedFolders.length}`);
  console.log(`- Files: ${result.totalFiles}`);
  console.log(`- Content size: ${result.vaultContent.length} chars`);
  console.log(`- Folders loaded: ${result.loadedFolders.join(', ')}`);
  
  if (result.loadedFolders.length !== 3) {
    console.error('❌ Expected 3 folders, got', result.loadedFolders.length);
    process.exit(1);
  }
  
  if (result.vaultContent.length < 10000) {
    console.error('❌ Vault content too small:', result.vaultContent.length);
    process.exit(1);
  }
  
  console.log('✅ All vault tests passed');
  process.exit(0);
} catch (error) {
  console.error('❌ Vault loading failed:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}
