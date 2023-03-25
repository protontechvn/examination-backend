export class BaseQuestionDto {
  title: string;
  answers: { label: string; value: string; isCorrect: boolean }[];
  level: number;
  subjectId: string;
  teacherId: string;
  security: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  explanation: string;
}