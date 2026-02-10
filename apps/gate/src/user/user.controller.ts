import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/user.dto';
import { User } from '@archeon-org/types';

@ApiTags('user')
@ApiBearerAuth('JWT-auth')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Get current user',
    description: 'Retrieves the authenticated user profile.',
  })
  @ApiOkResponse({
    description: 'User profile',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string', format: 'email' },
        firstName: { type: 'string', nullable: true },
        lastName: { type: 'string', nullable: true },
        profilePicture: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getMe(@Req() req: Request & { user: User }) {
    return this.userService.findById(req.user.id);
  }

  @Put('me')
  @ApiOperation({
    summary: 'Update current user',
    description: 'Updates the authenticated user profile.',
  })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({
    description: 'Updated user profile',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async updateMe(
    @Req() req: Request & { user: User },
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.userService.update(req.user.id, updateUserDto);
  }
}
