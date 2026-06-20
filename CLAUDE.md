# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

> **Repository status: bootstrap / empty.**
> As of the creation of this file, the `Planner` repository contains no application
> code — only this document. The sections below establish the conventions and
> workflow to follow, with clearly marked placeholders for codebase-specific
> details that should be filled in as the project takes shape. **When you add the
> first real code, update this file in the same change** so it always reflects the
> actual state of the repo.

## Project

- **Name:** Planner
- **Remote:** `uncleeai/planner`
- **Purpose:** _TODO — describe what Planner does once the project direction is set
  (e.g. task/calendar planning, project scheduling, etc.)._

## Repository structure

_TODO — document the directory layout once code exists. Suggested format:_

```
.
├── CLAUDE.md          # This file
└── ...                # (no source yet)
```

When source is added, list the top-level directories and what each contains, and
call out where the entry point(s), configuration, and tests live.

## Development workflow

### Branching

- All development happens on a designated feature branch — **do not commit
  directly to the default branch.**
- Create the branch locally if it does not exist yet, develop there, then push.
- Never push to a branch other than the one assigned for the current task without
  explicit permission.

### Committing

- Write clear, descriptive commit messages (imperative mood, e.g. "Add task model").
- Keep commits focused; group related changes together.

### Pushing

- Push with `git push -u origin <branch-name>`.
- On network errors, retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s).
- **Do not open a pull request unless explicitly asked.**

## Build, run, and test

_TODO — fill in once the toolchain is chosen. Capture, at minimum:_

- **Install dependencies:** _e.g._ `npm install` / `pip install -r requirements.txt`
- **Run the app:** _command to start it locally_
- **Run tests:** _test command_
- **Lint / format:** _linter and formatter commands_

Until these exist, there is no build or test step to run.

## Conventions

_TODO — record language/version, code style, naming conventions, and any
project-specific patterns once established._

---

_Keep this file current: whenever the structure, workflow, or tooling changes,
update the relevant section in the same commit._
