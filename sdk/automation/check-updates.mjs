#!/usr/bin/env node

import fs from 'fs/promises';
import crypto from 'crypto';
import { execSync } from 'child_process';

class BasicSDKUpdater {
  constructor() {
    this.config = {
      // You'll need to set this to your actual OpenAPI JSON URL or local file path
      openApiJsonUrl: process.env.OPENAPI_JSON_URL || './src/source/swagger.json',
      localJsonPath: './openapi.json',
      metadataFile: './automation-metadata.json'
    };
  }

  async run() {
    console.log('🔍 Checking for OpenAPI spec updates...');
    
    try {
      const hasChanges = await this.checkForChanges();
      
      if (!hasChanges) {
        console.log('✅ No changes detected');
        return false;
      }

      console.log('📝 Changes detected! Generating new code...');
      await this.generateCode();
      
      console.log('✅ Update completed successfully');
      return true;
      
    } catch (error) {
      console.error('❌ Update failed:', error.message);
      throw error;
    }
  }

  /**
   * Check if the OpenAPI spec has changed by comparing hashes
   */
  async checkForChanges() {
    try {
      console.log('📥 Reading OpenAPI specification...');
      
      let latestSpec;
      
      // Handle both URLs and local file paths
      if (this.config.openApiJsonUrl.startsWith('http://') || 
          this.config.openApiJsonUrl.startsWith('https://')) {
        // Remote URL
        const response = await fetch(this.config.openApiJsonUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`);
        }
        latestSpec = await response.text();
        
      } else if (this.config.openApiJsonUrl.startsWith('file://')) {
        // File URL - remove file:// prefix and read
        const filePath = this.config.openApiJsonUrl.replace('file://', '');
        latestSpec = await fs.readFile(filePath, 'utf8');
        
      } else {
        // Treat as local file path
        latestSpec = await fs.readFile(this.config.openApiJsonUrl, 'utf8');
      }
      
      // Calculate hash of the spec
      const latestHash = crypto.createHash('sha256').update(latestSpec).digest('hex');
      
      // Try to read existing metadata
      let metadata = { lastHash: null };
      try {
        const metadataContent = await fs.readFile(this.config.metadataFile, 'utf8');
        metadata = JSON.parse(metadataContent);
      } catch (err) {
        console.log('📄 No previous metadata found - treating as first run');
      }
      
      // Compare hashes
      if (metadata.lastHash === latestHash) {
        return false; // No changes
      }
      
      console.log(`🔄 Hash changed: ${metadata.lastHash?.slice(0, 8) || 'none'} -> ${latestHash.slice(0, 8)}`);
      
      // Only copy to localJsonPath if it's different from source
      if (this.config.openApiJsonUrl !== this.config.localJsonPath) {
        await fs.writeFile(this.config.localJsonPath, latestSpec);
      }
      
      // Update metadata
      const newMetadata = {
        lastHash: latestHash,
        previousHash: metadata.lastHash,
        lastUpdate: new Date().toISOString(),
        lastCheck: new Date().toISOString(),
        sourceFile: this.config.openApiJsonUrl
      };
      
      await fs.writeFile(this.config.metadataFile, JSON.stringify(newMetadata, null, 2));
      
      return true; // Changes detected
      
    } catch (error) {
      // Update the last check time even if we failed
      try {
        const metadataContent = await fs.readFile(this.config.metadataFile, 'utf8');
        const metadata = JSON.parse(metadataContent);
        metadata.lastCheck = new Date().toISOString();
        metadata.lastError = error.message;
        await fs.writeFile(this.config.metadataFile, JSON.stringify(metadata, null, 2));
      } catch (metaError) {
        // Ignore metadata update errors
      }
      
      throw new Error(`Failed to check for changes: ${error.message}`);
    }
  }

  /**
   * Generate new SDK code using your existing setup
   */
  async generateCode() {
    try {
      console.log('⚙️  Running code generation...');
      
      // Use your existing pnpm script
      execSync('pnpm generateSDK', { 
        stdio: 'inherit',  // This will show the generator output
        cwd: process.cwd()
      });
      
      console.log('✅ Code generation completed');
      
    } catch (error) {
      throw new Error(`Code generation failed: ${error.message}`);
    }
  }

  /**
   * Get basic info about what changed
   */
  async getChangeInfo() {
    try {
      const metadata = JSON.parse(await fs.readFile(this.config.metadataFile, 'utf8'));
      return {
        lastUpdate: metadata.lastUpdate,
        lastCheck: metadata.lastCheck,
        hasError: !!metadata.lastError,
        lastError: metadata.lastError
      };
    } catch (error) {
      return null;
    }
  }
}

// Export for use as module
export { BasicSDKUpdater };

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const updater = new BasicSDKUpdater();
  
  // Handle command line arguments
  const args = process.argv.slice(2);
  if (args.includes('--info')) {
    updater.getChangeInfo().then(info => {
      if (info) {
        console.log('📊 Update Information:');
        console.log(`Last update: ${info.lastUpdate || 'Never'}`);
        console.log(`Last check: ${info.lastCheck || 'Never'}`);
        if (info.hasError) {
          console.log(`Last error: ${info.lastError}`);
        }
      } else {
        console.log('📄 No update history found');
      }
    });
  } else {
    updater.run().catch(console.error);
  }
}