const inquirer = require('inquirer');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const ora = require('ora');
const { detectProject } = require('./utils');
const { getTemplateConfig, TEMPLATES_CONFIG } = require('./templates');
const { createPrompts, interactivePrompts } = require('./prompts');
const { copyTemplateFiles, runPostInstallationValidation } = require('./file-operations');
const { getHooksForLanguage, getMCPsForLanguage } = require('./hook-scanner');
const { installAgents } = require('./agents');
const { runHealthCheck } = require('./health-check');
const { trackingService } = require('./tracking-service');
const { createGlobalAgent, listGlobalAgents, removeGlobalAgent, updateGlobalAgent } = require('./sdk/global-agent-manager');

/**
 * Get platform-appropriate Python command candidates
 * Returns array of commands to try in order
 * @returns {string[]} Array of Python commands to try
 */
function getPlatformPythonCandidates() {
  if (process.platform === 'win32') {
    // Windows: Try py launcher (PEP 397) first, then python, then python3
    return ['py', 'python', 'python3'];
  } else {
    // Unix/Linux/Mac: Try python3 first, then python
    return ['python3', 'python'];
  }
}

/**
 * Replace python3 commands with platform-appropriate Python command in configuration
 * Windows typically uses 'python' or 'py', while Unix/Linux uses 'python3'
 * @param {Object} config - Configuration object to process
 * @returns {Object} Processed configuration with platform-appropriate Python commands
 */
function replacePythonCommands(config) {
  if (!config || typeof config !== 'object') {
    return config;
  }

  // On Windows, replace python3 with python for better compatibility
  if (process.platform === 'win32') {
    const configString = JSON.stringify(config);
    const replacedString = configString.replace(/python3\s/g, 'python ');
    return JSON.parse(replacedString);
  }

  return config;
}

async function showMainMenu() {
  console.log('');
  
  const initialChoice = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      {
        name: '⚙️ Project Setup - Configure GitHub Copilot for your project',
        value: 'setup',
        short: 'Project Setup'
      },
      {
        name: '🔍 Health Check - Verify your GitHub Copilot setup and configuration',
        value: 'health',
        short: 'Health Check'
      },
      {
        name: '🎯 Browse Components - View available agents, skills, and prompts',
        value: 'browse',
        short: 'Browse Components'
      }
    ],
    default: 'setup'
  }]);
  
  if (initialChoice.action === 'health') {
    console.log(chalk.blue('🔍 Running Health Check...'));
    const healthResult = await runHealthCheck();
    
    // Track health check usage
    trackingService.trackHealthCheck({
      setup_recommended: healthResult.runSetup,
      issues_found: healthResult.issues || 0
    });
    
    if (healthResult.runSetup) {
      console.log(chalk.blue('⚙️  Starting Project Setup...'));
      // Continue with setup flow
      return await createCopilotConfig({});
    } else {
      console.log(chalk.green('👍 Health check completed. Returning to main menu...'));
      return await showMainMenu();
    }
  }

  if (initialChoice.action === 'browse') {
    console.log(chalk.blue('🎯 Browsing available components...'));
    await showAvailableAgents();
    return;
  }
  
  // Continue with setup if user chose 'setup'
  console.log(chalk.blue('⚙️  Setting up GitHub Copilot configuration...'));
  return await createCopilotConfig({ setupFromMenu: true });
}

async function createCopilotConfig(options = {}) {
  const targetDir = options.directory || process.cwd();
  
  // Handle multiple components installation (new approach)
  if (options.agent || options.skill || options.mcp || options.instruction || options.prompt) {
    await installMultipleComponents(options, targetDir);
    return;
  }
  
  // Handle global agent creation
  if (options.createAgent) {
    await createGlobalAgent(options.createAgent, options);
    return;
  }
  
  // Handle global agent listing
  if (options.listAgents) {
    await listGlobalAgents(options);
    return;
  }
  
  // Handle global agent removal
  if (options.removeAgent) {
    await removeGlobalAgent(options.removeAgent, options);
    return;
  }
  
  // Handle global agent update
  if (options.updateAgent) {
    await updateGlobalAgent(options.updateAgent, options);
    return;
  }
  
  // Handle instruction installation
  if (options.instruction) {
    await installInstruction(options.instruction, targetDir, options);
    return;
  }

  // Handle prompt file installation  
  if (options.prompt) {
    await installPromptFile(options.prompt, targetDir, options);
    return;
  }

  // Handle learning path installation
  if (options.learningPath) {
    await installLearningPath(options.learningPath, targetDir, options);
    return;
  }

  // Handle health check
  let shouldRunSetup = false;
  if (options.healthCheck || options.health || options.check || options.verify) {
    trackingService.trackCommandExecution('health-check');
    const healthResult = await runHealthCheck();

    // Track health check usage
    trackingService.trackHealthCheck({
      setup_recommended: healthResult.runSetup,
      issues_found: healthResult.issues || 0,
      source: 'command_line'
    });
    
    if (healthResult.runSetup) {
      console.log(chalk.blue('⚙️  Starting Project Setup...'));
      shouldRunSetup = true;
    } else {
      console.log(chalk.green('👍 Health check completed. Returning to main menu...'));
      return await showMainMenu();
    }
  }
  
  // Add initial choice prompt (only if no specific options are provided and not continuing from health check or menu)
  if (!shouldRunSetup && !options.setupFromMenu && !options.yes && !options.language && !options.framework && !options.dryRun) {
    return await showMainMenu();
  } else {
    console.log(chalk.blue('🚀 Setting up GitHub Copilot configuration...'));
  }
  
  console.log(chalk.gray(`Target directory: ${targetDir}`));
  
  // Detect existing project
  const spinner = ora('Detecting project type...').start();
  const projectInfo = await detectProject(targetDir);
  spinner.succeed('Project detection complete');
  
  let config;
  if (options.yes) {
    // Use defaults - prioritize --template over --language for backward compatibility
    const selectedLanguage = options.template || options.language || projectInfo.detectedLanguage || 'common';
    
    // Check if selected language is coming soon
    if (selectedLanguage && TEMPLATES_CONFIG[selectedLanguage] && TEMPLATES_CONFIG[selectedLanguage].comingSoon) {
      console.log(chalk.red(`❌ ${selectedLanguage} is not available yet. Coming soon!`));
      console.log(chalk.yellow('Available languages: common, javascript-typescript, python'));
      return;
    }
    const availableHooks = getHooksForLanguage(selectedLanguage);
    const defaultHooks = availableHooks.filter(hook => hook.checked).map(hook => hook.id);
    const availableMCPs = getMCPsForLanguage(selectedLanguage);
    const defaultMCPs = availableMCPs.filter(mcp => mcp.checked).map(mcp => mcp.id);
    
    config = {
      language: selectedLanguage,
      framework: options.framework || projectInfo.detectedFramework || 'none',
      features: [],
      hooks: defaultHooks,
      mcps: defaultMCPs
    };
  } else {
    // Interactive prompts with back navigation
    config = await interactivePrompts(projectInfo, options);
  }
  
  // Check if user confirmed the setup
  if (config.confirm === false) {
    console.log(chalk.yellow('⏹️  Setup cancelled by user.'));
    return;
  }
  
  // Get template configuration
  const templateConfig = getTemplateConfig(config);
  
  // Add selected hooks to template config
  if (config.hooks) {
    templateConfig.selectedHooks = config.hooks;
    templateConfig.language = config.language; // Ensure language is available for hook filtering
  }
  
  // Add selected MCPs to template config
  if (config.mcps) {
    templateConfig.selectedMCPs = config.mcps;
    templateConfig.language = config.language; // Ensure language is available for MCP filtering
  }
  
  // Install selected agents
  if (config.agents && config.agents.length > 0) {
    console.log(chalk.blue('🤖 Installing GitHub Copilot agents...'));
    await installAgents(config.agents, targetDir);
  }
  
  if (options.dryRun) {
    console.log(chalk.yellow('🔍 Dry run - showing what would be copied:'));
    templateConfig.files.forEach(file => {
      console.log(chalk.gray(`  - ${file.source} → ${file.destination}`));
    });
    return;
  }
  
  // Copy template files
  const copySpinner = ora('Copying template files...').start();
  try {
    const result = await copyTemplateFiles(templateConfig, targetDir, options);
    if (result === false) {
      copySpinner.info('Setup cancelled by user');
      return; // Exit early if user cancelled
    }
    copySpinner.succeed('Template files copied successfully');
  } catch (error) {
    copySpinner.fail('Failed to copy template files');
    throw error;
  }
  
  // Show success message
  console.log(chalk.green('✅ GitHub Copilot configuration setup complete!'));
  console.log(chalk.cyan('📚 Next steps:'));
  console.log(chalk.white('  1. Review the generated configuration files'));
  console.log(chalk.white('  2. Customize the configuration for your project'));
  console.log(chalk.white('  3. Start using GitHub Copilot in VS Code'));
  console.log('');
  console.log(chalk.blue('🌐 View all available components at: https://educopilot.com/'));
  console.log(chalk.blue('📖 Read the complete documentation at: https://docs.educopilot.com/'));
  
  if (config.language !== 'common') {
    console.log(chalk.yellow(`💡 Language-specific features for ${config.language} have been configured`));
  }
  
  if (config.framework !== 'none') {
    console.log(chalk.yellow(`🎯 Framework-specific commands for ${config.framework} are available`));
  }
  
  if (config.hooks && config.hooks.length > 0) {
    console.log(chalk.magenta(`🔧 ${config.hooks.length} automation hooks have been configured`));
  }
  
  if (config.mcps && config.mcps.length > 0) {
    console.log(chalk.blue(`🔧 ${config.mcps.length} MCP servers have been configured`));
  }

  // Track successful template installation
  if (!options.agent && !options.mcp) {
    trackingService.trackTemplateInstallation(config.language, config.framework, {
      installation_method: options.setupFromMenu ? 'interactive_menu' : 'command_line',
      dry_run: options.dryRun || false,
      hooks_count: config.hooks ? config.hooks.length : 0,
      mcps_count: config.mcps ? config.mcps.length : 0,
      project_detected: !!options.detectedProject
    });
  }
  
  // Run post-installation validation
  if (!options.dryRun) {
    await runPostInstallationValidation(targetDir, templateConfig);
  }
}

// Individual component installation functions
async function installIndividualAgent(agentName, targetDir, options) {
  console.log(chalk.blue(`🤖 Installing agent: ${agentName}`));
  
  try {
    // Support both category/agent-name and direct agent-name formats
    let githubUrl;
    if (agentName.includes('/')) {
      // Category/agent format: beginner-tutors/python-basics-tutor
      githubUrl = `https://raw.githubusercontent.com/StudentCristian/copilot-learning-templates/main/cli-tool/components/agents/${agentName}.agent.md`;
    } else {
      // Direct agent format: python-basics-tutor
      githubUrl = `https://raw.githubusercontent.com/StudentCristian/copilot-learning-templates/main/cli-tool/components/agents/${agentName}.agent.md`;
    }
    
    console.log(chalk.gray(`📥 Downloading from GitHub (main branch)...`));
    
    const response = await fetch(githubUrl);
    if (!response.ok) {
      if (response.status === 404) {
        console.log(chalk.red(`❌ Agent "${agentName}" not found`));
        await showAvailableAgents();
        return;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const agentContent = await response.text();
    
    // Create .github/agents directory if it doesn't exist
    const agentsDir = path.join(targetDir, '.github', 'agents');
    await fs.ensureDir(agentsDir);
    
    // Write the agent file - always to flat .github/agents directory
    let fileName;
    if (agentName.includes('/')) {
      const [category, filename] = agentName.split('/');
      fileName = filename; // Extract just the filename, ignore category for installation
    } else {
      fileName = agentName;
    }
    
    const targetFile = path.join(agentsDir, `${fileName}.agent.md`);
    await fs.writeFile(targetFile, agentContent, 'utf8');
    
    if (!options.silent) {
      console.log(chalk.green(`✅ Agent "${agentName}" installed successfully!`));
      console.log(chalk.cyan(`📁 Installed to: ${path.relative(targetDir, targetFile)}`));
      console.log(chalk.cyan(`📦 Downloaded from: ${githubUrl}`));
    }
    
    // Track successful agent installation
    trackingService.trackDownload('agent', agentName, {
      installation_type: 'individual_component',
      target_directory: path.relative(process.cwd(), targetDir),
      source: 'github_main'
    });
    
    return true;
    
  } catch (error) {
    console.log(chalk.red(`❌ Error installing agent: ${error.message}`));
    return false;
  }
}

async function installIndividualPrompt(promptName, targetDir, options) {
  console.log(chalk.blue(`📝 Installing prompt: ${promptName}`));
  
  try {
    // Support both category/prompt-name and direct prompt-name formats
    let githubUrl;
    if (promptName.includes('/')) {
      // Category/prompt format: learning/generate-exercises
      githubUrl = `https://raw.githubusercontent.com/StudentCristian/copilot-learning-templates/main/cli-tool/components/prompts/${promptName}.md`;
    } else {
      // Direct prompt format: generate-exercises
      githubUrl = `https://raw.githubusercontent.com/StudentCristian/copilot-learning-templates/main/cli-tool/components/prompts/${promptName}.md`;
    }
    
    console.log(chalk.gray(`📥 Downloading from GitHub (main branch)...`));
    
    const response = await fetch(githubUrl);
    if (!response.ok) {
      if (response.status === 404) {
        console.log(chalk.red(`❌ Prompt "${promptName}" not found`));
        console.log(chalk.yellow('Available prompts: learning/generate-exercises'));
        return;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const promptContent = await response.text();
    
    // Create .github/prompts directory if it doesn't exist
    const promptsDir = path.join(targetDir, '.github', 'prompts');
    await fs.ensureDir(promptsDir);
    
    // Write the prompt file - always to flat .github/prompts directory
    let fileName;
    if (promptName.includes('/')) {
      const [category, filename] = promptName.split('/');
      fileName = filename; // Extract just the filename, ignore category for installation
    } else {
      fileName = promptName;
    }
    
    const targetFile = path.join(promptsDir, `${fileName}.md`);
    
    await fs.writeFile(targetFile, promptContent, 'utf8');
    
    if (!options.silent) {
      console.log(chalk.green(`✅ Prompt "${promptName}" installed successfully!`));
      console.log(chalk.cyan(`📁 Installed to: ${path.relative(targetDir, targetFile)}`));
      console.log(chalk.cyan(`📦 Downloaded from: ${githubUrl}`));
    }
    
    // Track successful prompt installation
    trackingService.trackDownload('prompt', promptName, {
      installation_type: 'individual_prompt',
      target_directory: path.relative(process.cwd(), targetDir),
      source: 'github_main'
    });
    
    return true;
    
  } catch (error) {
    console.log(chalk.red(`❌ Error installing prompt: ${error.message}`));
    return false;
  }
}

async function installIndividualMCP(mcpName, targetDir, options) {
  console.log(chalk.blue(`🔌 Installing MCP: ${mcpName}`));
  
  try {
    // Support both category/mcp-name and direct mcp-name formats
    let githubUrl;
    if (mcpName.includes('/')) {
      // Category/mcp format: database/mysql-integration
      githubUrl = `https://raw.githubusercontent.com/StudentCristian/copilot-learning-templates/main/cli-tool/components/mcps/${mcpName}.json`;
    } else {
      // Direct mcp format: web-fetch
      githubUrl = `https://raw.githubusercontent.com/StudentCristian/copilot-learning-templates/main/cli-tool/components/mcps/${mcpName}.json`;
    }
    
    console.log(chalk.gray(`📥 Downloading from GitHub (main branch)...`));
    
    const response = await fetch(githubUrl);
    if (!response.ok) {
      if (response.status === 404) {
        console.log(chalk.red(`❌ MCP "${mcpName}" not found`));
        console.log(chalk.yellow('Available MCPs: web-fetch, filesystem-access, github-integration, memory-integration, mysql-integration, postgresql-integration, deepgraph-react, deepgraph-nextjs, deepgraph-typescript, deepgraph-vue'));
        return;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const mcpConfigText = await response.text();
    const mcpConfig = JSON.parse(mcpConfigText);

    // Remove description field from each MCP server before merging
    if (mcpConfig.mcpServers) {
      for (const serverName in mcpConfig.mcpServers) {
        if (mcpConfig.mcpServers[serverName] && typeof mcpConfig.mcpServers[serverName] === 'object') {
          delete mcpConfig.mcpServers[serverName].description;
        }
      }
    }
    
    // Check if .mcp.json exists in target directory
    const targetMcpFile = path.join(targetDir, '.mcp.json');
    let existingConfig = {};
    
    if (await fs.pathExists(targetMcpFile)) {
      existingConfig = await fs.readJson(targetMcpFile);
      console.log(chalk.yellow('📝 Existing .mcp.json found, merging configurations...'));
    }
    
    // Merge configurations with deep merge for mcpServers
    const mergedConfig = {
      ...existingConfig,
      ...mcpConfig
    };
    
    // Deep merge mcpServers specifically to avoid overwriting existing servers
    if (existingConfig.mcpServers && mcpConfig.mcpServers) {
      mergedConfig.mcpServers = {
        ...existingConfig.mcpServers,
        ...mcpConfig.mcpServers
      };
    }
    
    // Write the merged configuration
    await fs.writeJson(targetMcpFile, mergedConfig, { spaces: 2 });
    
    if (!options.silent) {
      console.log(chalk.green(`✅ MCP "${mcpName}" installed successfully!`));
      console.log(chalk.cyan(`📁 Configuration merged into: ${path.relative(targetDir, targetMcpFile)}`));
      console.log(chalk.cyan(`📦 Downloaded from: ${githubUrl}`));
    }
    
    // Track successful MCP installation
    trackingService.trackDownload('mcp', mcpName, {
      installation_type: 'individual_mcp',
      merged_with_existing: existingConfig !== null,
      servers_count: Object.keys(mergedConfig.mcpServers || {}).length,
      source: 'github_main'
    });
    
    return true;
    
  } catch (error) {
    console.log(chalk.red(`❌ Error installing MCP: ${error.message}`));
    return false;
  }
}

// Helper functions to extract language/framework from agent content
function extractLanguageFromAgent(content, agentName) {
  // Try to determine language from agent content or filename
  if (agentName.includes('react') || content.includes('React')) return 'javascript-typescript';
  if (agentName.includes('django') || content.includes('Django')) return 'python';
  if (agentName.includes('fastapi') || content.includes('FastAPI')) return 'python';
  if (agentName.includes('flask') || content.includes('Flask')) return 'python';
  if (agentName.includes('rails') || content.includes('Rails')) return 'ruby';
  if (agentName.includes('api-security') || content.includes('API security')) return 'javascript-typescript';
  if (agentName.includes('database') || content.includes('database')) return 'javascript-typescript';
  
  // Default to javascript-typescript for general agents
  return 'javascript-typescript';
}

function extractFrameworkFromAgent(content, agentName) {
  // Try to determine framework from agent content or filename
  if (agentName.includes('react') || content.includes('React')) return 'react';
  if (agentName.includes('django') || content.includes('Django')) return 'django';
  if (agentName.includes('fastapi') || content.includes('FastAPI')) return 'fastapi';
  if (agentName.includes('flask') || content.includes('Flask')) return 'flask';
  if (agentName.includes('rails') || content.includes('Rails')) return 'rails';
  
  // For general agents, return none to install the base template
  return 'none';
}

/**
 * Fetch available agents dynamically from GitHub repository
 */
async function getAvailableAgentsFromGitHub() {
  try {
    // First try to use local components.json file which has all agents cached
    const fs = require('fs');
    const path = require('path');
    const componentsPath = path.join(__dirname, '../../docs/components.json');
    
    if (fs.existsSync(componentsPath)) {
      const componentsData = JSON.parse(fs.readFileSync(componentsPath, 'utf8'));
      
      if (componentsData.agents && Array.isArray(componentsData.agents)) {
        const agents = [];
        
        for (const agent of componentsData.agents) {
          // Extract category from path
          const pathParts = agent.path.split('/');
          const category = pathParts.length > 1 ? pathParts[0] : 'root';
          const name = pathParts[pathParts.length - 1];
          
          agents.push({
            name: name,
            path: agent.path,
            category: category
          });
        }
        
        console.log(chalk.green(`✅ Loaded ${agents.length} agents from local cache`));
        return agents;
      }
    }
    
    // Fallback to educopilot.com API if local file not found
    try {
      // Try educopilot.com API first
      const apiResponse = await fetch('https://educopilot.com/api/agents.json');
      if (apiResponse.ok) {
        const apiData = await apiResponse.json();
        
        if (apiData.agents && Array.isArray(apiData.agents)) {
          console.log(chalk.green(`✅ Loaded ${apiData.agents.length} agents from educopilot.com API`));
          return apiData.agents;
        }
      }
    } catch (apiError) {
      console.warn('Could not fetch from educopilot.com, trying GitHub API...');
    }
    
    // If educopilot.com API fails, try GitHub API as secondary fallback
    console.log(chalk.yellow('⚠️  Falling back to GitHub API...'));
    const response = await fetch('https://api.github.com/repos/StudentCristian/copilot-learning-templates/contents/cli-tool/components/agents');
    if (!response.ok) {
      // Check for rate limit error
      if (response.status === 403) {
        const responseText = await response.text();
        if (responseText.includes('rate limit')) {
          console.log(chalk.red('❌ GitHub API rate limit exceeded'));
          console.log(chalk.yellow('💡 Install locally with: npm install -g copilot-learning-templates'));
          
          // Return comprehensive fallback list
          return [
            { name: 'python-basics-tutor', path: 'beginner-tutors/python-basics-tutor', category: 'beginner-tutors' },
            { name: 'javascript-basics-tutor', path: 'beginner-tutors/javascript-basics-tutor', category: 'beginner-tutors' },
            { name: 'html-css-tutor', path: 'beginner-tutors/html-css-tutor', category: 'beginner-tutors' },
            { name: 'git-basics-tutor', path: 'beginner-tutors/git-basics-tutor', category: 'beginner-tutors' },
            { name: 'code-reviewer', path: 'learning-support/code-reviewer', category: 'learning-support' },
            { name: 'debugging-helper', path: 'learning-support/debugging-helper', category: 'learning-support' },
            { name: 'project-guide', path: 'learning-support/project-guide', category: 'learning-support' }
          ];
        }
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    const contents = await response.json();
    const agents = [];
    
    for (const item of contents) {
      if (item.type === 'file' && item.name.endsWith('.md')) {
        // Direct agent file
        agents.push({
          name: item.name.replace('.md', ''),
          path: item.name.replace('.md', ''),
          category: 'root'
        });
      } else if (item.type === 'dir') {
        // Category directory, fetch its contents
        try {
          const categoryResponse = await fetch(`https://api.github.com/repos/StudentCristian/copilot-learning-templates/contents/cli-tool/components/agents/${item.name}`);
          if (categoryResponse.ok) {
            const categoryContents = await categoryResponse.json();
            for (const categoryItem of categoryContents) {
              if (categoryItem.type === 'file' && categoryItem.name.endsWith('.md')) {
                agents.push({
                  name: categoryItem.name.replace('.md', ''),
                  path: `${item.name}/${categoryItem.name.replace('.md', '')}`,
                  category: item.name
                });
              }
            }
          }
        } catch (error) {
          console.warn(`Warning: Could not fetch category ${item.name}:`, error.message);
        }
      }
    }
    
    return agents;
  } catch (error) {
    console.warn('Warning: Could not fetch agents, using fallback list');
    // Comprehensive fallback list if all methods fail
    return [
      { name: 'frontend-developer', path: 'development-team/frontend-developer', category: 'development-team' },
      { name: 'backend-developer', path: 'development-team/backend-developer', category: 'development-team' },
      { name: 'fullstack-developer', path: 'development-team/fullstack-developer', category: 'development-team' },
      { name: 'api-security-audit', path: 'api-security-audit', category: 'root' },
      { name: 'database-optimization', path: 'database-optimization', category: 'root' },
      { name: 'react-performance-optimization', path: 'react-performance-optimization', category: 'root' }
    ];
  }
}

async function installIndividualSkill(skillName, targetDir, options) {
  console.log(chalk.blue(`💡 Installing skill: ${skillName}`));

  try {
    // Skills can be in format: "skill-name" or "category/skill-name"
    // Extract the actual skill name (last part of the path)
    const skillBaseName = skillName.includes('/') ? skillName.split('/').pop() : skillName;

    // Use GitHub API to download ALL files and directories for the skill
    const githubApiUrl = `https://api.github.com/repos/StudentCristian/copilot-learning-templates/contents/cli-tool/components/skills/${skillName}`;

    console.log(chalk.gray(`📥 Downloading skill from GitHub (main branch)...`));

    const downloadedFiles = {};

    // Recursive function to download all files and directories
    async function downloadDirectory(apiUrl, relativePath = '') {
      try {
        const response = await fetch(apiUrl, {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'copilot-learning-templates'
          }
        });

        if (!response.ok) {
          if (response.status === 404) {
            console.log(chalk.red(`❌ Skill "${skillName}" not found`));
            console.log(chalk.yellow('💡 Tip: Use format "category/skill-name" (e.g., creative-design/algorithmic-art)'));
            console.log(chalk.yellow('Available categories: creative-design, development, document-processing, enterprise-communication'));
            return false;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contents = await response.json();

        for (const item of contents) {
          const itemPath = relativePath ? `${relativePath}/${item.name}` : item.name;

          if (item.type === 'file') {
            // Download file
            try {
              const fileResponse = await fetch(item.download_url);
              if (fileResponse.ok) {
                const fileContent = await fileResponse.text();
                const isExecutable = item.name.endsWith('.py') || item.name.endsWith('.sh');

                const targetPath = `.github/skills/${skillBaseName}/${itemPath}`;
                downloadedFiles[targetPath] = {
                  content: fileContent,
                  executable: isExecutable
                };
                console.log(chalk.green(`✓ Downloaded: ${itemPath}`));
              }
            } catch (err) {
              console.log(chalk.gray(`  (Could not download ${itemPath})`));
            }
          } else if (item.type === 'dir') {
            // Recursively download directory contents
            console.log(chalk.gray(`📂 Downloading directory: ${itemPath}/`));
            await downloadDirectory(item.url, itemPath);
          }
        }

        return true;
      } catch (error) {
        console.log(chalk.gray(`  (Could not access GitHub API: ${error.message})`));
        return false;
      }
    }

    // Download all files from the skill directory
    const success = await downloadDirectory(githubApiUrl);
    if (!success) {
      return false;
    }

    // Check if SKILL.md was downloaded (required)
    const skillMdPath = `.github/skills/${skillBaseName}/SKILL.md`;
    if (!downloadedFiles[skillMdPath]) {
      console.log(chalk.red(`❌ SKILL.md not found in skill directory`));
      return false;
    }

    // Create .github/skills/skill-name directory
    const skillsDir = path.join(targetDir, '.github', 'skills');
    await fs.ensureDir(skillsDir);

    // Write all downloaded files
    for (const [filePath, fileData] of Object.entries(downloadedFiles)) {
      const fullPath = path.join(targetDir, filePath);
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, fileData.content, 'utf8');

      if (fileData.executable) {
        await fs.chmod(fullPath, '755');
      }
    }

    const targetFile = path.join(skillsDir, skillBaseName, 'SKILL.md');

    if (!options.silent) {
      console.log(chalk.green(`✅ Skill "${skillName}" installed successfully!`));
      console.log(chalk.cyan(`📁 Installed to: ${path.relative(targetDir, targetFile)}`));
      console.log(chalk.cyan(`📄 Total files downloaded: ${Object.keys(downloadedFiles).length}`));
      console.log(chalk.cyan(`📦 Downloaded from: ${githubApiUrl}`));
    }

    // Track successful skill installation
    trackingService.trackDownload('skill', skillName, {
      installation_type: 'individual_skill',
      target_directory: path.relative(process.cwd(), targetDir),
      source: 'github_main',
      total_files: Object.keys(downloadedFiles).length
    });

    return true;

  } catch (error) {
    console.log(chalk.red(`❌ Error installing skill: ${error.message}`));
    return false;
  }
}

/**
 * Install multiple components with optional YAML workflow
 */
async function installMultipleComponents(options, targetDir) {
  console.log(chalk.blue('🔧 Installing multiple components...'));
  
  try {
    const components = {
      agents: [],
      mcps: [],
      skills: [],
      instructions: [],
      prompts: []
    };
    
    // Parse comma-separated values for each component type
    if (options.agent) {
      const agentsInput = Array.isArray(options.agent) ? options.agent.join(',') : options.agent;
      components.agents = agentsInput.split(',').map(a => a.trim()).filter(a => a);
    }
    
    if (options.mcp) {
      const mcpsInput = Array.isArray(options.mcp) ? options.mcp.join(',') : options.mcp;
      components.mcps = mcpsInput.split(',').map(m => m.trim()).filter(m => m);
    }

    if (options.skill) {
      const skillsInput = Array.isArray(options.skill) ? options.skill.join(',') : options.skill;
      components.skills = skillsInput.split(',').map(s => s.trim()).filter(s => s);
    }

    if (options.instruction) {
      const instructionsInput = Array.isArray(options.instruction) ? options.instruction.join(',') : options.instruction;
      components.instructions = instructionsInput.split(',').map(i => i.trim()).filter(i => i);
    }

    if (options.prompt) {
      const promptsInput = Array.isArray(options.prompt) ? options.prompt.join(',') : options.prompt;
      components.prompts = promptsInput.split(',').map(p => p.trim()).filter(p => p);
    }

    const totalComponents = components.agents.length + components.mcps.length + components.skills.length + components.instructions.length + components.prompts.length;
    
    if (totalComponents === 0) {
      console.log(chalk.yellow('⚠️  No components specified to install.'));
      return;
    }
    
    console.log(chalk.cyan(`📦 Installing ${totalComponents} components:`));
    console.log(chalk.gray(`   Agents: ${components.agents.length}`));
    console.log(chalk.gray(`   Skills: ${components.skills.length}`));
    console.log(chalk.gray(`   MCPs: ${components.mcps.length}`));
    console.log(chalk.gray(`   Instructions: ${components.instructions.length}`));
    console.log(chalk.gray(`   Prompts: ${components.prompts.length}`));
    
    // Counter for successfully installed components
    let successfullyInstalled = 0;
    
    // Install agents
    for (const agent of components.agents) {
      console.log(chalk.gray(`   Installing agent: ${agent}`));
      const agentSuccess = await installIndividualAgent(agent, targetDir, { ...options, silent: true });
      if (agentSuccess) successfullyInstalled++;
    }
    
    // Install MCPs
    for (const mcp of components.mcps) {
      console.log(chalk.gray(`   Installing MCP: ${mcp}`));
      const mcpSuccess = await installIndividualMCP(mcp, targetDir, { ...options, silent: true });
      if (mcpSuccess) successfullyInstalled++;
    }

    // Install skills
    for (const skill of components.skills) {
      console.log(chalk.gray(`   Installing skill: ${skill}`));
      const skillSuccess = await installIndividualSkill(skill, targetDir, { ...options, silent: true });
      if (skillSuccess) successfullyInstalled++;
    }

    // Install instructions
    for (const instruction of components.instructions) {
      console.log(chalk.gray(`   Installing instruction: ${instruction}`));
      const instructionSuccess = await installInstruction(instruction, targetDir, { ...options, silent: true });
      if (instructionSuccess) successfullyInstalled++;
    }

    // Install prompts
    for (const prompt of components.prompts) {
      console.log(chalk.gray(`   Installing prompt: ${prompt}`));
      const promptSuccess = await installIndividualPrompt(prompt, targetDir, { ...options, silent: true });
      if (promptSuccess) successfullyInstalled++;
    }
    
    if (successfullyInstalled === totalComponents) {
      console.log(chalk.green(`\n✅ Successfully installed ${successfullyInstalled} components!`));
    } else if (successfullyInstalled > 0) {
      console.log(chalk.yellow(`\n⚠️  Successfully installed ${successfullyInstalled} of ${totalComponents} components.`));
      console.log(chalk.red(`❌ ${totalComponents - successfullyInstalled} component(s) failed to install.`));
    } else {
      console.log(chalk.red(`\n❌ No components were installed successfully.`));
      return; // Exit early if nothing was installed
    }
    console.log(chalk.cyan(`📁 Components installed to: .github/`));
    
    // Note: Individual components are already tracked separately in their installation functions
    
  } catch (error) {
    console.log(chalk.red(`❌ Error installing components: ${error.message}`));
  }
}

/**
 * Show available agents organized by category
 */
async function showAvailableAgents() {
  console.log(chalk.yellow('\n📋 Available Agents:'));
  console.log(chalk.gray('Use format: category/agent-name or just agent-name for root level\n'));
  console.log(chalk.gray('⏳ Fetching latest agents from GitHub...\n'));
  
  const agents = await getAvailableAgentsFromGitHub();
  
  // Group agents by category
  const groupedAgents = agents.reduce((acc, agent) => {
    const category = agent.category === 'root' ? '🤖 General Agents' : `📁 ${agent.category}`;
    if (!acc[category]) acc[category] = [];
    acc[category].push(agent);
    return acc;
  }, {});
  
  // Display agents by category
  Object.entries(groupedAgents).forEach(([category, categoryAgents]) => {
    console.log(chalk.cyan(category));
    categoryAgents.forEach(agent => {
      console.log(chalk.gray(`  • ${agent.path}`));
    });
    console.log('');
  });
  
  console.log(chalk.blue('Examples:'));
  console.log(chalk.gray('  cct --agent beginner-tutors/python-basics-tutor'));
  console.log(chalk.gray('  cct --agent beginner-tutors/python-basics-tutor --yes'));
  console.log('');
}

/**
 * Install a custom instruction file to .github/instructions/
 */
async function installInstruction(instructionName, targetDir, options) {
  console.log(chalk.blue(`📋 Installing instruction: ${instructionName}`));

  try {
    // Support both category/instruction-name and direct instruction-name formats
    let githubUrl;
    if (instructionName.includes('/')) {
      githubUrl = `https://raw.githubusercontent.com/StudentCristian/copilot-learning-templates/main/cli-tool/components/instructions/${instructionName}.instructions.md`;
    } else {
      githubUrl = `https://raw.githubusercontent.com/StudentCristian/copilot-learning-templates/main/cli-tool/components/instructions/${instructionName}.instructions.md`;
    }

    console.log(chalk.gray(`📥 Downloading from GitHub (main branch)...`));

    const response = await fetch(githubUrl);
    if (!response.ok) {
      if (response.status === 404) {
        console.log(chalk.red(`❌ Instruction "${instructionName}" not found`));
        console.log(chalk.yellow('Available instructions: always-on/beginner-friendly'));
        return false;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const instructionContent = await response.text();

    // Create .github/instructions directory if it doesn't exist
    const instructionsDir = path.join(targetDir, '.github', 'instructions');
    await fs.ensureDir(instructionsDir);

    // Write the instruction file
    let fileName;
    if (instructionName.includes('/')) {
      const parts = instructionName.split('/');
      fileName = parts[parts.length - 1];
    } else {
      fileName = instructionName;
    }

    const targetFile = path.join(instructionsDir, `${fileName}.instructions.md`);
    await fs.writeFile(targetFile, instructionContent, 'utf8');

    if (!options.silent) {
      console.log(chalk.green(`✅ Instruction "${instructionName}" installed successfully!`));
      console.log(chalk.cyan(`📁 Installed to: ${path.relative(targetDir, targetFile)}`));
      console.log(chalk.cyan(`📦 Downloaded from: ${githubUrl}`));
    }

    // Track successful instruction installation
    trackingService.trackDownload('instruction', instructionName, {
      installation_type: 'individual_instruction',
      target_directory: path.relative(process.cwd(), targetDir),
      source: 'github_main'
    });

    return true;

  } catch (error) {
    console.log(chalk.red(`❌ Error installing instruction: ${error.message}`));
    return false;
  }
}

/**
 * Install a prompt file to .github/prompts/
 */
async function installPromptFile(promptName, targetDir, options) {
  // Delegate to installIndividualPrompt
  return await installIndividualPrompt(promptName, targetDir, options);
}

/**
 * Install a complete learning path (a set of agents, skills, instructions, and prompts)
 */
async function installLearningPath(pathName, targetDir, options) {
  console.log(chalk.blue(`🎓 Installing learning path: ${pathName}`));

  try {
    // Fetch learning path manifest from GitHub
    const githubUrl = `https://raw.githubusercontent.com/StudentCristian/copilot-learning-templates/main/cli-tool/components/learning-paths/${pathName}.json`;

    console.log(chalk.gray(`📥 Downloading learning path manifest...`));

    const response = await fetch(githubUrl);
    if (!response.ok) {
      if (response.status === 404) {
        console.log(chalk.red(`❌ Learning path "${pathName}" not found`));
        console.log(chalk.yellow('Available learning paths: python-beginner'));
        return;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const pathManifest = await response.json();

    console.log(chalk.green(`✅ Learning path found: ${pathManifest.name || pathName}`));
    console.log(chalk.cyan(`📝 Description: ${pathManifest.description || 'No description'}`));
    console.log(chalk.cyan(`📊 Level: ${pathManifest.level || 'beginner'}`));

    let successfullyInstalled = 0;
    let totalComponents = 0;

    // Install agents from the learning path
    if (pathManifest.agents && pathManifest.agents.length > 0) {
      totalComponents += pathManifest.agents.length;
      for (const agent of pathManifest.agents) {
        console.log(chalk.gray(`   Installing agent: ${agent}`));
        const success = await installIndividualAgent(agent, targetDir, { ...options, silent: true });
        if (success) successfullyInstalled++;
      }
    }

    // Install skills from the learning path
    if (pathManifest.skills && pathManifest.skills.length > 0) {
      totalComponents += pathManifest.skills.length;
      for (const skill of pathManifest.skills) {
        console.log(chalk.gray(`   Installing skill: ${skill}`));
        const success = await installIndividualSkill(skill, targetDir, { ...options, silent: true });
        if (success) successfullyInstalled++;
      }
    }

    // Install instructions from the learning path
    if (pathManifest.instructions && pathManifest.instructions.length > 0) {
      totalComponents += pathManifest.instructions.length;
      for (const instruction of pathManifest.instructions) {
        console.log(chalk.gray(`   Installing instruction: ${instruction}`));
        const success = await installInstruction(instruction, targetDir, { ...options, silent: true });
        if (success) successfullyInstalled++;
      }
    }

    // Install prompts from the learning path
    if (pathManifest.prompts && pathManifest.prompts.length > 0) {
      totalComponents += pathManifest.prompts.length;
      for (const prompt of pathManifest.prompts) {
        console.log(chalk.gray(`   Installing prompt: ${prompt}`));
        const success = await installIndividualPrompt(prompt, targetDir, { ...options, silent: true });
        if (success) successfullyInstalled++;
      }
    }

    if (successfullyInstalled === totalComponents) {
      console.log(chalk.green(`\n🎉 Learning path "${pathName}" installed successfully! (${successfullyInstalled} components)`));
    } else if (successfullyInstalled > 0) {
      console.log(chalk.yellow(`\n⚠️  Learning path partially installed: ${successfullyInstalled} of ${totalComponents} components.`));
    } else {
      console.log(chalk.red(`\n❌ Learning path installation failed.`));
    }

    console.log(chalk.cyan(`📁 Components installed to: .github/`));
    console.log(chalk.blue(`🌐 View learning paths at: https://educopilot.com/learning-paths`));

    // Track successful learning path installation
    trackingService.trackDownload('learning-path', pathName, {
      installation_type: 'learning_path',
      target_directory: path.relative(process.cwd(), targetDir),
      components_installed: successfullyInstalled,
      total_components: totalComponents,
      source: 'github_main'
    });

  } catch (error) {
    console.log(chalk.red(`❌ Error installing learning path: ${error.message}`));
  }
}

module.exports = { createCopilotConfig, showMainMenu };
