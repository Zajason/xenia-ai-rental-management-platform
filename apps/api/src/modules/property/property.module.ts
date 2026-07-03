import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentOrg } from '../../common/current-org.decorator.js';
import { Roles } from '../../auth/decorators.js';
import { ZodValidationPipe } from '../../auth/zod-validation.pipe.js';
import { PropertyService } from './property.service.js';

const createPropertySchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional(),
  timezone: z.string().max(64).optional(),
});
const createUnitSchema = z.object({
  name: z.string().min(1).max(200),
  capacity: z.number().int().min(1).max(50).optional(),
  bedrooms: z.number().int().min(0).max(20).optional(),
});
const updateUnitSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['ready', 'dirty', 'maintenance', 'blocked']).optional(),
});
const factSchema = z.object({
  category: z.string().min(1).max(48),
  key: z.string().min(1).max(96),
  value: z.string().min(1),
});

@ApiTags('property')
@ApiBearerAuth()
@Controller()
class PropertyController {
  constructor(private readonly props: PropertyService) {}

  @Roles('manager')
  @Post('properties')
  createProperty(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(createPropertySchema)) body: z.infer<typeof createPropertySchema>,
  ) {
    return this.props.createProperty(orgId, body);
  }

  @Get('properties')
  listProperties(@CurrentOrg() orgId: string) {
    return this.props.listProperties(orgId);
  }

  @Roles('manager')
  @Post('properties/:id/units')
  createUnit(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) propertyId: string,
    @Body(new ZodValidationPipe(createUnitSchema)) body: z.infer<typeof createUnitSchema>,
  ) {
    return this.props.createUnit(orgId, propertyId, body);
  }

  @Get('units')
  listUnits(@CurrentOrg() orgId: string) {
    return this.props.listUnits(orgId);
  }

  @Roles('manager')
  @Patch('units/:id')
  updateUnit(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) unitId: string,
    @Body(new ZodValidationPipe(updateUnitSchema)) body: z.infer<typeof updateUnitSchema>,
  ) {
    return this.props.updateUnit(orgId, unitId, body);
  }

  @Roles('manager')
  @Post('units/:id/facts')
  addFact(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) unitId: string,
    @Body(new ZodValidationPipe(factSchema)) body: z.infer<typeof factSchema>,
  ) {
    return this.props.addFact(orgId, unitId, body);
  }

  @Get('units/:id/facts')
  listFacts(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) unitId: string) {
    return this.props.listFacts(orgId, unitId);
  }
}

@Module({ controllers: [PropertyController], providers: [PropertyService], exports: [PropertyService] })
export class PropertyModule {}
