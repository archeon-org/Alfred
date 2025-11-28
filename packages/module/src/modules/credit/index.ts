import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserEntity } from "@archeon-org/database";
import { CreditService } from "./credit.service";

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  providers: [CreditService],
  exports: [CreditService],
})
export class CreditModule {}
