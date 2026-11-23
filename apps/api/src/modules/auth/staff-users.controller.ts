import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
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

  @Roles('SUPERADMIN')
  @Get()
  list() {
    return this.staffUsersService.list();
  }

  @Roles('SUPERADMIN')
  @Post('invite')
  invite(
    @CurrentUser() actor: AuthenticatedStaffUser,
    @Body() dto: InviteStaffUserDto,
    @Req() req: { ip?: string },
  ) {
    return this.staffUsersService.invite(actor.id, dto, req.ip);
  }

  @Roles('SUPERADMIN')
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedStaffUser,
    @Param('id') id: string,
    @Body() dto: UpdateStaffUserDto,
    @Req() req: { ip?: string },
  ) {
    return this.staffUsersService.update(actor.id, id, dto, req.ip);
  }

  @Roles('SUPERADMIN')
  @Delete(':id')
  deactivate(
    @CurrentUser() actor: AuthenticatedStaffUser,
    @Param('id') id: string,
    @Req() req: { ip?: string },
  ) {
    return this.staffUsersService.deactivate(actor.id, id, req.ip);
  }
}
