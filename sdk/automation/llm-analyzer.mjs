// enhanced-llm-analyzer.mjs
import OpenAI from 'openai';
import { config } from './config.mjs';

export class EnhancedLLMAnalyzer {
  constructor() {
    this.client = new OpenAI({
      apiKey: config.openai.apiKey
    });
  }
  
  /**
   * Analyze changes and their impact on wrapper code with complete implementation
   */
  async analyzeChanges(diffData, wrapperContext, generationSummary) {
    try {
      console.log('🤖 Analyzing changes with enhanced LLM...');
      
      const response = await this.client.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: "system",
            content: this.getSystemPrompt()
          },
          {
            role: "user", 
            content: this.buildAnalysisPrompt(diffData, wrapperContext, generationSummary)
          }
        ],
        temperature: config.openai.temperature,
        max_tokens: config.openai.maxTokens,
        response_format: { type: "json_object" }
      });
      
      const analysis = JSON.parse(response.choices[0].message.content);
      return this.enhanceAnalysis(analysis, diffData, generationSummary);
      
    } catch (error) {
      console.warn('LLM analysis failed:', error.message);
      return this.createFallbackAnalysis(diffData, generationSummary);
    }
  }
  
  /**
   * Enhanced system prompt with complete implementation requirements
   */
  getSystemPrompt() {
    return `You are an expert TypeScript/JavaScript developer specializing in SDK wrapper analysis and complete implementation.

Analyze OpenAPI-generated TypeScript code changes and provide a comprehensive analysis with COMPLETE implementation.

Key responsibilities:
1. Identify breaking changes and compatibility issues
2. Generate complete, production-ready wrapper methods for new endpoints
3. **CRITICALLY IMPORTANT**: Generate complete index.ts updates that properly integrate new clients
4. Follow existing naming patterns and SDK structure exactly
5. Create ready-to-use GitHub PR descriptions with proper markdown
6. Provide actionable automated changes

For wrapper code generation:
- Write complete TypeScript methods with proper types, error handling, and JSDoc
- Follow existing patterns shown in the context exactly
- Generate full implementations, not snippets
- Use consistent naming: if existing clients are named "answers.ts" or "articles.ts", new ones should be "xxxxx.ts" depending on the endpoint

For index.ts integration (CRITICAL):
- Add new client imports at the top with other client imports
- Add new client properties to StackOverflowSDK class (public readonly)
- Initialize new clients in constructor with this.config
- Add new clients to TeamContext class if applicable
- Add new client to forTeam() method initialization
- Add proper re-exports at the bottom
- Follow the EXACT pattern of existing clients

For PR descriptions:
- Use proper GitHub markdown with headers, emojis, checkboxes
- Make it copy-paste ready for GitHub
- Include relevant technical details

Always respond with valid JSON only. Handle all formatting within the JSON values.
Generate COMPLETE file contents, not partial updates.`;
  }
  
  /**
   * Enhanced analysis prompt with index.ts integration requirements
   */
  buildAnalysisPrompt(diffData, wrapperContext, generationSummary) {
    const indexContent = wrapperContext['index.ts'] || wrapperContext['src/index.ts'] || '';
    
    return `
# Enhanced SDK Analysis Request

## Generation Context
${JSON.stringify(generationSummary, null, 2)}

## Changes Overview
${this.summarizeChanges(diffData)}

## Current Index.ts Structure (CRITICAL FOR INTEGRATION)
\`\`\`typescript
${this.limitContent(indexContent, 2000)}
\`\`\`

## Current Wrapper Structure
${this.summarizeWrappers(wrapperContext)}

## Raw Diff Sample
${this.limitDiff(diffData.rawDiff, 2000)}

---

## CRITICAL REQUIREMENTS:

1. **Complete Index.ts Integration**: Any new clients MUST be properly integrated into index.ts following the existing pattern:
   - Import statement with other client imports
   - Property declaration in StackOverflowSDK class
   - Initialization in constructor
   - Addition to TeamContext class
   - Re-export statement

2. **Naming Consistency**: Follow existing naming patterns exactly (e.g., if existing clients are "AnswerClient", new ones should be "XxxxxClient")

3. **Complete Implementation**: Generate full file contents, not snippets

Please analyze these changes and respond with JSON in this structure:

{
  "summary": "What changed in the SDK. Be specific about new endpoints and clients.",
  "prDescription": "Complete GitHub PR description with proper markdown formatting, emojis, headers, and checkboxes. Make it ready to paste into GitHub.",
  "riskAssessment": {
    "level": "LOW|MEDIUM|HIGH|BREAKING",
    "reasoning": "Why this risk level",
    "breakingChanges": ["List breaking changes"]
  },
  "impactAnalysis": {
    "addedEndpoints": ["New endpoints"],
    "modifiedEndpoints": ["Modified endpoints"], 
    "removedEndpoints": ["Removed endpoints"],
    "newClients": ["New client classes detected"],
    "typeChanges": ["Type changes"],
    "importChanges": ["Import changes"]
  },
  "wrapperImpact": {
    "affectedFiles": ["Files needing updates including index.ts"],
    "requiredChanges": ["Required changes including index.ts integration"],
    "newWrapperMethods": ["New wrapper methods to create"],
    "indexIntegrationRequired": true|false
  },
  "testingGuidance": ["Testing recommendations"],
  "automatedChanges": {
    "canAutomate": true|false,
    "suggestedUpdates": {
      "index.ts": "COMPLETE updated index.ts file content with new client integration",
      "src/clients/newClient.ts": "Complete new client wrapper file",
      "otherFile.ts": "Complete updated file content"
    },
    "reasoning": "Automation rationale"
  },
  "implementationDetails": {
    "newClientNames": ["Exact names of new clients to create"],
    "integrationSteps": ["Step-by-step integration process"],
    "namingConventions": "Naming pattern to follow",
    "exampleUsage": "Complete example of how to use new functionality"
  }
}

REMEMBER: Generate COMPLETE file contents in suggestedUpdates, especially for index.ts. Follow existing patterns exactly.`;
  }

  /**
   * Summarize changes with focus on new clients
   */
  summarizeChanges(diffData) {
    const parts = [];
    
    if (diffData.summary) {
      parts.push(`Files: ${diffData.summary.filesChanged}, +${diffData.summary.insertions}, -${diffData.summary.deletions}`);
    }
    
    if (diffData.structuredDiff?.files) {
      const files = diffData.structuredDiff.files;
      const newFiles = files.filter(f => f.isNewFile);
      const apiFiles = newFiles.filter(f => f.fileName.includes('Api') || f.fileName.includes('api'));
      
      parts.push(`New: ${newFiles.length}, Modified: ${files.filter(f => !f.isNewFile && !f.isDeletedFile).length}, Deleted: ${files.filter(f => f.isDeletedFile).length}`);
      
      if (apiFiles.length > 0) {
        parts.push(`New APIs: ${apiFiles.map(f => f.fileName).join(', ')}`);
      }
    }
    
    return parts.join(' | ') || 'Changes detected';
  }

  /**
   * Enhanced wrapper summarization
   */
  summarizeWrappers(wrapperContext) {
    const files = Object.keys(wrapperContext);
    if (files.length === 0) return 'No wrapper files found';
    
    // Prioritize index.ts for context
    const priorityFiles = ['index.ts', 'src/index.ts'];
    const otherFiles = files.filter(f => !priorityFiles.includes(f));
    const orderedFiles = [...priorityFiles.filter(f => files.includes(f)), ...otherFiles.slice(0, 2)];
    
    return orderedFiles.map(file => {
      const content = wrapperContext[file];
      const preview = this.limitContent(content, 500);
      return `${file}:\n${preview}${content.length > preview.length ? '\n...(truncated)' : ''}`;
    }).join('\n\n---\n\n');
  }

  /**
   * Limit content size for prompt efficiency
   */
  limitContent(content, maxChars = 1000) {
    if (!content) return 'No content available';
    return content.length > maxChars ? content.slice(0, maxChars) + '\n...(truncated)' : content;
  }

  /**
   * Limit diff size for prompt efficiency
   */
  limitDiff(diff, maxChars = 2000) {
    if (!diff) return 'No diff available';
    return diff.length > maxChars ? diff.slice(0, maxChars) + '\n...(truncated)' : diff;
  }
  
  /**
   * Enhance analysis with metadata and validation
   */
  enhanceAnalysis(analysis, diffData, generationSummary) {
    // Validate that index.ts integration is included if new clients are detected
    if (analysis.impactAnalysis?.newClients?.length > 0) {
      if (!analysis.automatedChanges?.suggestedUpdates?.['index.ts']) {
        console.warn('⚠️  New clients detected but no index.ts integration provided');
        analysis.warnings = analysis.warnings || [];
        analysis.warnings.push('New clients detected but index.ts integration missing');
      }
    }
    
    return {
      ...analysis,
      metadata: {
        analyzedAt: new Date().toISOString(),
        llmModel: config.openai.model,
        diffSummary: diffData.summary,
        generationSummary: generationSummary,
        analysisMethod: 'enhanced-llm',
        integrationValidated: true
      }
    };
  }
  
  /**
   * Enhanced fallback with index.ts awareness
   */
  createFallbackAnalysis(diffData, generationSummary) {
    return {
      summary: "Enhanced LLM analysis failed - manual review required for complete integration",
      prDescription: "# 🤖 SDK Update - Manual Review Required\n\n**Error:** Automated analysis failed. Please review changes manually.\n\n## Critical Tasks\n- [ ] Review generated SDK changes\n- [ ] **Update index.ts with new client integration**\n- [ ] Create wrapper methods following existing patterns\n- [ ] Update TeamContext if applicable\n- [ ] Test functionality\n- [ ] Verify no breaking changes\n\n## Integration Checklist\n- [ ] Import new clients in index.ts\n- [ ] Add properties to StackOverflowSDK class\n- [ ] Initialize in constructor\n- [ ] Add to TeamContext class\n- [ ] Add re-exports",
      riskAssessment: {
        level: "HIGH",
        reasoning: "Unable to perform automated analysis - complete integration required",
        breakingChanges: ["Unknown - requires manual analysis including index.ts integration"]
      },
      impactAnalysis: {
        addedEndpoints: [],
        modifiedEndpoints: [],
        removedEndpoints: [],
        newClients: ["Unknown - manual detection required"],
        typeChanges: ["Unknown"],
        importChanges: ["Unknown"]
      },
      wrapperImpact: {
        affectedFiles: ["index.ts", "Manual review required"],
        requiredChanges: ["Manual analysis needed", "Complete index.ts integration"],
        newWrapperMethods: [],
        indexIntegrationRequired: true
      },
      testingGuidance: ["Comprehensive manual testing required", "Test new client integration"],
      automatedChanges: {
        canAutomate: false,
        suggestedUpdates: {},
        reasoning: "Analysis failed - cannot automate safely, especially index.ts integration"
      },
      implementationDetails: {
        newClientNames: [],
        integrationSteps: ["Manual analysis required"],
        namingConventions: "Follow existing Client suffix pattern",
        exampleUsage: "// Manual implementation required"
      },
      metadata: {
        analyzedAt: new Date().toISOString(),
        analysisMethod: 'enhanced-fallback',
        requiresManualReview: true,
        error: 'Enhanced LLM analysis failed',
        criticalTasks: ['index.ts integration', 'client wrapper creation']
      }
    };
  }
  
  /**
   * Validate integration completeness
   */
  validateIntegration(analysis) {
    const warnings = [];
    
    // Check if new clients are properly integrated
    if (analysis.impactAnalysis?.newClients?.length > 0) {
      const indexUpdate = analysis.automatedChanges?.suggestedUpdates?.['index.ts'];
      if (!indexUpdate) {
        warnings.push('Missing index.ts integration for new clients');
      } else {
        // Basic validation of index.ts content
        const hasImports = analysis.impactAnalysis.newClients.some(client => 
          indexUpdate.includes(`import { ${client} }`)
        );
        const hasProperties = analysis.impactAnalysis.newClients.some(client => 
          indexUpdate.includes(`public readonly ${client.toLowerCase().replace('client', '')}`)
        );
        
        if (!hasImports) warnings.push('Missing client imports in index.ts');
        if (!hasProperties) warnings.push('Missing client properties in StackOverflowSDK class');
      }
    }
    
    if (warnings.length > 0) {
      analysis.integrationWarnings = warnings;
    }
    
    return analysis;
  }
}