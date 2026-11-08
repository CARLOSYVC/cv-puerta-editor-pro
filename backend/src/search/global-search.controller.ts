import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { GlobalSearchQueryDto } from './global-search-query.dto.js';
import { GlobalSearchService } from './global-search.service.js';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class GlobalSearchController {
  constructor(private readonly globalSearch: GlobalSearchService) {}

  @Get()
  search(
    @Query() query: GlobalSearchQueryDto,
    @Req() request: Pick<AuthenticatedRequest, 'user'>,
  ) {
    return this.globalSearch.search(query.query, request.user.sub);
  }
}
