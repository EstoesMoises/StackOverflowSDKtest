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
  async createBranchAndCommit(analysis, updateGuide) {  // CHANGED: updateResults -> updateGuide
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
      const commitMessage = this.generateCommitMessage(analysis, updateGuide);  // CHANGED
      
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
  generateCommitMessage(analysis, updateGuide) {  // CHANGED: updateResults -> updateGuide
    const riskLevel = analysis.riskAssessment.level;
    const filesAffected = analysis.wrapperUpdateGuide?.affectedFiles?.length || 0;  // CHANGED
    
    let message = `chore: update SDK wrapper for API changes`;
    
    if (riskLevel === 'BREAKING') {
      message = `feat!: update SDK wrapper for breaking API changes`;
    } else if (riskLevel === 'HIGH') {
      message = `feat: update SDK wrapper for high-impact API changes`;
    } else if (riskLevel === 'MEDIUM') {
      message = `feat: update SDK wrapper for API changes`;
    }
    
    const commitLines = [
      message,
      '',
      'Generated SDK changes detected and analyzed:',
      `- Risk level: ${riskLevel}`,
      `- Files affected: ${filesAffected}`,  // CHANGED
      `- Update guide: ${updateGuide.filename}`  // ADDED
    ];
    
    if (analysis.impactAnalysis.addedEndpoints?.length > 0) {
      commitLines.push(`- Added endpoints: ${analysis.impactAnalysis.addedEndpoints.length}`);
    }
    
    if (analysis.impactAnalysis.modifiedEndpoints?.length > 0) {
      commitLines.push(`- Modified endpoints: ${analysis.impactAnalysis.modifiedEndpoints.length}`);
    }
    
    if (analysis.riskAssessment.breakingChanges?.length > 0) {
      commitLines.push(`- Breaking changes: ${analysis.riskAssessment.breakingChanges.length}`);
    }
    
    commitLines.push('', `Analyzed by: ${analysis.metadata?.llmModel || 'automated system'}`);
    
    return commitLines.join('\n');
  }
  
  /**
   * Create a pull request using AI-generated description
   */
  async createPullRequest(branchName, analysis, updateGuide) {  // CHANGED: removed updateResults, instructionsFile params
    try {
      console.log('📝 Creating pull request...');
      
      const title = this.generatePRTitle(analysis);
      // Use the AI-generated PR description directly
      const body = analysis.prDescription || this.generateFallbackPRBody(analysis, updateGuide);  // CHANGED
      
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
    
    return `${prefix} Auto-update: SDK wrapper changes (${riskLevel} risk)`;
  }
  
  /**
   * Fallback PR body generation (only used if AI doesn't generate one)
   */
  generateFallbackPRBody(analysis, updateGuide) {  // CHANGED: updateResults -> updateGuide
    const lines = [
      '# 🤖 Automated SDK Update',
      '',
      `**Summary:** ${analysis.summary}`,
      '',
      '## 🎯 Risk Assessment',
      '',
      `**Level:** \`${analysis.riskAssessment.level}\``,
      `**Reasoning:** ${analysis.riskAssessment.reasoning}`,
      ''
    ];
    
    // CHANGED: Show update guide info instead
    if (updateGuide && updateGuide.filename) {
      lines.push('## 📋 Update Instructions', '');
      lines.push(`Detailed update instructions have been generated in \`${updateGuide.filename}\`.`);
      lines.push('');
      lines.push('**Summary:**');
      lines.push(`- Files affected: ${analysis.wrapperUpdateGuide?.affectedFiles?.length || 0}`);
      lines.push(`- New endpoints: ${analysis.wrapperUpdateGuide?.newEndpointsToWrap?.length || 0}`);
      lines.push(`- Migration steps: ${analysis.wrapperUpdateGuide?.migrationSteps?.length || 0}`);
      lines.push('');
    }
    
    // ADDED: Show breaking changes if any
    if (analysis.riskAssessment.breakingChanges?.length > 0) {
      lines.push('## ⚠️ Breaking Changes', '');
      analysis.riskAssessment.breakingChanges.forEach(change => {
        lines.push(`- ${change}`);
      });
      lines.push('');
    }
    
    lines.push('---');
    lines.push('*This PR was automatically generated by the SDK update automation.*');
    lines.push(`*Review the \`${updateGuide?.filename || 'WRAPPER_UPDATE_GUIDE.md'}\` file for detailed instructions.*`);
    
    return lines.join('\n');
  }
  
  /**
   * Generate manual PR creation instructions when API fails
   */
  generateManualPRInstructions(branchName, analysis) {
    const lines = [
      '## Manual PR Creation Required',
      '',
      'The automated PR creation failed. Please create the PR manually:',
      '',
      '1. Go to your repository on GitHub',
      `2. Click "Compare & pull request" for branch: ${branchName}`,
      `3. Use this title: ${this.generatePRTitle(analysis)}`,
      `4. Set the base branch to: ${config.defaultBranch}`,
      `5. Add these labels: ${config.prLabels?.join(', ') || 'none'}, risk-${analysis.riskAssessment.level.toLowerCase()}`,
      '',
      'The branch has been pushed and is ready for PR creation.'
    ];
    
    return lines.join('\n');
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