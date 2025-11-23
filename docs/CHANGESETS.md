# Changesets Setup Guide

This monorepo uses [Changesets](https://github.com/changesets/changesets) for version management and automated publishing to GitHub Packages.

## Overview

Changesets helps manage versions and changelogs with a focus on multi-package repositories. When you make changes to published packages, you create a "changeset" which describes the changes and the version bump type.

## Workflow

### 1. Make Your Changes

Edit the code in `packages/types` (or any other published package).

### 2. Create a Changeset

After making your changes, run:

```bash
yarn changeset
```

This interactive CLI will ask you:
- Which packages have changed
- What type of version bump (major, minor, patch)
- A summary of the changes

The changeset will be saved as a markdown file in `.changeset/`.

### 3. Commit Your Changes

```bash
git add .
git commit -m "feat: add new user types"
git push
```

### 4. Automatic Version PR

When you push to the `main` branch, the GitHub Actions workflow will:
- Detect the changesets
- Create or update a "Version Packages" Pull Request
- This PR will contain:
  - Version bumps in `package.json`
  - Updated `CHANGELOG.md` files
  - Removal of changeset files (they're consumed)

### 5. Merge and Publish

When you merge the "Version Packages" PR:
- The workflow automatically publishes the new version to GitHub Packages
- Tags are created in the repository
- CHANGELOGs are committed

## Commands

### Create a changeset
```bash
yarn changeset
```

### Preview version changes (locally)
```bash
yarn version-packages
```

### Build and publish (automated in CI)
```bash
yarn release
```

### Build just the types package
```bash
yarn build:packages
```

## Publishing to GitHub Packages

The package `@archeon-org/types` is configured to publish to GitHub Packages. The workflow uses the built-in `GITHUB_TOKEN` which is automatically provided by GitHub Actions.

### Configuration Files

1. **`.changeset/config.json`** - Changesets configuration
   - `access: "public"` - Packages are publicly accessible
   - `ignore: ["archeon", "gate", "scribe"]` - Apps are not published

2. **`.github/workflows/release.yml`** - CI/CD workflow
   - Runs on push to `main`
   - Creates version PRs or publishes packages
   - Uses `GITHUB_TOKEN` for authentication

3. **`.npmrc`** - NPM configuration
   - Configures GitHub Packages registry for `@archeon-org` scope

4. **`packages/types/package.json`**
   - `publishConfig.registry` set to GitHub Packages
   - Build scripts for TypeScript compilation

## Using Published Packages

### Within the Monorepo

Packages are automatically linked via Yarn workspaces. Just import:

```typescript
import { User, UserType } from '@archeon-org/types';
```

### External Projects

1. Create `.npmrc` in your project:
```
@archeon-org:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

2. Install the package:
```bash
npm install @archeon-org/types
# or
yarn add @archeon-org/types
```

## Example Changeset Scenarios

### Adding a new feature (minor)
```bash
yarn changeset
# Select: @archeon-org/types
# Type: minor
# Summary: "Add new UserRole type for permissions"
```

### Fixing a bug (patch)
```bash
yarn changeset
# Select: @archeon-org/types
# Type: patch
# Summary: "Fix AuthProvider enum values"
```

### Breaking change (major)
```bash
yarn changeset
# Select: @archeon-org/types
# Type: major
# Summary: "BREAKING: Rename UserType to UserRole"
```

## Tips

- **Always create changesets** for changes to published packages
- **One changeset per feature** - makes it easier to track
- **Write clear summaries** - they appear in CHANGELOGs
- **Review the Version PR** before merging
- **Don't manually edit versions** - let Changesets handle it

## Troubleshooting

### Package not publishing
- Check GitHub Actions logs
- Ensure `GITHUB_TOKEN` has package write permissions
- Verify `publishConfig` in package.json

### Types not resolving in IDE
- Run `yarn install` to ensure workspace is linked
- Rebuild the types package: `yarn workspace @archeon-org/types build`
- Restart TypeScript server in your IDE

### Changesets not creating PR
- Ensure you're pushing to the `main` branch
- Check GitHub Actions is enabled for the repository
- Verify the workflow file exists in `.github/workflows/`

## Reference

- [Changesets Documentation](https://github.com/changesets/changesets)
- [GitHub Packages Documentation](https://docs.github.com/en/packages)
- [Yarn Workspaces](https://classic.yarnpkg.com/en/docs/workspaces/)
