import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/user.dto';
import { User } from '@archeon-org/types';
import {
  ApiGetMeDocs,
  ApiUpdateMeDocs,
  ApiUserControllerDocs,
} from './user.docs';

@ApiUserControllerDocs()
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @ApiGetMeDocs()
  async getMe(@Req() req: Request & { user: User }) {
    return this.userService.findById(req.user.id);
  }

  @Put('me')
  @ApiUpdateMeDocs()
  async updateMe(
    @Req() req: Request & { user: User },
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.userService.update(req.user.id, updateUserDto);
  }
}
