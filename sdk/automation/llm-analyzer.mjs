// enhanced-llm-analyzer.mjs
import OpenAI from 'openai';
import { config } from './config.mjs';

export class LLMAnalyzer {
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
   * Enhanced system prompt with strict validation requirements
   */
  getSystemPrompt() {
    return `You are an expert TypeScript/JavaScript developer specializing in SDK wrapper analysis and complete implementation.

Analyze OpenAPI-generated TypeScript code changes and provide a comprehensive analysis with COMPLETE implementation.

CRITICAL REQUIREMENTS - NEVER VIOLATE THESE:

1. **COMPLETE FILE CONTENTS ONLY**: When providing file updates in suggestedUpdates, you MUST provide the ENTIRE file content. NEVER use placeholders like "// ... (rest of existing code)", "// ... existing code", "// unchanged code", or any ellipsis (...) notation.

2. **VALID TYPESCRIPT SYNTAX**: All generated code must be syntactically valid TypeScript. No incomplete imports, no broken function definitions, no missing closing braces.

3. **EXACT PATTERN MATCHING**: Follow the existing code patterns EXACTLY. If existing clients use "Client" suffix, new ones must too. If imports are organized in a specific way, maintain that organization.

4. **INDEX.TS INTEGRATION VALIDATION**: 
   - New clients MUST have proper import statements added at the top with other client imports
   - New clients MUST have properties added to StackOverflowSDK class (public readonly)
   - New clients MUST be initialized in the constructor with this.config
   - New clients MUST be added to TeamContext class if applicable
   - New clients MUST be added to forTeam() method initialization
   - New clients MUST have re-export statements at the bottom

5. **NO PARTIAL UPDATES**: Do not provide diff-style updates or partial code snippets. Provide complete file contents that can replace the existing file entirely.

Key responsibilities:
1. Identify breaking changes and compatibility issues
2. Generate complete, production-ready wrapper methods for new endpoints
3. Generate complete index.ts updates that properly integrate new clients
4. Follow existing naming patterns and SDK structure exactly
5. Create ready-to-use GitHub PR descriptions with proper markdown
6. Provide actionable automated changes with complete file contents

For wrapper code generation:
- Write complete TypeScript methods with proper types, error handling, and JSDoc
- Follow existing patterns shown in the context exactly
- Generate full implementations, not snippets
- Use consistent naming: if existing clients are named "answers.ts" or "articles.ts", new ones should follow the same pattern

For index.ts integration (CRITICAL):
- Provide the COMPLETE index.ts file content with all existing code plus new additions
- Add new client imports at the top with other client imports
- Add new client properties to StackOverflowSDK class (public readonly)
- Initialize new clients in constructor with this.config
- Add new clients to TeamContext class if applicable
- Add new client to forTeam() method initialization
- Add proper re-exports at the bottom
- Follow the EXACT pattern of existing clients

VALIDATION CHECKLIST FOR EVERY RESPONSE:
✅ Complete file contents provided (no ellipsis or placeholders)
✅ Valid TypeScript syntax throughout
✅ New imports properly added and formatted
✅ Class properties correctly declared
✅ Constructor initialization included
✅ TeamContext updated if needed
✅ Re-exports added at bottom
✅ Consistent naming with existing patterns

Always respond with valid JSON only. Handle all formatting within the JSON values.
Generate COMPLETE file contents, not partial updates or diffs.`;
  }
  
  /**
   * Enhanced analysis prompt with strict validation requirements
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
${this.limitContent(indexContent, 4000)}
\`\`\`

## Current Wrapper Structure
${this.summarizeWrappers(wrapperContext)}

## Raw Diff Sample
${this.limitDiff(diffData.rawDiff, 2000)}

---

## CRITICAL VALIDATION REQUIREMENTS:

⚠️  **NEVER USE ELLIPSIS OR PLACEHOLDERS** ⚠️
- Do NOT use "// ... (rest of existing code)"
- Do NOT use "// unchanged code"
- Do NOT use "..." or any placeholder notation
- Provide COMPLETE file contents that are syntactically valid

⚠️  **COMPLETE INDEX.TS INTEGRATION** ⚠️
Any new clients MUST be properly integrated into index.ts with:
- Import statement with other client imports
- Property declaration in StackOverflowSDK class
- Initialization in constructor
- Addition to TeamContext class
- Re-export statement
- COMPLETE file content (not partial)

⚠️  **NAMING CONSISTENCY** ⚠️
Follow existing naming patterns exactly (e.g., if existing clients are "AnswerClient", new ones should be "XxxxxClient")

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
      "index.ts": "COMPLETE updated index.ts file content with new client integration - NO ELLIPSIS OR PLACEHOLDERS",
      "src/clients/newClient.ts": "Complete new client wrapper file - FULL IMPLEMENTATION",
      "otherFile.ts": "Complete updated file content - ENTIRE FILE"
    },
    "reasoning": "Automation rationale"
  },
  "implementationDetails": {
    "newClientNames": ["Exact names of new clients to create"],
    "integrationSteps": ["Step-by-step integration process"],
    "namingConventions": "Naming pattern to follow",
    "exampleUsage": "Complete example of how to use new functionality"
  },
  "validationChecklist": {
    "completeFileContents": true|false,
    "validTypeScriptSyntax": true|false,
    "properImports": true|false,
    "classPropertiesAdded": true|false,
    "constructorUpdated": true|false,
    "teamContextUpdated": true|false,
    "reExportsAdded": true|false,
    "consistentNaming": true|false
  }
}

REMEMBER: 
- Generate COMPLETE file contents in suggestedUpdates
- NO ellipsis (...) or placeholders allowed
- Follow existing patterns exactly
- Validate syntax before responding`;
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
      const preview = this.limitContent(content, 800);
      return `${file}:\n${preview}${content.length > preview.length ? '\n...(truncated for analysis)' : ''}`;
    }).join('\n\n---\n\n');
  }

  /**
   * Limit content size for prompt efficiency
   */
  limitContent(content, maxChars = 1000) {
    if (!content) return 'No content available';
    return content.length > maxChars ? content.slice(0, maxChars) + '\n...(truncated for analysis)' : content;
  }

  /**
   * Limit diff size for prompt efficiency
   */
  limitDiff(diff, maxChars = 2000) {
    if (!diff) return 'No diff available';
    return diff.length > maxChars ? diff.slice(0, maxChars) + '\n...(truncated for analysis)' : diff;
  }
  
  /**
   * Enhanced analysis validation with syntax checking
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
    
    // Validate generated code doesn't contain placeholders
    const suggestedUpdates = analysis.automatedChanges?.suggestedUpdates || {};
    const validationErrors = [];
    
    for (const [fileName, content] of Object.entries(suggestedUpdates)) {
      if (typeof content === 'string') {
        // Check for placeholder patterns
        const placeholderPatterns = [
          /\/\/\s*\.\.\.\s*(\(.*\))?/gi, // // ... or // ... (rest of code)
          /\/\/\s*existing\s+code/gi,
          /\/\/\s*unchanged/gi,
          /\/\/\s*rest\s+of/gi,
          /\/\*\s*\.\.\.\s*\*\//gi,
          /\.\.\./g // any ellipsis
        ];
        
        for (const pattern of placeholderPatterns) {
          if (pattern.test(content)) {
            validationErrors.push(`${fileName} contains placeholder patterns - this will break the code`);
            break;
          }
        }
        
        // Basic syntax validation for TypeScript files
        if (fileName.endsWith('.ts') || fileName.endsWith('.js')) {
          const lines = content.split('\n');
          let braceCount = 0;
          let hasValidImports = true;
          
          for (const line of lines) {
            braceCount += (line.match(/{/g) || []).length;
            braceCount -= (line.match(/}/g) || []).length;
            
            // Check for incomplete imports
            if (line.trim().startsWith('import') && !line.includes(';') && !line.includes('from')) {
              hasValidImports = false;
            }
          }
          
          if (braceCount !== 0) {
            validationErrors.push(`${fileName} has unmatched braces`);
          }
          
          if (!hasValidImports) {
            validationErrors.push(`${fileName} has incomplete import statements`);
          }
        }
      }
    }
    
    if (validationErrors.length > 0) {
      analysis.validationErrors = validationErrors;
      analysis.canAutomate = false;
      analysis.automatedChanges.canAutomate = false;
      analysis.automatedChanges.reasoning = `Validation failed: ${validationErrors.join(', ')}`;
    }
    
    return {
      ...analysis,
      metadata: {
        analyzedAt: new Date().toISOString(),
        llmModel: config.openai.model,
        diffSummary: diffData.summary,
        generationSummary: generationSummary,
        analysisMethod: 'enhanced-llm-with-validation',
        integrationValidated: true,
        syntaxValidated: validationErrors.length === 0
      }
    };
  }
  
  /**
   * Enhanced fallback with strict validation requirements
   */
  createFallbackAnalysis(diffData, generationSummary) {
    return {
      summary: "Enhanced LLM analysis failed - manual review required for complete integration",
      prDescription: `# 🤖 SDK Update - Manual Review Required

**Error:** Automated analysis failed. Please review changes manually and ensure complete file integration.

## Critical Tasks
- [ ] Review generated SDK changes
- [ ] **Update index.ts with complete new client integration (NO PLACEHOLDERS)**
- [ ] Create wrapper methods following existing patterns exactly
- [ ] Update TeamContext if applicable
- [ ] Test functionality thoroughly
- [ ] Verify no breaking changes
- [ ] Ensure all code is syntactically valid

## Integration Checklist
- [ ] Import new clients in index.ts with proper syntax
- [ ] Add properties to StackOverflowSDK class
- [ ] Initialize in constructor with this.config
- [ ] Add to TeamContext class
- [ ] Add re-exports at bottom
- [ ] **CRITICAL**: Provide complete file contents, never use ellipsis or placeholders

## Validation Requirements
- [ ] All TypeScript files have valid syntax
- [ ] No incomplete imports or function definitions
- [ ] No placeholder comments like "// ... existing code"
- [ ] Proper brace matching and semicolons`,
      riskAssessment: {
        level: "HIGH",
        reasoning: "Unable to perform automated analysis - complete integration required with strict validation",
        breakingChanges: ["Unknown - requires manual analysis including complete index.ts integration"]
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
        requiredChanges: ["Manual analysis needed", "Complete index.ts integration with full file contents"],
        newWrapperMethods: [],
        indexIntegrationRequired: true
      },
      testingGuidance: ["Comprehensive manual testing required", "Test new client integration", "Validate TypeScript syntax"],
      automatedChanges: {
        canAutomate: false,
        suggestedUpdates: {},
        reasoning: "Analysis failed - cannot automate safely. Must provide complete file contents without placeholders."
      },
      implementationDetails: {
        newClientNames: [],
        integrationSteps: ["Manual analysis required", "Generate complete file contents", "No ellipsis or placeholders allowed"],
        namingConventions: "Follow existing Client suffix pattern exactly",
        exampleUsage: "// Complete implementation required - no partial code allowed"
      },
      validationChecklist: {
        completeFileContents: false,
        validTypeScriptSyntax: false,
        properImports: false,
        classPropertiesAdded: false,
        constructorUpdated: false,
        teamContextUpdated: false,
        reExportsAdded: false,
        consistentNaming: false
      },
      metadata: {
        analyzedAt: new Date().toISOString(),
        analysisMethod: 'enhanced-fallback-with-validation',
        requiresManualReview: true,
        error: 'Enhanced LLM analysis failed',
        criticalTasks: ['Complete index.ts integration', 'Full client wrapper creation', 'Strict syntax validation']
      }
    };
  }
  
  /**
   * Comprehensive validation with syntax checking
   */
  validateIntegration(analysis) {
    const warnings = [];
    const errors = [];
    
    // Check if new clients are properly integrated
    if (analysis.impactAnalysis?.newClients?.length > 0) {
      const indexUpdate = analysis.automatedChanges?.suggestedUpdates?.['index.ts'];
      if (!indexUpdate) {
        errors.push('Missing index.ts integration for new clients');
      } else {
        // Validate no placeholders
        const placeholderPatterns = [
          /\/\/\s*\.\.\./gi,
          /\/\/\s*existing\s+code/gi,
          /\/\/\s*rest\s+of/gi
        ];
        
        for (const pattern of placeholderPatterns) {
          if (pattern.test(indexUpdate)) {
            errors.push('index.ts contains placeholder patterns that will break the code');
            break;
          }
        }
        
        // Validate client integration
        const hasImports = analysis.impactAnalysis.newClients.some(client => 
          indexUpdate.includes(`import { ${client} }`) || indexUpdate.includes(`import {${client}}`)
        );
        const hasProperties = analysis.impactAnalysis.newClients.some(client => {
          const propName = client.toLowerCase().replace('client', '');
          return indexUpdate.includes(`public readonly ${propName}:`);
        });
        
        if (!hasImports) warnings.push('Missing client imports in index.ts');
        if (!hasProperties) warnings.push('Missing client properties in StackOverflowSDK class');
      }
    }
    
    if (warnings.length > 0) {
      analysis.integrationWarnings = warnings;
    }
    
    if (errors.length > 0) {
      analysis.integrationErrors = errors;
      analysis.automatedChanges.canAutomate = false;
    }
    
    return analysis;
  }
}