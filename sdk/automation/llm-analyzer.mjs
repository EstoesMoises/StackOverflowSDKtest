// llm-analyzer.mjs
import OpenAI from 'openai';
import { config } from './config.mjs';

export class LLMAnalyzer {
  constructor() {
    this.client = new OpenAI({
      apiKey: config.openai.apiKey
    });
  }
  
  /**
   * Analyze changes and their impact on wrapper code
   */
  async analyzeChanges(diffData, wrapperContext, generationSummary) {
    let response;
    try {
      console.log('🤖 Analyzing changes with LLM...');
      
      const prompt = this.buildAnalysisPrompt(diffData, wrapperContext, generationSummary);
      
      response = await this.client.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: "system",
            content: this.getSystemPrompt()
          },
          {
            role: "user", 
            content: prompt
          }
        ],
        temperature: config.openai.temperature,
        max_tokens: config.openai.maxTokens
      });
      
      // Add better error handling and response cleaning
      const rawContent = response.choices[0].message.content.trim();
      console.log('🔍 Raw LLM response length:', rawContent.length);
      
      // Clean the response if it contains markdown
      const cleanContent = this.cleanJsonResponse(rawContent);
      
      const analysis = JSON.parse(cleanContent);
      return this.enhanceAnalysis(analysis, diffData, generationSummary);
      
    } catch (error) {
      console.warn('LLM analysis failed:', error.message);
      if (response?.choices?.[0]?.message?.content) {
        console.warn('Response content preview:', response.choices[0].message.content.slice(0, 200) + '...');
      }
      return this.createFallbackAnalysis(diffData, generationSummary);
    }
  }
  
  /**
   * Clean JSON response by removing markdown formatting if present
   */
  cleanJsonResponse(content) {
    // Remove markdown code blocks if present
    const jsonBlockMatch = content.match(/```json\s*\n?([\s\S]*?)\n?```/);
    if (jsonBlockMatch) {
      return jsonBlockMatch[1].trim();
    }
    
    // Remove any leading/trailing markdown backticks
    return content.replace(/^`+|`+$/g, '').trim();
  }
  
  /**
   * System prompt for the LLM
   */
  getSystemPrompt() {
    return `You are an expert TypeScript/JavaScript developer specializing in SDK wrapper analysis and automated code generation.

Your task is to analyze changes in OpenAPI-generated TypeScript code and:
1. Determine impact on custom wrapper layer
2. Generate COMPLETE working wrapper methods for new endpoints
3. Create a properly formatted GitHub PR description
4. Provide specific, actionable automated changes

When generating wrapper code:
- Write complete, production-ready TypeScript methods
- Include proper error handling, type annotations, and JSDoc comments
- DO NOT remove previous JSDocs comments, error handling, or type annotations if its not strictly necessary for compatiblity
- Follow the existing wrapper patterns shown in the context
- Generate full method implementations, not just snippets or comments

When generating PR descriptions:
- Create properly formatted GitHub markdown (not escaped \\n characters)
- Use actual line breaks and proper markdown formatting
- Make it ready to paste directly into GitHub

CRITICAL: Always respond with ONLY valid JSON. Do not use markdown formatting in the JSON response itself. However, within string values (like PR descriptions and code), use proper formatting.`;
  }
  
  /**
   * Build the analysis prompt
   */
  buildAnalysisPrompt(diffData, wrapperContext, generationSummary) {
    const diffHighlights = diffData.structuredDiff ? 
      this.formatDiffHighlights(diffData.structuredDiff) : 
      'Diff analysis unavailable';
    
    const wrapperSummary = this.formatWrapperSummary(wrapperContext);
    const existingWrapperPatterns = this.extractWrapperPatterns(wrapperContext);
    
    return `
## OpenAPI SDK Update Analysis

### Generation Summary
${JSON.stringify(generationSummary, null, 2)}

### Generated Code Changes
${this.formatDiffSummary(diffData)}

### Key Changes Detected
${diffHighlights}

### Current Wrapper Code Structure
${wrapperSummary}

### Existing Wrapper Patterns (for reference when generating new code)
${existingWrapperPatterns}

### Sample of Raw Diff (truncated)
${this.truncateDiff(diffData.rawDiff)}

## Analysis Requirements

Analyze these changes and provide a JSON response with this exact structure (return ONLY the JSON):

{
  "summary": "Brief description of what changed in the generated SDK",
  "prDescription": "Complete GitHub PR description with proper markdown formatting (use actual line breaks, not \\n). Include emojis, headers, checklists, and proper markdown formatting. Make it ready to paste directly into GitHub.",
  "riskAssessment": {
    "level": "LOW|MEDIUM|HIGH|BREAKING", 
    "reasoning": "Explanation of why this risk level was assigned",
    "breakingChanges": ["List of specific breaking changes found"]
  },
  "impactAnalysis": {
    "addedEndpoints": ["New API endpoints/methods that were added"],
    "modifiedEndpoints": ["Existing endpoints that changed signatures/behavior"],
    "removedEndpoints": ["Endpoints that were removed"],
    "typeChanges": ["Important interface/type changes"],
    "importChanges": ["Changes to import paths or module structure"]
  },
  "wrapperImpact": {
    "affectedFiles": ["wrapper files that need updates"],
    "requiredChanges": ["Specific changes needed in wrapper"],
    "suggestedCode": "Complete TypeScript wrapper methods with full implementations, proper types, error handling, and JSDoc comments. Generate COMPLETE working code, not just snippets.",
    "newWrapperMethods": ["New wrapper methods that should be created"]
  },
  "testingGuidance": [
    "Specific areas to test manually",
    "Edge cases to verify", 
    "Regression tests to run"
  ],
  "automatedChanges": {
    "canAutomate": true,
    "suggestedUpdates": {
      "filename.ts": "COMPLETE updated file content with all existing code plus new wrapper methods. Include the entire file content, not just additions."
    },
    "reasoning": "Why these changes can/cannot be automated"
  }
}

## Critical Instructions:

1. **PR Description**: Generate a complete, properly formatted GitHub PR description with:
   - Proper markdown headers (# ## ###)
   - Actual line breaks (not \\n)
   - Emojis and checkboxes
   - Code blocks with proper backticks
   - Ready to paste directly into GitHub

2. **Wrapper Code Generation**: For any new endpoints detected:
   - Generate COMPLETE wrapper methods following existing patterns
   - Include full TypeScript types and interfaces
   - Add proper error handling and validation
   - Include JSDoc comments
   - Follow the existing code style shown in the wrapper context

3. **File Updates**: In suggestedUpdates, provide COMPLETE file content including:
   - All existing code
   - New wrapper methods
   - Updated imports if needed
   - Proper formatting and structure

4. **Focus Areas**:
   - Breaking changes that prevent compilation
   - New functionality that should be exposed through the wrapper
   - Complete working implementations, not placeholder comments
   - Automated updates that include full file content

Remember: Return ONLY valid JSON. Generate complete, working code implementations.`;
  }
  
  /**
   * Extract existing wrapper patterns to help LLM generate consistent code
   */
  extractWrapperPatterns(wrapperContext) {
    const files = Object.keys(wrapperContext);
    if (files.length === 0) return 'No wrapper files found for pattern analysis';
    
    let patterns = 'Common patterns found in existing wrapper code:\n\n';
    
    // Analyze first few files for patterns
    files.slice(0, 3).forEach(file => {
      const content = wrapperContext[file];
      
      // Extract method patterns
      const methods = content.match(/export\s+(async\s+)?function\s+\w+[^{]*{[^}]*}/g) || [];
      if (methods.length > 0) {
        patterns += `\n${file} method example:\n`;
        patterns += methods[0].substring(0, 200) + (methods[0].length > 200 ? '...' : '') + '\n';
      }
      
      // Extract class patterns
      const classes = content.match(/export\s+class\s+\w+[^{]*{[^}]*}/g) || [];
      if (classes.length > 0) {
        patterns += `\n${file} class example:\n`;
        patterns += classes[0].substring(0, 200) + (classes[0].length > 200 ? '...' : '') + '\n';
      }
    });
    
    return patterns;
  }
  
  /**
   * Format diff summary for the prompt
   */
  formatDiffSummary(diffData) {
    if (!diffData.summary) return 'No diff summary available';
    
    const { filesChanged, insertions, deletions } = diffData.summary;
    return `Files changed: ${filesChanged}, Insertions: ${insertions}, Deletions: ${deletions}`;
  }
  
  /**
   * Format diff highlights for easier LLM analysis
   */
  formatDiffHighlights(structuredDiff) {
    const files = structuredDiff.files || [];
    if (files.length === 0) return 'No file changes detected';
    
    let highlights = '';
    
    const newFiles = files.filter(f => f.isNewFile);
    const deletedFiles = files.filter(f => f.isDeletedFile); 
    const modifiedFiles = files.filter(f => !f.isNewFile && !f.isDeletedFile);
    
    if (newFiles.length > 0) {
      highlights += `\nNew files (${newFiles.length}): ${newFiles.map(f => f.path).join(', ')}`;
    }
    
    if (deletedFiles.length > 0) {
      highlights += `\nDeleted files (${deletedFiles.length}): ${deletedFiles.map(f => f.path).join(', ')}`;
    }
    
    if (modifiedFiles.length > 0) {
      highlights += `\nModified files (${modifiedFiles.length}): ${modifiedFiles.map(f => f.path).join(', ')}`;
    }
    
    return highlights || 'No significant changes detected';
  }
  
  /**
   * Format wrapper code summary
   */
  formatWrapperSummary(wrapperContext) {
    const files = Object.keys(wrapperContext);
    if (files.length === 0) return 'No wrapper files found';
    
    let summary = `Wrapper files (${files.length}):\n`;
    
    files.forEach(file => {
      const content = wrapperContext[file];
      const lines = content.split('\n').length;
      const exports = (content.match(/export\s+(?:class|function|const|interface|type)/g) || []).length;
      const imports = (content.match(/import.*from/g) || []).length;
      
      summary += `- ${file}: ${lines} lines, ${exports} exports, ${imports} imports\n`;
    });
    
    return summary;
  }
  
  /**
   * Truncate diff for prompt size management
   */
  truncateDiff(rawDiff) {
    const maxLength = 5000; // 5KB of diff context
    if (!rawDiff || rawDiff.length <= maxLength) return rawDiff || 'No diff available';
    
    return rawDiff.slice(0, maxLength) + '\n... (truncated for analysis)';
  }
  
  /**
   * Enhance the LLM analysis with metadata
   */
  enhanceAnalysis(analysis, diffData, generationSummary) {
    return {
      ...analysis,
      metadata: {
        analyzedAt: new Date().toISOString(),
        llmModel: config.openai.model,
        diffSummary: diffData.summary,
        generationSummary: generationSummary,
        analysisMethod: 'llm'
      }
    };
  }
  
  /**
   * Create fallback analysis when LLM fails
   */
  createFallbackAnalysis(diffData, generationSummary) {
    return {
      summary: "LLM analysis failed - manual review required",
      prDescription: `# 🤖 SDK Update Failed

**Analysis Error:** LLM analysis could not be completed. Manual review required.

## What to do:

1. Review the generated SDK changes manually
2. Update wrapper methods as needed
3. Test all functionality before merging

## Files Changed:
${diffData.summary ? `${diffData.summary.filesChanged} files modified` : 'Unknown changes'}

---
*This PR was created automatically but requires manual analysis due to automation failure.*`,
      riskAssessment: {
        level: "HIGH",
        reasoning: "Unable to perform automated analysis - all changes require manual review",
        breakingChanges: ["Unknown - manual analysis required"]
      },
      impactAnalysis: {
        addedEndpoints: [],
        modifiedEndpoints: [],
        removedEndpoints: [],
        typeChanges: ["Unknown type changes - check generated files"],
        importChanges: ["Potential import changes - verify wrapper imports"]
      },
      wrapperImpact: {
        affectedFiles: ["All wrapper files should be reviewed"],
        requiredChanges: ["Manual analysis required"],
        suggestedCode: "// LLM analysis unavailable\n// Please review changes manually",
        newWrapperMethods: []
      },
      testingGuidance: [
        "Comprehensive testing required due to analysis failure",
        "Verify all wrapper methods compile successfully",
        "Test all API calls for correct functionality",
        "Check for runtime errors in wrapper usage"
      ],
      automatedChanges: {
        canAutomate: false,
        suggestedUpdates: {},
        reasoning: "Cannot automate changes without proper analysis"
      },
      metadata: {
        analyzedAt: new Date().toISOString(),
        analysisMethod: 'fallback',
        requiresManualReview: true,
        diffSummary: diffData.summary,
        generationSummary: generationSummary
      }
    };
  }
}