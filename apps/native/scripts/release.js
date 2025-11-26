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
  // Store original state for rollback
  let originalVersionConfig = null;
  let originalChangelog = null;
  let filesModified = false;

  try {
    // 1. Read and backup current version
    originalVersionConfig = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'));
    const currentVersion = originalVersionConfig.version;
    
    if (fs.existsSync(changelogPath)) {
      originalChangelog = fs.readFileSync(changelogPath, 'utf8');
    }
    
    console.log(chalk.cyan(`Current Version: ${currentVersion} (Build: iOS ${originalVersionConfig.iosBuildNumber}, Android ${originalVersionConfig.androidVersionCode})`));

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

    //Increment build numbers based on platform (if specified)
    let newAndroidVersionCode = originalVersionConfig.androidVersionCode;
    let newIosBuildNumber = originalVersionConfig.iosBuildNumber;

    if (shouldBuild && platform) {
      // Only bump the platform being built
      if (platform === 'android') {
        newAndroidVersionCode = originalVersionConfig.androidVersionCode + 1;
        console.log(chalk.blue(`Building for Android - bumping Android version code only`));
      } else if (platform === 'ios') {
        newIosBuildNumber = (parseInt(originalVersionConfig.iosBuildNumber, 10) + 1).toString();
        console.log(chalk.blue(`Building for iOS - bumping iOS build number only`));
      }
    } else {
      // No build or no platform specified - bump both (for full releases)
      newAndroidVersionCode = originalVersionConfig.androidVersionCode + 1;
      newIosBuildNumber = (parseInt(originalVersionConfig.iosBuildNumber, 10) + 1).toString();
    }

    // 4. Update version.json
    const newVersionConfig = {
      version: newVersion,
      androidVersionCode: newAndroidVersionCode,
      iosBuildNumber: newIosBuildNumber
    };

    fs.writeFileSync(versionFilePath, JSON.stringify(newVersionConfig, null, 2) + '\n');
    filesModified = true;
    console.log(chalk.green(`\n✔ Updated version to ${newVersion}`));
    console.log(chalk.green(`✔ Build numbers: Android ${newAndroidVersionCode}, iOS ${newIosBuildNumber}`));

    // 5. Update CHANGELOG.md BEFORE build
    const date = new Date().toISOString().split('T')[0];
    const changelogEntry = `\n## [${newVersion}] - ${date} (iOS: ${newIosBuildNumber}, Android: ${newAndroidVersionCode})\n-

 ${answers.description}\n`;
    
    let currentChangelog = originalChangelog || '# Changelog\n\nAll notable changes to this project will be documented in this file.\n';

    const headerMarker = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n';
    let newChangelog;
    if (currentChangelog.startsWith(headerMarker)) {
      newChangelog = currentChangelog.replace(headerMarker, headerMarker + changelogEntry);
    } else {
      newChangelog = headerMarker + changelogEntry + currentChangelog.replace('# Changelog\n', '');
    }

    fs.writeFileSync(changelogPath, newChangelog);
    console.log(chalk.green(`✔ Updated CHANGELOG.md`));

    // 6. Run Build (if requested) - THIS IS THE CRITICAL STEP
    if (shouldBuild && platform) {
      console.log(chalk.blue(`\n🚀 Starting local build for ${platform}...`));
      try {
        execSync(`eas build --platform ${platform} --profile production --local`, { stdio: 'inherit' });
        console.log(chalk.green('\n✔ Build completed successfully!'));
      } catch (error) {
        console.error(chalk.red('\n❌ Build failed! Reverting all changes...'));
        // Revert ALL changes
        if (originalVersionConfig) {
          fs.writeFileSync(versionFilePath, JSON.stringify(originalVersionConfig, null, 2) + '\n');
        }
        if (originalChangelog) {
          fs.writeFileSync(changelogPath, originalChangelog);
        } else if (fs.existsSync(changelogPath)) {
          // If there was no original changelog, remove the one we created
          fs.unlinkSync(changelogPath);
        }
        console.log(chalk.yellow('✔ Reverted version.json and CHANGELOG.md'));
        process.exit(1);
      }
    }

    // 7. Git Commit (only after successful build or no build)
    try {
      execSync(`git add ${versionFilePath} ${changelogPath}`);
      execSync(`git commit -m "chore(release): ${newVersion} - ${answers.description}"`);
      console.log(chalk.green('✔ Committed changes to git'));
    } catch (error) {
      console.error(chalk.yellow('⚠ Failed to commit changes to git'));
      console.error(chalk.yellow('⚠ Files were modified but not committed. You may want to commit manually or revert.'));
    }

    console.log(chalk.green.bold(`\n🎉 Release ${newVersion} completed successfully!`));

  } catch (error) {
    console.error(chalk.red('Error during release:'), error);
    
    // Rollback if files were modified
    if (filesModified && originalVersionConfig) {
      console.log(chalk.yellow('Attempting to revert changes...'));
      try {
        fs.writeFileSync(versionFilePath, JSON.stringify(originalVersionConfig, null, 2) + '\n');
        if (originalChangelog) {
          fs.writeFileSync(changelogPath, originalChangelog);
        }
        console.log(chalk.green('✔ Successfully reverted changes'));
      } catch (revertError) {
        console.error(chalk.red('❌ Failed to revert changes!'), revertError);
      }
    }
    
    process.exit(1);
  }
}

release();
