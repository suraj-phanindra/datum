# claudify.md - How to Make Any Repository Agent-Ready

> **What is this?** Instructions for Claude Code to transform any repository into an agent-friendly codebase with layered documentation, specialized agents, and slash command skills. Paste this into a Claude Code session or reference it during `/init` to have Claude systematically build out the entire knowledge architecture.

---

## Table of Contents

1. [The 4-Layer Architecture](#the-4-layer-architecture)
2. [Phase 1: Deep Codebase Exploration](#phase-1-deep-codebase-exploration)
3. [Phase 2: Create CLAUDE.md (Layer 0)](#phase-2-create-claudemd-layer-0)
4. [Phase 3: Create Style Guide / Rules (Layer 1)](#phase-3-create-style-guide--rules-layer-1)
5. [Phase 4: Create Claude Code Notes (Layer 2)](#phase-4-create-claude-code-notes-layer-2)
6. [Phase 5: Create Specialized Agents (Layer 3a)](#phase-5-create-specialized-agents-layer-3a)
7. [Phase 6: Create Slash Command Skills (Layer 3b)](#phase-6-create-slash-command-skills-layer-3b)
8. [Phase 7: Wire It All Together](#phase-7-wire-it-all-together)
9. [Adaptation Guide](#adaptation-guide)

---

## The 4-Layer Architecture

The goal is to build a knowledge system that gives Claude (and future developers) everything needed to work effectively in the codebase, organized by depth and purpose:

```
Layer 0: CLAUDE.md (Root)
    Purpose: Routing table + quick reference (~300-400 lines)
    Contains: Project overview, key commands, architecture summary, critical rules, links to deeper docs
    When read: Every conversation (auto-loaded by Claude Code)

Layer 1: Style Guide / Rules
    Purpose: Enforceable patterns - the "law" of the codebase
    Contains: BAD/GOOD code pairs, checklists, naming conventions, anti-patterns
    When read: When writing code

Layer 2: Claude Code Notes (Deep Reference)
    Purpose: Comprehensive technical documentation by domain
    Contains: Architecture, patterns, auth, database, streaming, release history, etc.
    When read: When working on specific areas

Layer 3a: Specialized Agents
    Purpose: Task-specific expert instructions
    Contains: 15-20 agent prompts for feature building, debugging, reviewing, etc.
    When read: When performing specific development tasks

Layer 3b: Slash Command Skills
    Purpose: Executable workflows triggered by /commands
    Contains: Step-by-step guided workflows that invoke agents
    When read: When user invokes a slash command
```

### What the End Result Looks Like

```
your-project/
├── CLAUDE.md                          # Layer 0: Routing table (300-400 lines)
├── docs/style-guide/
│   └── RULES.md                       # Layer 1: Coding rules (300-500 lines)
├── .claude/
│   ├── settings.local.json            # Permissions for common commands
│   ├── Claude Code Notes/             # Layer 2: Deep reference (8-15 files)
│   │   ├── INDEX.md
│   │   ├── ARCHITECTURE.md
│   │   ├── TECHNICAL_SUMMARY.md
│   │   ├── COMMON_PATTERNS.md
│   │   ├── RELEASE_HISTORY.md
│   │   └── {domain-specific}.md       # AUTH, DATABASE, API, etc.
│   ├── agents/                        # Layer 3a: Specialized agents (15-20 files)
│   │   ├── INDEX.md
│   │   ├── feature-builder.md
│   │   ├── test-generator.md
│   │   └── ...
│   └── skills/                        # Layer 3b: Slash commands (12-18 skills)
│       ├── add-feature/SKILL.md
│       ├── debug-issue/SKILL.md
│       ├── update-notes/SKILL.md
│       └── ...
```

**Total files created**: 40-60 depending on project complexity.

---

## Phase 1: Deep Codebase Exploration

**Goal**: Understand the codebase deeply enough to write accurate documentation. Do NOT write anything yet.

### Step 1: Read Existing Documentation

Read everything that already exists:
- `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`
- Any `docs/` directory contents
- Existing `CLAUDE.md` if present
- `.env.example` or environment documentation
- `Makefile`, `Taskfile`, `justfile`, `package.json` scripts section
- CI/CD configs (`.github/workflows/`, `Dockerfile`, `docker-compose.yml`)

### Step 2: Scan the File Tree

Map the project structure:
- Top-level directory layout
- Source code organization (is it `src/`, `app/`, `lib/`, project-name folder?)
- Test location and structure
- Config file locations
- Migration/schema directories

### Step 3: Identify the Technology Stack

Determine from dependency files:
- **Language & version**: Python 3.x, Node 20, Go 1.22, Rust, etc.
- **Framework**: FastAPI, Express, Gin, Actix, Next.js, Django, Rails, etc.
- **Database(s)**: PostgreSQL, MySQL, MongoDB, Redis, SQLite, etc.
- **ORM/ODM**: SQLAlchemy, Prisma, GORM, TypeORM, Drizzle, etc.
- **Auth**: JWT, OAuth, Clerk, Auth0, Passport, etc.
- **Package manager**: pip/poetry/uv, npm/yarn/pnpm, go mod, cargo, etc.
- **Test framework**: pytest, jest, vitest, go test, etc.
- **Linter/formatter**: black/ruff, eslint/prettier, golangci-lint, etc.

### Step 4: Discover Architecture Patterns

Read 5-10 key source files to identify:
- **Layering**: Is there a clear API -> Service -> Repository/DAO pattern?
- **Dependency injection**: How are dependencies wired? (DI container, constructor injection, global singletons)
- **Error handling**: Custom exceptions? Error codes? HTTP error mapping?
- **Authentication flow**: How does auth middleware work? How is user context propagated?
- **Data flow**: Request -> validation -> business logic -> database -> response
- **Configuration**: How are settings loaded? Environment variables? Config files?

### Step 5: Identify the "Invisible Constraints"

These are the things that break silently if you get them wrong:
- **Multi-tenancy rules**: Is data isolated per tenant/org? How?
- **Timezone handling**: Are timestamps stored with timezone? What's the convention?
- **Caching gotchas**: Are there dependency injection caching issues? Stale data risks?
- **Schema sync requirements**: Do tool schemas need to match function signatures exactly?
- **Migration ordering**: Can migrations conflict? Are there multi-head issues?
- **Environment requirements**: Must you activate a virtualenv? Source a file? Export vars?

### Step 6: Discover What Breaks Often

Look at:
- Git history for common fix patterns (`git log --oneline --grep="fix"`)
- Open/closed issues if available
- Comments in code that say `HACK`, `TODO`, `FIXME`, `WORKAROUND`
- Any existing troubleshooting documentation

### Exploration Checklist

Before proceeding to Phase 2, you should be able to answer:

- [ ] What is this project? (1-sentence description)
- [ ] What is the tech stack? (language, framework, databases, etc.)
- [ ] How is the code organized? (directory structure, layering)
- [ ] How do you run it locally? (exact commands)
- [ ] How do you run tests? (exact commands)
- [ ] How do you format/lint? (exact commands)
- [ ] How is authentication handled?
- [ ] How is data isolated? (multi-tenancy, user scoping, etc.)
- [ ] What are the 3-5 most critical "gotcha" rules?
- [ ] What are the key abstractions? (base classes, patterns)
- [ ] What does the deployment look like?
- [ ] What external services does it integrate with?

---

## Phase 2: Create CLAUDE.md (Layer 0)

**Goal**: Create a routing table and quick reference that Claude reads every conversation. Must be short enough to fit in context (~300-400 lines) but comprehensive enough to prevent common mistakes.

**Path**: `CLAUDE.md` (project root)

### Design Principles

1. **Routing table, not encyclopedia** - Link to deeper docs, don't duplicate them
2. **Prevent common mistakes** - Include WRONG/CORRECT pairs for the top 3-5 gotchas
3. **Actionable commands** - Every command should be copy-pasteable
4. **Quick orientation** - A new Claude session should understand the project in 30 seconds

### Template

```markdown
# CLAUDE.md

This file provides high-level guidance to Claude Code when working with this repository.

**For detailed technical documentation, see [.claude/Claude Code Notes/](.claude/Claude%20Code%20Notes/) folder.**

## Quick Links

- **[Quick Rules](docs/style-guide/RULES.md)** - Actionable patterns and anti-patterns
- **[Claude Code Notes](.claude/Claude Code Notes/INDEX.md)** - Comprehensive technical documentation
- **[Common Patterns](.claude/Claude Code Notes/COMMON_PATTERNS.md)** - Code snippets and quick reference
- **[Repo Tips](.claude/Claude Code Notes/REPO_TIPS_AND_TRICKS.md)** - Running the app, migrations, debugging

## Project Overview

**{Project Name}** is a {1-2 sentence description of what the project does}.

**Key Features**:
- {Feature 1}
- {Feature 2}
- {Feature 3}

**Technology Stack**: {Framework}, {ORM}, {Database}, {Auth}, {Other key tech}

## Development Commands

{Include any environment activation required}

```bash
# {Environment setup - if needed}
{activation command}

# Development server
{dev server command}

# Tests
{test command}

# Linting/formatting
{lint command}
{format command}

# Database migrations
{migration commands}
```

## Architecture Overview

### Layered Architecture

```
{Layer diagram showing the dependency flow}
```

{Brief description of each layer's responsibility - 1 line each}

### Key Patterns

**1. {Pattern Name}** - {One-line description}

```{language}
{Minimal code example showing correct usage}
```

**2. {Pattern Name}** - {One-line description}

```{language}
{Minimal code example showing correct usage}
```

{Repeat for 3-5 most important patterns}

## Critical Implementation Rules

{These are the WRONG/CORRECT pairs for the things that break most often}

**1. {Rule Name}**
```{language}
// WRONG - {why it's wrong}
{bad code}

// CORRECT - {why it's correct}
{good code}
```

**2. {Rule Name}**
```{language}
// WRONG
{bad code}

// CORRECT
{good code}
```

{3-5 rules total - focus on things that break SILENTLY}

## File Organization

```
{project}/
├── {dir}/          # {purpose}
├── {dir}/          # {purpose}
│   ├── {subdir}/   # {purpose}
│   └── {subdir}/   # {purpose}
└── {dir}/          # {purpose}
```

## Common Tasks

### Add New Feature
1. {Step 1 with link to detailed guide}
2. {Step 2}
3. {Step 3}

### Add {Domain-Specific Task}
1. {Step 1}
2. {Step 2}

### Debug Issue
1. {Step 1}
2. {Step 2}

## Environment Configuration

{Minimum required env vars or config}

## Where to Find Information

**Quick lookup**:
- {Topic} -> {File path}
- {Topic} -> {File path}

**Detailed guides**:
- {Topic} -> {File path}
- {Topic} -> {File path}

## Slash Commands for Workflow Orchestration

- `/{command}` - {description}
- `/{command}` - {description}
{List all slash commands}

## Important Notes

**{Category}**:
- {Critical note}
- {Critical note}

**{Category}**:
- {Critical note}

---

## Getting Started

**First time?**
1. Read this file (you're here!)
2. Browse [.claude/Claude Code Notes/INDEX.md](.claude/Claude%20Code%20Notes/INDEX.md)
3. Read [.claude/Claude Code Notes/ARCHITECTURE.md](.claude/Claude%20Code%20Notes/ARCHITECTURE.md)

**Working on specific area?**
- {Task} -> {Link}
- {Task} -> {Link}

**Need help?**
- Check {troubleshooting link}
- Review {common mistakes link}
```

### What Makes a Good CLAUDE.md

- **Length**: 300-400 lines. Short enough to always be in context.
- **Links everywhere**: Every section should link to deeper docs in Claude Code Notes.
- **WRONG/CORRECT pairs**: The #1 tool for preventing bugs. Include these for every "silent failure" pattern.
- **Copy-paste commands**: Every command should work as-is (including env activation).
- **No prose paragraphs**: Use bullet points, code blocks, and tables. Dense information, not essays.

---

## Phase 3: Create Style Guide / Rules (Layer 1)

**Goal**: Create an enforceable set of patterns that Claude can reference when writing code. Pure patterns, no architecture explanation.

**Path**: `docs/style-guide/RULES.md`

### Design Principles

1. **Patterns, not explanations** - Show code, don't explain architecture
2. **BAD/GOOD pairs** - Every rule has a wrong example and a correct example
3. **Checklist at the end** - Quick verification list for new features
4. **Framework-specific** - Tailored to the actual tech stack

### Template

```markdown
# {Project Name} - Coding Rules

**Quick reference for implementing features. See [CLAUDE.md](../../CLAUDE.md) for architectural overview.**

## Critical Rules - READ FIRST

### {Category 1: e.g., Environment}
- **ALWAYS** {do this thing}
- **NEVER** {do this bad thing}

### {Category 2: e.g., Data Isolation}
- **ALWAYS** {do this thing}
- **NEVER** {do this bad thing}

### {Category 3: e.g., Dependency Injection}
- **ALWAYS** {do this thing}
- **NEVER** {do this bad thing}

## Layer Responsibilities - STRICT

- **{Layer Name}**: {One-line responsibility}. NO {what it must not do}.
- **{Layer Name}**: {One-line responsibility}. NO {what it must not do}.
{Repeat for each layer}

**Rule**: Never skip layers. {Layer flow diagram}.

## {Pattern 1 Name} - CRITICAL

{One-line description of what this pattern is for}

### Structure
```{language}
{Full code template showing the correct structure}
```

### Key Points
- {Point 1}
- {Point 2}
- {Point 3}

## {Pattern 2 Name} - CRITICAL

{Repeat pattern template for each major pattern in the codebase}

## {Error Handling Pattern}

### Raise {Custom Exceptions}, NOT {Framework Exceptions}
```{language}
// Good
{correct code}

// Bad
{incorrect code}
```

## Common Anti-Patterns - NEVER DO THESE

```{language}
// BAD: {description}
{bad code}

// GOOD: {description}
{good code}

// BAD: {description}
{bad code}

// GOOD: {description}
{good code}
```

{Include 5-10 anti-pattern pairs covering the most common mistakes}

## Quick Checklist for New Features

- [ ] {Step 1}
- [ ] {Step 2}
- [ ] {Step 3}
{15-20 items covering the full feature implementation flow}

## Resources

- **Architectural Overview**: See [CLAUDE.md](../../CLAUDE.md)
- **Example {Layer}**: `{path to example file 1}`, `{path to example file 2}`
{List example files for each layer}
```

### What to Include (Adapt Per Project)

For **any** project, you should have rules covering:
- Environment setup requirements
- Layer responsibilities and boundaries
- Data model/schema patterns (with templates)
- Service/business logic patterns (with templates)
- API/route handler patterns (with templates)
- Error handling approach
- Logging standards
- Naming conventions
- Import organization
- Async/concurrency patterns (if applicable)
- Data isolation patterns (multi-tenant, user-scoped, etc.)
- Anti-patterns specific to the framework

---

## Phase 4: Create Claude Code Notes (Layer 2)

**Goal**: Create comprehensive reference documentation organized by domain. One file per concern. Cross-reference liberally.

**Path**: `.claude/Claude Code Notes/`

### Required Files (Every Project)

These files should exist for every project:

#### 1. `INDEX.md` - Navigation Hub

```markdown
# Claude Code Notes - {Project Name}

## Quick Navigation

| I want to... | Read this |
|--------------|-----------|
| Understand the architecture | [ARCHITECTURE.md](ARCHITECTURE.md) |
| See code patterns | [COMMON_PATTERNS.md](COMMON_PATTERNS.md) |
| Debug an issue | [COMMON_PATTERNS.md#debugging-checklist](COMMON_PATTERNS.md#debugging-checklist) |
| Add a new feature | [COMMON_PATTERNS.md#quick-patterns](COMMON_PATTERNS.md#quick-patterns) |
| Check what changed recently | [RELEASE_HISTORY.md](RELEASE_HISTORY.md) |
| Understand {domain topic} | [{DOMAIN}.md]({DOMAIN}.md) |

## All Documentation

### Core Documentation
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design, components, data flow
- **[TECHNICAL_SUMMARY.md](TECHNICAL_SUMMARY.md)** - Deep implementation details
- **[COMMON_PATTERNS.md](COMMON_PATTERNS.md)** - Code patterns, anti-patterns, debugging
- **[RELEASE_HISTORY.md](RELEASE_HISTORY.md)** - Changelog and lessons learned
- **[REPO_TIPS_AND_TRICKS.md](REPO_TIPS_AND_TRICKS.md)** - Running the app, common issues

### Domain-Specific Documentation
{List domain-specific files identified from the codebase}

## File Purposes

{For each file, 2-3 sentences about when you should read it}
```

#### 2. `ARCHITECTURE.md` - System Design

Should contain:
- High-level system diagram (ASCII art or description)
- Component relationship map
- Layered architecture with responsibilities
- Data flow for key operations (CRUD, auth, etc.)
- Database architecture (schemas, relationships, isolation)
- Request lifecycle (from HTTP request to response)
- Error handling flow
- External service integrations
- Deployment architecture

**Template structure**:
```markdown
# Architecture - {Project Name}

## System Overview
{High-level description and diagram}

## Layered Architecture
{Each layer with its responsibility, files, and boundaries}

## Component Relationships
{How components depend on each other}

## Data Flow
### {Flow 1: e.g., Standard CRUD Request}
{Step-by-step flow}

### {Flow 2: e.g., Authentication Flow}
{Step-by-step flow}

## Database Architecture
{Schema overview, relationships, isolation strategy}

## Request Lifecycle
{Full flow from middleware to response}

## Error Handling
{How errors propagate and get converted}

## External Integrations
{Each external service and how it's connected}

## Performance & Scaling
{Caching, pooling, horizontal scaling}
```

#### 3. `TECHNICAL_SUMMARY.md` - Implementation Details

Should contain:
- Technology stack with versions
- Key technical decisions and rationale
- System constraints (pool sizes, rate limits, timeouts)
- Performance characteristics (latency targets, throughput)
- Security model details
- Configuration management approach

#### 4. `COMMON_PATTERNS.md` - Quick Reference

The most-referenced file. Should contain:

```markdown
# Common Patterns - {Project Name}

## Quick Patterns

### Pattern: Add New {Component Type}
{Step-by-step with code snippets}

### Pattern: Add New {Component Type}
{Step-by-step with code snippets}

{Repeat for each common operation}

## Anti-Patterns (Mistakes to Avoid)

### {Anti-pattern 1}
```{language}
// BAD
{code}

// GOOD
{code}
```
**Why**: {Explanation of what goes wrong}

{Repeat for each anti-pattern}

## Debugging Checklist

### {Category} Failures
1. Check {thing 1}
2. Check {thing 2}
3. Check {thing 3}

### {Category} Failures
1. Check {thing 1}
2. Check {thing 2}
```

#### 5. `RELEASE_HISTORY.md` - Changelog with Lessons

```markdown
# Release History

## {Date} - {Feature/Change Name}

### What Changed
- {Change 1}
- {Change 2}

### Files Modified
- `{path}` - {what changed}

### Key Learnings
1. **{Learning title}**: {What you learned and why it matters}
2. **{Learning title}**: {What you learned}

### Bugs Fixed During Implementation
- **{Bug}**: {Root cause and fix}
```

#### 6. `REPO_TIPS_AND_TRICKS.md` - Practical Guide

```markdown
# Repo Tips and Tricks

## Running the Application
{Exact commands to start the app locally}

## Running Tests
{Exact commands for different test types}

## Database Operations
{Migration commands, seeding, resetting}

## Environment Variables
{Required vars with descriptions}

## Common Issues
### {Issue 1}
**Symptom**: {What you see}
**Cause**: {Why it happens}
**Fix**: {How to fix it}
```

### Domain-Specific Files (Identify from Codebase)

Based on what the project does, create additional files. Common domain files:

| If the project has... | Create... |
|----------------------|-----------|
| Authentication/authorization | `AUTHENTICATION.md` |
| Database with ORM | `DATABASE.md` |
| Real-time features (WebSocket/SSE) | `STREAMING.md` or `REALTIME.md` |
| Multi-tenancy | `MULTI_TENANCY.md` |
| LLM/AI integration | `LLM_INTEGRATION.md` or `AI.md` |
| Complex API layer | `API.md` |
| Service/business logic layer | `SERVICE_LAYER.md` |
| External service integrations | `INTEGRATIONS.md` |
| Complex state management | `STATE_MANAGEMENT.md` |
| Complex build/deploy pipeline | `DEPLOYMENT.md` |
| Background jobs/queues | `BACKGROUND_JOBS.md` |
| File upload/storage | `STORAGE.md` |
| Email/notifications | `NOTIFICATIONS.md` |
| Search functionality | `SEARCH.md` |
| Caching strategy | `CACHING.md` |

### Design Principles for Claude Code Notes

1. **One concern per file** - Don't put auth details in the database file
2. **Cross-reference liberally** - Link to related files often: `See [DATABASE.md](DATABASE.md) for migration details`
3. **Include "When to Use This File"** - Top of each file should say when to read it
4. **Code examples over prose** - Show, don't tell
5. **Keep files focused** - If a file exceeds ~800 lines, split it
6. **Update regularly** - Use `/update-notes` after significant sessions

---

## Phase 5: Create Specialized Agents (Layer 3a)

**Goal**: Create task-specific agent prompts that provide focused context and workflows for common development tasks.

**Path**: `.claude/agents/`

### What Agents Are

Agent files are markdown documents that serve as specialized instruction sets. When invoked via Claude Code's Task tool, they give the agent focused context about:
- What it's trying to accomplish
- What patterns to follow
- What files to reference
- What steps to execute
- What rules to never break

### Agent File Template

Every agent file should follow this structure:

```markdown
# {Agent Name} Agent

You are a specialized agent for {one-line description of what this agent does} in the {Project Name} {framework} application.

## Your Capabilities

- {Capability 1}
- {Capability 2}
- {Capability 3}
- {Capability 4}

## Project Context

**Architecture**: {Tech stack summary}
**Pattern**: {Key architectural pattern}

Key files to reference:
- `.claude/Claude Code Notes/COMMON_PATTERNS.md` - Code patterns
- `.claude/Claude Code Notes/ARCHITECTURE.md` - System architecture
- {Additional relevant doc files}

## {Workflow Name}

### Phase 1: {First Phase}

1. {Step 1}
2. {Step 2}
3. {Step 3}

### Phase 2: {Second Phase}

1. {Step 1}
   ```{language}
   {Code template if applicable}
   ```

2. {Step 2}

### Phase 3: {Third Phase}

{Continue with implementation phases}

## Critical Rules

1. **{Rule 1}** - {Brief explanation}
2. **{Rule 2}** - {Brief explanation}
3. **{Rule 3}** - {Brief explanation}
{Include the 3-5 most critical rules for this agent's domain}

## Output Format

After completing the task, provide:
1. {What to report}
2. {What to report}
3. {What to report}
```

### Agents Every Project Should Have

#### Feature Development Agents

**1. `feature-builder.md`** - End-to-end feature implementation
- Phases: Requirements -> Database -> Data Access -> Business Logic -> API -> Testing
- Includes code templates for each layer
- References architecture patterns

**2. `service-creator.md`** - Create new service/business logic components
- Template for service class
- Registration in DI container
- Permission/authorization patterns
- Exception handling

**3. `api-endpoint-builder.md`** - Add REST/GraphQL endpoints
- Request/response schema templates
- Route handler template
- Middleware/guard patterns
- OpenAPI documentation

**4. `dao-builder.md`** (or `repository-builder.md`) - Data access layer
- ORM model template
- Repository/DAO class template
- Query patterns (filtering, pagination, sorting)
- Data isolation patterns

#### Database Operations Agents

**5. `migration-manager.md`** - Database migration workflows
- Create, review, apply, rollback migrations
- Common pitfalls (multiple heads, data loss)
- Migration review checklist

**6. `schema-analyzer.md`** - Database optimization
- Index analysis
- Query performance
- Relationship optimization
- N+1 detection

#### Testing & Quality Agents

**7. `test-generator.md`** - Generate comprehensive tests
- Unit test templates with mocking patterns
- Integration test templates
- Fixture patterns
- Coverage targets

**8. `bug-hunter.md`** - Systematic debugging
- Debugging methodology (reproduce -> isolate -> fix -> verify)
- Common bug pattern recognition
- Log analysis guidance

**9. `code-reviewer.md`** - Code review checklist
- Pattern adherence check
- Security review (OWASP top 10)
- Performance review
- Severity classification (Critical/Major/Minor/Suggestion)

**10. `performance-analyzer.md`** - Performance optimization
- Profiling approach
- Bottleneck identification
- Optimization strategies per layer

#### Documentation Agents

**11. `doc-writer.md`** - Technical documentation
- Feature documentation template
- README template
- Architecture decision records

**12. `api-doc-generator.md`** - API documentation
- OpenAPI/Swagger generation
- Endpoint documentation template
- Example request/response pairs

**13. `release-notes-writer.md`** - Release documentation
- Changelog format
- Breaking change documentation
- Migration guides

#### Architecture & Analysis Agents

**14. `codebase-explorer.md`** - Codebase navigation
- File structure mapping
- Data flow tracing
- Dependency mapping

**15. `dependency-analyzer.md`** - Dependency management
- Outdated package detection
- Security vulnerability scanning
- Compatibility analysis

**16. `security-auditor.md`** - Security review
- OWASP top 10 checklist
- Auth/authz review
- Data protection audit
- Input validation check

#### Deployment & Operations Agents

**17. `deploy-preparer.md`** - Deployment readiness
- Pre-deployment checklist
- Environment verification
- Rollback plan template

**18. `incident-responder.md`** - Production incident handling
- Triage methodology
- Diagnosis steps
- Mitigation strategies
- Post-mortem template

### Agent INDEX.md Template

Create `.claude/agents/INDEX.md`:

```markdown
# {Project Name} Specialized Agents

This directory contains {N} specialized agent prompts for development tasks.

## How to Use

These agents provide specialized context for specific tasks. Reference them when performing the corresponding task type.

## Agent Categories

### Feature Development ({N} agents)

| Agent | File | Purpose |
|-------|------|---------|
| Feature Builder | `feature-builder.md` | End-to-end feature implementation |
| Service Creator | `service-creator.md` | Create services with proper patterns |
| API Endpoint Builder | `api-endpoint-builder.md` | Add REST endpoints |
| {Layer} Builder | `{layer}-builder.md` | Create {layer} components |

### Database Operations ({N} agents)

| Agent | File | Purpose |
|-------|------|---------|
| Migration Manager | `migration-manager.md` | Create and manage migrations |
| Schema Analyzer | `schema-analyzer.md` | Analyze and optimize schema |

### Testing & Quality ({N} agents)

| Agent | File | Purpose |
|-------|------|---------|
| Test Generator | `test-generator.md` | Generate tests |
| Bug Hunter | `bug-hunter.md` | Systematic debugging |
| Code Reviewer | `code-reviewer.md` | Review code quality |
| Performance Analyzer | `performance-analyzer.md` | Profile and optimize |

### Documentation ({N} agents)

| Agent | File | Purpose |
|-------|------|---------|
| Doc Writer | `doc-writer.md` | Write technical documentation |
| API Doc Generator | `api-doc-generator.md` | Generate API documentation |
| Release Notes Writer | `release-notes-writer.md` | Write changelogs |

### Architecture & Analysis ({N} agents)

| Agent | File | Purpose |
|-------|------|---------|
| Codebase Explorer | `codebase-explorer.md` | Navigate and understand codebase |
| Dependency Analyzer | `dependency-analyzer.md` | Audit dependencies |
| Security Auditor | `security-auditor.md` | Security vulnerability analysis |

### Deployment & Operations ({N} agents)

| Agent | File | Purpose |
|-------|------|---------|
| Deploy Preparer | `deploy-preparer.md` | Pre-deployment checklist |
| Incident Responder | `incident-responder.md` | Handle production incidents |

## Mapping to Slash Commands

| Slash Command | Primary Agent |
|---------------|---------------|
| `/add-feature` | Feature Builder |
| `/add-service` | Service Creator |
| `/test-feature` | Test Generator |
| `/debug-issue` | Bug Hunter |
| `/prepare-deploy` | Deploy Preparer |
| `/update-notes` | Release Notes Writer |
{Map all slash commands to agents}

## See Also

- [Skills Directory](../skills/) - Slash command implementations
- [Claude Code Notes](../Claude%20Code%20Notes/) - Technical documentation
- [CLAUDE.md](../../CLAUDE.md) - Project overview
```

---

## Phase 6: Create Slash Command Skills (Layer 3b)

**Goal**: Create executable slash commands that guide Claude through multi-step workflows. These are the user-facing interface to the agent system.

**Path**: `.claude/skills/{skill-name}/SKILL.md`

### What Skills Are

Skills are markdown files with YAML frontmatter that define guided workflows. When a user types `/{skill-name}` in Claude Code, the SKILL.md contents become the instructions for that interaction.

### Skill File Template

```markdown
---
name: {skill-name}
description: {One sentence description}. Use when {trigger condition}.
---

## Task: {Task Title} - $ARGUMENTS

{One-line description of what this skill does.}

### Phase 1: {First Phase Name}

{Instructions for what to do in this phase}

1. {Step 1}
2. {Step 2}
3. {Step 3}

### Phase 2: {Second Phase Name}

{Instructions for what to do in this phase}

1. {Step 1}
2. {Step 2}

### Phase 3: {Third Phase Name}

{Continue phases as needed}

### References

- {Link to relevant Claude Code Notes file}
- {Link to relevant Claude Code Notes file}
```

**Key elements**:
- `$ARGUMENTS` is replaced with whatever the user types after the command
- Frontmatter `name` must match the directory name
- Frontmatter `description` should explain when to use it
- Phases should be sequential and actionable
- Reference relevant documentation files

### Core Skills Every Project Should Have

#### Session Management Skills

**1. `/update-notes`** - Update documentation after development session

```markdown
---
name: update-notes
description: Update Claude Code Notes after development session. Use when you've made significant changes and want to document lessons learned.
---

## Task: Update Claude Code Notes

Update the technical documentation to reflect changes made during this session.

### Steps

1. **Review Session Changes**
   - Run `git status` to see all modified/new files
   - Run `git diff --stat` to understand scope of changes
   - Identify what features were added, bugs fixed, or patterns discovered

2. **Update RELEASE_HISTORY.md**
   - Add entry with today's date
   - Document features implemented, bugs fixed
   - Include any key learnings or gotchas discovered
   - Follow existing format in the file

3. **Update COMMON_PATTERNS.md** (if applicable)
   - Add new code patterns discovered
   - Update anti-patterns section if new mistakes were made
   - Add debugging tips learned

4. **Update Feature-Specific Docs** (if applicable)
   - If a feature was significantly changed, update its documentation
   - Check INDEX.md to find relevant docs

5. **Update CLAUDE.md** (ONLY if major architecture changed)
   - High-level overview only
   - Link to detailed docs in Claude Code Notes

6. **Commit Documentation Changes**
   - Stage only documentation files
   - Commit with message: "docs: update Claude Code Notes after session"

### Files to Review

- `.claude/Claude Code Notes/RELEASE_HISTORY.md` - Primary update target
- `.claude/Claude Code Notes/COMMON_PATTERNS.md` - For new patterns
- `.claude/Claude Code Notes/INDEX.md` - If new docs created
- `CLAUDE.md` - Only for major changes

### Output Format

After completing updates, summarize:
1. What documentation was updated
2. Key learnings documented
3. Any architecture changes noted
```

**2. `/session-summary`** - Generate summary of current session

```markdown
---
name: session-summary
description: Generate a summary of work done in this session. Use at the end of a work session.
---

## Task: Session Summary

Generate a concise summary of all work done in this session.

### Steps

1. **Review Changes**
   - Run `git diff --stat` to see modified files
   - Run `git log --oneline -20` to see recent commits
   - Identify the main tasks accomplished

2. **Generate Summary**
   Format:
   ```
   ## Session Summary - {Date}

   ### Accomplished
   - {What was done}

   ### Files Modified
   - `{path}` - {what changed}

   ### Key Decisions Made
   - {Decision and rationale}

   ### Open Items
   - {What still needs to be done}

   ### Lessons Learned
   - {Any gotchas or insights}
   ```
```

#### Feature Development Skills

**3. `/add-feature`** - Guided feature implementation

```markdown
---
name: add-feature
description: Guided feature implementation workflow. Use when adding meaningful new functionality.
---

## Task: Implement Feature - $ARGUMENTS

Guide the implementation of a new feature following the project's layered architecture.

### Phase 1: Requirements Gathering

Ask clarifying questions:
1. What is the core functionality needed?
2. Who will use this feature? (API, internal, etc.)
3. What data needs to be stored/retrieved?
4. Does it integrate with external services?
5. What permissions/roles should have access?

### Phase 2: Architecture Planning

Based on requirements, plan which layers need modification:

```
Models (if new data) -> Data Access (if queries needed) -> Business Logic (ALWAYS) -> API (if endpoint needed)
```

Reference: `.claude/Claude Code Notes/ARCHITECTURE.md`

### Phase 3: Implementation Order

**CRITICAL**: Follow this exact order to avoid dependency issues:

1. **Database Model** (if needed)
2. **Migration** (if model created)
3. **Data Access Layer** (if queries needed)
4. **Business Logic Layer** (always)
5. **API Layer** (if endpoint needed)

### Phase 4: Testing

1. Write unit tests for business logic layer
2. Write integration tests for API
3. Manual testing
4. Test with different user roles

### Phase 5: Documentation

1. Update relevant Claude Code Notes
2. Add API examples if applicable
3. Document configuration options

### References

- Patterns: `.claude/Claude Code Notes/COMMON_PATTERNS.md`
- Architecture: `.claude/Claude Code Notes/ARCHITECTURE.md`
```

**4. `/add-service`** - Create new service component

```markdown
---
name: add-service
description: Create a new service with proper patterns and registration. Use when adding business logic.
---

## Task: Create Service - $ARGUMENTS

Create a new service following established patterns.

### Steps

1. **Identify Service Scope** - What business logic does this service encapsulate?
2. **Create Service File** - In the services directory following naming conventions
3. **Implement Core Methods** - With proper error handling and logging
4. **Register in DI Container** - Following the project's dependency injection pattern
5. **Add Permission Checks** - If the service is user-facing
6. **Write Tests** - Unit tests with mocked dependencies

### References

- Service patterns: `.claude/Claude Code Notes/COMMON_PATTERNS.md`
- Service layer details: `.claude/Claude Code Notes/SERVICE_LAYER.md`
```

**5. `/add-api-endpoint`** - Add new API endpoint

```markdown
---
name: add-api-endpoint
description: Add a new API endpoint to an existing router. Use when exposing new HTTP endpoints.
---

## Task: Add API Endpoint - $ARGUMENTS

Add a new endpoint following the project's API patterns.

### Steps

1. **Define Request/Response Schemas** - Create validation models
2. **Add Route Handler** - In the appropriate router file
3. **Wire to Service Layer** - Call business logic, don't implement it here
4. **Add Permission Checks** - Enforce authorization
5. **Test the Endpoint** - curl/Postman verification

### References

- API patterns: `.claude/Claude Code Notes/COMMON_PATTERNS.md`
- Route examples: Check existing routers in the API directory
```

#### Database Skills

**6. `/add-migration`** - Create database migration

```markdown
---
name: add-migration
description: Create and apply a database migration. Use when modifying the database schema.
---

## Task: Create Migration - $ARGUMENTS

### Steps

1. **Create Migration File**
   - Run the migration creation command
   - Review the auto-generated migration for correctness

2. **Review Migration**
   - Check for data loss risks
   - Verify index creation
   - Ensure rollback (downgrade) is correct

3. **Apply Migration**
   - Run the migration upgrade command
   - Verify the migration was applied

4. **Verify Schema**
   - Check the database reflects the expected schema

### References

- Database docs: `.claude/Claude Code Notes/DATABASE.md`
- Migration tips: `.claude/Claude Code Notes/REPO_TIPS_AND_TRICKS.md`
```

**7. `/rollback-migration`** - Rollback last migration

**8. `/fix-migration`** - Fix common migration issues (multiple heads, conflicts)

#### Testing & Debugging Skills

**9. `/test-feature`** - Generate and run tests

```markdown
---
name: test-feature
description: Generate and run tests for a feature. Use after implementing or modifying a feature.
---

## Task: Test Feature - $ARGUMENTS

### Steps

1. **Identify Test Scope** - What needs to be tested?
2. **Generate Unit Tests** - For business logic layer with mocked dependencies
3. **Generate Integration Tests** - For API layer if applicable
4. **Run Tests** - Execute and verify all pass
5. **Check Coverage** - Identify untested paths

### References

- Test patterns: `.claude/Claude Code Notes/COMMON_PATTERNS.md`
- Test configuration: Check existing tests for fixtures and patterns
```

**10. `/debug-issue`** - Systematic debugging workflow

```markdown
---
name: debug-issue
description: Systematic debugging workflow. Use when investigating bugs or unexpected behavior.
---

## Task: Debug Issue - $ARGUMENTS

### Steps

1. **Reproduce** - Confirm the issue and identify exact steps
2. **Isolate** - Narrow down to the specific component/layer
3. **Diagnose** - Read code, add logging, trace data flow
4. **Fix** - Implement the minimal fix
5. **Verify** - Confirm the fix resolves the issue without regressions
6. **Document** - Update COMMON_PATTERNS.md if a new gotcha was discovered

### References

- Debugging checklist: `.claude/Claude Code Notes/COMMON_PATTERNS.md#debugging-checklist`
- Common issues: `.claude/Claude Code Notes/REPO_TIPS_AND_TRICKS.md#common-issues`
```

**11. `/check-performance`** - Profile and optimize

#### Documentation Skills

**12. `/document-feature`** - Generate feature documentation

**13. `/api-docs`** - Generate API documentation

**14. `/create-readme`** - Generate README for a component

#### Deployment Skills

**15. `/prepare-deploy`** - Pre-deployment checklist

**16. `/rollback-deploy`** - Rollback to previous deployment

### Skills-to-Agents Mapping

Each skill should map to one or more agents:

| Slash Command | Primary Agent | Secondary Agent |
|---------------|---------------|-----------------|
| `/add-feature` | Feature Builder | (may invoke others) |
| `/add-service` | Service Creator | |
| `/add-api-endpoint` | API Endpoint Builder | |
| `/add-migration` | Migration Manager | |
| `/rollback-migration` | Migration Manager | |
| `/fix-migration` | Migration Manager | |
| `/test-feature` | Test Generator | |
| `/debug-issue` | Bug Hunter | |
| `/check-performance` | Performance Analyzer | |
| `/document-feature` | Doc Writer | |
| `/api-docs` | API Doc Generator | |
| `/create-readme` | Doc Writer | |
| `/prepare-deploy` | Deploy Preparer | |
| `/rollback-deploy` | Incident Responder | |
| `/update-notes` | Release Notes Writer | |
| `/session-summary` | Release Notes Writer | |

### Skill Design Guidelines

1. **Start with questions** - Gather requirements before acting (especially for `/add-feature`)
2. **Strict ordering** - Phases should follow dependency order (database before service before API)
3. **Reference docs** - Always point to relevant Claude Code Notes files
4. **Include verification** - Each skill should end with a verification/testing step
5. **Keep skills focused** - One skill = one workflow. Compose skills for complex tasks.

---

## Phase 7: Wire It All Together

### Step 1: Update CLAUDE.md with All References

After creating all documentation, update CLAUDE.md to link to:
- Style guide
- Each Claude Code Notes file
- Slash command list
- Agent descriptions (summarized)

### Step 2: Configure `.claude/settings.local.json`

Create or update settings with commonly needed permissions:

```json
{
  "permissions": {
    "allow": [
      "Bash({package-manager} install:*)",
      "Bash({package-manager} run:*)",
      "Bash({test-command}:*)",
      "Bash({lint-command}:*)",
      "Bash({format-command}:*)",
      "Bash({migration-command}:*)",
      "Bash({dev-server-command}:*)",
      "WebSearch"
    ]
  }
}
```

Adapt the permissions to the project's package manager and tooling. The goal is to pre-approve commands that Claude will commonly need so it doesn't have to ask for permission every time.

### Step 3: Cross-Reference Verification

Verify that all documentation links work:

1. Every link in `CLAUDE.md` points to an existing file
2. Every link in `INDEX.md` points to an existing file
3. Every slash command listed in `CLAUDE.md` has a corresponding `SKILL.md`
4. Every agent listed in agents `INDEX.md` has a corresponding `.md` file
5. Every Claude Code Notes file links back to `INDEX.md`
6. The style guide links back to `CLAUDE.md`

### Step 4: The Self-Updating Loop

Two skills create a documentation maintenance loop:

1. **`/update-notes`** - Run after development sessions to capture learnings
   - Updates `RELEASE_HISTORY.md` with what was done
   - Updates `COMMON_PATTERNS.md` with new patterns/anti-patterns
   - Updates domain-specific docs if relevant
   - Keeps documentation fresh without manual effort

2. **`/session-summary`** - Run at end of session
   - Generates a summary of work accomplished
   - Identifies open items for next session
   - Captures decisions made

This loop means the documentation improves over time as the project evolves, rather than rotting.

### Step 5: Document the Slash Commands

Create or update `.claude/Claude Code Notes/SLASH_COMMANDS.md`:

```markdown
# Slash Commands

Workflow orchestration commands for development tasks.

## Session Management
- `/update-notes` - Update Claude Code Notes after session
- `/session-summary` - Generate work summary

## Feature Development
- `/add-feature <name>` - Guided feature implementation
- `/add-service <name>` - Create new service
- `/add-api-endpoint <details>` - Add API endpoint

## Database Operations
- `/add-migration "<description>"` - Create migration
- `/rollback-migration` - Undo last migration
- `/fix-migration` - Fix migration issues

## Testing & Debugging
- `/test-feature <name>` - Generate and run tests
- `/debug-issue "<description>"` - Systematic debugging
- `/check-performance <target>` - Profile and optimize

## Documentation
- `/document-feature <name>` - Generate feature docs
- `/api-docs [scope]` - Generate API documentation
- `/create-readme <path>` - Create component README

## Deployment
- `/prepare-deploy <env>` - Pre-deployment checklist
- `/rollback-deploy` - Rollback deployment

## Command Composition

Commands can be composed for complex workflows:

```
/add-feature user-preferences
{implement feature}
/test-feature user-preferences
/document-feature user-preferences
/update-notes
```
```

---

## Adaptation Guide

### Adapting for Different Tech Stacks

The 4-layer architecture is universal. The content within each layer is project-specific.

#### What's Universal (Copy As-Is)

- File structure (CLAUDE.md, .claude/ directory, docs/style-guide/)
- INDEX.md format and navigation structure
- Agent categories (Feature, Database, Testing, Documentation, Architecture, Deployment)
- Skill categories (Feature, Database, Testing, Documentation, Deployment, Session Management)
- RELEASE_HISTORY.md format
- COMMON_PATTERNS.md structure (patterns, anti-patterns, debugging checklist)
- REPO_TIPS_AND_TRICKS.md structure
- The self-updating loop (/update-notes, /session-summary)

#### What's Project-Specific (Must Customize)

- CLAUDE.md content (commands, patterns, rules)
- RULES.md patterns and anti-patterns (framework-specific)
- ARCHITECTURE.md (unique to every project)
- TECHNICAL_SUMMARY.md (unique to every project)
- Agent code templates (language/framework specific)
- Skill implementation phases (framework-specific)
- Domain-specific Claude Code Notes files
- Settings permissions (project-specific commands)

### Stack-Specific Guidance

#### Python (FastAPI, Django, Flask)
- Emphasize: virtualenv activation, async patterns, ORM model patterns, migration workflows
- Domain docs: DATABASE.md, AUTHENTICATION.md, possibly CELERY.md or BACKGROUND_JOBS.md
- Key gotchas: datetime timezone handling, async context, dependency injection caching

#### TypeScript/JavaScript (Next.js, Express, Nest.js)
- Emphasize: type safety, module patterns, middleware chains, build configuration
- Domain docs: STATE_MANAGEMENT.md, ROUTING.md, possibly SSR.md
- Key gotchas: module resolution, environment variable access (client vs server), build-time vs runtime

#### Go (Gin, Echo, standard library)
- Emphasize: interface patterns, error handling (no exceptions), goroutine patterns
- Domain docs: CONCURRENCY.md, MIDDLEWARE.md
- Key gotchas: nil pointer dereference patterns, goroutine leaks, context cancellation

#### Rust (Actix, Axum, Rocket)
- Emphasize: ownership patterns, error types, async runtime choice
- Domain docs: ERROR_HANDLING.md, ASYNC.md
- Key gotchas: lifetime annotations, Send + Sync bounds, deadlock patterns

### How to Identify Project-Specific Agents/Skills

After Phase 1 (exploration), ask:

1. **Does this project have a unique domain?** (e.g., LLM tools, payment processing, real-time collaboration)
   - If yes: create domain-specific agents (e.g., `llm-tool-builder.md`, `payment-flow-builder.md`)

2. **Does this project have unique infrastructure?** (e.g., Kubernetes, serverless, microservices)
   - If yes: create infrastructure agents (e.g., `k8s-deployer.md`, `lambda-builder.md`)

3. **What are the most common development tasks?**
   - Whatever developers do most often should have a slash command

4. **What mistakes are made most often?**
   - Common mistakes should be documented as anti-patterns AND have related agents/skills to prevent them

### Scaling: When to Add More vs. When It's Complete

**Add more documentation when**:
- A new domain area is added (e.g., adding real-time features to a REST-only app)
- A significant pattern is established that doesn't fit existing docs
- The same debugging steps are repeated across multiple sessions

**The system is complete when**:
- CLAUDE.md accurately routes to all relevant documentation
- Every common development task has a slash command
- Every significant architectural decision is documented
- Anti-patterns cover the top 10 mistakes made in the project
- The self-updating loop (/update-notes) is keeping docs fresh

**Signs of over-documentation**:
- Docs that are never referenced
- Duplicate information across multiple files
- Docs that go stale because they're too detailed
- More time spent documenting than coding

The sweet spot is documentation that saves more time than it costs to maintain.

---

## Worked Example: CompanyInsights Backend

This guide was developed by "claudifying" the [CompanyInsights Backend](https://github.com/CompanyInsights-ai/company-insights-backend), a multi-tenant SaaS FastAPI platform. Here's what the final structure looks like:

### Stats
- **CLAUDE.md**: ~350 lines (routing table)
- **RULES.md**: ~460 lines (coding patterns)
- **Claude Code Notes**: 13 files (architecture, patterns, auth, database, streaming, multi-tenancy, LLM integration, service layer, technical summary, release history, tips, slash commands, common patterns)
- **Agents**: 18 specialized agents across 6 categories
- **Skills**: 17 slash commands covering feature dev, database ops, testing, documentation, deployment, and session management

### Key Learnings from Building This

1. **Start with CLAUDE.md** - It's the file Claude reads every conversation, so getting it right has the highest leverage
2. **WRONG/CORRECT pairs are gold** - The single most effective pattern for preventing bugs
3. **Anti-patterns come from real mistakes** - Document mistakes as you make them, not hypothetically
4. **The self-updating loop matters** - `/update-notes` keeps documentation alive
5. **Domain-specific docs earn their keep** - `MULTI_TENANCY.md` and `LLM_INTEGRATION.md` are referenced constantly because multi-tenancy and LLM tool calling are the two areas where mistakes are most expensive
6. **Agent templates should be practical** - Include code templates, not just descriptions
7. **Skills should ask questions first** - The best skills start with requirements gathering, not implementation

---

## Quick Start Checklist

For Claude: when asked to "claudify" a repo, follow these phases in order:

- [ ] **Phase 1**: Explore the codebase deeply (do not write anything yet)
- [ ] **Phase 2**: Create `CLAUDE.md` at project root (~300-400 lines)
- [ ] **Phase 3**: Create `docs/style-guide/RULES.md` (~300-500 lines)
- [ ] **Phase 4**: Create `.claude/Claude Code Notes/` (8-15 files)
  - [ ] INDEX.md
  - [ ] ARCHITECTURE.md
  - [ ] TECHNICAL_SUMMARY.md
  - [ ] COMMON_PATTERNS.md
  - [ ] RELEASE_HISTORY.md
  - [ ] REPO_TIPS_AND_TRICKS.md
  - [ ] {Domain-specific files as needed}
- [ ] **Phase 5**: Create `.claude/agents/` (15-20 agent files + INDEX.md)
- [ ] **Phase 6**: Create `.claude/skills/` (12-18 skill directories with SKILL.md)
- [ ] **Phase 7**: Wire everything together
  - [ ] Update CLAUDE.md with all links
  - [ ] Create/update `.claude/settings.local.json`
  - [ ] Verify all cross-references
  - [ ] Create `.claude/Claude Code Notes/SLASH_COMMANDS.md`

After completion, verify by:
1. Reading CLAUDE.md end-to-end for coherence
2. Clicking every link to confirm targets exist
3. Running one slash command to test the workflow
