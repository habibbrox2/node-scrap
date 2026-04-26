#!/usr/bin/env node

/**
 * Auto-increment version on build and cleanup old files
 * Increments patch version: 1.0.0 -> 1.0.1
 * Removes old .exe files before new build
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const packagePath = path.join(__dirname, '..', 'package.json');
const distPath = path.join(__dirname, '..', 'dist');

try {
    // ============================================
    // Step 1: Cleanup old .exe files
    // ============================================
    if (fs.existsSync(distPath)) {
        console.log('🧹 Cleaning up old .exe files...');

        const exeFiles = glob.sync(path.join(distPath, '*.exe'), { sync: true });
        let deletedCount = 0;

        exeFiles.forEach(file => {
            try {
                fs.unlinkSync(file);
                console.log(`  ✓ Deleted: ${path.basename(file)}`);
                deletedCount++;
            } catch (err) {
                console.warn(`  ⚠ Could not delete ${path.basename(file)}: ${err.message}`);
            }
        });

        if (deletedCount > 0) {
            console.log(`✓ Cleaned up ${deletedCount} old .exe file(s)\n`);
        }
    }

    // ============================================
    // Step 2: Increment version
    // ============================================
    console.log('📦 Incrementing version...');

    // Read package.json
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

    // Get current version
    const currentVersion = packageJson.version;

    // Parse semantic version (major.minor.patch)
    const versionParts = currentVersion.split('.');
    if (versionParts.length !== 3) {
        throw new Error(`Invalid version format: ${currentVersion}`);
    }

    const major = parseInt(versionParts[0], 10);
    const minor = parseInt(versionParts[1], 10);
    let patch = parseInt(versionParts[2], 10);

    // Increment patch version
    patch++;

    const newVersion = `${major}.${minor}.${patch}`;

    // Update package.json
    packageJson.version = newVersion;
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');

    console.log(`✓ Version incremented: ${currentVersion} → ${newVersion}\n`);
    console.log('🚀 Ready to build...\n');
    process.exit(0);

} catch (err) {
    console.error('✗ Error:', err.message);
    process.exit(1);
}
