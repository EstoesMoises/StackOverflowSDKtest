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
  async createBranchAndCommit(analysis) {  // FIXED: Removed updateGuide parameter
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const branchName = `${config.branchPrefix}-${timestamp}`;
    
    try {
      console.log(`🌿 Creating branch: ${branchName}`);
      
      execSync(`git checkout ${config.defaultBranch}`, { stdio: 'pipe' });
      execSync('git pull origin ' + config.defaultBranch, { stdio: 'pipe' });
      execSync(`git checkout -b ${branchName}`, { stdio: 'pipe' });
      execSync('git add .', { stdio: 'pipe' });
      
      const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
      if (!status) {
        console.log('⚠️  No changes to commit');
        return null;
      }
      
      const commitMessage = this.generateCommitMessage(analysis);  // FIXED: Removed updateGuide param
      
      execSync(`git commit -m "${commitMessage}"`, { stdio: 'pipe' });
      console.log(`✅ Committed changes to ${branchName}`);
      
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
  
  generateCommitMessage(analysis) {
    const riskLevel = analysis.riskAssessment.level;
    const filesAffected = analysis.wrapperUpdateGuide?.affectedFiles?.length || 0;
    
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
      `- Files affected: ${filesAffected}`
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
    commitLines.push('', 'See PR description for detailed update instructions.');
    
    return commitLines.join('\n');
  }

  async createPullRequest(branchName, analysis) {
    try {
      console.log('📝 Creating pull request...');
      
      const title = this.generatePRTitle(analysis);
      const body = analysis.prDescription || this.generateFallbackPRBody(analysis);
      
      const response = await this.octokit.pulls.create({
        owner: config.github.owner,
        repo: config.github.repoName,
        title: title,
        head: branchName,
        base: config.defaultBranch,
        body: body
      });
      
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

  generateFallbackPRBody(analysis) {
    const guide = analysis.wrapperUpdateGuide;
    const impact = analysis.impactAnalysis;
    
    let md = `# 🤖 SDK Wrapper Update Required\n\n`;
    md += `**Risk Level:** \`${analysis.riskAssessment.level}\`\n\n`;
    md += `${analysis.summary}\n\n`;
    
    if (analysis.riskAssessment.level === 'BREAKING') {
      md += `> **⚠️ BREAKING CHANGES DETECTED** - Immediate attention required!\n\n`;
    }
    
    // Quick summary
    md += `## 📊 Quick Summary\n\n`;
    md += `- **Files affected:** ${guide?.affectedFiles?.length || 0}\n`;
    md += `- **New endpoints:** ${guide?.newEndpointsToWrap?.length || 0}\n`;
    md += `- **Migration steps:** ${guide?.migrationSteps?.length || 0}\n`;
    md += `- **Added endpoints:** ${impact?.addedEndpoints?.length || 0}\n`;
    md += `- **Modified endpoints:** ${impact?.modifiedEndpoints?.length || 0}\n`;
    md += `- **Removed endpoints:** ${impact?.removedEndpoints?.length || 0}\n\n`;
    
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
      md += `<details>\n<summary><strong>Click to expand file-by-file instructions (${guide.affectedFiles.length} files)</strong></summary>\n\n`;
      
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
      
      md += `</details>\n\n`;
    }
    
    // New endpoints
    if (guide?.newEndpointsToWrap?.length > 0) {
      md += `## ✨ New Endpoints to Wrap\n\n`;
      md += `<details>\n<summary><strong>Click to expand endpoint details (${guide.newEndpointsToWrap.length} endpoints)</strong></summary>\n\n`;
      
      for (const endpoint of guide.newEndpointsToWrap) {
        md += `### ${endpoint.method} ${endpoint.endpoint}\n\n`;
        md += `**Generated SDK:** \`${endpoint.generatedPath}\`\n`;
        md += `**Wrapper file:** \`src/client/${endpoint.suggestedWrapperFile}\`\n`;
        md += `**Suggested method:** \`${endpoint.suggestedMethodName}\`\n\n`;
        md += `**Example:**\n\`\`\`typescript\n${endpoint.exampleImplementation}\n\`\`\`\n\n`;
        md += `---\n\n`;
      }
      
      md += `</details>\n\n`;
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
    
    // Detailed impact analysis
    if (impact) {
      md += `## 📈 Detailed Impact Analysis\n\n`;
      md += `<details>\n<summary><strong>Click to expand impact details</strong></summary>\n\n`;
      
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
      
      if (impact.typeChanges?.length > 0) {
        md += `### Type Changes\n`;
        impact.typeChanges.forEach(e => md += `- ${e}\n`);
        md += `\n`;
      }
      
      if (impact.importChanges?.length > 0) {
        md += `### Import Changes\n`;
        impact.importChanges.forEach(e => md += `- ${e}\n`);
        md += `\n`;
      }
      
      md += `</details>\n\n`;
    }
    
    md += `---\n*Automated SDK update - generated by Claude ${analysis.metadata?.llmModel || 'unknown'}*`;
    
    return md;
  }

  generatePRTitle(analysis) {
    const riskLevel = analysis.riskAssessment.level;
    
    let prefix = '🔄';
    if (riskLevel === 'BREAKING') prefix = '💥';
    else if (riskLevel === 'HIGH') prefix = '⚠️';
    else if (riskLevel === 'MEDIUM') prefix = '📝';
    else prefix = '✨';
    
    return `${prefix} Auto-update: SDK wrapper changes (${riskLevel} risk)`;
  }

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
  
  getCurrentBranch() {
    try {
      return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    } catch (error) {
      return 'unknown';
    }
  }
  
  isRepositoryClean() {
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
      return !status;
    } catch (error) {
      return false;
    }
  }
  
  async switchToDefaultBranch() {
    try {
      execSync(`git checkout ${config.defaultBranch}`, { stdio: 'pipe' });
      console.log(`🔄 Switched back to ${config.defaultBranch}`);
    } catch (error) {
      console.warn(`Failed to switch to ${config.defaultBranch}:`, error.message);
    }
  }
}