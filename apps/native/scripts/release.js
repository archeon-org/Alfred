const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Try to require dependencies
let inquirer, chalk, semver;
try {
  inquirer = require('inquirer');
  chalk = require('chalk');
  semver = require('semver');
} catch (e) {
  console.error('Missing dependencies. Please run: yarn add -D inquirer@^8.0.0 chalk@^4.1.2 semver');
  process.exit(1);
}

const versionFilePath = path.join(__dirname, '../version.json');
const changelogPath = path.join(__dirname, '../CHANGELOG.md');

// Parse command line arguments
const args = process.argv.slice(2);
const shouldBuild = args.includes('--build');
const platformIndex = args.indexOf('--platform');
const platform = platformIndex !== -1 ? args[platformIndex + 1] : null;

async function release() {
  try {
    // 1. Read current version
    const versionConfig = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'));
    const currentVersion = versionConfig.version;
    
    console.log(chalk.cyan(`Current Version: ${currentVersion} (Build: iOS ${versionConfig.iosBuildNumber}, Android ${versionConfig.androidVersionCode})`));

    // 2. Ask for release type
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'type',
        message: 'What type of release is this?',
        choices: [
          { name: `Patch (${semver.inc(currentVersion, 'patch')}) - Bug fixes`, value: 'patch' },
          { name: `Minor (${semver.inc(currentVersion, 'minor')}) - New features`, value: 'minor' },
          { name: `Major (${semver.inc(currentVersion, 'major')}) - Breaking changes`, value: 'major' },
          { name: 'Build Bump Only (No version change)', value: 'build' }
        ]
      },
      {
        type: 'input',
        name: 'description',
        message: 'Enter a description for the changelog:',
        validate: input => input.length > 0 ? true : 'Description is required'
      }
    ]);

    // 3. Calculate new values
    let newVersion = currentVersion;
    if (answers.type !== 'build') {
      newVersion = semver.inc(currentVersion, answers.type);
    }

    // Always increment build numbers for any release/deployment
    const newAndroidVersionCode = versionConfig.androidVersionCode + 1;
    const newIosBuildNumber = (parseInt(versionConfig.iosBuildNumber, 10) + 1).toString();

    // 4. Update version.json
    const newVersionConfig = {
      version: newVersion,
      androidVersionCode: newAndroidVersionCode,
      iosBuildNumber: newIosBuildNumber
    };

    fs.writeFileSync(versionFilePath, JSON.stringify(newVersionConfig, null, 2) + '\n');
    console.log(chalk.green(`\n✔ Updated version to ${newVersion}`));
    console.log(chalk.green(`✔ Bumped build numbers to: Android ${newAndroidVersionCode}, iOS ${newIosBuildNumber}`));

    // 5. Run Build (if requested)
    if (shouldBuild && platform) {
      console.log(chalk.blue(`\n🚀 Starting local build for ${platform}...`));
      try {
        execSync(`eas build --platform ${platform} --profile production --local`, { stdio: 'inherit' });
        console.log(chalk.green('\n✔ Build completed successfully!'));
      } catch (error) {
        console.error(chalk.red('\n❌ Build failed! Reverting version changes...'));
        // Revert version.json
        fs.writeFileSync(versionFilePath, JSON.stringify(versionConfig, null, 2) + '\n');
        process.exit(1);
      }
    }

    // 6. Update CHANGELOG.md (Only if build succeeded or no build was requested)
    const date = new Date().toISOString().split('T')[0];
    const changelogEntry = `\n## [${newVersion}] - ${date} (Build ${newIosBuildNumber})\n- ${answers.description}\n`;
    
    let currentChangelog = '';
    if (fs.existsSync(changelogPath)) {
      currentChangelog = fs.readFileSync(changelogPath, 'utf8');
    } else {
      currentChangelog = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n';
    }

    // Insert after the header
    const headerMarker = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n';
    let newChangelog;
    if (currentChangelog.startsWith(headerMarker)) {
      newChangelog = currentChangelog.replace(headerMarker, headerMarker + changelogEntry);
    } else {
      newChangelog = headerMarker + changelogEntry + currentChangelog.replace('# Changelog\n', '');
    }

    fs.writeFileSync(changelogPath, newChangelog);
    console.log(chalk.green(`✔ Updated CHANGELOG.md`));

    // 7. Git Commit
    try {
      execSync(`git add ${versionFilePath} ${changelogPath}`);
      execSync(`git commit -m "chore(release): ${newVersion} - ${answers.description}"`);
      console.log(chalk.green('✔ Committed changes to git'));
    } catch (error) {
      console.error(chalk.yellow('⚠ Failed to commit changes to git (is this a git repo?)'));
    }

  } catch (error) {
    console.error(chalk.red('Error during release:'), error);
    // Try to revert version file if it was changed
    try {
      const versionConfig = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'));
      // This is a simplistic revert, ideally we'd read the original state at the start
      // But since we crash, we might not want to revert if we don't know the state.
      // For now, relying on the build failure revert block above.
    } catch (e) {}
    process.exit(1);
  }
}

release();
