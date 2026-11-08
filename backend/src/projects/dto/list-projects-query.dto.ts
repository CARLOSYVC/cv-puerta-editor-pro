import { IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../../common/list-query.dto.js';

export class ListProjectsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;
}
