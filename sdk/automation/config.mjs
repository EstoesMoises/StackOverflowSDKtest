// config.mjs
export const config = {
  // Paths
  openApiSpecPath: './src/source/swagger.json',
  generatedDir: './src/generated',
  clientDir: './src/client',
  metadataFile: './automation-metadata.json',
  
  // Generation
  generateCommand: 'pnpm generateSDK',
  
  // Git & GitHub
  branchPrefix: 'sdk-auto-update',
  defaultBranch: 'main',
  prLabels: ['auto-generated', 'sdk-update'],
  
  // Anthropic (Claude)
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-20250514',
    maxTokens: 20000,
    temperature: 0.1
  },
  
  // GitHub
  github: {
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPOSITORY,
    owner: process.env.GITHUB_REPOSITORY?.split('/')[0],
    repoName: process.env.GITHUB_REPOSITORY?.split('/')[1]
  },
  
  // Analysis settings
  maxFileSize: 50000,
  filePatterns: {
    include: ['**/*.ts', '**/*.js'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.*', '**/*.spec.*']
  },
  
  // Safety
  dryRun: process.env.DRY_RUN === 'true',
  skipPR: process.env.SKIP_PR === 'true'
};

// Validate required environment variables
export function validateConfig() {
  const required = [];
  
  if (!config.anthropic.apiKey) required.push('ANTHROPIC_API_KEY');
  if (!config.github.token) required.push('GITHUB_TOKEN');
  if (!config.github.repo) required.push('GITHUB_REPOSITORY');
  
  if (required.length > 0) {
    throw new Error(`Missing required environment variables: ${required.join(', ')}`);
  }
  
  return true;
}