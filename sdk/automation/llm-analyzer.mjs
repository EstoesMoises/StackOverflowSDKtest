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
  async analyzeChanges(diffData, wrapperContext, generationSummary) {
    try {
      console.log('🤖 Analyzing changes with Claude...');
      
      const response = await this.client.messages.create({
        model: config.anthropic.model,
        max_tokens: 8192,
        temperature: config.anthropic.temperature,
        tools: [{
          name: "provide_analysis",
          description: "Provide structured analysis of SDK changes with actionable wrapper update instructions",
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
              wrapperUpdateGuide: {
                type: "object",
                description: "Step-by-step instructions for updating wrapper files",
                properties: {
                  affectedFiles: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        file: { 
                          type: "string",
                          description: "Relative path from src/client/"
                        },
                        action: { 
                          type: "string",
                          enum: ["CREATE", "MODIFY", "DELETE", "REVIEW"],
                          description: "What needs to be done with this file"
                        },
                        priority: {
                          type: "string",
                          enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
                          description: "Update priority"
                        },
                        instructions: { 
                          type: "string",
                          description: "Clear, step-by-step instructions for what to change"
                        },
                        codeExample: { 
                          type: "string",
                          description: "Code snippet showing the pattern to follow (not the complete file)"
                        },
                        reasoning: {
                          type: "string",
                          description: "Why this change is needed"
                        }
                      },
                      required: ["file", "action", "priority", "instructions"]
                    }
                  },
                  newEndpointsToWrap: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        generatedPath: { 
                          type: "string",
                          description: "Path in generated SDK"
                        },
                        endpoint: { type: "string" },
                        method: { type: "string" },
                        suggestedWrapperFile: { 
                          type: "string",
                          description: "Which wrapper file should contain this"
                        },
                        suggestedMethodName: { type: "string" },
                        exampleImplementation: { 
                          type: "string",
                          description: "Example showing how to wrap this endpoint"
                        }
                      },
                      required: ["generatedPath", "endpoint", "method", "suggestedWrapperFile", "suggestedMethodName", "exampleImplementation"]
                    }
                  },
                  migrationSteps: {
                    type: "array",
                    items: { type: "string" },
                    description: "Ordered steps to safely migrate wrapper code"
                  },
                  compatibilityNotes: {
                    type: "array",
                    items: { type: "string" },
                    description: "Important notes about backwards compatibility"
                  }
                },
                required: ["affectedFiles", "newEndpointsToWrap", "migrationSteps"]
              },
              testingGuidance: {
                type: "array",
                items: { type: "string" },
                description: "Specific tests that should be run or created"
              }
            },
            required: ["summary", "prDescription", "riskAssessment", "impactAnalysis", "wrapperUpdateGuide", "testingGuidance"]
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
      
      // Extract tool call result
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

Analyze OpenAPI-generated TypeScript code changes and provide clear, actionable instructions for updating wrapper code in /src/client/.

Key responsibilities:
1. Identify breaking changes and compatibility issues
2. Provide step-by-step instructions for updating wrapper files
3. Give clear code examples showing patterns to follow (NOT complete files)
4. Create ready-to-use GitHub PR descriptions with proper markdown that includes ALL update instructions
5. Prioritize changes by criticality

IMPORTANT: The prDescription field must contain the COMPLETE update guide including:
- Summary and risk assessment
- Step-by-step migration instructions
- File-by-file update guidance with code examples **wrapped in ONE collapsible section**
- Testing checklist
- All information a developer needs to make the changes

The PR description should be comprehensive and self-contained - developers should not need any external files.

For wrapper update guidance:
- Specify which files need changes (CREATE/MODIFY/DELETE/REVIEW)
- Provide clear, numbered instructions for each file
- Include focused code examples showing only the relevant changes
- Explain WHY each change is needed
- Consider backwards compatibility

For code examples:
- Show only the relevant method/function/type that needs to change
- Include enough context to understand where it goes
- Add comments explaining the changes
- Follow the patterns from existing wrapper files
- Keep examples concise and focused

For PR descriptions:
- Use proper GitHub markdown with headers, emojis, checkboxes
- Make it comprehensive and self-contained
- Include ALL update instructions in the PR body
- **CRITICAL: Wrap the entire file-by-file update section in ONE <details> collapsible block**
- Include relevant technical details

**Required PR Description Format for File Updates:**
## 📝 Files to Update

<details>
<summary><strong>Click to expand file-by-file instructions (X files)</strong></summary>

### 🔴 ACTION: \`path/to/file.ts\`
**Priority:** LEVEL
**Why:** reason
**Instructions:**
1. Step one
2. Step two

**Example:**
\`\`\`typescript
// code example
\`\`\`

---

[Repeat for each file]

</details>

Output should be immediately actionable for a developer who will manually make the changes.

Use the provide_analysis tool to return your structured analysis.`;
}
  /**
   * Build analysis prompt
   */
  buildAnalysisPrompt(diffData, wrapperContext, generationSummary) {
    return `
# SDK Analysis Request

## Project Structure
Base wrapper directory: src/client/
Current wrapper files: ${Object.keys(wrapperContext).join(', ') || 'none'}

## Generation Summary
${JSON.stringify(generationSummary, null, 2)}

## Changes Overview
${this.summarizeChanges(diffData)}

## Current Wrapper Files (for reference)
${this.provideFullWrapperContext(wrapperContext)}

## Generated Code Diff (first 5000 chars)
${this.limitDiff(diffData.rawDiff, 5000)}

---

Analyze these changes and provide:
1. Clear instructions for updating each affected wrapper file
2. Code examples showing the pattern (not complete files)
3. Step-by-step migration guide
4. Testing recommendations

Focus on actionable instructions that a developer can follow manually.

Use the provide_analysis tool with your findings.`;
  }

  /**
   * Summarize changes
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
   * Provide wrapper context
   */
  provideFullWrapperContext(wrapperContext) {
    const files = Object.keys(wrapperContext);
    if (files.length === 0) return 'No wrapper files found - this may be a new wrapper implementation';
    
    const sortedFiles = files.sort((a, b) => {
      if (a.includes('index.ts')) return -1;
      if (b.includes('index.ts')) return 1;
      return a.localeCompare(b);
    });
    
    return sortedFiles.map(file => {
      const content = wrapperContext[file];
      const lineCount = content.split('\n').length;
      return `### File: ${file}
Location: src/client/${file}
Line count: ${lineCount} lines
\`\`\`typescript
${content}
\`\`\`
`;
    }).join('\n---\n\n');
  }

  /**
   * Limit diff size
   */
  limitDiff(diff, maxChars = 5000) {
    if (!diff) return 'No diff available';
    return diff.length > maxChars ? diff.slice(0, maxChars) + '\n\n...(truncated for brevity)' : diff;
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
      prDescription: `# 🤖 SDK Update - Manual Review Required

**Error:** Automated analysis failed. Please review changes manually.

## Changes Detected
${diffData.summary ? `- ${diffData.summary.filesChanged} files changed` : 'Unknown changes'}
${diffData.summary ? `- +${diffData.summary.insertions} / -${diffData.summary.deletions} lines` : ''}

## Next Steps
- [ ] Review generated SDK changes in the diff
- [ ] Update wrapper methods in src/client/
- [ ] Test all affected functionality
- [ ] Verify no breaking changes for consumers

## Generated Files Summary
\`\`\`json
${JSON.stringify(generationSummary, null, 2)}
\`\`\`

Please perform manual analysis and update wrapper code accordingly.`,
      riskAssessment: {
        level: "HIGH",
        reasoning: "Unable to perform automated analysis - manual review required for safety",
        breakingChanges: ["Unknown - requires manual analysis"]
      },
      impactAnalysis: {
        addedEndpoints: [],
        modifiedEndpoints: [],
        removedEndpoints: [],
        typeChanges: ["Unknown"],
        importChanges: ["Unknown"]
      },
      wrapperUpdateGuide: {
        affectedFiles: [{
          file: "ALL",
          action: "REVIEW",
          priority: "CRITICAL",
          instructions: "Manual analysis required. Review all wrapper files against generated SDK changes.",
          reasoning: "Automated analysis failed"
        }],
        newEndpointsToWrap: [],
        migrationSteps: [
          "Review the generated SDK diff manually",
          "Identify changed endpoints and types",
          "Update wrapper methods to match new SDK structure",
          "Test all functionality",
          "Update documentation"
        ],
        compatibilityNotes: ["Unable to assess compatibility - manual review required"]
      },
      testingGuidance: ["Comprehensive manual testing required for all wrapper functionality"],
      metadata: {
        analyzedAt: new Date().toISOString(),
        analysisMethod: 'fallback',
        requiresManualReview: true,
        error: 'LLM analysis failed'
      }
    };
  }
}