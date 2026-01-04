// MRGCAR API - Entry Point
// This file serves as the minimal entry point for the application.
// The actual Express app configuration resides in app.js for testability.

const { app } = require('./app');

// Use port from environment or default to 3000
const PORT = process.env.PORT || 3000;

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MRGCAR API running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('\n--- Registered Routes ---');
  console.log('  GET    /              (Health Check)');
  console.log('  /cars                 (Cars Router)');
  console.log('  /auth                 (User Auth Router)');
  console.log('  /admin                (Admin Auth Router)');
  console.log('  /news                 (News Router)');
  console.log('  /forum                (Forum Router)');
  console.log('  /sliders              (Sliders Router)');
  console.log('  /notifications        (Notifications Router)');
  console.log('  /users                (Users Router)');
  console.log('  /uploads              (Uploads Router)');
  console.log('-------------------------\n');
});