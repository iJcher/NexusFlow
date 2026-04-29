import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeService } from './knowledge.service';
import { JsonResponse } from '../common/response';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';

@Controller('Knowledge')
export class KnowledgeController {
  constructor(private knowledgeService: KnowledgeService) {}

  // ==================== 知识库 ====================

  @Post('Create')
  async createKnowledgeBase(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.knowledgeService.createKnowledgeBase(
      dto,
      user.id,
      user.nickName || 'System',
    );
    return JsonResponse.ok(result);
  }

  @Get('GetById')
  async getKnowledgeBaseById(@Query('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.knowledgeService.getKnowledgeBaseById(BigInt(id), user.id);
    if (!result) return JsonResponse.error('Knowledge base not found');
    return JsonResponse.ok(result);
  }

  @Get('GetList')
  async getKnowledgeBaseList(
    @Query('keyword') keyword?: string,
    @Query('pageIndex') pageIndex?: string,
    @Query('pageSize') pageSize?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const result = await this.knowledgeService.getKnowledgeBaseList({
      keyword: keyword || undefined,
      pageIndex: Number(pageIndex || 1),
      pageSize: Number(pageSize || 20),
    }, user!.id);
    return JsonResponse.ok(result);
  }

  @Post('Update')
  async updateKnowledgeBase(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.knowledgeService.updateKnowledgeBase(BigInt(dto.id), dto, user.id);
    if (!result) return JsonResponse.error('Knowledge base not found');
    return JsonResponse.ok(result);
  }

  @Post('Delete')
  async deleteKnowledgeBase(@Query('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.knowledgeService.deleteKnowledgeBase(BigInt(id), user.id);
    if (!result) return JsonResponse.error('Knowledge base not found');
    return JsonResponse.ok(true);
  }

  // ==================== 文档管理 ====================

  @Post('UploadDocument')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Query('knowledgeBaseId') knowledgeBaseId: string,
    @Query('chunkSize') chunkSize?: string,
    @Query('chunkOverlap') chunkOverlap?: string,
    @Query('embeddingModel') embeddingModel?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (!file) return JsonResponse.error('No file uploaded');
    const result = await this.knowledgeService.uploadDocument(BigInt(knowledgeBaseId), file, user!.id, {
      chunkSize: chunkSize ? Number(chunkSize) : undefined,
      chunkOverlap: chunkOverlap ? Number(chunkOverlap) : undefined,
      embeddingModel: embeddingModel || undefined,
    });
    return JsonResponse.ok(result);
  }

  @Get('GetDocumentChunks')
  async getDocumentChunks(@Query('documentId') documentId: string, @CurrentUser() user: AuthenticatedUser) {
    const chunks = await this.knowledgeService.getDocumentChunks(BigInt(documentId), user.id);
    const result = chunks.map((c) => ({
      id: c.id.toString(),
      chunkIndex: c.chunkIndex,
      content: c.content,
      tokenCount: c.tokenCount,
    }));
    return JsonResponse.ok(result);
  }

  @Post('DeleteDocument')
  async deleteDocument(@Query('documentId') documentId: string, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.knowledgeService.deleteDocument(BigInt(documentId), user.id);
    if (!result) return JsonResponse.error('Document not found');
    return JsonResponse.ok(true);
  }

  // ==================== RAG 检索 ====================

  @Post('Search')
  async search(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    const results = await this.knowledgeService.searchSimilar(BigInt(dto.knowledgeBaseId), dto.query, user.id, {
      topK: dto.topK,
      threshold: dto.threshold,
      embeddingModel: dto.embeddingModel,
    });
    return JsonResponse.ok(results);
  }
}
