# Descripción del Proyecto: Copilot Learning Templates

## Contexto General

Estás adaptando el proyecto **`claude-code-templates`** (originalmente diseñado para Claude Code de Anthropic) para crear **`copilot-learning-templates`**, una herramienta educativa enfocada en **estudiantes principiantes** que usan **VS Code con GitHub Copilot**. [16-cite-0](#16-cite-0) 

## Objetivo del Proyecto

Crear un **sistema de distribución de componentes educativos** que permita a estudiantes de programación instalar y configurar:

1. **Custom agents** (`.agent.md`) - Tutores de IA especializados por nivel
2. **Agent skills** - Habilidades modulares de programación
3. **Custom instructions** - Instrucciones personalizadas para GitHub Copilot
4. **Prompt files** - Comandos reutilizables para tareas comunes
5. **MCP servers** - Integraciones con servicios externos

## Arquitectura Replicada (Costo Cero)

Mantienes la misma arquitectura de `claude-code-templates`: [16-cite-1](#16-cite-1) 

- **GitHub como backend**: Los componentes se sirven desde tu repositorio público
- **npm como distribuidor**: CLI instalable con `npx copilot-learning-templates`
- **Vercel para sitio web**: Catálogo visual de componentes (adaptado de aitmpl.com)
- **Supabase/Neon**: Tracking de descargas y analytics
- **GitHub Actions**: Despliegue automático al fusionar PRs

## Cambios Clave Aplicados

### Fase 1 (Completada): Limpieza
- Fork del repositorio original
- Eliminación de componentes específicos de Claude: `commands/`, `hooks/`, `settings/`, `sandbox/`
- Actualización de `package.json` con nuevo nombre

### Fase 2 (Completada): Adaptación del CLI
**Archivo**: `cli-tool/bin/create-copilot-config.js` [16-cite-2](#16-cite-2) 

Cambios realizados:
- Renombrado de función: `createClaudeConfig` → `createCopilotConfig`
- Actualización de branding: "Copilot Learning Templates"
- Eliminación de opciones de Claude: `--command`, `--hook`, `--setting`, `--analytics`, `--chats`, `--studio`, `--sandbox`
- Agregado de opciones educativas: `--instruction`, `--prompt`, `--learning-path`, `--level`

### Fase 3 (Siguiente): Componentes Educativos
Crear estructura de componentes en `cli-tool/components/`:
- `agents/beginner-tutors/` - Agentes para principiantes
- `skills/programming-basics/` - Skills fundamentales
- `instructions/always-on/` - Instrucciones globales
- `prompts/learning/` - Prompts educativos

## Diferencias vs Claude Code Templates

| Aspecto | Claude Code Templates | Copilot Learning Templates |
|---------|----------------------|---------------------------|
| **Plataforma** | Claude Code (Anthropic) | VS Code + GitHub Copilot |
| **Público** | Desarrolladores experimentados | Estudiantes principiantes |
| **Directorio instalación** | `.claude/` | `.github/` |
| **Formato agentes** | `.md` con `model: sonnet` | `.agent.md` con `target: github-copilot` |
| **Componentes** | Agents, Commands, Hooks, Settings, MCPs, Skills | Agents, Skills, Prompts, Instructions, MCPs |
| **Categorización** | Por dominio técnico | Por nivel educativo (beginner, intermediate, advanced) |

## Próximos Pasos

**Fase actual**: Adaptar `cli-tool/src/index.js` [16-cite-3](#16-cite-3) 

Cambios pendientes:
1. Renombrar función principal: `createClaudeConfig` → `createCopilotConfig`
2. Eliminar handlers de componentes no soportados (commands, hooks, analytics dashboards)
3. Agregar handlers para nuevos componentes (instructions, prompts, learning-paths)
4. Actualizar URLs de GitHub: `davila7/claude-code-templates` → `StudentCristian/copilot-learning-templates`
5. Cambiar rutas de instalación: `.claude/` → `.github/`
6. Adaptar formato de archivos: `.md` → `.agent.md` con `target: github-copilot`

## Componentes Reutilizables

**Mantener sin cambios**: [16-cite-4](#16-cite-4) 
- `cli-tool/src/utils.js` - Utilidades generales
- `cli-tool/src/file-operations.js` - Operaciones de archivos
- `cli-tool/src/tracking-service.js` - Tracking de analytics
- Sistema de gestión de agentes globales
- Lógica de descarga desde GitHub con retry

**Eliminar completamente**:
- Dashboards de analytics (`analytics.js`, `chats-mobile.js`)
- Stats de componentes (`command-stats.js`, `hook-stats.js`)
- Sistema de sandbox (`sandbox-server.js`)
- Templates específicos de Claude (`cli-tool/templates/`)

## Resultado Final

Un CLI educativo que permite a estudiantes ejecutar:
```bash
npx copilot-learning-templates --agent beginner-tutors/python-basics-tutor --yes
npx copilot-learning-templates --skill programming-basics/python-fundamentals --yes
npx copilot-learning-templates --learning-path python-beginner --yes
```

Y obtener componentes instalados en `.github/` listos para usar con GitHub Copilot en VS Code.

Wiki pages you might want to explore:
- [Overview (StudentCristian/claude-code-templates)](/wiki/StudentCristian/claude-code-templates#1)

### Citations

**File:** README.md (L49-51)
```markdown
# Claude Code Templates ([aitmpl.com](https://aitmpl.com))

**Ready-to-use configurations for Anthropic's Claude Code.** A comprehensive collection of AI agents, custom commands, settings, hooks, external integrations (MCPs), and project templates to enhance your development workflow.
```

**File:** cli-tool/README.md (L1-90)
```markdown
[![npm version](https://img.shields.io/npm/v/claude-code-templates.svg)](https://www.npmjs.com/package/claude-code-templates)
[![npm downloads](https://img.shields.io/npm/dt/claude-code-templates.svg)](https://www.npmjs.com/package/claude-code-templates)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Open Source](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://opensource.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/davila7/claude-code-templates/blob/main/CONTRIBUTING.md)
[![GitHub stars](https://img.shields.io/github/stars/davila7/claude-code-templates.svg?style=social&label=Star)](https://github.com/davila7/claude-code-templates)

# Claude Code Templates

**CLI tool for configuring and monitoring Claude Code** - Quick setup for any project with framework-specific commands and real-time monitoring dashboard.

## 🚀 Quick Start

```bash
# Interactive setup (recommended)
npx claude-code-templates@latest

# Real-time analytics dashboard
npx claude-code-templates@latest --analytics

# System health check
npx claude-code-templates@latest --health-check
```

## ✨ Core Features

- **📋 Smart Project Setup** - Auto-detect and configure any project with framework-specific commands
- **📊 Real-time Analytics** - Monitor Claude Code sessions with live state detection and performance metrics
- **🔍 Health Check** - Comprehensive system validation with actionable recommendations
- **🧩 Individual Components** - Install specialized agents, commands, and MCPs individually
- **🌍 Global Agents** - Create AI agents accessible from anywhere using Claude Code SDK

## 🎯 What You Get

| Component | Description | Example |
|-----------|-------------|---------|
| **CLAUDE.md** | Project-specific Claude Code configuration | Framework best practices, coding standards |
| **Commands** | Custom slash commands for development tasks | `/generate-tests`, `/check-file`, `/optimize-bundle` |
| **Agents** | AI specialists for specific domains | API security audit, React performance, database optimization |
| **MCPs** | External service integrations | GitHub, databases, development tools |
| **Skills** | Modular capabilities with progressive disclosure | PDF processing, algorithmic art, MCP builder |
| **Analytics** | Real-time monitoring dashboard | Live session tracking, usage statistics, exports |

## 🛠️ Supported Technologies

| Language | Frameworks | Status |
|----------|------------|---------|
| **JavaScript/TypeScript** | React, Vue, Angular, Node.js | ✅ Ready |
| **Python** | Django, Flask, FastAPI | ✅ Ready |
| **Common** | Universal configurations | ✅ Ready |
| **Go** | Gin, Echo, Fiber | 🚧 Coming Soon |
| **Rust** | Axum, Warp, Actix | 🚧 Coming Soon |

## 🌍 Global Agents (Claude Code SDK Integration)

Create AI agents that can be executed from anywhere using the Claude Code SDK:

```bash
# Create a global agent (one-time setup)
npx claude-code-templates@latest --create-agent customer-support

# Use the agent from anywhere
customer-support "Help me with ticket #12345"
sre-logs "Analyze error patterns in app.log"  
code-reviewer "Review this PR for security issues"
```

### Available Global Agents

| Agent | Usage | Description |
|-------|-------|-------------|
| `customer-support` | `customer-support "query"` | AI customer support specialist |
| `api-security-audit` | `api-security-audit "analyze endpoints"` | Security auditing for APIs |
| `react-performance-optimization` | `react-performance-optimization "optimize components"` | React performance expert |
| `database-optimization` | `database-optimization "improve queries"` | Database performance tuning |

### Global Agent Management

```bash
# List installed global agents
npx claude-code-templates@latest --list-agents

# Update an agent to latest version
npx claude-code-templates@latest --update-agent customer-support

# Remove an agent
npx claude-code-templates@latest --remove-agent customer-support
```

### How It Works
```

**File:** cli-tool/bin/create-claude-config.js (L44-101)
```javascript
program
  .name('create-claude-config')
  .description('Setup Claude Code configurations and create global AI agents powered by Claude Code SDK')
  .version(require('../package.json').version)
  .option('-l, --language <language>', 'specify programming language (deprecated, use --template)')
  .option('-f, --framework <framework>', 'specify framework (deprecated, use --template)')
  .option('-t, --template <template>', 'specify template (e.g., common, javascript-typescript, python, ruby)')
  .option('-d, --directory <directory>', 'target directory (default: current directory)')
  .option('-y, --yes', 'skip prompts and use defaults')
  .option('--dry-run', 'show what would be copied without actually copying')
  .option('--command-stats, --commands-stats', 'analyze existing Claude Code commands and offer optimization')
  .option('--hook-stats, --hooks-stats', 'analyze existing automation hooks and offer optimization')
  .option('--mcp-stats, --mcps-stats', 'analyze existing MCP server configurations and offer optimization')
  .option('--analytics', 'launch real-time Claude Code analytics dashboard')
  .option('--chats', 'launch mobile-first chats interface (AI-optimized for mobile devices)')
  .option('--agents', 'launch Claude Code agents dashboard (opens directly to conversations)')
  .option('--chats-mobile', 'launch mobile-first chats interface (AI-optimized for mobile devices)')
  .option('--plugins', 'launch Plugin Dashboard to view marketplaces, installed plugins, and permissions')
  .option('--skills-manager', 'launch Skills Dashboard to view and explore installed Claude Code Skills')
  .option('--2025', 'launch 2025 Year in Review dashboard (showcase your Claude Code usage statistics)')
  .option('--tunnel', 'enable Cloudflare Tunnel for remote access (use with --analytics or --chats)')
  .option('--verbose', 'enable verbose logging for debugging and development')
  .option('--health-check, --health, --check, --verify', 'run comprehensive health check to verify Claude Code setup')
  .option('--agent <agent>', 'install specific agent component (supports comma-separated values)')
  .option('--command <command>', 'install specific command component (supports comma-separated values)')
  .option('--mcp <mcp>', 'install specific MCP component (supports comma-separated values)')
  .option('--setting <setting>', 'install specific setting component (supports comma-separated values)')
  .option('--hook <hook>', 'install specific hook component (supports comma-separated values)')
  .option('--skill <skill>', 'install specific skill component (supports comma-separated values)')
  .option('--workflow <workflow>', 'install workflow from hash (#hash) OR workflow YAML (base64 encoded) when used with --agent/--command/--mcp')
  .option('--prompt <prompt>', 'execute the provided prompt in Claude Code after installation or in sandbox')
  .option('--create-agent <agent>', 'create a global agent accessible from anywhere (e.g., customer-support)')
  .option('--list-agents', 'list all installed global agents')
  .option('--remove-agent <agent>', 'remove a global agent')
  .option('--update-agent <agent>', 'update a global agent to the latest version')
  .option('--studio', 'launch Claude Code Studio interface for local and cloud execution')
  .option('--sandbox <provider>', 'execute Claude Code in isolated sandbox environment (e.g., e2b)')
  .option('--e2b-api-key <key>', 'E2B API key for sandbox execution (alternative to environment variable)')
  .option('--anthropic-api-key <key>', 'Anthropic API key for Claude Code (alternative to environment variable)')
  .option('--clone-session <url>', 'download and import a shared Claude Code session from URL')
  .action(async (options) => {
    try {
      // Only show banner for non-agent-list commands
      const isQuietCommand = options.listAgents || 
                            options.removeAgent || 
                            options.updateAgent;
      
      if (!isQuietCommand) {
        showBanner();
      }
      
      await createClaudeConfig(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

```

**File:** cli-tool/package.json (L1-60)
```json
{
  "name": "claude-code-templates",
  "version": "1.28.13",
  "description": "CLI tool to setup Claude Code configurations with framework-specific commands, automation hooks and MCP Servers for your projects",
  "main": "src/index.js",
  "bin": {
    "create-claude-config": "bin/create-claude-config.js",
    "claude-code-templates": "bin/create-claude-config.js",
    "claude-code-template": "bin/create-claude-config.js",
    "claude-init": "bin/create-claude-config.js",
    "cctemplates": "bin/create-claude-config.js",
    "cct": "bin/create-claude-config.js",
    "claude-setup": "bin/create-claude-config.js",
    "claude-config": "bin/create-claude-config.js"
  },
  "scripts": {
    "start": "node bin/create-claude-config.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "jest tests/e2e",
    "test:analytics": "jest --testPathPattern=analytics",
    "test:commands": "./test-commands.sh",
    "test:detailed": "./test-detailed.sh",
    "test:react": "make test-react",
    "test:vue": "make test-vue",
    "test:node": "make test-node",
    "test:all": "npm run test:coverage && make test",
    "dev:link": "npm link",
    "dev:unlink": "npm unlink -g claude-code-templates",
    "pretest:commands": "npm run dev:link",
    "analytics:start": "node src/analytics.js",
    "analytics:test": "npm run test:analytics",
    "security-audit": "node src/security-audit.js",
    "security-audit:ci": "node src/security-audit.js --ci",
    "security-audit:verbose": "node src/security-audit.js --verbose",
    "security-audit:json": "node src/security-audit.js --json --output=security-report.json"
  },
  "keywords": [
    "claude",
    "claude-code",
    "ai",
    "configuration",
    "template",
    "setup",
    "cli",
    "hooks",
    "automation",
    "javascript",
    "typescript",
    "react",
    "vue",
    "angular",
    "nodejs",
    "python",
    "django",
    "flask",
    "fastapi",
```
