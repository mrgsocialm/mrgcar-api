// Route registry - imports all routes and exports them
const createCarsRouter = require('./cars');
const createAuthRouter = require('./auth');
const createAdminRouter = require('./admin');
const createNewsRouter = require('./news');
const createForumRouter = require('./forum');
const createSlidersRouter = require('./sliders');
const createNotificationsRouter = require('./notifications');

module.exports = {
    cars: createCarsRouter,
    auth: createAuthRouter,
    admin: createAdminRouter,
    news: createNewsRouter,
    forum: createForumRouter,
    sliders: createSlidersRouter,
    notifications: createNotificationsRouter,
};
