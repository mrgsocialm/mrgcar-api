/**
 * Migrate console.log/error/warn to Winston logger
 * Run: node scripts/migrateToWinston.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const files = [
    'app.js',
    'routes/auth.js',
    'routes/cars.js',
    'routes/forum.js',
    'routes/news.js',
    'routes/reviews.js',
    'routes/sliders.js',
    'routes/uploads.js',
    'routes/users.js',
    'routes/notifications.js',
    'routes/admin.js',
    'services/email.js',
    'services/fcm.js',
    'services/r2.js',
    'middleware/activityLogger.js',
];

let totalUpdated = 0;

files.forEach(f => {
    const fp = path.join(root, f);
    if (!fs.existsSync(fp)) {
        console.log(`SKIP: ${f} not found`);
        return;
    }

    let content = fs.readFileSync(fp, 'utf8');
    const original = content;

    // Skip if already migrated
    if (content.includes("require('../services/logger')") || content.includes("require('./services/logger')")) {
        console.log(`SKIP: ${f} already has logger`);
        return;
    }

    // Determine require path based on file depth
    const isRoot = !f.includes('/');
    const requireStatement = isRoot
        ? "const logger = require('./services/logger');"
        : "const logger = require('../services/logger');";

    // Add logger require after the first require statement block
    const lines = content.split('\n');
    let insertIndex = -1;

    // Find the last require/import line in the top of the file
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
        if (lines[i].includes('require(') || lines[i].includes('module.exports')) {
            insertIndex = i;
        }
        // Stop at first function or router definition
        if (lines[i].includes('function ') || lines[i].includes('router.') || lines[i].includes('app.')) {
            break;
        }
    }

    if (insertIndex >= 0) {
        lines.splice(insertIndex + 1, 0, requireStatement);
        content = lines.join('\n');
    }

    // Replace console methods
    content = content.replace(/console\.error\(/g, 'logger.error(');
    content = content.replace(/console\.warn\(/g, 'logger.warn(');
    content = content.replace(/console\.log\(/g, 'logger.info(');

    if (content !== original) {
        fs.writeFileSync(fp, content);
        totalUpdated++;
        console.log(`UPDATED: ${f}`);
    }
});

console.log(`\nDone! Updated ${totalUpdated} files.`);
