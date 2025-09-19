// github-integration.mjs
import { execSync } from 'child_process';
import { Octokit } from '@octokit/rest';
import { config } from './config.mjs';

export class GitHubIntegration {
  constructor() {
    this.octokit = new Octokit({
      auth: config.github.token
    });
  }
  
  /**
   * Create a new branch and commit changes
   */
  async createBranchAndCommit(analysis, updateResults) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const branchName = `${config.branchPrefix}-${timestamp}`;
    
    try {
      console.log(`🌿 Creating branch: ${branchName}`);
      
      // Ensure we're on the default branch
      execSync(`git checkout ${config.defaultBranch}`, { stdio: 'pipe' });
      
      // Pull latest changes
      execSync('git pull origin ' + config.defaultBranch, { stdio: 'pipe' });
      
      // Create new branch
      execSync(`git checkout -b ${branchName}`, { stdio: 'pipe' });
      
      // Stage all changes
      execSync('git add .', { stdio: 'pipe' });
      
      // Check if there are changes to commit
      const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
      if (!status) {
        console.log('⚠️  No changes to commit');
        return null;
      }
      
      // Create commit message
      const commitMessage = this.generateCommitMessage(analysis, updateResults);
      
      // Commit changes
      execSync(`git commit -m "${commitMessage}"`, { stdio: 'pipe' });
      
      console.log(`✅ Committed changes to ${branchName}`);
      
      // Push branch to remote
      execSync(`git push -u origin ${branchName}`, { stdio: 'pipe' });
      
      console.log(`🚀 Pushed branch ${branchName} to remote`);
      
      return {
        branchName,
        commitMessage,
        changedFiles: status.split('\n').length
      };
      
    } catch (error) {
      throw new Error(`Git operations failed: ${error.message}`);
    }
  }
  
  /**
   * Generate commit message based on analysis
   */
  generateCommitMessage(analysis, updateResults) {
    const riskLevel = analysis.riskAssessment.level;
    const automatedCount = updateResults.updatedFiles.length;
    
    let message = `chore: update SDK wrapper for API changes`;
    
    if (riskLevel === 'BREAKING') {
      message = `feat!: update SDK wrapper for breaking API changes`;
    } else if (riskLevel === 'HIGH') {
      message = `feat: update SDK wrapper for high-impact API changes`;
    } else if (riskLevel === 'MEDIUM') {
      message = `feat: update SDK wrapper for API changes`;
    }
    
    let body = `\\n\\nGenerated SDK changes detected and analyzed:\\n`;
    body += `- Risk level: ${riskLevel}\\n`;
    body += `- Automated updates: ${automatedCount} files\\n`;
    
    if (analysis.impactAnalysis.addedEndpoints?.length > 0) {
      body += `- Added endpoints: ${analysis.impactAnalysis.addedEndpoints.length}\\n`;
    }
    
    if (analysis.impactAnalysis.modifiedEndpoints?.length > 0) {
      body += `- Modified endpoints: ${analysis.impactAnalysis.modifiedEndpoints.length}\\n`;
    }
    
    if (analysis.riskAssessment.breakingChanges?.length > 0) {
      body += `- Breaking changes: ${analysis.riskAssessment.breakingChanges.length}\\n`;
    }
    
    body += `\\nAnalyzed by: ${analysis.metadata?.llmModel || 'automated system'}`;
    
    return message + body;
  }
  
  /**
   * Create a pull request
   */
  async createPullRequest(branchName, analysis, updateResults, instructionsFile) {
    try {
      console.log('📝 Creating pull request...');
      
      const title = this.generatePRTitle(analysis);
      const body = this.generatePRBody(analysis, updateResults, instructionsFile);
      
      const response = await this.octokit.pulls.create({
        owner: config.github.owner,
        repo: config.github.repoName,
        title: title,
        head: branchName,
        base: config.defaultBranch,
        body: body
      });
      
      // Add labels
      if (config.prLabels && config.prLabels.length > 0) {
        await this.octokit.issues.addLabels({
          owner: config.github.owner,
          repo: config.github.repoName,
          issue_number: response.data.number,
          labels: [
            ...config.prLabels,
            `risk-${analysis.riskAssessment.level.toLowerCase()}`,
            ...(analysis.riskAssessment.level === 'BREAKING' ? ['breaking-change'] : [])
          ]
        });
      }
      
      console.log(`✅ Pull request created: #${response.data.number}`);
      
      return {
        success: true,
        number: response.data.number,
        url: response.data.html_url,
        title: title
      };
      
    } catch (error) {
      console.error('Failed to create pull request:', error.message);
      
      return {
        success: false,
        error: error.message,
        instructions: this.generateManualPRInstructions(branchName, analysis)
      };
    }
  }
  
  /**
   * Generate PR title based on analysis
   */
  generatePRTitle(analysis) {
    const riskLevel = analysis.riskAssessment.level;
    
    let prefix = '🔄';
    if (riskLevel === 'BREAKING') prefix = '💥';
    else if (riskLevel === 'HIGH') prefix = '⚠️';
    else if (riskLevel === 'MEDIUM') prefix = '📝';
    else prefix = '✨';
    
    const title = `${prefix} Auto-update: SDK wrapper changes (${riskLevel} risk)`;
    
    return title;
  }
  
  /**
   * Generate PR body with detailed information
   */
  generatePRBody(analysis, updateResults, instructionsFile) {
    let body = `## 🤖 Automated SDK Update\\n\\n`;
    
    // Summary
    body += `**Summary:** ${analysis.summary}\\n\\n`;
    
    // Risk assessment
    body += `## 🎯 Risk Assessment\\n\\n`;
    body += `**Level:** \`${analysis.riskAssessment.level}\`\\n`;
    body += `**Reasoning:** ${analysis.riskAssessment.reasoning}\\n\\n`;
    
    // Breaking changes warning
    if (analysis.riskAssessment.level === 'BREAKING') {
      body += `## ⚠️ Breaking Changes Detected\\n\\n`;
      if (analysis.riskAssessment.breakingChanges?.length > 0) {
        analysis.riskAssessment.breakingChanges.forEach(change => {
          body += `- ⚠️ ${change}\\n`;
        });
      }
      body += `\\n**🚨 This PR requires immediate attention and thorough testing!**\\n\\n`;
    }
    
    // What changed
    body += `## 📊 What Changed\\n\\n`;
    
    const impact = analysis.impactAnalysis;
    if (impact.addedEndpoints?.length > 0) {
      body += `### ➕ Added Endpoints (${impact.addedEndpoints.length})\\n`;
      impact.addedEndpoints.forEach(endpoint => body += `- ${endpoint}\\n`);
      body += `\\n`;
    }
    
    if (impact.modifiedEndpoints?.length > 0) {
      body += `### 🔄 Modified Endpoints (${impact.modifiedEndpoints.length})\\n`;
      impact.modifiedEndpoints.forEach(endpoint => body += `- ${endpoint}\\n`);
      body += `\\n`;
    }
    
    if (impact.removedEndpoints?.length > 0) {
      body += `### ➖ Removed Endpoints (${impact.removedEndpoints.length})\\n`;
      impact.removedEndpoints.forEach(endpoint => body += `- ${endpoint}\\n`);
      body += `\\n`;
    }
    
    if (impact.typeChanges?.length > 0) {
      body += `### 🏷️ Type Changes\\n`;
      impact.typeChanges.forEach(change => body += `- ${change}\\n`);
      body += `\\n`;
    }
    
    // Automated changes
    body += `## 🔧 Automated Changes\\n\\n`;
    if (updateResults.updatedFiles.length > 0) {
      body += `✅ **${updateResults.updatedFiles.length} files automatically updated:**\\n`;
      updateResults.updatedFiles.forEach(file => {
        const status = file.isNewFile ? '🆕 Created' : '📝 Updated';
        body += `- ${status}: \`${file.file}\`\\n`;
      });
    } else {
      body += `ℹ️ No files were automatically updated.\\n`;
    }
    
    if (updateResults.errors.length > 0) {
      body += `\\n❌ **${updateResults.errors.length} files had update errors:**\\n`;
      updateResults.errors.forEach(error => {
        body += `- \`${error.file}\`: ${error.error}\\n`;
      });
    }
    body += `\\n`;
    
    // Manual actions required
    if (!analysis.automatedChanges?.canAutomate || analysis.wrapperImpact.requiredChanges?.length > 0) {
      body += `## 👤 Manual Actions Required\\n\\n`;
      if (instructionsFile) {
        body += `📋 Detailed instructions have been generated in [\`${instructionsFile}\`](./${instructionsFile})\\n\\n`;
      }
      
      if (analysis.wrapperImpact.requiredChanges?.length > 0) {
        body += `**Required changes:**\\n`;
        analysis.wrapperImpact.requiredChanges.forEach((change, index) => {
          body += `${index + 1}. ${change}\\n`;
        });
        body += `\\n`;
      }
      
      if (analysis.wrapperImpact.affectedFiles?.length > 0) {
        body += `**Files requiring review:**\\n`;
        analysis.wrapperImpact.affectedFiles.forEach(file => {
          body += `- \`${file}\`\\n`;
        });
        body += `\\n`;
      }
    }
    
    // Testing checklist
    if (analysis.testingGuidance?.length > 0) {
      body += `## ✅ Testing Checklist\\n\\n`;
      analysis.testingGuidance.forEach(test => {
        body += `- [ ] ${test}\\n`;
      });
      body += `\\n`;
    }
    
    // Code suggestions
    if (analysis.wrapperImpact.suggestedCode && analysis.wrapperImpact.suggestedCode.trim()) {
      body += `## 💡 Suggested Code Changes\\n\\n`;
      body += `\`\`\`typescript\\n${analysis.wrapperImpact.suggestedCode}\\n\`\`\`\\n\\n`;
    }
    
    // Metadata
    body += `## 🔍 Analysis Details\\n\\n`;
    body += `- **Analyzed by:** ${analysis.metadata?.llmModel || 'Automated system'}\\n`;
    body += `- **Analysis time:** ${analysis.metadata?.analyzedAt}\\n`;
    body += `- **Generation summary:** Files changed: ${analysis.metadata?.generationSummary?.summary?.totalChanges || 'unknown'}\\n`;
    
    body += `\\n---\\n`;
    body += `*This PR was automatically generated by the SDK update automation. Please review carefully before merging.*`;
    
    return body;
  }
  
  /**
   * Generate manual PR creation instructions when API fails
   */
  generateManualPRInstructions(branchName, analysis) {
    return `
## Manual PR Creation Required

The automated PR creation failed. Please create the PR manually:

1. Go to your repository on GitHub
2. Click "Compare & pull request" for branch: ${branchName}  
3. Use this title: ${this.generatePRTitle(analysis)}
4. Set the base branch to: ${config.defaultBranch}
5. Add these labels: ${config.prLabels.join(', ')}, risk-${analysis.riskAssessment.level.toLowerCase()}

The branch has been pushed and is ready for PR creation.
`;
  }
  
  /**
   * Get current git status
   */
  getCurrentBranch() {
    try {
      return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    } catch (error) {
      return 'unknown';
    }
  }
  
  /**
   * Check if repository is clean
   */
  isRepositoryClean() {
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
      return !status;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Switch back to default branch
   */
  async switchToDefaultBranch() {
    try {
      execSync(`git checkout ${config.defaultBranch}`, { stdio: 'pipe' });
      console.log(`🔄 Switched back to ${config.defaultBranch}`);
    } catch (error) {
      console.warn(`Failed to switch to ${config.defaultBranch}:`, error.message);
    }
  }
}