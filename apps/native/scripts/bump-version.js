const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const versionFilePath = path.join(__dirname, '../version.json');

// Parse command line arguments to detect platform
const args = process.argv.slice(2);
const platformIndex = args.indexOf('--platform');
const platform = platformIndex !== -1 ? args[platformIndex + 1] : null;

function bumpVersion() {
  try {
    // Read current version config
    const versionConfig = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'));

    let bumpedPlatform = '';

    // Increment build numbers based on platform
    if (platform === 'android') {
      versionConfig.androidVersionCode += 1;
      bumpedPlatform = `Android ${versionConfig.androidVersionCode}`;
      console.log(`Bumped Android version code to: ${versionConfig.androidVersionCode}`);
    } else if (platform === 'ios') {
      versionConfig.

iosBuildNumber = (parseInt(versionConfig.iosBuildNumber, 10) + 1).toString();
      bumpedPlatform = `iOS ${versionConfig.iosBuildNumber}`;
      console.log(`Bumped iOS build number to: ${versionConfig.iosBuildNumber}`);
    } else {
      // If no platform specified, bump both (for full releases)
      versionConfig.androidVersionCode += 1;
      versionConfig.iosBuildNumber = (parseInt(versionConfig.iosBuildNumber, 10) + 1).toString();
      bumpedPlatform = `Android ${versionConfig.androidVersionCode}, iOS ${versionConfig.iosBuildNumber}`;
      console.log(`Bumped both platforms: Android ${versionConfig.androidVersionCode}, iOS ${versionConfig.iosBuildNumber}`);
    }

    // Write back to file
    fs.writeFileSync(versionFilePath, JSON.stringify(versionConfig, null, 2) + '\n');

    // Git commit
    try {
      execSync(`git add ${versionFilePath}`);
      execSync(`git commit -m "chore: bump build version (${bumpedPlatform})"`);
      console.log('Committed version bump to git.');
    } catch (error) {
      console.error('Failed to commit version bump to git:', error.message);
      // Don't fail the build if git commit fails (e.g. in CI without git config)
    }

  } catch (error) {
    console.error('Error bumping version:', error);
    process.exit(1);
  }
}

bumpVersion();
