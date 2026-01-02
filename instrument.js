// Sentry Instrumentation - Must be imported first before any other modules
const Sentry = require("@sentry/node");

// Try to load profiling, but make it optional (may fail on Windows)
let nodeProfilingIntegration;
try {
    nodeProfilingIntegration = require("@sentry/profiling-node").nodeProfilingIntegration;
} catch (e) {
    console.warn("⚠️ Sentry profiling not available on this platform");
    nodeProfilingIntegration = null;
}

const integrations = [];
if (nodeProfilingIntegration) {
    integrations.push(nodeProfilingIntegration());
}

Sentry.init({
    dsn: process.env.SENTRY_DSN || "https://e82d5c0d8344f9ba404a0e1d68dd5a99@o4510625374666752.ingest.de.sentry.io/4510625382465616",

    integrations,

    // Send structured logs to Sentry
    enableAILogs: true,
    debug: false,

    // Performance Monitoring
    tracesSampleRate: 1.0, // Capture 100% of transactions (lower in production for high traffic)

    // Profiling
    profilesSampleRate: 1.0, // Profile 100% of sampled transactions

    // Environment
    environment: process.env.NODE_ENV || "development",

    // Release tracking (optional - can be set via CI/CD)
    // release: "mrgcar-api@1.0.0",

    // Filter out sensitive data
    beforeSend(event) {
        // Remove sensitive data from events if needed
        if (event.request && event.request.headers) {
            delete event.request.headers['authorization'];
            delete event.request.headers['x-admin-token'];
        }
        return event;
    },
});

console.log("✅ Sentry initialized for error monitoring and profiling");

module.exports = Sentry;
