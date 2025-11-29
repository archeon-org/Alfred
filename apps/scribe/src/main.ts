import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { Queue } from 'bull';
import { getQueueToken } from '@nestjs/bull';

// Track this worker's active jobs
export const activeJobsInThisWorker = new Set<string>();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  const port = process.env.PORT ?? 3000;
  const workerId = process.env.WORKER_HOST || 'unknown';

  // Get the documents queue for graceful shutdown
  const documentsQueue = app.get<Queue>(getQueueToken('documents'));

  // Graceful shutdown handler
  let isShuttingDown = false;

  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return; // Prevent multiple shutdown attempts
    isShuttingDown = true;

    Logger.log(
      `⚠️ [${workerId}] Received ${signal}. Starting graceful shutdown...`,
      'Main',
    );

    // 1. Pause the queue - stop accepting new jobs
    Logger.log(
      `⏸️ [${workerId}] Pausing queue - no new jobs will be processed...`,
      'Main',
    );
    await documentsQueue.pause(true); // true = pause only this worker

    // 2. Wait for THIS WORKER's active jobs to complete (not global count)
    // With optimized OCR (60s timeout + early stop), jobs complete in ~2 min max
    const maxWaitTime = 3 * 60 * 1000; // 3 minutes max wait
    const startTime = Date.now();

    const checkActiveJobs = async (): Promise<void> => {
      // Use our own tracking instead of global getActiveCount()
      const myActiveJobs = activeJobsInThisWorker.size;
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      if (myActiveJobs > 0) {
        if (Date.now() - startTime >= maxWaitTime) {
          Logger.warn(
            `⚠️ [${workerId}] Graceful shutdown timeout (${elapsed}s). ` +
              `${myActiveJobs} job(s) in this worker will be returned to queue for retry.`,
            'Main',
          );
          Logger.warn(
            `⚠️ [${workerId}] Active job IDs: ${Array.from(activeJobsInThisWorker).join(', ')}`,
            'Main',
          );
          return;
        }

        Logger.log(
          `⏳ [${workerId}] Waiting for ${myActiveJobs} active job(s) in this worker... (${elapsed}s elapsed)`,
          'Main',
        );

        return new Promise((resolve) => {
          setTimeout(async () => {
            await checkActiveJobs();
            resolve();
          }, 5000); // Check every 5 seconds
        });
      }
      Logger.log(`✅ [${workerId}] All jobs in this worker completed!`, 'Main');
    };

    await checkActiveJobs();

    // 3. Close the application
    Logger.log(`🛑 [${workerId}] Closing application...`, 'Main');
    await app.close();
    process.exit(0);
  };

  // Register shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  await app.listen(port);
  Logger.log(
    `🚀 [${workerId}] Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}
bootstrap();
