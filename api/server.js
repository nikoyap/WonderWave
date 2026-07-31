require('dotenv').config({
  path: '/opt/wonderwave/.env',
});

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');

const {
  videoQueue,
} = require('../services/videoQueue');

const app = express();

const port = Number(
  process.env.PORT || 3000
);

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(
    process.env.REDIS_PORT || 6379
  ),
  maxRetriesPerRequest: 3,
});

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());

app.use(
  express.json({
    limit: '10mb',
  })
);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/*
 * Health check
 */

app.get('/health', async (req, res) => {
  try {
    const redisStatus = await redis.ping();

    return res.json({
      success: true,
      service: 'wonderwave-api',
      status: 'healthy',
      redis: redisStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      service: 'wonderwave-api',
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/*
 * ClickUp webhook
 */

app.post(
  '/webhooks/clickup',
  async (req, res, next) => {
    try {
      /*
       * Validate webhook secret
       */

      const providedSecret =
        req.headers['x-wonderwave-secret'];

      if (
        !process.env.WEBHOOK_SECRET ||
        providedSecret !==
          process.env.WEBHOOK_SECRET
      ) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
      }

      /*
       * ClickUp automation sends the task inside
       * req.body.payload.
       *
       * Manual requests may send fields directly
       * inside req.body, so both formats are
       * supported.
       */

      const clickupTask =
        req.body?.payload &&
        typeof req.body.payload === 'object'
          ? req.body.payload
          : req.body;

      const taskId =
        clickupTask?.task_id ||
        clickupTask?.taskId ||
        clickupTask?.id ||
        req.body?.task_id ||
        req.body?.taskId ||
        req.body?.id ||
        req.query?.task_id ||
        req.query?.taskId ||
        req.query?.id;

      if (!taskId) {
        console.error(
          '[Webhook] Missing task ID'
        );

        return res.status(400).json({
          success: false,
          error:
            'Missing task_id in webhook request',
        });
      }

      /*
       * Map ClickUp fields into the structure
       * expected by projectService.js.
       */

      const topic =
        clickupTask?.topic ||
        clickupTask?.name ||
        clickupTask?.title;

      const script =
        clickupTask?.script ||
        clickupTask?.text_content ||
        clickupTask?.description ||
        clickupTask?.content;

      if (!topic && !script) {
        console.error(
          '[Webhook] Missing topic and script',
          {
            taskId,
            availableFields:
              Object.keys(clickupTask || {}),
          }
        );

        return res.status(400).json({
          success: false,
          error:
            'At least one of topic or script is required',
        });
      }

      const payload = {
        ...clickupTask,

        task_id: String(taskId),

title: topic
  ? String(topic)
  : undefined,        

topic: topic
          ? String(topic)
          : undefined,

        script: script
          ? String(script)
          : undefined,

        automation_id:
          req.body?.auto_id || null,

        trigger_id:
          req.body?.trigger_id || null,

        webhook_date:
          req.body?.date || null,
      };

      console.log(
        '[Webhook] Accepted ClickUp task:',
        {
          task_id: payload.task_id,
          topic: payload.topic || null,
          script_length:
            payload.script?.length || 0,
          automation_id:
            payload.automation_id,
          trigger_id:
            payload.trigger_id,
        }
      );

      /*
       * Add the normalized payload to BullMQ.
       */

      const job = await videoQueue.add(
        'generate-video',
        payload,
        {
          jobId: `task-${payload.task_id}`,
          attempts: 1,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: {
            age: 24 * 60 * 60,
            count: 100,
          },
          removeOnFail: {
            age: 7 * 24 * 60 * 60,
            count: 500,
          },
        }
      );

      console.log(
        `[Webhook] Queued job ${job.id} for task ${payload.task_id}`
      );

      return res.status(202).json({
        success: true,
        status: 'queued',
        jobId: job.id,
        taskId: payload.task_id,
        queue: 'wonderwave-video',
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
 * 404 response
 */

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

/*
 * Error handler
 */

app.use((error, req, res, next) => {
  console.error('[API Error]', {
    message: error.message,
    stack: error.stack,
  });

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

/*
 * Start API
 */

const server = app.listen(
  port,
  '127.0.0.1',
  () => {
    console.log(
      `WonderWave API listening on 127.0.0.1:${port}`
    );
  }
);

/*
 * Graceful shutdown
 */

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(
    `${signal} received. Shutting down.`
  );

  server.close(async () => {
    try {
      await videoQueue.close();
      await redis.quit();

      console.log(
        'WonderWave API shut down successfully.'
      );

      process.exit(0);
    } catch (error) {
      console.error(
        '[Shutdown Error]',
        error
      );

      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error(
      'Forced shutdown after timeout.'
    );

    process.exit(1);
  }, 10000).unref();
}

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);
