import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from 'src/user/user.module';
import { ExamController } from './exam.controller';
import { ExamService } from './exam.service';
import { Exam, ExamSchema } from './schemas/exam.schema';

@Module({
  providers: [ExamService],
  controllers: [ExamController],
  imports: [
    MongooseModule.forFeature([{ name: Exam.name, schema: ExamSchema }]),
    UserModule,
  ],
  exports: [ExamService],
})
export class ExamModule {}
