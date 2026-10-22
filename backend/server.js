const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const errorMiddleware = require('./middleware/errorMiddleware');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const projectRoutes = require('./routes/projectRoutes');
const fileRoutes = require('./routes/fileRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const taskRoutes = require('./routes/taskRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const searchRoutes = require('./routes/searchRoutes');
const messageRoutes = require('./routes/messageRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const devRoutes = require('./routes/devRoutes');

const { ping } = require('./db/pool');

const app = express();
const corsOrigins = (typeof config.CORS_ORIGIN === 'string' && config.CORS_ORIGIN.includes(','))
  ? config.CORS_ORIGIN.split(',').map(s => s.trim())
  : config.CORS_ORIGIN;
app.use(cors({ origin: corsOrigins }));
app.use(express.json());

app.get('/api/health', async (req, res) => {
  let dbStatus = 'disabled';
  if (config.DB_ENABLED) {
    try {
      const isUp = await ping();
      dbStatus = isUp ? 'reachable' : 'unavailable';
    } catch {
      dbStatus = 'unavailable';
    }
  }
  res.json({ success: true, message: "CodeReviewHub API is running", db: dbStatus });
});


app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/dev', devRoutes);

app.use(errorMiddleware);

if (require.main === module) {
  app.listen(config.PORT, () => {
    console.log(`Server is running on port ${config.PORT}`);
  });
}

module.exports = app;
