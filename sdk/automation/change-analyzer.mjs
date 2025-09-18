import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

export class ChangeAnalyzer {
  constructor(options = {}) {
    this.config = {
      generatedDir: options.generatedDir || './src/generated',
      clientDir: options.clientDir || './src/client',
      backupDir: options.backupDir || './backups',
      ...options
    };
  }

  /**
   * Analyze all changes made during the SDK update
   */
  async analyzeChanges() {
    console.log('🔍 Analyzing changes...');
    
    try {
      const analysis = {
        timestamp: new Date().toISOString(),
        gitChanges: await this.getGitChanges(),
        generatedCodeChanges: await this.analyzeGeneratedChanges(),
        wrapperImpact: await this.analyzeWrapperImpact(),
        riskAssessment: null
      };

      // Calculate risk assessment
      analysis.riskAssessment = this.assessRisk(analysis);
      
      // Save analysis
      await this.saveAnalysis(analysis);
      
      console.log('✅ Change analysis completed');
      return analysis;
      
    } catch (error) {
      console.error('❌ Change analysis failed:', error);
      throw error;
    }
  }

  /**
   * Get git changes using git diff and status
   */
  async getGitChanges() {
    try {
      // Get list of changed files
      const statusOutput = execSync('git status --porcelain', { encoding: 'utf8' });
      const files = this.parseGitStatus(statusOutput);
      
      // Get detailed diff for generated files only (to avoid huge diffs)
      let diffOutput = '';
      try {
        diffOutput = execSync('git diff --name-status src/generated/', { encoding: 'utf8' });
      } catch (err) {
        // No diff available (maybe first commit)
        diffOutput = '';
      }

      return {
        totalFiles: files.length,
        filesByStatus: this.groupFilesByStatus(files),
        generatedFiles: files.filter(f => f.path.includes('generated/')),
        clientFiles: files.filter(f => f.path.includes('client/')),
        otherFiles: files.filter(f => !f.path.includes('generated/') && !f.path.includes('client/')),
        diffSummary: this.parseDiffSummary(diffOutput)
      };
    } catch (error) {
      console.warn('⚠️  Could not get git changes:', error.message);
      return { totalFiles: 0, error: error.message };
    }
  }

  /**
   * Parse git status output
   */
  parseGitStatus(statusOutput) {
    return statusOutput
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        const status = line.substring(0, 2).trim();
        const path = line.substring(3);
        return {
          status: this.interpretGitStatus(status),
          path,
          rawStatus: status
        };
      });
  }

  /**
   * Interpret git status codes
   */
  interpretGitStatus(status) {
    const statusMap = {
      'A': 'added',
      'M': 'modified',
      'D': 'deleted',
      'R': 'renamed',
      'C': 'copied',
      '??': 'untracked'
    };
    return statusMap[status] || 'unknown';
  }

  /**
   * Group files by their change status
   */
  groupFilesByStatus(files) {
    const groups = {};
    files.forEach(file => {
      if (!groups[file.status]) {
        groups[file.status] = [];
      }
      groups[file.status].push(file.path);
    });
    return groups;
  }

  /**
   * Parse git diff summary
   */
  parseDiffSummary(diffOutput) {
    const lines = diffOutput.split('\n').filter(line => line.trim());
    return {
      filesChanged: lines.length,
      changes: lines.map(line => {
        const [status, file] = line.split('\t');
        return { status, file };
      })
    };
  }

  /**
   * Analyze changes in generated code specifically
   */
  async analyzeGeneratedChanges() {
    try {
      const generatedDir = this.config.generatedDir;
      
      // Check if generated directory exists
      try {
        await fs.access(generatedDir);
      } catch (err) {
        return { error: 'Generated directory not found' };
      }

      const analysis = {
        apiFiles: [],
        modelFiles: [],
        configFiles: [],
        newEndpoints: [],
        removedEndpoints: [],
        modifiedEndpoints: []
      };

      // Analyze API files
      const apiDir = path.join(generatedDir, 'apis');
      try {
        const apiFiles = await fs.readdir(apiDir);
        analysis.apiFiles = apiFiles.filter(f => f.endsWith('.ts'));
        
        // For each API file, try to extract endpoint information
        for (const file of analysis.apiFiles) {
          const filePath = path.join(apiDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const endpoints = this.extractEndpoints(content);
          analysis.newEndpoints.push(...endpoints);
        }
      } catch (err) {
        console.warn('⚠️  Could not analyze API files:', err.message);
      }

      // Analyze model files
      const modelDir = path.join(generatedDir, 'models');
      try {
        const modelFiles = await fs.readdir(modelDir);
        analysis.modelFiles = modelFiles.filter(f => f.endsWith('.ts'));
      } catch (err) {
        console.warn('⚠️  Could not analyze model files:', err.message);
      }

      return analysis;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Extract endpoint information from API file content
   */
  extractEndpoints(content) {
    const endpoints = [];
    
    // Look for async method definitions (simplified extraction)
    const methodRegex = /async\s+(\w+)\s*\([^)]*\):\s*Promise<[^>]+>/g;
    let match;
    
    while ((match = methodRegex.exec(content)) !== null) {
      endpoints.push({
        method: match[1],
        type: 'api-method'
      });
    }
    
    return endpoints;
  }

  /**
   * Analyze impact on wrapper clients
   */
  async analyzeWrapperImpact() {
    try {
      const clientDir = this.config.clientDir;
      
      // Check if client directory exists
      try {
        await fs.access(clientDir);
      } catch (err) {
        return { error: 'Client directory not found', affectedClients: [] };
      }

      const impact = {
        affectedClients: [],
        totalClients: 0,
        riskLevel: 'LOW'
      };

      // Find all client files
      const clientFiles = await fs.readdir(clientDir);
      const tsFiles = clientFiles.filter(f => f.endsWith('.ts') && !f.includes('.test.'));
      
      impact.totalClients = tsFiles.length;

      // Analyze each client file
      for (const file of tsFiles) {
        const filePath = path.join(clientDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        
        const clientAnalysis = await this.analyzeClientFile(filePath, content);
        if (clientAnalysis.affectedImports.length > 0) {
          impact.affectedClients.push(clientAnalysis);
        }
      }

      // Determine overall risk level
      if (impact.affectedClients.length > 0) {
        const highRiskClients = impact.affectedClients.filter(c => c.riskLevel === 'HIGH');
        if (highRiskClients.length > 0) {
          impact.riskLevel = 'HIGH';
        } else {
          impact.riskLevel = 'MEDIUM';
        }
      }

      return impact;
    } catch (error) {
      return { error: error.message, affectedClients: [] };
    }
  }

  /**
   * Analyze a specific client file for potential impacts
   */
  async analyzeClientFile(filePath, content) {
    const analysis = {
      file: filePath,
      affectedImports: [],
      imports: [],
      methods: [],
      riskLevel: 'LOW'
    };

    // Extract imports from generated code
    const importRegex = /import\s+{([^}]+)}\s+from\s+['"](\.\.\/generated[^'"]*)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[2];
      const importedTypes = match[1].split(',').map(t => t.trim());
      
      analysis.imports.push({
        path: importPath,
        types: importedTypes
      });
    }

    // Extract method signatures
    const methodRegex = /async\s+(\w+)\s*\([^)]*\):\s*Promise<([^>]+)>/g;
    while ((match = methodRegex.exec(content)) !== null) {
      analysis.methods.push({
        name: match[1],
        returnType: match[2]
      });
    }

    // Check if any imports might be affected by checking against git changes
    try {
      const gitChanges = await this.getGitChanges();
      const changedGeneratedFiles = gitChanges.generatedFiles || [];
      
      for (const imp of analysis.imports) {
        const isAffected = changedGeneratedFiles.some(change => 
          change.path.includes(imp.path.replace('../generated/', ''))
        );
        
        if (isAffected) {
          analysis.affectedImports.push(imp);
        }
      }

      // Assess risk based on number of affected imports
      if (analysis.affectedImports.length >= 5) {
        analysis.riskLevel = 'HIGH';
      } else if (analysis.affectedImports.length >= 2) {
        analysis.riskLevel = 'MEDIUM';
      }

    } catch (err) {
      console.warn(`⚠️  Could not check git changes for ${filePath}`);
    }

    return analysis;
  }

  /**
   * Assess overall risk level
   */
  assessRisk(analysis) {
    const factors = {
      totalFiles: analysis.gitChanges.totalFiles || 0,
      affectedClients: analysis.wrapperImpact.affectedClients?.length || 0,
      generatedChanges: analysis.generatedCodeChanges?.apiFiles?.length || 0
    };

    let score = 0;
    
    // File change impact
    if (factors.totalFiles > 20) score += 3;
    else if (factors.totalFiles > 10) score += 2;
    else if (factors.totalFiles > 5) score += 1;

    // Client impact
    if (factors.affectedClients > 3) score += 3;
    else if (factors.affectedClients > 1) score += 2;
    else if (factors.affectedClients > 0) score += 1;

    // Generated code changes
    if (factors.generatedChanges > 10) score += 2;
    else if (factors.generatedChanges > 5) score += 1;

    // Determine risk level
    if (score >= 6) return { level: 'HIGH', score, factors };
    if (score >= 3) return { level: 'MEDIUM', score, factors };
    return { level: 'LOW', score, factors };
  }

  /**
   * Save analysis to file
   */
  async saveAnalysis(analysis) {
    const filename = `change-analysis-${Date.now()}.json`;
    const filepath = path.join('./automation', filename);
    
    try {
      await fs.writeFile(filepath, JSON.stringify(analysis, null, 2));
      console.log(`💾 Analysis saved to: ${filepath}`);
      
      // Also save as latest
      await fs.writeFile('./automation/latest-analysis.json', JSON.stringify(analysis, null, 2));
      
    } catch (error) {
      console.warn('⚠️  Could not save analysis:', error.message);
    }
  }

  /**
   * Generate human-readable summary
   */
  generateSummary(analysis) {
    const summary = [];
    
    summary.push(`## 📊 SDK Update Analysis`);
    summary.push(`**Timestamp**: ${analysis.timestamp}`);
    summary.push(`**Risk Level**: ${analysis.riskAssessment?.level || 'UNKNOWN'}`);
    summary.push('');
    
    // Git changes summary
    const git = analysis.gitChanges;
    if (git && !git.error) {
      summary.push(`### 📁 File Changes`);
      summary.push(`- **Total files changed**: ${git.totalFiles}`);
      summary.push(`- **Generated files**: ${git.generatedFiles?.length || 0}`);
      summary.push(`- **Client files**: ${git.clientFiles?.length || 0}`);
      summary.push('');
    }
    
    // Wrapper impact
    const wrapper = analysis.wrapperImpact;
    if (wrapper && !wrapper.error) {
      summary.push(`### 🔧 Wrapper Client Impact`);
      summary.push(`- **Total clients**: ${wrapper.totalClients}`);
      summary.push(`- **Affected clients**: ${wrapper.affectedClients?.length || 0}`);
      summary.push(`- **Impact risk**: ${wrapper.riskLevel}`);
      
      if (wrapper.affectedClients && wrapper.affectedClients.length > 0) {
        summary.push('');
        summary.push('**Affected clients:**');
        wrapper.affectedClients.forEach(client => {
          summary.push(`- ${client.file} (${client.riskLevel} risk, ${client.affectedImports.length} imports affected)`);
        });
      }
      summary.push('');
    }
    
    return summary.join('\n');
  }
}