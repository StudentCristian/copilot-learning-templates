#!/usr/bin/env node  
  
const { program } = require('commander');  
const chalk = require('chalk');  
const boxen = require('boxen');  
const { createCopilotConfig } = require('../src/index'); 
  
const pkg = require('../package.json');  
  
const title = 'Copilot Learning Templates';  
const subtitle = 'Your learning companion for GitHub Copilot';  
  
const colorGradient = ['#EA580C', '#F97316', '#FB923C', '#FDBA74', '#FED7AA', '#FFEBD6'];  
  
function colorizeTitle(text) {  
  const chars = text.split('');  
  const steps = colorGradient.length;  
  return chars  
    .map((char, i) => {  
      const color = colorGradient[i % steps];  
      return chalk.hex(color)(char);  
    })  
    .join('');  
}  
  
function showBanner() {  
  console.clear();  
  console.log(chalk.hex('#F97316')('════════════════════════════════════════════════════════════════'));  
  console.log('\n');  
  console.log('       🎓 ' + colorizeTitle(title)); 
  console.log('\n');  
  console.log('       ' + chalk.hex('#FDBA74')(subtitle));  
  console.log('\n');  
  console.log(chalk.hex('#F97316')('════════════════════════════════════════════════════════════════\n'));  
  
  console.log(  
    chalk.hex('#D97706')('🚀 Setup GitHub Copilot for learning programming 🚀') + 
    chalk.gray(`\n                             v${pkg.version}\n\n`) +  
    chalk.blue('🌐 Components: ') + chalk.underline('https://savantmind.com') + '\n' + 
    chalk.blue('📖 Documentation: ') + chalk.underline('https://docs.savantmind.com') + '\n' 
  );  
}  
  
program  
  .name('create-copilot-config')  
  .description('Setup GitHub Copilot configurations for learning programming')  
  .version(require('../package.json').version)  
  // Opciones básicas (MANTENER)  
  .option('-d, --directory <directory>', 'target directory (default: current directory)')  
  .option('-y, --yes', 'skip prompts and use defaults')  
  .option('--dry-run', 'show what would be copied without actually copying')  
  .option('--verbose', 'enable verbose logging for debugging and development')  
  .option('--health-check, --health, --check, --verify', 'run comprehensive health check to verify GitHub Copilot setup')  
    
  // Opciones de componentes (ADAPTAR)  
  .option('--agent <agent>', 'install specific agent component (supports comma-separated values)')  
  .option('--skill <skill>', 'install specific skill component (supports comma-separated values)')  
  .option('--mcp <mcp>', 'install specific MCP component (supports comma-separated values)')  
    
  // Nuevas opciones para Copilot (AGREGAR)  
  .option('--instruction <instruction>', 'install custom instruction file (.github/instructions/)')  
  .option('--copilot-instructions <name>', 'install copilot-instructions.md template (always-on instructions)')  
  .option('--workspace-agents <file>', 'install AGENTS.md with workspace-wide agent definitions')  
  .option('--prompt <prompt>', 'install prompt file (slash command)')  
  .option('--learning-path <path>', 'install complete learning path')  
  .option('--level <level>', 'filter by level (beginner, intermediate, advanced)')  
    
  // Gestión de agentes globales (MANTENER - útil para estudiantes)  
  .option('--create-agent <agent>', 'create a global agent accessible from anywhere')  
  .option('--list-agents', 'list all installed global agents')  
  .option('--remove-agent <agent>', 'remove a global agent')  
  .option('--update-agent <agent>', 'update a global agent to the latest version')  
    
  .action(async (options) => {  
    try {  
      // Only show banner for non-agent-list commands  
      const isQuietCommand = options.listAgents ||   
                            options.removeAgent ||   
                            options.updateAgent;  
        
      if (!isQuietCommand) {  
        showBanner();  
      }  
        
      await createCopilotConfig(options);
    } catch (error) {  
      console.error(chalk.red('Error:'), error.message);  
      process.exit(1);  
    }  
  });  
  
program.parse(process.argv);