import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import {
  type AuthenticatedStaffUser,
  CurrentUser,
  Roles,
} from './decorators/roles.decorator.js';
import { InviteStaffUserDto, UpdateStaffUserDto } from './dto/auth.dto.js';
import { StaffUsersService } from './staff-users.service.js';

@Controller('staff-users')
export class StaffUsersController {
  constructor(@Inject(StaffUsersService) private readonly staffUsersService: StaffUsersService) {}

  @Roles('SUPERADMIN', 'ADMIN')
  @Get()
  list(@CurrentUser() actor: AuthenticatedStaffUser) {
    return this.staffUsersService.list(actor);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Post('invite')
  invite(
    @CurrentUser() actor: AuthenticatedStaffUser,
    @Body() dto: InviteStaffUserDto,
    @Req() req: { ip?: string },
  ) {
    return this.staffUsersService.invite(actor, dto, req.ip);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedStaffUser,
    @Param('id') id: string,
    @Body() dto: UpdateStaffUserDto,
    @Req() req: { ip?: string },
  ) {
    return this.staffUsersService.update(actor, id, dto, req.ip);
  }

  @Roles('SUPERADMIN', 'ADMIN')
  @Delete(':id')
  deactivate(
    @CurrentUser() actor: AuthenticatedStaffUser,
    @Param('id') id: string,
    @Query('permanent') permanent: string | undefined,
    @Req() req: { ip?: string },
  ) {
    if (permanent === 'true') {
      return this.staffUsersService.removePermanently(actor, id, req.ip);
    }
    return this.staffUsersService.deactivate(actor, id, req.ip);
  }
}
