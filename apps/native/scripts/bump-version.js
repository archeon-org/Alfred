const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const versionFilePath = path.join(__dirname, '../version.json');

function bumpVersion() {
  try {
    // Read current version config
    const versionConfig = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'));

    // Increment build numbers
    versionConfig.androidVersionCode += 1;
    versionConfig.iosBuildNumber = (parseInt(versionConfig.iosBuildNumber, 10) + 1).toString();

    // Write back to file
    fs.writeFileSync(versionFilePath, JSON.stringify(versionConfig, null, 2) + '\n');

    console.log(`Bumped version to: Android ${versionConfig.androidVersionCode}, iOS ${versionConfig.iosBuildNumber}`);

    // Git commit
    try {
      execSync(`git add ${versionFilePath}`);
      execSync(`git commit -m "chore: bump build version to ${versionConfig.iosBuildNumber}"`);
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
