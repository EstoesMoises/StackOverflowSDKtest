#!/usr/bin/env node

import { PRAutomation } from './pr-automation.mjs';
import { ChangeAnalyzer } from './change-analyzer.mjs';
import { execSync } from 'child_process';
import fs from 'fs/promises';

/**
 * Standalone script to create a PR for the current branch
 */
async function main() {
  const args = process.argv.slice(2);
  
  try {
    // Get current branch
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    
    if (!currentBranch || currentBranch === 'main' || currentBranch === 'master') {
      console.error('❌ Not on a feature branch. Switch to your update branch first.');
      process.exit(1);
    }
    
    console.log(`🌿 Current branch: ${currentBranch}`);
    
    // Check if analysis exists
    let analysis = null;
    try {
      const analysisContent = await fs.readFile('./automation/latest-analysis.json', 'utf8');
      analysis = JSON.parse(analysisContent);
      console.log('📊 Found existing analysis');
    } catch (err) {
      console.log('🔍 No existing analysis found, generating new one...');
      const analyzer = new ChangeAnalyzer({
        generatedDir: './src/generated',
        clientDir: './src/client'
      });
      analysis = await analyzer.analyzeChanges();
    }
    
    // Create PR
    const pr = new PRAutomation({
      defaultBranch: 'main',
      prLabels: ['auto-generated', 'sdk-update'],
      githubToken: process.env.GITHUB_TOKEN
    });
    
    const result = await pr.createPullRequest(currentBranch, analysis);
    
    if (result.success) {
      console.log('✅ Pull request created successfully!');
      console.log(`🔗 URL: ${result.url}`);
      if (result.number) {
        console.log(`📝 PR Number: #${result.number}`);
      }
    } else {
      console.log('⚠️  PR creation failed, but manual instructions were provided');
    }
    
  } catch (error) {
    console.error('❌ PR creation failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}