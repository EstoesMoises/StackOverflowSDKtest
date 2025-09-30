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
        max_tokens: config.anthropic.maxTokens,
        temperature: config.anthropic.temperature,
        system: this.getSystemPrompt(),
        messages: [
          {
            role: "user",
            content: this.buildAnalysisPrompt(diffData, wrapperContext, generationSummary)
          }
        ]
      });
      
      // Extract JSON from Claude's response
      const textContent = response.content[0].text;
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('Could not extract JSON from Claude response');
      }
      
      const analysis = JSON.parse(jsonMatch[0]);
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
2. When providing file updates in automatedChanges.completeFiles, you MUST include the ENTIRE file content
3. Every code block must be production-ready and executable as-is with NO omissions
4. If you cannot generate the complete file, do not include it in completeFiles
5. All imports, all methods, all types, all existing code must be preserved and included

Analyze OpenAPI-generated TypeScript code changes and provide a comprehensive analysis as JSON.

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

Always respond with valid JSON only. Handle all formatting within the JSON values.`;
}
  
  /**
   * Build analysis prompt - simplified data presentation
   */
  buildAnalysisPrompt(diffData, wrapperContext, generationSummary) {
    return `
# SDK Analysis Request

## Project Structure
Base wrapper directory: src/client/
Wrapper files should be placed in: src/client/

Example file paths (use these exact patterns):
- src/client/users.ts
- src/client/questions.ts  
- src/client/answers.ts
- src/client/index.ts
etc.

⚠️ CRITICAL: All file paths in completeFiles must start with "src/client/"

## Generation Context
${JSON.stringify(generationSummary, null, 2)}

## Changes Overview
${this.summarizeChanges(diffData)}

## Current Wrapper Structure
${this.provideFullWrapperContext(wrapperContext)}

## Raw Diff Sample
${this.limitDiff(diffData.rawDiff, 3000)}

---

⚠️ CRITICAL INSTRUCTIONS FOR FILE GENERATION:

File Path Rules:
- ALL file paths in completeFiles MUST start with "src/client/"
- New wrapper files go in src/client/ (e.g., src/client/newEndpoint.ts)
- Keep the same naming pattern as existing files shown above
- Use lowercase filenames matching the resource name (users.ts, questions.ts, etc.)

When generating files in automatedChanges.completeFiles:
- Include the ENTIRE file from start to finish
- NO placeholders, NO "rest of your code", NO ellipsis (...)
- Include ALL imports at the top
- Include ALL existing methods and classes
- Include ALL type definitions
- Include the complete file structure

If you need to modify an existing file:
1. Take the COMPLETE original file content from the "COMPLETE Current Wrapper Files" section above
2. Apply your modifications (add new methods, update imports, etc.)
3. Return the ENTIRE modified file with the correct path (src/client/filename.ts)

If you need to create a new file:
1. Follow the patterns from existing wrapper files
2. Use the correct path: src/client/filename.ts
3. Include complete implementation

---

Please analyze these changes and respond with JSON in this structure:

{
  "summary": "What changed in the SDK. Be specific.",
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
    "typeChanges": ["Type changes"],
    "importChanges": ["Import changes"]
  },
  "wrapperImpact": {
    "affectedFiles": ["Files needing updates"],
    "requiredChanges": ["Required changes"],
    "suggestedCode": "Complete TypeScript wrapper methods with full implementations, types, error handling, and JSDoc",
    "newWrapperMethods": ["New methods to create"]
  },
  "testingGuidance": ["Testing recommendations"],
  "automatedChanges": {
    "canAutomate": true,
    "suggestedUpdates": {
      "filename.ts": "Complete updated file content"
    },
    "reasoning": "Automation rationale"
  }
}

Focus on completeness and actionability. Generate full working code, not placeholders.`;
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