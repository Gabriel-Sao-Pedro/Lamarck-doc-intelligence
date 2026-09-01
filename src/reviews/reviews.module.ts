import { Module } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard.js';
import { ReviewQueueService } from './review-queue.service.js';
import { ReviewsController } from './reviews.controller.js';

@Module({
  controllers: [ReviewsController],
  providers: [ReviewQueueService, ApiKeyGuard],
})
export class ReviewsModule {}
