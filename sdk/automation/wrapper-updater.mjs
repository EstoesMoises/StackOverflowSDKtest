// wrapper-updater.mjs
import fs from 'fs/promises';
import path from 'path';
import { config } from './config.mjs';

export class WrapperUpdater {
  /**
   * Apply automated changes suggested by LLM analysis
   */
  async applyAutomatedChanges(analysis) {
    const results = {
      updatedFiles: [],
      errors: [],
      skippedFiles: []
    };
    
    if (!analysis.automatedChanges?.canAutomate) {
      console.log('⚠️  No automated changes suggested by analysis');
      return results;
    }
    
    const suggestedUpdates = analysis.automatedChanges.suggestedUpdates || {};
    
    console.log(`🔧 Applying ${Object.keys(suggestedUpdates).length} automated updates...`);
    
    for (const [filename, newContent] of Object.entries(suggestedUpdates)) {
      try {
        await this.applyFileUpdate(filename, newContent, results);
      } catch (error) {
        console.error(`Failed to update ${filename}:`, error.message);
        results.errors.push({
          file: filename,
          error: error.message
        });
      }
    }
    
    return results;
  }
  
  /**
   * Apply update to a single file with safety checks
   */
  async applyFileUpdate(filename, newContent, results) {
    const fullPath = path.join(config.clientDir, filename);
    
    // Safety checks
    if (!newContent || typeof newContent !== 'string') {
      throw new Error('Invalid content provided');
    }
    
    if (!filename.endsWith('.ts') && !filename.endsWith('.js')) {
      throw new Error('Only TypeScript and JavaScript files are supported');
    }
    
    // Check if file exists
    const fileExists = await fs.access(fullPath).then(() => true).catch(() => false);
    
    if (!fileExists) {
      console.log(`📄 Creating new file: ${filename}`);
    } else {
      // Backup existing file
      const backupPath = `${fullPath}.backup.${Date.now()}`;
      await fs.copyFile(fullPath, backupPath);
      console.log(`💾 Backed up ${filename} to ${path.basename(backupPath)}`);
    }
    
    // Basic syntax validation (very simple check)
    if (!this.validateTypeScriptSyntax(newContent)) {
      throw new Error('Content appears to have syntax errors');
    }
    
    // Write the new content
    await fs.writeFile(fullPath, newContent, 'utf8');
    
    results.updatedFiles.push({
      file: filename,
      path: fullPath,
      isNewFile: !fileExists,
      size: newContent.length
    });
    
    console.log(`✅ Updated ${filename}`);
  }
  
  /**
   * Very basic TypeScript syntax validation
   */
  validateTypeScriptSyntax(content) {
    // Basic checks for common syntax errors
    const lines = content.split('\n');
    let braceCount = 0;
    let parenCount = 0;
    let bracketCount = 0;
    
    for (const line of lines) {
      // Count braces, parentheses, brackets
      braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      parenCount += (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
      bracketCount += (line.match(/\[/g) || []).length - (line.match(/\]/g) || []).length;
      
      // Check for obvious syntax errors
      if (line.includes(';;') || line.match(/\}\s*\{/) || line.includes(',,')) {
        return false;
      }
    }
    
    // Check if brackets are balanced
    return braceCount === 0 && parenCount === 0 && bracketCount === 0;
  }
  
  /**
   * Create manual update instructions
   */
  generateManualInstructions(analysis) {
    let instructions = '# Manual Update Instructions\n\n';
    
    instructions += `## Summary\n${analysis.summary}\n\n`;
    
    if (analysis.riskAssessment.level === 'BREAKING') {
      instructions += '⚠️ **BREAKING CHANGES DETECTED** - Immediate attention required\n\n';
    }
    
    // Required changes
    if (analysis.wrapperImpact.requiredChanges?.length > 0) {
      instructions += '## Required Changes\n\n';
      analysis.wrapperImpact.requiredChanges.forEach((change, index) => {
        instructions += `${index + 1}. ${change}\n`;
      });
      instructions += '\n';
    }
    
    // Affected files
    if (analysis.wrapperImpact.affectedFiles?.length > 0) {
      instructions += '## Affected Files\n\n';
      analysis.wrapperImpact.affectedFiles.forEach(file => {
        instructions += `- \`${file}\`\n`;
      });
      instructions += '\n';
    }
    
    // Code suggestions
    if (analysis.wrapperImpact.suggestedCode) {
      instructions += '## Suggested Code Changes\n\n';
      instructions += '```typescript\n';
      instructions += analysis.wrapperImpact.suggestedCode;
      instructions += '\n```\n\n';
    }
    
    // New wrapper methods
    if (analysis.wrapperImpact.newWrapperMethods?.length > 0) {
      instructions += '## New Wrapper Methods to Implement\n\n';
      analysis.wrapperImpact.newWrapperMethods.forEach(method => {
        instructions += `- ${method}\n`;
      });
      instructions += '\n';
    }
    
    // Testing guidance
    if (analysis.testingGuidance?.length > 0) {
      instructions += '## Testing Checklist\n\n';
      analysis.testingGuidance.forEach(test => {
        instructions += `- [ ] ${test}\n`;
      });
      instructions += '\n';
    }
    
    // Breaking changes
    if (analysis.riskAssessment.breakingChanges?.length > 0) {
      instructions += '## Breaking Changes\n\n';
      analysis.riskAssessment.breakingChanges.forEach(change => {
        instructions += `⚠️ ${change}\n`;
      });
      instructions += '\n';
    }
    
    // Impact analysis
    instructions += '## Detailed Impact Analysis\n\n';
    
    const impact = analysis.impactAnalysis;
    if (impact.addedEndpoints?.length > 0) {
      instructions += '### Added Endpoints\n';
      impact.addedEndpoints.forEach(endpoint => instructions += `- ${endpoint}\n`);
      instructions += '\n';
    }
    
    if (impact.modifiedEndpoints?.length > 0) {
      instructions += '### Modified Endpoints\n';
      impact.modifiedEndpoints.forEach(endpoint => instructions += `- ${endpoint}\n`);
      instructions += '\n';
    }
    
    if (impact.removedEndpoints?.length > 0) {
      instructions += '### Removed Endpoints\n';
      impact.removedEndpoints.forEach(endpoint => instructions += `- ${endpoint}\n`);
      instructions += '\n';
    }
    
    if (impact.typeChanges?.length > 0) {
      instructions += '### Type Changes\n';
      impact.typeChanges.forEach(change => instructions += `- ${change}\n`);
      instructions += '\n';
    }
    
    return instructions;
  }
  
  /**
   * Save manual instructions to file
   */
  async saveManualInstructions(analysis, filename = 'UPDATE_INSTRUCTIONS.md') {
    try {
      const instructions = this.generateManualInstructions(analysis);
      await fs.writeFile(filename, instructions, 'utf8');
      console.log(`📝 Manual instructions saved to ${filename}`);
      return filename;
    } catch (error) {
      console.error('Failed to save manual instructions:', error.message);
      return null;
    }
  }
  
  /**
   * Generate a summary of all changes made
   */
  generateUpdateSummary(analysis, automatedResults) {
    const summary = {
      riskLevel: analysis.riskAssessment.level,
      automatedChanges: automatedResults.updatedFiles.length,
      manualChangesRequired: !analysis.automatedChanges?.canAutomate || 
                           analysis.wrapperImpact.requiredChanges?.length > 0,
      filesModified: automatedResults.updatedFiles.map(f => f.file),
      errors: automatedResults.errors,
      breakingChanges: analysis.riskAssessment.breakingChanges || [],
      testingRequired: analysis.testingGuidance || []
    };
    
    return summary;
  }
  
  /**
   * Validate that updated files can be compiled
   */
  async validateUpdatedFiles(updatedFiles) {
    console.log('🔍 Validating updated files...');
    
    // This is a basic validation - in a real scenario you might want to run tsc --noEmit
    const validationResults = {
      valid: [],
      errors: []
    };
    
    for (const fileInfo of updatedFiles) {
      try {
        const content = await fs.readFile(fileInfo.path, 'utf8');
        
        if (this.validateTypeScriptSyntax(content)) {
          validationResults.valid.push(fileInfo.file);
        } else {
          validationResults.errors.push({
            file: fileInfo.file,
            error: 'Syntax validation failed'
          });
        }
      } catch (error) {
        validationResults.errors.push({
          file: fileInfo.file,
          error: error.message
        });
      }
    }
    
    if (validationResults.errors.length > 0) {
      console.warn(`⚠️  Validation issues found in ${validationResults.errors.length} files`);
    } else {
      console.log('✅ All updated files passed basic validation');
    }
    
    return validationResults;
  }
}