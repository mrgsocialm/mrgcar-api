// MRGCAR API - Entry Point
// This file serves as the minimal entry point for the application.
// The actual Express app configuration resides in app.js for testability.

const { app } = require('./app');
const logger = require('./services/logger');

// Use port from environment or default to 3000
const PORT = process.env.PORT || 3000;

// Start server
app.listen(PORT, () => {
  logger.info(`MRGCAR API running on port ${PORT}`, {
    port: PORT,
    env: process.env.NODE_ENV || 'development',
  });
  logger.info('Registered Routes: /, /cars, /auth, /admin, /news, /forum, /sliders, /reviews, /notifications, /users, /uploads');
});