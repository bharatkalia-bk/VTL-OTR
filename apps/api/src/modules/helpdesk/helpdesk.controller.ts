import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CandidateGuard, CurrentUser } from '../../common/auth';
import type { AccessClaims } from '../../security/tokens.service';
import { DocumentsService } from '../profile/documents.service';
import { HelpdeskService } from './helpdesk.service';

@ApiTags('Helpdesk')
@Controller('helpdesk')
export class HelpdeskController {
  constructor(private readonly svc: HelpdeskService, private readonly docs: DocumentsService) {}

  @Post('public-tickets')
  createPublic(@Body() b: unknown, @Req() req: Request) {
    return this.svc.createPublic(b, req.ip ?? 'unknown');
  }

  @Post('attachments')
  @UseGuards(CandidateGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  attach(@CurrentUser() u: AccessClaims, @UploadedFile() file: Express.Multer.File) {
    return this.docs.upload(u.sub, 'HELPDESK_ATTACHMENT', file);
  }

  @Get('tickets')
  @UseGuards(CandidateGuard)
  list(@CurrentUser() u: AccessClaims) {
    return this.svc.listMine(u.sub);
  }
  @Post('tickets')
  @UseGuards(CandidateGuard)
  create(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    return this.svc.create(u.sub, b);
  }
  @Get('tickets/:id')
  @UseGuards(CandidateGuard)
  get(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(id, u.sub);
  }
  @Post('tickets/:id/messages')
  @UseGuards(CandidateGuard)
  reply(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) {
    return this.svc.reply(id, { type: 'CANDIDATE', id: u.sub }, b);
  }
}
