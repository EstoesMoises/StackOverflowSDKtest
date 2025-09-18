#!/usr/bin/env node

import { ChangeAnalyzer } from './change-analyzer.mjs';

/**
 * Standalone script to analyze changes without running the full update
 */
async function main() {
  const analyzer = new ChangeAnalyzer({
    generatedDir: './src/generated',
    clientDir: './src/client'
  });

  try {
    console.log('🔍 Analyzing current changes...');
    
    const analysis = await analyzer.analyzeChanges();
    const summary = analyzer.generateSummary(analysis);
    
    console.log('\n' + '='.repeat(60));
    console.log(summary);
    console.log('='.repeat(60));
    
    // Show detailed breakdown
    if (analysis.wrapperImpact?.affectedClients?.length > 0) {
      console.log('\n📋 Detailed Client Impact:');
      analysis.wrapperImpact.affectedClients.forEach((client, index) => {
        console.log(`\n${index + 1}. ${client.file} (${client.riskLevel} risk)`);
        console.log(`   Affected imports: ${client.affectedImports.length}`);
        client.affectedImports.forEach(imp => {
          console.log(`   - ${imp.path}: ${imp.types.join(', ')}`);
        });
        console.log(`   Total methods: ${client.methods.length}`);
      });
    }

    // Show recommendations
    console.log('\n💡 Recommendations:');
    if (analysis.riskAssessment?.level === 'HIGH') {
      console.log('- ⚠️  HIGH RISK: Thorough testing recommended');
      console.log('- 🧪 Test all affected wrapper clients');
      console.log('- 📖 Review breaking changes carefully');
    } else if (analysis.riskAssessment?.level === 'MEDIUM') {
      console.log('- ⚡ MEDIUM RISK: Test affected clients');
      console.log('- 🔍 Review generated code changes');
    } else {
      console.log('- ✅ LOW RISK: Standard testing should suffice');
    }
    
    console.log('- 🏃 Run your test suite');
    console.log('- 📝 Update documentation if needed');
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}