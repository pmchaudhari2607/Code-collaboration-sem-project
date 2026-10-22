const { DB_ENABLED } = require('../config/env');
const target = DB_ENABLED ? './mysql' : './in-memory';

const auth = require(`${target}/authService`);
const user = require(`${target}/userService`);
const project = require(`${target}/projectService`);
const file = require(`${target}/fileService`);
const review = require(`${target}/reviewService`);
const task = require(`${target}/taskService`);
const notification = require(`${target}/notificationService`);
const dashboard = require(`${target}/dashboardService`);
const search = require(`${target}/searchService`);
const message = require(`${target}/messageService`);
const dev = require(`${target}/devService`);

module.exports = {
  auth,
  user,
  project,
  file,
  review,
  task,
  notification,
  dashboard,
  search,
  message,
  dev,
  authService: auth,
  userService: user,
  projectService: project,
  fileService: file,
  reviewService: review,
  taskService: task,
  notificationService: notification,
  dashboardService: dashboard,
  searchService: search,
  messageService: message,
  devService: dev
};
