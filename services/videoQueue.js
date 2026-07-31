require('dotenv').config({ path: '/opt/wonderwave/.env' });

const { Queue } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379),
};

const videoQueue = new Queue('wonderwave-video', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 86400,
      count: 100,
    },
    removeOnFail: {
      age: 604800,
      count: 500,
    },
  },
});

module.exports = {
  videoQueue,
};
