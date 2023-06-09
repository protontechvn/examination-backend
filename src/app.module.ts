import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ExamHistoryModule } from './exam-history/exam-history.module';
import { ExamModule } from './exam/exam.module';
import { QuestionModule } from './question/question.module';
import { SubjectModule } from './subject/subject.module';
import { TodoModule } from './todo/todo.module';
import { TopicModule } from './topic/topic.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    MongooseModule.forRoot(
      'mongodb+srv://admin:abcd1234@examination.fgjmhxz.mongodb.net/examination?retryWrites=true&w=majority',
    ),
    ConfigModule.forRoot({ isGlobal: true }),
    TodoModule,
    AuthModule,
    UserModule,
    QuestionModule,
    ExamModule,
    ExamHistoryModule,
    SubjectModule,
    TopicModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
