// diff-analyzer.mjs
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { config } from './config.mjs';

export class DiffAnalyzer {
  /**
   * Get git diff for generated files
   */
  async getGeneratedDiff() {
    try {
      console.log('📊 Analyzing generated code changes...');
      
      // Get git diff for the generated directory
      const diffOutput = execSync(
        `git diff --no-index --minimal ${config.generatedDir} ${config.generatedDir} || git diff HEAD -- ${config.generatedDir}`,
        { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 } // 10MB buffer
      ).trim();
      
      return {
        rawDiff: diffOutput,
        summary: this.parseDiffSummary(diffOutput),
        structuredDiff: this.parseStructuredDiff(diffOutput)
      };
      
    } catch (error) {
      // If git diff fails, try to analyze the changes differently
      console.warn('Git diff failed, falling back to file comparison');
      return await this.fallbackDiffAnalysis();
    }
  }
  
  /**
   * Fallback analysis when git diff isn't available
   */
  async fallbackDiffAnalysis() {
    return {
      rawDiff: 'Git diff unavailable - using file comparison',
      summary: { filesChanged: 0, insertions: 0, deletions: 0 },
      structuredDiff: { files: [] }
    };
  }
  
  /**
   * Parse diff summary (files changed, insertions, deletions)
   */
  parseDiffSummary(diffOutput) {
    const summary = {
      filesChanged: 0,
      insertions: 0,
      deletions: 0
    };
    
    // Look for summary line like: "X files changed, Y insertions(+), Z deletions(-)"
    const summaryMatch = diffOutput.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
    
    if (summaryMatch) {
      summary.filesChanged = parseInt(summaryMatch[1]) || 0;
      summary.insertions = parseInt(summaryMatch[2]) || 0;
      summary.deletions = parseInt(summaryMatch[3]) || 0;
    }
    
    return summary;
  }
  
  /**
   * Parse diff into structured format for easier LLM analysis
   */
  parseStructuredDiff(diffOutput) {
    const files = [];
    const lines = diffOutput.split('\n');
    let currentFile = null;
    let currentHunk = null;
    
    for (const line of lines) {
      // New file
      if (line.startsWith('diff --git')) {
        if (currentFile) files.push(currentFile);
        
        const match = line.match(/diff --git a\/(.+) b\/(.+)/);
        currentFile = {
          path: match ? match[2] : 'unknown',
          hunks: [],
          isNewFile: false,
          isDeletedFile: false
        };
        currentHunk = null;
      }
      
      // File status
      else if (line.startsWith('new file mode')) {
        if (currentFile) currentFile.isNewFile = true;
      }
      else if (line.startsWith('deleted file mode')) {
        if (currentFile) currentFile.isDeletedFile = true;
      }
      
      // Hunk header
      else if (line.startsWith('@@')) {
        if (currentFile) {
          currentHunk = {
            header: line,
            changes: []
          };
          currentFile.hunks.push(currentHunk);
        }
      }
      
      // Content changes
      else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
        const changeType = line.startsWith('+') ? 'addition' : line.startsWith('-') ? 'deletion' : 'context';
        currentHunk.changes.push({
          type: changeType,
          content: line.slice(1) // Remove the +/- prefix
        });
      }
    }
    
    // Don't forget the last file
    if (currentFile) files.push(currentFile);
    
    return { files };
  }
  
  /**
   * Read all wrapper files for context
   */
  async getWrapperContext() {
    try {
      console.log('📖 Reading wrapper code for context...');
      
      const wrapperFiles = {};
      
      const clientExists = await fs.access(config.clientDir).then(() => true).catch(() => false);
      if (!clientExists) {
        console.warn('Client directory not found:', config.clientDir);
        return wrapperFiles;
      }
      
      async function readDirectory(dir, basePath = '') {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;
          
          if (entry.isDirectory()) {
            await readDirectory(fullPath, relativePath);
          } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            try {
              const content = await fs.readFile(fullPath, 'utf8');
              
              // Only include files within size limit
              if (content.length <= config.maxFileSize) {
                wrapperFiles[relativePath] = content;
              } else {
                console.warn(`Skipping large file: ${relativePath} (${content.length} bytes)`);
                wrapperFiles[relativePath] = `// File too large for analysis (${content.length} bytes)\n// Please review manually`;
              }
            } catch (err) {
              console.warn(`Failed to read ${fullPath}:`, err.message);
            }
          }
        }
      }
      
      await readDirectory(config.clientDir);
      
      console.log(`📚 Read ${Object.keys(wrapperFiles).length} wrapper files`);
      return wrapperFiles;
      
    } catch (error) {
      console.warn('Failed to read wrapper context:', error.message);
      return {};
    }
  }
  
  /**
   * Extract key information from the diff for LLM analysis
   */
  extractDiffHighlights(structuredDiff) {
    const highlights = {
      newFiles: [],
      deletedFiles: [],
      modifiedFiles: [],
      apiChanges: [],
      typeChanges: []
    };
    
    for (const file of structuredDiff.files) {
      if (file.isNewFile) {
        highlights.newFiles.push(file.path);
      } else if (file.isDeletedFile) {
        highlights.deletedFiles.push(file.path);
      } else {
        highlights.modifiedFiles.push(file.path);
      }
      
      // Look for API-related changes
      for (const hunk of file.hunks || []) {
        for (const change of hunk.changes || []) {
          if (change.type === 'addition' || change.type === 'deletion') {
            const content = change.content.trim();
            
            // Detect potential API endpoint changes
            if (content.includes('endpoint') || content.includes('path') || content.match(/\/api\/|\/v\d+\//)) {
              highlights.apiChanges.push({
                file: file.path,
                type: change.type,
                content: content.slice(0, 100) // Truncate for brevity
              });
            }
            
            // Detect type changes
            if (content.includes('interface') || content.includes('type') || content.includes('export')) {
              highlights.typeChanges.push({
                file: file.path,
                type: change.type,
                content: content.slice(0, 100)
              });
            }
          }
        }
      }
    }
    
    return highlights;
  }
}