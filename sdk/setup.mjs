#!/usr/bin/env node

// setup.mjs - Setup script for SDK automation
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

class SetupScript {
  async run() {
    console.log('🚀 Setting up SDK Update Automation...\n');
    
    try {
      await this.createDirectories();
      await this.installDependencies();
      await this.createConfigFiles();
      await this.updatePackageJson();
      await this.createGitIgnoreEntries();
      await this.displaySetupInstructions();
      
      console.log('✅ Setup completed successfully!\n');
      
    } catch (error) {
      console.error('❌ Setup failed:', error.message);
      process.exit(1);
    }
  }
  
  async createDirectories() {
    console.log('📁 Creating automation directory...');
    
    const automationDir = './automation';
    
    try {
      await fs.access(automationDir);
      console.log('   Directory already exists');
    } catch {
      await fs.mkdir(automationDir, { recursive: true });
      console.log('   ✅ Created ./automation directory');
    }
  }
  
  async installDependencies() {
    console.log('📦 Installing automation dependencies...');
    
    const requiredDeps = [
      'openai',
      '@octokit/rest'
    ];
    
    // Check if package.json exists
    let packageJson;
    try {
      const content = await fs.readFile('./package.json', 'utf8');
      packageJson = JSON.parse(content);
    } catch {
      console.log('❌ package.json not found. Please run this from your project root.');
      process.exit(1);
    }
    
    // Install missing dependencies
    const devDeps = packageJson.devDependencies || {};
    const deps = packageJson.dependencies || {};
    const allDeps = { ...deps, ...devDeps };
    
    const missingDeps = requiredDeps.filter(dep => !allDeps[dep]);
    
    if (missingDeps.length > 0) {
      console.log(`   Installing: ${missingDeps.join(', ')}`);
      
      try {
        execSync(`pnpm add -D ${missingDeps.join(' ')}`, { stdio: 'inherit' });
        console.log('   ✅ Dependencies installed');
      } catch (error) {
        console.log('   ⚠️ Failed to install with pnpm, trying npm...');
        try {
          execSync(`npm install --save-dev ${missingDeps.join(' ')}`, { stdio: 'inherit' });
          console.log('   ✅ Dependencies installed with npm');
        } catch (npmError) {
          throw new Error('Failed to install dependencies with both pnpm and npm');
        }
      }
    } else {
      console.log('   ✅ All dependencies already installed');
    }
  }
  
  async updatePackageJson() {
    console.log('📝 Updating package.json scripts...');
    
    const packageJsonPath = './package.json';
    const content = await fs.readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(content);
    
    // Add automation scripts
    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }
    
    const newScripts = {
      'sdk:check': 'node automation/sdk-updater.mjs check',
      'sdk:update': 'node automation/sdk-updater.mjs run',
      'sdk:status': 'node automation/sdk-updater.mjs status',
      'sdk:dry-run': 'DRY_RUN=true node automation/sdk-updater.mjs run'
    };
    
    let scriptsAdded = 0;
    for (const [script, command] of Object.entries(newScripts)) {
      if (!packageJson.scripts[script]) {
        packageJson.scripts[script] = command;
        scriptsAdded++;
      }
    }
    
    if (scriptsAdded > 0) {
      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
      console.log(`   ✅ Added ${scriptsAdded} automation scripts`);
    } else {
      console.log('   ✅ Scripts already exist');
    }
  }
  
  async createConfigFiles() {
    console.log('⚙️ Creating configuration files...');
    
    // Create .env.example
    const envExample = `# SDK Update Automation Environment Variables
# Copy this file to .env and fill in your values

# Required: OpenAI API key for LLM analysis
OPENAI_API_KEY=sk-your-openai-api-key-here

# Required for local testing: GitHub personal access token
# Not needed in GitHub Actions (uses GITHUB_TOKEN automatically)
GITHUB_TOKEN=ghp_your-github-token-here

# Optional: Repository in owner/repo format
# Auto-detected in GitHub Actions
GITHUB_REPOSITORY=your-username/your-repo

# Optional: Default branch (default: main)
DEFAULT_BRANCH=main

# Optional: Run without making commits
DRY_RUN=false

# Optional: Skip PR creation
SKIP_PR=false
`;
    
    try {
      await fs.access('.env.example');
      console.log('   .env.example already exists');
    } catch {
      await fs.writeFile('.env.example', envExample);
      console.log('   ✅ Created .env.example');
    }
    
    // Create automation metadata file placeholder
    const metadataPath = './automation-metadata.json';
    try {
      await fs.access(metadataPath);
      console.log('   automation-metadata.json already exists');
    } catch {
      const initialMetadata = {
        lastHash: null,
        lastUpdate: null,
        lastCheck: null,
        sourceFile: "./src/source/swagger.json"
      };
      
      await fs.writeFile(metadataPath, JSON.stringify(initialMetadata, null, 2));
      console.log('   ✅ Created automation-metadata.json');
    }
  }
  
  async createGitIgnoreEntries() {
    console.log('📋 Updating .gitignore...');
    
    const gitignoreEntries = `
# SDK Update Automation
automation-metadata.json
UPDATE_INSTRUCTIONS.md
*.backup.*
.env
`;
    
    try {
      const gitignoreContent = await fs.readFile('.gitignore', 'utf8');
      
      if (!gitignoreContent.includes('SDK Update Automation')) {
        await fs.appendFile('.gitignore', gitignoreEntries);
        console.log('   ✅ Added automation entries to .gitignore');
      } else {
        console.log('   ✅ .gitignore already contains automation entries');
      }
    } catch {
      // .gitignore doesn't exist, create it
      await fs.writeFile('.gitignore', gitignoreEntries.trim() + '\n');
      console.log('   ✅ Created .gitignore with automation entries');
    }
  }
  
  async displaySetupInstructions() {
    console.log(`
🎉 SDK Update Automation Setup Complete!

📋 Next Steps:

1. 🔑 Get your OpenAI API Key:
   • Visit: https://platform.openai.com/api-keys
   • Create a new API key
   • Add it to your repository secrets as OPENAI_API_KEY

2. 📝 Configure your environment:
   • Copy .env.example to .env for local testing
   • Fill in your OpenAI API key and other settings

3. 🔧 Available Commands:
   • pnpm sdk:check      - Check if OpenAPI spec changed
   • pnpm sdk:update     - Run full update automation
   • pnpm sdk:dry-run    - Test without making commits
   • pnpm sdk:status     - Show git repository status

4. 🚀 GitHub Actions:
   • The workflow will trigger automatically on swagger.json changes
   • You can also trigger it manually from the Actions tab
   • Make sure OPENAI_API_KEY is set in repository secrets

5. 🧪 Test the setup:
   • Run: pnpm sdk:check
   • This will verify your configuration and check for changes

📚 Files created/updated:
   • ./automation/ directory with all automation scripts
   • ./.github/workflows/sdk-update.yml (GitHub Action)
   • ./automation-metadata.json (change tracking)
   • ./.env.example (configuration template)
   • Updated package.json with new scripts
   • Updated .gitignore

🔗 Documentation:
   • All scripts have built-in help: node automation/sdk-updater.mjs help
   • Check the README for more detailed usage instructions

Happy automating! 🤖
`);
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new SetupScript();
  setup.run();
}

export { SetupScript };