import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ModuleAccess } from '../auth/module-access.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateMaterialDto } from './dto/create-material.dto.js';
import { UpdateMaterialDto } from './dto/update-material.dto.js';
import { MaterialsService } from './materials.service.js';
import { ListQueryDto } from '../common/list-query.dto.js';

@ApiTags('materials')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@ModuleAccess('materials')
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Get()
  findAll() {
    return this.materialsService.findAll();
  }

  @Get('paginated')
  findPaginated(@Query() query: ListQueryDto) {
    return this.materialsService.findPaginated(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.materialsService.findOne(id);
  }

  @Post()
  create(@Body() input: CreateMaterialDto) {
    return this.materialsService.create(input);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateMaterialDto,
  ) {
    return this.materialsService.update(id, input);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.materialsService.remove(id);
  }
}
