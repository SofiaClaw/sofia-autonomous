# SOFIA Autonomous 🤖

> An autonomous AI agent system inspired by Zoe - self-improving, task-orchestrating, and continuously learning.

## Features

### 🤖 Autonomous Agent System
- **Sub-agent spawning**: Spawns specialized agents via OpenClaw gateway
- **Task orchestration**: Auto-assigns tasks to best-suited agents
- **GitHub integration**: Reads/writes code, manages issues and PRs
- **Self-improvement**: Analyzes completed tasks to improve future performance

### 📊 Admin Dashboard (`/admin`)
- **Secure API key authentication**
- **Task queue management**: Create, cancel, monitor tasks
- **Agent status monitoring**: Real-time agent health and performance
- **Auto-deployment triggers**: Deploy to staging/production

### ⏰ Cron Jobs
- **Daily standup generation**: Automated progress reports
- **Proactive task suggestions**: AI-generated improvement tasks
- **Performance monitoring**: Health checks and alerting
- **GitHub sync**: Automatic issue-to-task conversion

## Quick Start

### Prerequisites
- Node.js 18+
- Convex account
- GitHub Personal Access Token
- OpenClaw Gateway access

### Installation

```bash
# Clone the repository
git clone https://github.com/SofiaClaw/sofia-autonomous.git
cd sofia-autonomous

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Start development server
npm run dev
```

### Environment Variables

```env
# Server
PORT=3000
ADMIN_API_KEY=your-secure-admin-key

# Convex
CONVEX_DEPLOYMENT=your-convex-deployment
CONVEX_ADMIN_KEY=your-convex-key

# GitHub
GITHUB_TOKEN=ghp_your_token
GITHUB_OWNER=SofiaClaw
GITHUB_REPO=second-brain

# OpenClaw
OPENCLAW_GATEWAY_URL=http://localhost:3001
OPENCLAW_API_KEY=your-openclaw-key
```

## API Reference

### Admin Endpoints

All admin endpoints require the `Authorization: Bearer <ADMIN_API_KEY>` header.

#### Stats
```bash
GET /admin/stats
```
Returns system-wide statistics.

#### Tasks
```bash
# List tasks
GET /admin/tasks?status=pending&limit=50

# Create task
POST /admin/tasks
{
  "title": "Implement feature X",
  "description": "Detailed description",
  "type": "code",
  "priority": "high",
  "autoAssign": true
}

# Cancel task
POST /admin/tasks/:id/cancel
{
  "reason": "No longer needed"
}
```

#### Agents
```bash
# List agents
GET /admin/agents

# Get agent details
GET /admin/agents/:id

# Update agent status
POST /admin/agents/:id/status
{
  "status": "idle"
}
```

#### Deployments
```bash
# Trigger deployment
POST /admin/deploy
{
  "environment": "staging",
  "commitSha": "abc123..."
}

# List deployments
GET /admin/deployments
```

#### Reporting
```bash
# Generate standup
GET /admin/standup

# Get metrics
GET /admin/metrics

# Generate suggestions
POST /admin/suggestions
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     SOFIA Autonomous                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Task Manager │  │ Agent Service│  │   Reporting  │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │              │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐     │
│  │  GitHub API  │  │ OpenClaw GW  │  │   Mission    │     │
│  │              │  │              │  │   Control    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │              Express Server /admin                 │   │
│  └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │     Convex     │
                    │    Database    │
                    └────────────────┘
```

## Task Types

| Type | Description | Agent Capabilities |
|------|-------------|-------------------|
| `code` | Write new features | `code`, `fullstack` |
| `bugfix` | Fix bugs | `bugfix`, `code` |
| `review` | Code review | `review` |
| `deploy` | Deploy to environment | `deploy` |
| `research` | Research tasks | `research` |
| `documentation` | Write docs | `documentation` |
| `test` | Write tests | `test`, `code` |
| `maintenance` | Refactoring | `maintenance` |

## Cron Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Daily Standup | `0 9 * * *` | Generate progress report |
| Suggestions | `0 */4 * * *` | Generate task suggestions |
| Monitoring | `*/15 * * * *` | Health checks |
| GitHub Sync | `*/5 * * * *` | Sync issues to tasks |
| Cleanup | `0 2 * * *` | Clean old data |

### Setup Cron Jobs

```bash
npm run cron:setup
```

## Self-Improvement

SOFIA learns from every task:

1. **Extracts learnings** from successful task outputs
2. **Analyzes failures** to identify patterns
3. **Adjusts agent assignments** based on performance
4. **Generates improvement tasks** automatically

Access learnings via:
```bash
GET /admin/learnings
```

## Development

```bash
# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build

# Start production
npm start
```

## Deployment

### Using GitHub Actions

1. Add secrets to GitHub repository:
   - `ADMIN_API_KEY`
   - `SOFIA_ADMIN_URL`

2. Push to `main` branch
3. CI/CD will deploy to staging → production

### Manual Deployment

```bash
# Build
npm run build

# Deploy to Convex
npm run convex:deploy

# Start server
npm start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a PR

## License

MIT License - see LICENSE file

## Credits

Inspired by [Zoe](https://github.com/elvissun) - the autonomous agent that writes code, fixes bugs, and improves itself.

---

Built with ❤️ by SOFIA