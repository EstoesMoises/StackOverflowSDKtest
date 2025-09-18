import { execSync } from 'child_process';

export class GitIntegration {
  constructor(options = {}) {
    this.config = {
      branchPrefix: options.branchPrefix || 'auto-update',
      defaultBranch: options.defaultBranch || 'main',
      commitPrefix: options.commitPrefix || 'chore: update SDK from OpenAPI spec',
      ...options
    };
  }

  /**
   * Check if we're in a git repository
   */
  isGitRepo() {
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current git status
   */
  getGitStatus() {
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf8' });
      const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
      
      return {
        hasChanges: status.trim().length > 0,
        currentBranch: branch,
        isClean: status.trim().length === 0
      };
    } catch (error) {
      throw new Error(`Failed to get git status: ${error.message}`);
    }
  }

  /**
   * Get list of changed files
   */
  getChangedFiles() {
    try {
      const output = execSync('git status --porcelain', { encoding: 'utf8' });
      const files = output
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const status = line.substring(0, 2);
          const file = line.substring(3);
          return { status: status.trim(), file };
        });

      return files;
    } catch (error) {
      throw new Error(`Failed to get changed files: ${error.message}`);
    }
  }

  /**
   * Generate a unique branch name
   */
  generateBranchName() {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const shortHash = Date.now().toString(36).slice(-4); // short random suffix
    return `${this.config.branchPrefix}-${timestamp}-${shortHash}`;
  }

  /**
   * Create and switch to a new branch
   */
  createBranch(branchName) {
    try {
      console.log(`🌿 Creating branch: ${branchName}`);
      execSync(`git checkout -b ${branchName}`, { stdio: 'inherit' });
      return branchName;
    } catch (error) {
      throw new Error(`Failed to create branch: ${error.message}`);
    }
  }

  /**
   * Switch to an existing branch
   */
  switchBranch(branchName) {
    try {
      console.log(`🔄 Switching to branch: ${branchName}`);
      execSync(`git checkout ${branchName}`, { stdio: 'inherit' });
    } catch (error) {
      throw new Error(`Failed to switch to branch: ${error.message}`);
    }
  }

  /**
   * Add files to git staging
   */
  addFiles(files = []) {
    try {
      if (files.length === 0) {
        // Add all changes
        console.log('📁 Adding all changes to git...');
        execSync('git add .', { stdio: 'inherit' });
      } else {
        // Add specific files
        console.log(`📁 Adding ${files.length} files to git...`);
        for (const file of files) {
          execSync(`git add "${file}"`, { stdio: 'inherit' });
        }
      }
    } catch (error) {
      throw new Error(`Failed to add files: ${error.message}`);
    }
  }

  /**
   * Create a commit with descriptive message
   */
  commit(changesSummary) {
    try {
      const message = this.generateCommitMessage(changesSummary);
      console.log('💾 Creating commit...');
      console.log(`📝 Commit message: ${message.split('\n')[0]}`);
      
      execSync(`git commit -m "${message}"`, { stdio: 'inherit' });
    } catch (error) {
      throw new Error(`Failed to commit: ${error.message}`);
    }
  }

  /**
   * Generate a descriptive commit message
   */
  generateCommitMessage(changesSummary) {
    const timestamp = new Date().toISOString();
    const changedFiles = this.getChangedFiles();
    
    let message = this.config.commitPrefix;
    
    // Add summary information
    if (changesSummary) {
      message += `\n\n`;
      message += `Updated: ${timestamp}\n`;
      message += `Files changed: ${changedFiles.length}\n`;
      
      // Group files by type
      const generated = changedFiles.filter(f => f.file.includes('generated/')).length;
      const metadata = changedFiles.filter(f => f.file.includes('metadata') || f.file.includes('openapi')).length;
      const other = changedFiles.length - generated - metadata;
      
      if (generated > 0) message += `- Generated files: ${generated}\n`;
      if (metadata > 0) message += `- Metadata files: ${metadata}\n`;
      if (other > 0) message += `- Other files: ${other}\n`;
    }
    
    // Add file list if reasonable number
    if (changedFiles.length <= 10) {
      message += `\nChanged files:\n`;
      changedFiles.forEach(f => {
        message += `- ${f.status} ${f.file}\n`;
      });
    }
    
    return message;
  }

  /**
   * Push branch to remote
   */
  pushBranch(branchName) {
    try {
      console.log(`⬆️  Pushing branch to remote: ${branchName}`);
      execSync(`git push origin ${branchName}`, { stdio: 'inherit' });
      
      // Get the remote URL for reference
      try {
        const remoteUrl = execSync('git config --get remote.origin.url', { encoding: 'utf8' }).trim();
        console.log(`🔗 Branch available at: ${remoteUrl}`);
        return remoteUrl;
      } catch (err) {
        // Ignore if we can't get remote URL
        return null;
      }
    } catch (error) {
      throw new Error(`Failed to push branch: ${error.message}`);
    }
  }

  /**
   * Full workflow: create branch, commit, and push
   */
  async handleChanges(changesSummary = null) {
    console.log('🔧 Starting Git integration...');
    
    // Verify we're in a git repo
    if (!this.isGitRepo()) {
      throw new Error('Not in a git repository. Initialize git first with: git init');
    }

    // Check current status
    const status = this.getGitStatus();
    console.log(`📊 Current branch: ${status.currentBranch}`);
    console.log(`📊 Has changes: ${status.hasChanges}`);

    if (!status.hasChanges) {
      console.log('✅ No changes to commit');
      return null;
    }

    // Generate branch name
    const branchName = this.generateBranchName();
    
    // Create and switch to new branch
    const createdBranch = this.createBranch(branchName);
    
    // Stage all changes
    this.addFiles();
    
    // Commit changes
    this.commit(changesSummary);
    
    // Push to remote (if configured)
    let remoteUrl = null;
    try {
      remoteUrl = this.pushBranch(branchName);
    } catch (error) {
      console.warn('⚠️  Failed to push to remote:', error.message);
      console.log('🔧 You can push manually later with: git push origin ' + branchName);
    }

    console.log('✅ Git integration completed successfully');
    
    return {
      branchName: createdBranch,
      remoteUrl,
      changedFiles: this.getChangedFiles().length,
      previousBranch: status.currentBranch
    };
  }

  /**
   * Cleanup: switch back to default branch
   */
  switchToDefault() {
    try {
      console.log(`🔄 Switching back to ${this.config.defaultBranch}`);
      execSync(`git checkout ${this.config.defaultBranch}`, { stdio: 'inherit' });
    } catch (error) {
      console.warn(`⚠️  Could not switch to ${this.config.defaultBranch}:`, error.message);
    }
  }

  /**
   * Get branch creation summary for reporting
   */
  async getBranchInfo(branchName) {
    try {
      const commitHash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
      const commitMessage = execSync('git log -1 --pretty=%B', { encoding: 'utf8' }).trim();
      
      return {
        branchName,
        commitHash: commitHash.substring(0, 7),
        commitMessage: commitMessage.split('\n')[0],
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return null;
    }
  }
}