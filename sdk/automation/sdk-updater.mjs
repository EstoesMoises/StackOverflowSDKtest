#!/usr/bin/env node

// sdk-updater.mjs - Main orchestrator for SDK automation
import fs from 'fs';
import { config, validateConfig } from './config.mjs';
import { OpenAPIGenerator } from './openapi-generator.mjs';
import { DiffAnalyzer } from './diff-analyzer.mjs';
import { LLMAnalyzer } from './llm-analyzer.mjs';
import { GitHubIntegration } from './github-integration.mjs';

class SDKUpdater {
  constructor() {
    this.generator = new OpenAPIGenerator();
    this.diffAnalyzer = new DiffAnalyzer();
    this.llmAnalyzer = new LLMAnalyzer();
    this.github = new GitHubIntegration();
  }
  
    /**
   * Generate wrapper update guide file
   */
  generateUpdateGuideFile(analysis) {
    const guide = analysis.wrapperUpdateGuide;
    let md = `# Wrapper Update Guide\n\n`;
    md += `**Generated:** ${new Date().toISOString()}\n`;
    md += `**Risk Level:** \`${analysis.riskAssessment.level}\`\n\n`;
    
    md += `## 📋 Summary\n\n${analysis.summary}\n\n`;
    
    if (analysis.riskAssessment.level === 'BREAKING') {
      md += `> ⚠️ **BREAKING CHANGES DETECTED** - Immediate attention required!\n\n`;
    }
    
    // Migration steps
    if (guide?.migrationSteps?.length > 0) {
      md += `## 🔄 Migration Steps\n\n`;
      guide.migrationSteps.forEach((step, i) => {
        md += `${i + 1}. ${step}\n`;
      });
      md += `\n`;
    }
    
    // Files to update
    if (guide?.affectedFiles?.length > 0) {
      md += `## 📝 Files to Update\n\n`;
      
      const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const sortedFiles = [...guide.affectedFiles].sort((a, b) => 
        priorityOrder[a.priority] - priorityOrder[b.priority]
      );
      
      for (const file of sortedFiles) {
        const priorityEmoji = {
          CRITICAL: '🔴',
          HIGH: '🟠',
          MEDIUM: '🟡',
          LOW: '🟢'
        }[file.priority];
        
        md += `### ${priorityEmoji} ${file.action}: \`src/client/${file.file}\`\n\n`;
        md += `**Priority:** ${file.priority}\n\n`;
        
        if (file.reasoning) {
          md += `**Why:** ${file.reasoning}\n\n`;
        }
        
        md += `**Instructions:**\n${file.instructions}\n\n`;
        
        if (file.codeExample) {
          md += `**Example:**\n\`\`\`typescript\n${file.codeExample}\n\`\`\`\n\n`;
        }
        
        md += `---\n\n`;
      }
    }
    
    // New endpoints
    if (guide?.newEndpointsToWrap?.length > 0) {
      md += `## ✨ New Endpoints to Wrap\n\n`;
      
      for (const endpoint of guide.newEndpointsToWrap) {
        md += `### ${endpoint.method} ${endpoint.endpoint}\n\n`;
        md += `**Generated SDK:** \`${endpoint.generatedPath}\`\n`;
        md += `**Wrapper file:** \`src/client/${endpoint.suggestedWrapperFile}\`\n`;
        md += `**Suggested method:** \`${endpoint.suggestedMethodName}\`\n\n`;
        md += `**Example implementation:**\n\`\`\`typescript\n${endpoint.exampleImplementation}\n\`\`\`\n\n`;
        md += `---\n\n`;
      }
    }
    
    // Compatibility notes
    if (guide?.compatibilityNotes?.length > 0) {
      md += `## ⚠️ Compatibility Notes\n\n`;
      guide.compatibilityNotes.forEach(note => {
        md += `- ${note}\n`;
      });
      md += `\n`;
    }
    
    // Testing
    if (analysis.testingGuidance?.length > 0) {
      md += `## 🧪 Testing Checklist\n\n`;
      analysis.testingGuidance.forEach(test => {
        md += `- [ ] ${test}\n`;
      });
      md += `\n`;
    }
    
    // Breaking changes
    if (analysis.riskAssessment.breakingChanges?.length > 0) {
      md += `## 💥 Breaking Changes\n\n`;
      analysis.riskAssessment.breakingChanges.forEach(change => {
        md += `- ${change}\n`;
      });
      md += `\n`;
    }
    
    // Impact analysis
    md += `## 📊 Detailed Impact\n\n`;
    
    const impact = analysis.impactAnalysis;
    if (impact.addedEndpoints?.length > 0) {
      md += `### Added Endpoints\n`;
      impact.addedEndpoints.forEach(e => md += `- ${e}\n`);
      md += `\n`;
    }
    
    if (impact.modifiedEndpoints?.length > 0) {
      md += `### Modified Endpoints\n`;
      impact.modifiedEndpoints.forEach(e => md += `- ${e}\n`);
      md += `\n`;
    }
    
    if (impact.removedEndpoints?.length > 0) {
      md += `### Removed Endpoints\n`;
      impact.removedEndpoints.forEach(e => md += `- ${e}\n`);
      md += `\n`;
    }
    
    const filename = 'WRAPPER_UPDATE_GUIDE.md';
    fs.writeFileSync(filename, md, 'utf8');
    
    return { filename, content: md };
  }
  /**
   * Main entry point for the automation
   */
  async run() {
    try {
      console.log('🚀 Starting SDK update automation...');
      console.log(`📅 Started at: ${new Date().toISOString()}`);
      
      // Validate configuration
      validateConfig();
      console.log('✅ Configuration validated');
      
      // Check if running in dry-run mode
      if (config.dryRun) {
        console.log('🧪 Running in DRY-RUN mode - no changes will be committed');
      }
      
      // Step 1: Check for OpenAPI spec changes
      console.log('\\n=== Step 1: Checking for OpenAPI changes ===');
      const hasSpecChanges = await this.generator.checkForChanges();
      
      if (!hasSpecChanges) {
        console.log('✅ No changes detected in OpenAPI spec');
        return this.createResult({ updated: false, reason: 'no-changes' });
      }
      
      // Step 2: Generate new SDK
      console.log('\\n=== Step 2: Generating new SDK ===');
      const generationResult = await this.generator.generateSDK();
      
      if (!generationResult.hasChanges) {
        console.log('✅ SDK generation completed but no code changes detected');
        return this.createResult({ updated: false, reason: 'no-code-changes' });
      }
      
      console.log(`📊 Generation completed: ${generationResult.after.files.length} files generated`);
      const generationDiff = await this.generator.getGenerationDiff(
        generationResult.before, 
        generationResult.after
      );
      
      // Step 3: Analyze changes with git diff
      console.log('\\n=== Step 3: Analyzing code changes ===');
      const diffData = await this.diffAnalyzer.getGeneratedDiff();
      const wrapperContext = await this.diffAnalyzer.getWrapperContext();
      
      console.log(`📈 Diff analysis: ${diffData.summary.filesChanged} files changed`);
      console.log(`📚 Wrapper context: ${Object.keys(wrapperContext).length} files read`);
      
      // Step 4: LLM analysis
      console.log('\\n=== Step 4: AI-powered impact analysis ===');
      const analysis = await this.llmAnalyzer.analyzeChanges(
        diffData, 
        wrapperContext, 
        generationDiff
      );
      
      console.log(`🎯 Risk assessment: ${analysis.riskAssessment.level}`);
      console.log(`🔧 Can automate: ${analysis.automatedChanges?.canAutomate ? 'Yes' : 'No'}`);
      
      // Step 5: Generate update instructions
    console.log('\n=== Step 5: Preparing update instructions ===');
    console.log(`Files affected: ${analysis.wrapperUpdateGuide?.affectedFiles?.length || 0}`);
    console.log(`New endpoints: ${analysis.wrapperUpdateGuide?.newEndpointsToWrap?.length || 0}`);
    console.log(`Migration steps: ${analysis.wrapperUpdateGuide?.migrationSteps?.length || 0}`);
    
    // Step 6: Git operations and PR creation
    if (!config.dryRun) {
      console.log('\n=== Step 6: Creating branch and PR ===');
      
      const gitResult = await this.github.createBranchAndCommit(analysis);
      
      if (!gitResult) {
        console.log('No changes to commit');
        return this.createResult({ 
          updated: true, 
          reason: 'no-git-changes',
          analysis: analysis
        });
      }
      
      console.log(`Created branch: ${gitResult.branchName}`);
      
      let prResult = null;
      if (!config.skipPR) {
        prResult = await this.github.createPullRequest(
          gitResult.branchName,
          analysis
        );
        
        if (prResult.success) {
          console.log(`Pull request created: ${prResult.url}`);
        } else {
          console.log('PR creation failed, manual creation required');
          console.log(prResult.instructions);
        }
      }
      
      return this.createResult({
        updated: true,
        branchName: gitResult.branchName,
        pullRequest: prResult,
        analysis: analysis
      });
      
    } else {
      console.log('DRY-RUN: Skipping git operations and PR creation');
      // In dry run, save instructions to a local file for review
      this.saveLocalInstructions(analysis);
      
      return this.createResult({
        updated: true,
        dryRun: true,
        analysis: analysis
      });
    }
      
    } catch (error) {
      console.error('❌ SDK update failed:', error.message);
      console.error('Stack trace:', error.stack);
      
      // Try to switch back to default branch on error
      try {
        await this.github.switchToDefaultBranch();
      } catch (switchError) {
        console.warn('Failed to switch back to default branch:', switchError.message);
      }
      
      throw error;
    }
  }
  
  /**
   * Create standardized result object
   */
  createResult(data) {
    return {
      timestamp: new Date().toISOString(),
      success: true,
      ...data
    };
  }
  
  /**
   * Display summary of the update process
   */
  displaySummary(result) {
    console.log('\n' + '='.repeat(60));
    console.log('📋 SDK UPDATE SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`⏰ Completed at: ${result.timestamp}`);
    console.log(`✅ Status: ${result.success ? 'Success' : 'Failed'}`);
    
    if (!result.updated) {
      console.log(`📄 Reason: ${result.reason}`);
      console.log('='.repeat(60));
      return;
    }
    
    if (result.dryRun) {
      console.log('🧪 Mode: DRY RUN (no changes committed)');
    }
    
    if (result.analysis) {
      console.log(`🎯 Risk Level: ${result.analysis.riskAssessment.level}`);
      console.log(`📊 Summary: ${result.analysis.summary}`);
      
      if (result.analysis.riskAssessment.breakingChanges?.length > 0) {
        console.log(`💥 Breaking Changes: ${result.analysis.riskAssessment.breakingChanges.length}`);
      }
    }
    
    if (result.updateGuide) {
      console.log(`📋 Update Guide: ${result.updateGuide.filename}`);
    }
    
    if (result.branchName) {
      console.log(`🌿 Branch: ${result.branchName}`);
    }
    
    if (result.pullRequest?.success) {
      console.log(`📝 Pull Request: ${result.pullRequest.url}`);
    }
    
    // Testing reminders
    if (result.analysis?.testingGuidance?.length > 0) {
      console.log('\n🧪 TESTING REQUIRED:');
      result.analysis.testingGuidance.forEach(test => {
        console.log(`   • ${test}`);
      });
    }
    
    // Breaking changes warning
    if (result.analysis?.riskAssessment?.level === 'BREAKING') {
      console.log('\n🚨 BREAKING CHANGES DETECTED!');
      console.log('   This update requires immediate attention and thorough testing.');
    }
    
    console.log('='.repeat(60) + '\n');
  }
  
  /**
   * Handle different CLI commands
   */
  async handleCommand(command) {
    switch (command) {
      case 'run':
      case undefined:
        const result = await this.run();
        this.displaySummary(result);
        return result;
        
      case 'check':
        console.log('🔍 Checking for OpenAPI spec changes...');
        const hasChanges = await this.generator.checkForChanges();
        console.log(hasChanges ? '✅ Changes detected' : '⭕ No changes detected');
        return { hasChanges };
        
      case 'status':
        console.log('📊 Repository Status:');
        console.log(`Current branch: ${this.github.getCurrentBranch()}`);
        console.log(`Repository clean: ${this.github.isRepositoryClean() ? 'Yes' : 'No'}`);
        return {};
        
      case 'help':
        this.showHelp();
        return {};
        
      default:
        console.error(`Unknown command: ${command}`);
        this.showHelp();
        process.exit(1);
    }
  }
  
  /**
   * Show help information
   */
  showHelp() {
    console.log(`
🤖 SDK Update Automation

Usage: node sdk-updater.mjs [command]

Commands:
  run (default)  Run the full update automation
  check          Check if OpenAPI spec has changed
  status         Show current git repository status  
  help           Show this help message

Environment Variables:
  OPENAI_API_KEY      Your OpenAI API key (required)
  GITHUB_TOKEN        GitHub personal access token (required)
  GITHUB_REPOSITORY   Repository in owner/repo format (auto-set in GitHub Actions)
  DRY_RUN=true        Run without making git commits
  SKIP_PR=true        Skip pull request creation
  DEFAULT_BRANCH      Default branch name (default: main)

Examples:
  node sdk-updater.mjs           # Run full automation
  node sdk-updater.mjs check     # Just check for changes
  DRY_RUN=true node sdk-updater.mjs  # Test run without commits
`);
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const updater = new SDKUpdater();
  const command = process.argv[2];
  
  updater.handleCommand(command)
    .then(result => {
      if (result.success === false) {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Fatal error:', error.message);
      process.exit(1);
    });
}

// Export for use as module
export { SDKUpdater };