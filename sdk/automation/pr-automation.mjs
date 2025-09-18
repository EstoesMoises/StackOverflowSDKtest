import { execSync } from 'child_process';
import fs from 'fs/promises';

export class PRAutomation {
  constructor(options = {}) {
    this.config = {
      defaultBranch: options.defaultBranch || 'main',
      prLabels: options.prLabels || ['auto-generated', 'sdk-update'],
      githubToken: options.githubToken || process.env.GITHUB_TOKEN,
      repository: options.repository || this.detectRepository(),
      ...options
    };
  }

  /**
   * Detect GitHub repository from git remote
   */
  detectRepository() {
    try {
      const remoteUrl = execSync('git config --get remote.origin.url', { encoding: 'utf8' }).trim();
      
      // Parse GitHub URL (both HTTPS and SSH)
      let match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      if (match) {
        return `${match[1]}/${match[2]}`;
      }
      
      return null;
    } catch (error) {
      console.warn('⚠️  Could not detect GitHub repository');
      return null;
    }
  }

  /**
   * Create a pull request using GitHub CLI
   */
  async createPullRequest(branchName, analysis, options = {}) {
    console.log('📝 Creating pull request...');
    
    try {
      // Generate PR content
      const prContent = this.generatePRContent(analysis, options);
      
      // Try GitHub CLI first (easier)
      const ghSuccess = await this.createPRWithGitHubCLI(branchName, prContent);
      if (ghSuccess) {
        return ghSuccess;
      }
      
      // Fallback to GitHub API
      const apiSuccess = await this.createPRWithAPI(branchName, prContent);
      if (apiSuccess) {
        return apiSuccess;
      }
      
      // If both fail, provide manual instructions
      return this.providePRInstructions(branchName, prContent);
      
    } catch (error) {
      console.error('❌ PR creation failed:', error.message);
      return this.providePRInstructions(branchName, { title: 'SDK Auto-Update', body: 'Failed to generate PR content' });
    }
  }

  /**
   * Create PR using GitHub CLI
   */
  async createPRWithGitHubCLI(branchName, prContent) {
    try {
      // Check if GitHub CLI is available
      execSync('gh --version', { stdio: 'ignore' });
      
      console.log('🔧 Using GitHub CLI to create PR...');
      
      // Build the command
      const labels = this.config.prLabels.join(',');
      const command = [
        'gh pr create',
        `--title "${prContent.title}"`,
        `--body "${prContent.body.replace(/"/g, '\\"')}"`,
        `--head ${branchName}`,
        `--base ${this.config.defaultBranch}`,
        labels ? `--label "${labels}"` : '',
        '--draft' // Create as draft initially
      ].filter(Boolean).join(' ');
      
      const output = execSync(command, { encoding: 'utf8' });
      const prUrl = output.trim();
      
      console.log('✅ Pull request created successfully!');
      console.log(`🔗 PR URL: ${prUrl}`);
      
      return {
        success: true,
        method: 'github-cli',
        url: prUrl,
        number: this.extractPRNumber(prUrl)
      };
      
    } catch (error) {
      console.log('⚠️  GitHub CLI not available or failed:', error.message);
      return null;
    }
  }

  /**
   * Create PR using GitHub API
   */
  async createPRWithAPI(branchName, prContent) {
    if (!this.config.githubToken || !this.config.repository) {
      console.log('⚠️  GitHub token or repository not configured');
      return null;
    }

    try {
      console.log('🔧 Using GitHub API to create PR...');
      
      const [owner, repo] = this.config.repository.split('/');
      
      const prData = {
        title: prContent.title,
        head: branchName,
        base: this.config.defaultBranch,
        body: prContent.body,
        draft: true
      };

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${this.config.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(prData)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`GitHub API error: ${response.status} - ${error}`);
      }

      const pr = await response.json();
      
      // Add labels if configured
      if (this.config.prLabels.length > 0) {
        await this.addLabels(owner, repo, pr.number);
      }
      
      console.log('✅ Pull request created successfully!');
      console.log(`🔗 PR URL: ${pr.html_url}`);
      
      return {
        success: true,
        method: 'github-api',
        url: pr.html_url,
        number: pr.number,
        data: pr
      };
      
    } catch (error) {
      console.log('⚠️  GitHub API failed:', error.message);
      return null;
    }
  }

  /**
   * Add labels to PR
   */
  async addLabels(owner, repo, prNumber) {
    try {
      await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/labels`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${this.config.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ labels: this.config.prLabels })
      });
    } catch (error) {
      console.warn('⚠️  Could not add labels:', error.message);
    }
  }

  /**
   * Provide manual PR instructions
   */
  providePRInstructions(branchName, prContent) {
    console.log('\n' + '='.repeat(60));
    console.log('📋 MANUAL PR CREATION REQUIRED');
    console.log('='.repeat(60));
    console.log(`Branch: ${branchName}`);
    console.log(`Title: ${prContent.title}`);
    console.log('\nBody:');
    console.log(prContent.body);
    console.log('='.repeat(60));
    
    // Save to file for easy copy-paste
    const filename = `pr-content-${Date.now()}.md`;
    fs.writeFile(filename, `# ${prContent.title}\n\n${prContent.body}`)
      .then(() => console.log(`📄 PR content saved to: ${filename}`))
      .catch(() => {});
    
    return {
      success: false,
      method: 'manual',
      branchName,
      title: prContent.title,
      body: prContent.body,
      instructions: `Create PR manually from branch ${branchName}`
    };
  }

  /**
   * Generate comprehensive PR content
   */
  generatePRContent(analysis, options = {}) {
    const timestamp = new Date().toLocaleString();
    const riskLevel = analysis?.riskAssessment?.level || 'UNKNOWN';
    const affectedClients = analysis?.wrapperImpact?.affectedClients?.length || 0;
    const totalFiles = analysis?.gitChanges?.totalFiles || 0;
    
    // Generate title
    const title = this.generatePRTitle(analysis, options);
    
    // Generate body
    const body = this.generatePRBody(analysis, options);
    
    return { title, body };
  }

  /**
   * Generate PR title
   */
  generatePRTitle(analysis, options) {
    const riskLevel = analysis?.riskAssessment?.level || 'UNKNOWN';
    const totalFiles = analysis?.gitChanges?.totalFiles || 0;
    const affectedClients = analysis?.wrapperImpact?.affectedClients?.length || 0;
    
    const riskEmoji = {
      'HIGH': '🚨',
      'MEDIUM': '⚠️',
      'LOW': '✅',
      'UNKNOWN': '🤖'
    };
    
    let title = `${riskEmoji[riskLevel]} SDK Auto-Update: ${totalFiles} files changed`;
    
    if (affectedClients > 0) {
      title += `, ${affectedClients} clients affected`;
    }
    
    return title;
  }

  /**
   * Generate comprehensive PR body
   */
  generatePRBody(analysis, options) {
    const sections = [];
    
    // Header
    sections.push(`## 🤖 Automated SDK Update`);
    sections.push(`This PR contains automatically generated changes from the latest OpenAPI specification.`);
    sections.push(`**Generated at**: ${new Date().toLocaleString()}`);
    sections.push('');
    
    // Summary
    sections.push(this.generateSummarySection(analysis));
    
    // Risk Assessment
    sections.push(this.generateRiskSection(analysis));
    
    // File Changes
    sections.push(this.generateFileChangesSection(analysis));
    
    // Wrapper Impact
    sections.push(this.generateWrapperImpactSection(analysis));
    
    // Testing Recommendations
    sections.push(this.generateTestingSection(analysis));
    
    // Checklist
    sections.push(this.generateChecklistSection(analysis));
    
    // Footer
    sections.push(this.generateFooterSection());
    
    return sections.join('\n');
  }

  /**
   * Generate summary section
   */
  generateSummarySection(analysis) {
    const lines = [];
    lines.push(`### 📊 Change Summary`);
    
    const git = analysis?.gitChanges;
    const wrapper = analysis?.wrapperImpact;
    const risk = analysis?.riskAssessment;
    
    lines.push(`| Metric | Count |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Files Changed | ${git?.totalFiles || 0} |`);
    lines.push(`| Generated Files | ${git?.generatedFiles?.length || 0} |`);
    lines.push(`| Affected Clients | ${wrapper?.affectedClients?.length || 0} |`);
    lines.push(`| Risk Level | ${risk?.level || 'UNKNOWN'} |`);
    lines.push('');
    
    return lines.join('\n');
  }

  /**
   * Generate risk assessment section
   */
  generateRiskSection(analysis) {
    const lines = [];
    const risk = analysis?.riskAssessment;
    
    if (!risk) {
      return `### ⚠️ Risk Assessment\n\nRisk assessment unavailable.\n`;
    }
    
    const riskEmojis = {
      'HIGH': '🚨',
      'MEDIUM': '⚠️',
      'LOW': '✅'
    };
    
    lines.push(`### ${riskEmojis[risk.level] || '❓'} Risk Assessment: ${risk.level}`);
    
    if (risk.level === 'HIGH') {
      lines.push(`🚨 **HIGH RISK DETECTED**`);
      lines.push(`- Extensive changes that may include breaking modifications`);
      lines.push(`- Multiple wrapper clients affected`);
      lines.push(`- Thorough testing and review required before merging`);
    } else if (risk.level === 'MEDIUM') {
      lines.push(`⚠️ **MEDIUM RISK**`);
      lines.push(`- Some wrapper clients may be affected`);
      lines.push(`- Test affected components before merging`);
    } else {
      lines.push(`✅ **LOW RISK**`);
      lines.push(`- Minimal changes detected`);
      lines.push(`- Standard testing should be sufficient`);
    }
    
    lines.push('');
    return lines.join('\n');
  }

  /**
   * Generate file changes section
   */
  generateFileChangesSection(analysis) {
    const lines = [];
    const git = analysis?.gitChanges;
    
    if (!git || git.error) {
      return `### 📁 File Changes\n\nFile change analysis unavailable.\n`;
    }
    
    lines.push(`### 📁 File Changes`);
    
    const { filesByStatus } = git;
    if (filesByStatus) {
      Object.keys(filesByStatus).forEach(status => {
        const files = filesByStatus[status];
        const statusEmoji = {
          'added': '➕',
          'modified': '✏️',
          'deleted': '❌',
          'renamed': '🔄'
        };
        
        lines.push(`**${statusEmoji[status] || '📝'} ${status.toUpperCase()} (${files.length})**`);
        
        // Show first few files, collapse if too many
        const displayFiles = files.slice(0, 10);
        displayFiles.forEach(file => {
          lines.push(`- \`${file}\``);
        });
        
        if (files.length > 10) {
          lines.push(`- ... and ${files.length - 10} more files`);
        }
        lines.push('');
      });
    }
    
    return lines.join('\n');
  }

  /**
   * Generate wrapper impact section
   */
  generateWrapperImpactSection(analysis) {
    const lines = [];
    const wrapper = analysis?.wrapperImpact;
    
    lines.push(`### 🔧 Wrapper Client Impact`);
    
    if (!wrapper || wrapper.error) {
      lines.push(`Wrapper impact analysis unavailable.`);
      lines.push('');
      return lines.join('\n');
    }
    
    if (wrapper.affectedClients.length === 0) {
      lines.push(`✅ **No wrapper clients appear to be affected by these changes.**`);
    } else {
      lines.push(`⚠️ **${wrapper.affectedClients.length} wrapper client(s) potentially affected:**`);
      lines.push('');
      
      wrapper.affectedClients.forEach((client, index) => {
        const riskEmoji = {
          'HIGH': '🚨',
          'MEDIUM': '⚠️',
          'LOW': '✅'
        };
        
        lines.push(`**${index + 1}. \`${client.file}\`** ${riskEmoji[client.riskLevel]} ${client.riskLevel} Risk`);
        lines.push(`- Affected imports: ${client.affectedImports.length}`);
        lines.push(`- Total methods: ${client.methods.length}`);
        
        if (client.affectedImports.length > 0 && client.affectedImports.length <= 3) {
          lines.push(`- Imports: ${client.affectedImports.map(imp => `\`${imp.path}\``).join(', ')}`);
        }
        lines.push('');
      });
    }
    
    return lines.join('\n');
  }

  /**
   * Generate testing recommendations section
   */
  generateTestingSection(analysis) {
    const lines = [];
    const risk = analysis?.riskAssessment?.level;
    const affectedClients = analysis?.wrapperImpact?.affectedClients || [];
    
    lines.push(`### 🧪 Testing Recommendations`);
    
    if (risk === 'HIGH') {
      lines.push(`- [ ] **Critical**: Full test suite execution`);
      lines.push(`- [ ] **Critical**: Manual testing of all affected wrapper clients`);
      lines.push(`- [ ] **Critical**: Integration testing with real API endpoints`);
      lines.push(`- [ ] Backward compatibility verification`);
      lines.push(`- [ ] Performance impact assessment`);
    } else if (risk === 'MEDIUM') {
      lines.push(`- [ ] Run full test suite`);
      lines.push(`- [ ] Test affected wrapper clients specifically`);
      lines.push(`- [ ] Spot-check critical functionality`);
    } else {
      lines.push(`- [ ] Run standard test suite`);
      lines.push(`- [ ] Basic functionality verification`);
    }
    
    if (affectedClients.length > 0) {
      lines.push(`- [ ] **Specific clients to test:**`);
      affectedClients.forEach(client => {
        lines.push(`  - [ ] \`${client.file}\` (${client.riskLevel} risk)`);
      });
    }
    
    lines.push('');
    return lines.join('\n');
  }

  /**
   * Generate checklist section
   */
  generateChecklistSection(analysis) {
    const lines = [];
    
    lines.push(`### 📋 Review Checklist`);
    lines.push(`- [ ] **Code Review**: Generated code changes reviewed`);
    lines.push(`- [ ] **Analysis**: Change impact analysis reviewed`);
    lines.push(`- [ ] **Testing**: All recommended tests completed`);
    lines.push(`- [ ] **Documentation**: Updated if necessary`);
    lines.push(`- [ ] **Breaking Changes**: Identified and documented`);
    lines.push(`- [ ] **Client Updates**: Wrapper clients updated if needed`);
    lines.push(`- [ ] **Approval**: Ready for deployment`);
    lines.push('');
    
    return lines.join('\n');
  }

  /**
   * Generate footer section
   */
  generateFooterSection() {
    return `---
*This PR was automatically generated by the SDK automation pipeline.*
*Review the changes carefully and test thoroughly before merging.*`;
  }

  /**
   * Extract PR number from URL
   */
  extractPRNumber(url) {
    const match = url.match(/\/pull\/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Update existing PR with new analysis
   */
  async updatePR(prNumber, analysis) {
    if (!this.config.githubToken || !this.config.repository) {
      console.log('⚠️  Cannot update PR: GitHub token or repository not configured');
      return false;
    }

    try {
      const [owner, repo] = this.config.repository.split('/');
      const prContent = this.generatePRContent(analysis);
      
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `token ${this.config.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: prContent.title,
          body: prContent.body
        })
      });

      if (response.ok) {
        console.log(`✅ PR #${prNumber} updated successfully`);
        return true;
      } else {
        console.log(`❌ Failed to update PR #${prNumber}`);
        return false;
      }
    } catch (error) {
      console.error('❌ PR update failed:', error.message);
      return false;
    }
  }
}