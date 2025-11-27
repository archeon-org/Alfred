import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NotificationEntity, UserEntity } from "@archeon-org/database";
import { NotificationService } from "./notification.service";

@Module({
  imports: [TypeOrmModule.forFeature([NotificationEntity, UserEntity])],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
