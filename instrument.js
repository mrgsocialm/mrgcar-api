// Sentry Instrumentation - Must be imported first before any other modules
const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

Sentry.init({
    dsn: process.env.SENTRY_DSN || "https://e920cd3b334ff8a94ade1e188d5a560e91062537466752.ingest.de.sentry.io/4510822302415616",

    integrations: [
        nodeProfilingIntegration(),
    ],

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
