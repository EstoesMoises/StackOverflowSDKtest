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
    try {
      console.log('🤖 Analyzing changes with LLM...');
      
      const prompt = this.buildAnalysisPrompt(diffData, wrapperContext, generationSummary);
      
      const response = await this.client.chat.completions.create({
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
      console.log('🔍 Raw LLM response:', rawContent);
      
      // Clean the response if it contains markdown
      const cleanContent = this.cleanJsonResponse(rawContent);
      
      const analysis = JSON.parse(cleanContent);
      return this.enhanceAnalysis(analysis, diffData, generationSummary);
      
    } catch (error) {
      console.warn('LLM analysis failed:', error.message);
      console.warn('Response content:', response?.choices?.[0]?.message?.content);
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
    return `You are an expert TypeScript/JavaScript developer specializing in SDK wrapper analysis. 

Your task is to analyze changes in OpenAPI-generated TypeScript code and determine how these changes impact a custom wrapper layer built on top of the generated SDK.

Key responsibilities:
1. Identify breaking changes that would cause compilation errors in the wrapper
2. Detect new endpoints/methods that should be wrapped
3. Find modified types/interfaces that affect wrapper implementations  
4. Suggest specific code changes needed in the wrapper files
5. Assess the risk level of changes
6. Provide actionable testing guidance

IMPORTANT: Always respond with ONLY valid JSON. Do not use markdown formatting, code blocks, or any other text. Return pure JSON only.`;
  }
  
  /**
   * Build the analysis prompt
   */
  buildAnalysisPrompt(diffData, wrapperContext, generationSummary) {
    const diffHighlights = diffData.structuredDiff ? 
      this.formatDiffHighlights(diffData.structuredDiff) : 
      'Diff analysis unavailable';
    
    const wrapperSummary = this.formatWrapperSummary(wrapperContext);
    
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

### Sample of Raw Diff (truncated)
${this.truncateDiff(diffData.rawDiff)}

## Required Analysis

Please analyze these changes and provide a JSON response with this exact structure (return ONLY the JSON, no markdown formatting):

{
  "summary": "Brief description of what changed in the generated SDK",
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
    "suggestedCode": "TypeScript code snippets showing how to fix issues",
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
      "filename.ts": "complete updated file content if changes are simple and safe"
    },
    "reasoning": "Why these changes can/cannot be automated"
  }
}

Focus on:
- Breaking changes that prevent compilation
- New functionality that should be exposed through the wrapper
- Modified response types or parameter requirements
- Import statement changes
- Opportunity to automate simple, safe updates

Remember: Return ONLY valid JSON, no additional text or formatting.`;
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