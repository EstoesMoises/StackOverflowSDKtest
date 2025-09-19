// openapi-generator.mjs
import fs from 'fs/promises';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { config } from './config.mjs';

export class OpenAPIGenerator {
  /**
   * Check if the OpenAPI spec has changed by comparing hashes
   */
  async checkForChanges() {
    try {
      console.log('🔍 Checking for OpenAPI spec changes...');
      
      // Read the current spec
      const currentSpec = await fs.readFile(config.openApiSpecPath, 'utf8');
      const currentHash = crypto.createHash('sha256').update(currentSpec).digest('hex');
      
      // Try to read existing metadata
      let metadata = { lastHash: null };
      try {
        const metadataContent = await fs.readFile(config.metadataFile, 'utf8');
        metadata = JSON.parse(metadataContent);
      } catch (err) {
        console.log('📄 No previous metadata found - treating as first run');
      }
      
      // Compare hashes
      if (metadata.lastHash === currentHash) {
        console.log('✅ No changes detected in OpenAPI spec');
        return false;
      }
      
      console.log(`🔄 Hash changed: ${metadata.lastHash?.slice(0, 8) || 'none'} -> ${currentHash.slice(0, 8)}`);
      
      // Update metadata
      const newMetadata = {
        lastHash: currentHash,
        previousHash: metadata.lastHash,
        lastUpdate: new Date().toISOString(),
        specPath: config.openApiSpecPath
      };
      
      await fs.writeFile(config.metadataFile, JSON.stringify(newMetadata, null, 2));
      
      return true;
      
    } catch (error) {
      throw new Error(`Failed to check for spec changes: ${error.message}`);
    }
  }
  
  /**
   * Generate new SDK code using openapi-generator-cli
   */
  async generateSDK() {
    try {
      console.log('⚙️  Generating new SDK from OpenAPI spec...');
      
      // Capture the state of generated dir before generation
      const beforeGeneration = await this.captureGeneratedState();
      
      // Run the generation command
      execSync(config.generateCommand, { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      console.log('✅ SDK generation completed');
      
      // Capture the state after generation
      const afterGeneration = await this.captureGeneratedState();
      
      return {
        before: beforeGeneration,
        after: afterGeneration,
        hasChanges: JSON.stringify(beforeGeneration) !== JSON.stringify(afterGeneration)
      };
      
    } catch (error) {
      throw new Error(`SDK generation failed: ${error.message}`);
    }
  }
  
  /**
   * Capture the current state of generated files
   */
  async captureGeneratedState() {
    try {
      const state = {
        files: [],
        timestamp: new Date().toISOString()
      };
      
      const generatedExists = await fs.access(config.generatedDir).then(() => true).catch(() => false);
      if (!generatedExists) {
        return state;
      }
      
      async function scanDirectory(dir, basePath = '') {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = `${dir}/${entry.name}`;
          const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath, relativePath);
          } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            const content = await fs.readFile(fullPath, 'utf8');
            const hash = crypto.createHash('sha256').update(content).digest('hex');
            
            state.files.push({
              path: relativePath,
              hash: hash,
              size: content.length
            });
          }
        }
      }
      
      await scanDirectory(config.generatedDir);
      return state;
      
    } catch (error) {
      console.warn('Failed to capture generated state:', error.message);
      return { files: [], timestamp: new Date().toISOString() };
    }
  }
  
  /**
   * Get detailed diff between before and after generation
   */
  async getGenerationDiff(beforeState, afterState) {
    const diff = {
      addedFiles: [],
      removedFiles: [],
      modifiedFiles: [],
      summary: {
        totalChanges: 0,
        addedCount: 0,
        removedCount: 0,
        modifiedCount: 0
      }
    };
    
    const beforeFiles = new Map(beforeState.files.map(f => [f.path, f]));
    const afterFiles = new Map(afterState.files.map(f => [f.path, f]));
    
    // Find added files
    for (const [path, file] of afterFiles) {
      if (!beforeFiles.has(path)) {
        diff.addedFiles.push(path);
        diff.summary.addedCount++;
      }
    }
    
    // Find removed files
    for (const [path, file] of beforeFiles) {
      if (!afterFiles.has(path)) {
        diff.removedFiles.push(path);
        diff.summary.removedCount++;
      }
    }
    
    // Find modified files
    for (const [path, afterFile] of afterFiles) {
      const beforeFile = beforeFiles.get(path);
      if (beforeFile && beforeFile.hash !== afterFile.hash) {
        diff.modifiedFiles.push({
          path: path,
          sizeBefore: beforeFile.size,
          sizeAfter: afterFile.size,
          sizeChange: afterFile.size - beforeFile.size
        });
        diff.summary.modifiedCount++;
      }
    }
    
    diff.summary.totalChanges = diff.summary.addedCount + diff.summary.removedCount + diff.summary.modifiedCount;
    
    return diff;
  }
}