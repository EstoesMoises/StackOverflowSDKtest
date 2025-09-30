// llm-analyzer.mjs
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.mjs';

export class LLMAnalyzer {
  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey
    });
  }
  
  /**
   * Analyze changes and their impact on wrapper code
   */
// llm-analyzer.mjs
  async analyzeChanges(diffData, wrapperContext, generationSummary) {
    try {
      console.log('🤖 Analyzing changes with Claude...');
      
      const response = await this.client.messages.create({
        model: config.anthropic.model,
        max_tokens: 8192, // Increased for complete files
        temperature: config.anthropic.temperature,
        tools: [{
          name: "provide_analysis",
          description: "Provide structured analysis of SDK changes",
          input_schema: {
            type: "object",
            properties: {
              summary: { 
                type: "string",
                description: "What changed in the SDK" 
              },
              prDescription: { 
                type: "string",
                description: "Complete GitHub PR description with markdown" 
              },
              riskAssessment: {
                type: "object",
                properties: {
                  level: { 
                    type: "string",
                    enum: ["LOW", "MEDIUM", "HIGH", "BREAKING"]
                  },
                  reasoning: { type: "string" },
                  breakingChanges: { 
                    type: "array",
                    items: { type: "string" }
                  }
                },
                required: ["level", "reasoning", "breakingChanges"]
              },
              impactAnalysis: {
                type: "object",
                properties: {
                  addedEndpoints: { type: "array", items: { type: "string" } },
                  modifiedEndpoints: { type: "array", items: { type: "string" } },
                  removedEndpoints: { type: "array", items: { type: "string" } },
                  typeChanges: { type: "array", items: { type: "string" } },
                  importChanges: { type: "array", items: { type: "string" } }
                },
                required: ["addedEndpoints", "modifiedEndpoints", "removedEndpoints", "typeChanges", "importChanges"]
              },
              wrapperImpact: {
                type: "object",
                properties: {
                  affectedFiles: { type: "array", items: { type: "string" } },
                  requiredChanges: { type: "array", items: { type: "string" } },
                  suggestedCode: { type: "string" },
                  newWrapperMethods: { type: "array", items: { type: "string" } }
                },
                required: ["affectedFiles", "requiredChanges", "suggestedCode", "newWrapperMethods"]
              },
              testingGuidance: {
                type: "array",
                items: { type: "string" }
              },
              automatedChanges: {
                type: "object",
                properties: {
                  canAutomate: { type: "boolean" },
                  suggestedUpdates: {
                    type: "object",
                    additionalProperties: { type: "string" }
                  },
                  reasoning: { type: "string" }
                },
                required: ["canAutomate", "suggestedUpdates", "reasoning"]
              }
            },
            required: ["summary", "prDescription", "riskAssessment", "impactAnalysis", "wrapperImpact", "testingGuidance", "automatedChanges"]
          }
        }],
        tool_choice: { type: "tool", name: "provide_analysis" },
        messages: [
          {
            role: "user",
            content: this.buildAnalysisPrompt(diffData, wrapperContext, generationSummary)
          }
        ]
      });
      
      // Extract tool call result - no parsing needed!
      const toolUse = response.content.find(block => block.type === 'tool_use');
      if (!toolUse) {
        throw new Error('No tool use found in response');
      }
      
      const analysis = toolUse.input;
      return this.enhanceAnalysis(analysis, diffData, generationSummary);
      
    } catch (error) {
      console.warn('LLM analysis failed:', error.message);
      return this.createFallbackAnalysis(diffData, generationSummary);
    }
  }
  
  /**
   * System prompt
   */
  getSystemPrompt() {
    return `You are an expert TypeScript/JavaScript developer specializing in SDK wrapper analysis.

⚠️ CRITICAL RULES - NO PLACEHOLDERS ALLOWED:
1. NEVER use placeholders like "// rest of your code", "// ... existing code ...", "...", or "// rest of the file"
2. When providing file updates in automatedChanges.suggestedUpdates, you MUST include the ENTIRE file content
3. Every code block must be production-ready and executable as-is with NO omissions
4. If you cannot generate the complete file, do not include it in suggestedUpdates
5. All imports, all methods, all types, all existing code must be preserved and included

Analyze OpenAPI-generated TypeScript code changes and use the provide_analysis tool to return structured results.

Key responsibilities:
1. Identify breaking changes and compatibility issues
2. Generate complete, production-ready wrapper methods for new endpoints
3. Create ready-to-use GitHub PR descriptions with proper markdown
4. Provide actionable automated changes with COMPLETE file contents

For wrapper code generation:
- Write complete TypeScript methods with proper types, error handling, and JSDoc
- Follow existing patterns shown in the context
- Generate full implementations, not snippets

For PR descriptions:
- Use proper GitHub markdown with headers, emojis, checkboxes
- Make it copy-paste ready for GitHub
- Include relevant technical details

Use the provide_analysis tool to return your structured analysis.`;
}
  
  /**
   * Build analysis prompt - simplified data presentation
   */
buildAnalysisPrompt(diffData, wrapperContext, generationSummary) {
  return `
# SDK Analysis Request

## Project Structure
Base wrapper directory: src/client/
All wrapper files must use paths starting with "src/client/"

## Generation Context
${JSON.stringify(generationSummary, null, 2)}

## Changes Overview
${this.summarizeChanges(diffData)}

## Complete Current Wrapper Files
${this.provideFullWrapperContext(wrapperContext)}

## Raw Diff (first 5000 chars)
${this.limitDiff(diffData.rawDiff, 5000)}

---

Analyze these changes and use the provide_analysis tool with your findings.

Remember: 
- suggestedUpdates must contain COMPLETE file contents, no placeholders
- All file paths must start with "src/client/"
- Follow patterns from existing wrapper files shown above`;
}

  /**
   * Summarize changes - let LLM do the heavy lifting
   */
  summarizeChanges(diffData) {
    const parts = [];
    
    if (diffData.summary) {
      parts.push(`Files: ${diffData.summary.filesChanged}, +${diffData.summary.insertions}, -${diffData.summary.deletions}`);
    }
    
    if (diffData.structuredDiff?.files) {
      const files = diffData.structuredDiff.files;
      parts.push(`New: ${files.filter(f => f.isNewFile).length}, Modified: ${files.filter(f => !f.isNewFile && !f.isDeletedFile).length}, Deleted: ${files.filter(f => f.isDeletedFile).length}`);
    }
    
    return parts.join(' | ') || 'Changes detected';
  }

  /**
   * Summarize wrapper context
   */
  provideFullWrapperContext(wrapperContext) {
    const files = Object.keys(wrapperContext);
    if (files.length === 0) return 'No wrapper files found';
    
    const sortedFiles = files.sort((a, b) => {
      if (a.includes('index.ts')) return -1;
      if (b.includes('index.ts')) return 1;
      return a.localeCompare(b);
    });
    
    return sortedFiles.map(file => {
      const content = wrapperContext[file];
      const lineCount = content.split('\n').length;
      return `### File: ${file}
  Location: ${file}
  Line count: ${lineCount} lines
  \`\`\`typescript
  ${content}
  \`\`\`
  `;
    }).join('\n---\n\n');
  }

  /**
   * Limit diff size for prompt efficiency
   */
  limitDiff(diff, maxChars = 3000) {
    if (!diff) return 'No diff available';
    return diff.length > maxChars ? diff.slice(0, maxChars) + '\n...(truncated)' : diff;
  }
  
  /**
   * Enhance analysis with metadata
   */
  enhanceAnalysis(analysis, diffData, generationSummary) {
    return {
      ...analysis,
      metadata: {
        analyzedAt: new Date().toISOString(),
        llmModel: config.anthropic.model,
        diffSummary: diffData.summary,
        generationSummary: generationSummary,
        analysisMethod: 'llm'
      }
    };
  }
  
  /**
   * Fallback when LLM fails
   */
  createFallbackAnalysis(diffData, generationSummary) {
    return {
      summary: "LLM analysis failed - manual review required",
      prDescription: "# 🤖 SDK Update - Manual Review Required\n\n**Error:** Automated analysis failed. Please review changes manually.\n\n## Next Steps\n- [ ] Review generated SDK changes\n- [ ] Update wrapper methods\n- [ ] Test functionality\n- [ ] Verify no breaking changes",
      riskAssessment: {
        level: "HIGH",
        reasoning: "Unable to perform automated analysis",
        breakingChanges: ["Unknown - requires manual analysis"]
      },
      impactAnalysis: {
        addedEndpoints: [],
        modifiedEndpoints: [],
        removedEndpoints: [],
        typeChanges: ["Unknown"],
        importChanges: ["Unknown"]
      },
      wrapperImpact: {
        affectedFiles: ["Manual review required"],
        requiredChanges: ["Manual analysis needed"],
        suggestedCode: "// Manual analysis required",
        newWrapperMethods: []
      },
      testingGuidance: ["Comprehensive manual testing required"],
      automatedChanges: {
        canAutomate: false,
        suggestedUpdates: {},
        reasoning: "Analysis failed - cannot automate safely"
      },
      metadata: {
        analyzedAt: new Date().toISOString(),
        analysisMethod: 'fallback',
        requiresManualReview: true,
        error: 'LLM analysis failed'
      }
    };
  }
}