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
        temperature: config.openai.temperature || 0.1, // Lower temperature for more consistent output
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
   * Analyze import relationships between wrapper and generated code
   */
  analyzeImportRelationships(wrapperContext, diffData) {
    const relationships = {};
    
    Object.entries(wrapperContext).forEach(([wrapperFile, content]) => {
      const imports = this.extractImports(content);
      relationships[wrapperFile] = {
        importsFromGenerated: imports.filter(imp => 
          imp.from.includes('./generated') || 
          imp.from.includes('../generated') ||
          imp.from.includes('@/generated') ||
          imp.from.includes('/generated/') ||
          imp.from.includes('generated/')
        ),
        allImports: imports,
        exportedWrappers: this.extractExportedMethods(content),
        usedGeneratedTypes: this.extractUsedTypes(content)
      };
    });
    
    return relationships;
  }

  /**
   * Extract imports from TypeScript/JavaScript code
   */
  extractImports(content) {
    const importRegex = /import\s+(?:(?:(?:\w+)|(?:\*\s+as\s+\w+)|(?:\{[^}]*\}))\s+from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"])/g;
    const imports = [];
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      const fullMatch = match[0];
      const fromPath = match[1] || match[2];
      
      // Extract what's being imported
      const typeImportMatch = fullMatch.match(/import\s+(?:type\s+)?\{([^}]*)\}/);
      const defaultImportMatch = fullMatch.match(/import\s+(\w+)\s+from/);
      const namespaceImportMatch = fullMatch.match(/import\s+\*\s+as\s+(\w+)/);
      
      imports.push({
        statement: fullMatch,
        from: fromPath,
        namedImports: typeImportMatch ? typeImportMatch[1].split(',').map(i => i.trim()) : [],
        defaultImport: defaultImportMatch ? defaultImportMatch[1] : null,
        namespaceImport: namespaceImportMatch ? namespaceImportMatch[1] : null,
        isTypeOnly: fullMatch.includes('import type')
      });
    }
    
    return imports;
  }

  /**
   * Extract exported methods/classes from wrapper code
   */
  extractExportedMethods(content) {
    const exportRegex = /export\s+(?:async\s+)?(?:function\s+(\w+)|class\s+(\w+)|const\s+(\w+)|interface\s+(\w+)|type\s+(\w+))/g;
    const exports = [];
    let match;
    
    while ((match = exportRegex.exec(content)) !== null) {
      const name = match[1] || match[2] || match[3] || match[4] || match[5];
      const type = match[1] ? 'function' : match[2] ? 'class' : match[3] ? 'const' : match[4] ? 'interface' : 'type';
      exports.push({ name, type });
    }
    
    return exports;
  }

  /**
   * Extract types/interfaces being used from generated code
   */
  extractUsedTypes(content) {
    // Look for type annotations and generic parameters
    const typeUsageRegex = /:\s*([A-Z][a-zA-Z0-9_]*(?:\[[^\]]*\])?(?:\s*\|\s*[A-Z][a-zA-Z0-9_]*)*)/g;
    const genericRegex = /<([A-Z][a-zA-Z0-9_]*)>/g;
    
    const usedTypes = new Set();
    let match;
    
    while ((match = typeUsageRegex.exec(content)) !== null) {
      const typeStr = match[1];
      // Extract individual types from union types
      typeStr.split('|').forEach(type => {
        const cleanType = type.trim().replace(/\[[^\]]*\]/, ''); // Remove array brackets
        if (cleanType && /^[A-Z]/.test(cleanType)) {
          usedTypes.add(cleanType);
        }
      });
    }
    
    while ((match = genericRegex.exec(content)) !== null) {
      const genericType = match[1];
      if (genericType && /^[A-Z]/.test(genericType)) {
        usedTypes.add(genericType);
      }
    }
    
    return Array.from(usedTypes);
  }

  /**
   * Group endpoints by API domain/resource for file organization
   */
  groupEndpointsByDomain(endpoints) {
    const groups = {};
    
    endpoints.forEach(endpoint => {
      // Extract domain from endpoint path or name
      let domain = 'general';
      
      if (endpoint.path) {
        const pathParts = endpoint.path.split('/').filter(p => p && !p.startsWith('{'));
        if (pathParts.length > 0) {
          domain = pathParts[0].toLowerCase();
        }
      } else if (endpoint.operationId) {
        // Extract domain from operationId like "getUserById" -> "user"
        const match = endpoint.operationId.match(/^(get|post|put|delete|patch)?([A-Z][a-z]+)/);
        if (match) {
          domain = match[2].toLowerCase();
        }
      }
      
      if (!groups[domain]) {
        groups[domain] = [];
      }
      groups[domain].push(endpoint);
    });
    
    return groups;
  }

  /**
   * Find existing wrapper file for a given API domain
   */
  findWrapperForDomain(domain, wrapperFiles) {
    const domainLower = domain.toLowerCase();
    
    // Look for files that match the domain
    return wrapperFiles.find(file => {
      const fileName = file.toLowerCase();
      return fileName.includes(domainLower) || 
             fileName.includes(domainLower + 'wrapper') ||
             fileName.includes(domainLower + 'client') ||
             fileName.includes(domainLower + 'api');
    });
  }

  /**
   * Determine file organization strategy
   */
  determineFileStrategy(diffData, existingWrappers) {
    const newEndpoints = this.extractNewEndpoints(diffData);
    const strategies = {
      modifyExisting: [],
      createNew: [],
      reasoning: []
    };

    if (newEndpoints.length === 0) {
      strategies.reasoning.push("No new endpoints detected - only modifications to existing code");
      return strategies;
    }

    // Group endpoints by domain/resource
    const endpointGroups = this.groupEndpointsByDomain(newEndpoints);
    
    Object.entries(endpointGroups).forEach(([domain, endpoints]) => {
      const existingWrapperForDomain = this.findWrapperForDomain(domain, Object.keys(existingWrappers));
      
      if (existingWrapperForDomain && endpoints.length <= 3) {
        // Add to existing file if it exists and we're only adding a few methods
        strategies.modifyExisting.push({
          file: existingWrapperForDomain,
          endpoints: endpoints,
          reason: `Adding ${endpoints.length} new methods to existing ${domain} wrapper`
        });
      } else if (!existingWrapperForDomain || endpoints.length > 5) {
        // Create new file if no existing wrapper or too many new endpoints
        strategies.createNew.push({
          suggestedFileName: `${domain}Wrapper.ts`,
          endpoints: endpoints,
          reason: existingWrapperForDomain ? 
            `Too many new ${domain} endpoints (${endpoints.length}) - suggest separate file` :
            `No existing wrapper for ${domain} domain - creating new file`
        });
      } else {
        // Middle ground - existing wrapper with moderate number of new endpoints
        strategies.modifyExisting.push({
          file: existingWrapperForDomain,
          endpoints: endpoints,
          reason: `Extending existing ${domain} wrapper with ${endpoints.length} new methods`
        });
      }
    });

    return strategies;
  }

  /**
   * Extract new endpoints from diff data
   */
  extractNewEndpoints(diffData) {
    const newEndpoints = [];
    
    // Look for new methods in the structured diff
    if (diffData.structuredDiff?.files) {
      diffData.structuredDiff.files.forEach(file => {
        if (file.additions) {
          file.additions.forEach(addition => {
            // Look for new method definitions
            const methodMatch = addition.match(/^\+.*(?:async\s+)?(\w+)\s*\([^)]*\)/);
            if (methodMatch) {
              newEndpoints.push({
                name: methodMatch[1],
                file: file.path,
                method: addition,
                path: this.extractPathFromMethod(addition)
              });
            }
          });
        }
      });
    }
    
    return newEndpoints;
  }

  /**
   * Extract API path from method implementation
   */
  extractPathFromMethod(methodCode) {
    const pathMatch = methodCode.match(/['"`]([/\w{}-]+)['"`]/);
    return pathMatch ? pathMatch[1] : null;
  }

  /**
   * System prompt for the LLM with improved constraints
   */
  getSystemPrompt() {
    return `You are a TypeScript SDK wrapper specialist focused on INCREMENTAL UPDATES and CODE PRESERVATION.

CORE PRINCIPLES:
1. **Preserve existing wrapper code** - Never rewrite working code unless absolutely necessary for compatibility
2. **Add, don't replace** - Only add new methods or make minimal compatibility fixes  
3. **Respect patterns** - Follow existing error handling, naming, and structure patterns
4. **Suggest file separation** - Recommend new files for new API domains when appropriate
5. **Minimal changes** - Make the smallest changes necessary for compatibility

WHEN TO MODIFY vs CREATE:
- **Modify existing files:** When adding 1-3 methods to existing API domains that already have wrappers
- **Create new files:** When new API domains are introduced OR when adding 5+ methods to avoid file bloat
- **Compatibility fixes:** Only when existing wrapper methods would break due to generated code changes

WRAPPER CODE REQUIREMENTS:
- Write complete, production-ready TypeScript methods with proper types
- Include comprehensive error handling and validation
- Add detailed JSDoc comments for all new methods
- Follow existing import patterns and code style from the wrapper context
- Generate full method implementations, not snippets or TODO comments

OUTPUT REQUIREMENTS:
- Return ONLY valid JSON without any markdown formatting around it
- For existing file modifications: specify ONLY what to ADD or minimally change
- For new files: provide complete file content with imports, exports, and methods
- Include proper TypeScript types, error handling, and JSDoc comments
- Use proper line breaks and formatting within string values

You are NOT a code rewriter. You are a careful code enhancer who respects existing work and makes surgical improvements.`;
  }
  
  /**
   * Build improved analysis prompt with better structure
   */
  buildAnalysisPrompt(diffData, wrapperContext, generationSummary) {
    const importRelationships = this.analyzeImportRelationships(wrapperContext, diffData);
    const fileStrategy = this.determineFileStrategy(diffData, wrapperContext);
    const diffHighlights = diffData.structuredDiff ? 
      this.formatDiffHighlights(diffData.structuredDiff) : 
      'Diff analysis unavailable';
    
    const wrapperSummary = this.formatWrapperSummary(wrapperContext);
    const existingWrapperPatterns = this.extractWrapperPatterns(wrapperContext);
    
    return `# SDK Wrapper Impact Analysis

## CRITICAL INSTRUCTIONS - READ CAREFULLY

**EXISTING CODE PRESERVATION:** You MUST preserve all existing wrapper code. Only add new methods or make minimal necessary changes for compatibility. DO NOT rewrite, reorganize, or remove existing working code.

**FILE STRATEGY:** Follow the file organization recommendations provided below. Create new files for new API domains rather than cramming everything into existing files when it makes sense.

**IMPORT ANALYSIS:** Pay attention to the import relationships shown below. Ensure new wrapper methods import only what they need from the generated SDK and maintain consistency with existing patterns.

## Generation Summary
${JSON.stringify(generationSummary, null, 2)}

## Current Import Relationships
${JSON.stringify(importRelationships, null, 2)}

## Recommended File Organization Strategy  
${JSON.stringify(fileStrategy, null, 2)}

## Generated Code Changes
${this.formatDiffSummary(diffData)}

## Key Changes Detected
${diffHighlights}

## Current Wrapper Code Structure (PRESERVE THIS)
${wrapperSummary}

## Existing Wrapper Patterns (FOLLOW THESE)
${existingWrapperPatterns}

## Sample of Raw Diff (truncated)
${this.truncateDiff(diffData.rawDiff)}

## Required Analysis

Provide analysis following this EXACT JSON structure (return ONLY valid JSON):

{
  "summary": "Brief description focusing on what NEW functionality was added to the generated SDK",
  "prDescription": "Complete GitHub PR description with proper markdown formatting. Use actual line breaks and proper markdown. Include emojis, headers, checklists. Make it ready to paste directly into GitHub.",
  "riskAssessment": {
    "level": "LOW|MEDIUM|HIGH|BREAKING",
    "reasoning": "Focus on compatibility issues with existing wrapper code",
    "breakingChanges": ["Only list changes that would break existing wrapper code compilation or runtime"]
  },
  "impactAnalysis": {
    "addedEndpoints": ["New API endpoints/methods that need wrapper implementations"],
    "modifiedEndpoints": ["Existing endpoints where method signatures changed in breaking ways"],
    "removedEndpoints": ["Only list if they affect existing wrapper methods"],
    "typeChanges": ["Breaking interface/type changes that affect wrapper code"],
    "importChanges": ["Changes to import paths or module structure affecting wrappers"]
  },
  "wrapperChanges": {
    "preserveExisting": true,
    "modifyExistingFiles": {
      "filename.ts": {
        "reason": "Why this existing file needs changes",
        "addMethods": ["List of new method names to add"],
        "modifyMethods": ["Only list if existing methods must change for compatibility"],
        "newImports": ["Additional imports needed from generated SDK"],
        "additionsOnly": "COMPLETE new methods code to ADD to the existing file. Include full TypeScript implementations with proper types, error handling, and JSDoc comments."
      }
    },
    "createNewFiles": {
      "newWrapperFile.ts": {
        "reason": "Why a new file is recommended over modifying existing files",
        "endpoints": ["List of endpoints this file will handle"],
        "domain": "API domain this file covers",
        "suggestedContent": "COMPLETE new file content including imports, exports, classes/functions, and all methods with full implementations"
      }
    }
  },
  "implementationGuidance": {
    "consistencyPatterns": ["Patterns to follow for error handling, naming, types etc"],
    "importGuidelines": ["How to import from generated SDK consistently"],
    "codeStyleNotes": ["Style guidelines based on existing wrapper code"]
  },
  "testingGuidance": [
    "Test new wrapper methods without breaking existing functionality",
    "Verify import paths work correctly", 
    "Specific edge cases to test based on the changes"
  ]
}

## KEY CONSTRAINTS:

1. **PRESERVE EXISTING CODE:** Only add new methods or make minimal compatibility fixes to existing wrapper files
2. **SUGGEST NEW FILES:** For new API domains with 3+ methods, recommend new wrapper files  
3. **MINIMAL IMPORTS:** Only import what's actually needed from generated SDK
4. **CONSISTENT PATTERNS:** Follow existing wrapper patterns for error handling, types, naming
5. **NO REWRITES:** Don't reorganize or rewrite existing working code
6. **COMPLETE IMPLEMENTATIONS:** Provide full working code, not snippets or placeholder comments
7. **SURGICAL CHANGES:** Make the smallest changes necessary while maintaining functionality

Focus on incremental additions and compatibility, not rewrites or major refactoring.`;
  }
  
  /**
   * Extract existing wrapper patterns with better analysis
   */
  extractWrapperPatterns(wrapperContext) {
    const files = Object.keys(wrapperContext);
    if (files.length === 0) return 'No wrapper files found for pattern analysis';
    
    let patterns = 'Common patterns found in existing wrapper code:\n\n';
    
    // Analyze patterns across all files
    const allContent = Object.values(wrapperContext).join('\n');
    
    // Error handling patterns
    const errorHandlingPattern = allContent.match(/(try\s*{[^}]*}\s*catch[^}]*})/s);
    if (errorHandlingPattern) {
      patterns += `Error Handling Pattern:\n${errorHandlingPattern[0].substring(0, 150)}...\n\n`;
    }
    
    // Type annotation patterns
    const typePatterns = allContent.match(/(:\s*[A-Z][a-zA-Z0-9<>[\],\s]*)/g);
    if (typePatterns) {
      patterns += `Type Annotation Examples:\n${typePatterns.slice(0, 3).join('\n')}\n\n`;
    }
    
    // Method signature patterns
    files.slice(0, 2).forEach(file => {
      const content = wrapperContext[file];
      
      // Extract full method examples
      const methods = content.match(/\/\*\*[\s\S]*?\*\/\s*export\s+(?:async\s+)?function\s+\w+[^{]*{[\s\S]*?^}/gm) || [];
      if (methods.length > 0) {
        patterns += `\n${file} complete method example:\n`;
        patterns += methods[0].substring(0, 400) + (methods[0].length > 400 ? '...' : '') + '\n';
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
   * Format wrapper code summary with more detail
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
      const generatedImports = (content.match(/import.*from\s+['"][^'"]*generated[^'"]*['"]/g) || []).length;
      
      summary += `- ${file}: ${lines} lines, ${exports} exports, ${imports} imports (${generatedImports} from generated SDK)\n`;
    });
    
    return summary;
  }
  
  /**
   * Truncate diff for prompt size management
   */
  truncateDiff(rawDiff) {
    const maxLength = 3000; // Reduced size for better prompt efficiency
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
        analysisMethod: 'llm-improved',
        preservationFocus: true
      }
    };
  }
  
  /**
   * Create fallback analysis when LLM fails
   */
  createFallbackAnalysis(diffData, generationSummary) {
    return {
      summary: "LLM analysis failed - manual review required",
      prDescription: `# 🤖 SDK Update Analysis Failed

**Analysis Error:** Automated analysis could not be completed. Manual review required.

## What to do next:

1. 📋 Review the generated SDK changes manually
2. 🔍 Check for new endpoints that need wrapper methods  
3. ⚠️ Verify existing wrapper imports still work
4. 🧪 Test all wrapper functionality before merging
5. 📝 Update wrapper methods as needed

## Files Changed:
${diffData.summary ? `${diffData.summary.filesChanged} files modified` : 'Unknown changes detected'}

## Safety Notes:
- Preserve all existing wrapper code
- Only add new methods or fix compatibility issues
- Follow existing patterns for consistency

---
*This PR was created automatically but requires manual analysis due to automation failure.*`,
      riskAssessment: {
        level: "HIGH",
        reasoning: "Unable to perform automated analysis - all changes require manual review for safety",
        breakingChanges: ["Unknown - manual analysis required to identify breaking changes"]
      },
      impactAnalysis: {
        addedEndpoints: [],
        modifiedEndpoints: [],
        removedEndpoints: [],
        typeChanges: ["Unknown type changes - manually check generated SDK files"],
        importChanges: ["Potential import path changes - verify all wrapper imports"]
      },
      wrapperChanges: {
        preserveExisting: true,
        modifyExistingFiles: {},
        createNewFiles: {},
        manualReviewRequired: true
      },
      testingGuidance: [
        "Comprehensive testing required due to analysis failure",
        "Verify all wrapper methods compile without errors",
        "Test all API endpoints through wrapper methods",
        "Check for runtime errors and type issues",
        "Validate that existing wrapper functionality still works"
      ],
      implementationGuidance: {
        consistencyPatterns: ["Follow existing wrapper code patterns"],
        importGuidelines: ["Verify import paths from generated SDK"],
        codeStyleNotes: ["Maintain existing code style and structure"]
      },
      metadata: {
        analyzedAt: new Date().toISOString(),
        analysisMethod: 'fallback',
        requiresManualReview: true,
        diffSummary: diffData.summary,
        generationSummary: generationSummary,
        preservationFocus: true
      }
    };
  }
}