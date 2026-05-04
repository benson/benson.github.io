# Agent Workflow

This repo is often edited by multiple agents at once. Keep work isolated by
default. Do not start substantial work directly on `master`.

## Before Editing

1. Check the shared workspace state:

```powershell
git status --short --branch
git worktree list
git branch --show-current
```

2. If the tree is dirty, assume another agent or the user owns those changes.
   Do not reset, checkout, stash, delete, or rewrite them unless the user
   explicitly asks.

3. For anything more than a tiny hotfix, create a separate branch and worktree
   from the latest remote `master`:

```powershell
cd C:\Users\benso\Projects\homepage
git fetch origin
git worktree add -b <task-branch> ..\<task-worktree> origin/master
cd ..\<task-worktree>
npm ci
```

Use task-specific names, for example:

```powershell
git worktree add -b mtgcollection-mobile ..\homepage-mobile origin/master
git worktree add -b mtgcollection-mcp ..\homepage-mcp origin/master
git worktree add -b mtgcollection-ops ..\homepage-ops origin/master
```

## During Work

- Own only the files needed for the assigned task.
- Do not modify another active worktree or another agent's dirty files.
- Commit focused changes with descriptive messages.
- Run relevant tests before pushing. For MTG Collection work, the default is:

```powershell
npm test
```

- If deploying a Cloudflare Worker, record the deployed Worker version in the
  final handoff.

## Publishing

Push task branches instead of pushing directly to `master`:

```powershell
git push -u origin <task-branch>
```

After CI passes and the user accepts the work, merge through the normal GitHub
flow or fast-forward `master` only when the shared workspace is clean.

## Cleanup

After a branch is merged and no agent is using its worktree:

```powershell
git worktree remove ..\<task-worktree>
git branch -d <task-branch>
```

Use `-D` only for branches that are backed up, merged elsewhere, or explicitly
approved for deletion.

## Safety Branches

When the shared workspace already contains valuable commits or active dirty
work, create a safety branch before any cleanup:

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
git branch "safety/<short-description>-$stamp" HEAD
```

If there are uncommitted changes, back them up outside the repo before touching
anything:

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = "C:\Users\benso\Projects\homepage-safety-backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
git diff --binary | Out-File "$backupDir\homepage-dirty-$stamp.patch" -Encoding utf8
git status --short --untracked-files=all | Out-File "$backupDir\homepage-untracked-$stamp.txt" -Encoding utf8
```

Untracked files may contain real work. Copy them before deletion unless the user
explicitly asks to remove them.
