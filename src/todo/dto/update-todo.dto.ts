import { BaseTodoDto } from './base-todo.dto';

export class UpdateTodoDto extends BaseTodoDto {
  updatedAt: number;
}
