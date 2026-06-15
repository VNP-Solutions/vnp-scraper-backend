import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { QaPanel, QaPanelStatus } from '@prisma/client';
import FormData = require('form-data');
import { basename } from 'path';
import { firstValueFrom } from 'rxjs';
import { S3UploadService } from '../../common/utils/s3-upload.util';
import { MailService } from '../../common/utils/mail.service';
import { extractFailedReasonsFromProxyResponse } from './qa-panel-failed-reason.util';
import {
  IQaPanelService,
} from './qa-panel.interface';
import { QaPanelRepository } from './qa-panel.repository';
import {
  CreateQaPanelType,
  QaPanelImportCallbackType,
  UpdateQaPanelType,
} from './qa-panel.validation';

@Injectable()
export class QaPanelService implements IQaPanelService {
  private readonly logger = new Logger(QaPanelService.name);
  private readonly proxyApiPath = '/api/external/bulk-audit-import';

  constructor(
    private readonly repository: QaPanelRepository,
    private readonly s3UploadService: S3UploadService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async createQaPanel(data: CreateQaPanelType): Promise<QaPanel> {
    const qaPanel = await this.repository.create(data);
    this.logger.log(`QA panel created: ${qaPanel.file_name} (ID: ${qaPanel.id})`);
    return qaPanel;
  }

  async findAllQaPanels(filters?: {
    search?: string;
    status?: QaPanelStatus;
    page?: number;
    limit?: number;
    order?: 'asc' | 'desc';
  }) {
    return this.repository.findAll(filters);
  }

  async findQaPanelById(id: string): Promise<QaPanel> {
    const qaPanel = await this.repository.findById(id);

    if (!qaPanel) {
      throw new NotFoundException(`QA panel with ID ${id} not found`);
    }

    return qaPanel;
  }

  async updateQaPanel(id: string, data: UpdateQaPanelType): Promise<QaPanel> {
    await this.findQaPanelById(id);
    const qaPanel = await this.repository.update(id, data);
    this.logger.log(`QA panel updated: ${qaPanel.id}`);
    return qaPanel;
  }

  async deleteQaPanel(
    id: string,
  ): Promise<{ deletedCount: number; deletedId: string }> {
    const qaPanel = await this.findQaPanelById(id);
    await this.tryDeleteS3File(qaPanel.file_url);
    await this.repository.delete(id);
    this.logger.log(`QA panel deleted: ${id}`);
    return { deletedCount: 1, deletedId: id };
  }

  async bulkDeleteQaPanels(ids: string[]): Promise<{
    deletedCount: number;
    deletedIds: string[];
  }> {
    const qaPanels = await Promise.all(
      ids.map((id) => this.repository.findById(id)),
    );

    const existingIds = qaPanels
      .filter((qaPanel): qaPanel is QaPanel => qaPanel !== null)
      .map((qaPanel) => qaPanel.id);

    if (existingIds.length === 0) {
      throw new NotFoundException('No QA panel records found for the provided IDs');
    }

    await Promise.all(
      qaPanels
        .filter((qaPanel): qaPanel is QaPanel => qaPanel !== null)
        .map((qaPanel) => this.tryDeleteS3File(qaPanel.file_url)),
    );

    const deletedCount = await this.repository.bulkDelete(existingIds);

    return {
      deletedCount,
      deletedIds: existingIds,
    };
  }

  async uploadAndProcess(file: Express.Multer.File): Promise<unknown> {
    const fileName = basename(file.originalname);
    const fileUrl = await this.s3UploadService.uploadFile(file);

    const qaPanel = await this.repository.create({
      file_url: fileUrl,
      file_name: fileName,
      status: QaPanelStatus.success,
      failed_reasons: [],
    });

    const proxyUrl = this.getProxyUrl();
    const { proxyResponse, status } = await this.forwardToProxyApi(
      file,
      proxyUrl,
      qaPanel.id,
    );

    const failedReasons = extractFailedReasonsFromProxyResponse(proxyResponse);

    await this.repository.update(qaPanel.id, {
      status,
      failed_reasons: failedReasons,
    });

    return proxyResponse;
  }

  async processImportCallback(
    data: QaPanelImportCallbackType,
  ): Promise<QaPanel> {
    const qaPanel = await this.findQaPanelById(data.qa_panel_id);

    const failedReasons = (data.errors ?? []).map((error) => ({
      row_number: error.row,
      reason: error.failed_reason,
    }));

    const updatedQaPanel = await this.repository.update(data.qa_panel_id, {
      status: data.status,
      failed_reasons: failedReasons,
    });

    await this.mailService.sendQaPanelImportReportEmail({
      to: data.email,
      fileName: qaPanel.file_name,
      status: data.status,
      report: data.report,
    });

    this.logger.log(
      `QA panel import callback processed for ${data.qa_panel_id} (${data.status})`,
    );

    return updatedQaPanel;
  }

  private async tryDeleteS3File(fileUrl: string): Promise<void> {
    try {
      await this.s3UploadService.deleteFile(fileUrl);
    } catch (error: any) {
      this.logger.warn(
        `Failed to delete S3 file for QA panel (${fileUrl}): ${error.message}`,
      );
    }
  }

  private getProxyBaseUrl(): string {
    const baseUrl =
      this.configService.get<string>('DASHBOARD_PROXY_URL') ??
      'https://dashboard-backend.vnpmanage.online';

    return baseUrl.startsWith('http://') || baseUrl.startsWith('https://')
      ? baseUrl.replace(/\/+$/, '')
      : `https://${baseUrl.replace(/\/+$/, '')}`;
  }

  private getProxyUrl(): string {
    return `${this.getProxyBaseUrl()}${this.proxyApiPath}`;
  }

  private getCommunicationSecret(): string {
    const secret =
      this.configService.get<string>('JWT_COMMUNICATION_SECRET') ??
      this.configService.get<string>('JWT_COMMUNICATION_SECRET');

    if (!secret) {
      throw new BadRequestException(
        'JWT_COMMUNICATION_SECRET is not configured',
      );
    }

    return secret;
  }

  private generateProxyBearerToken(): string {
    this.getCommunicationSecret();

    const expiresIn = (this.configService.get<string>(
      'JWT_COMMUNICATION_TOKEN_EXPIRES_IN',
    ) ?? '1d') as NonNullable<SignOptions['expiresIn']>;

    return this.jwtService.sign(
      { type: 'external-communication' },
      { expiresIn },
    );
  }

  private async forwardToProxyApi(
    file: Express.Multer.File,
    proxyUrl: string,
    qaPanelId: string,
  ): Promise<{ proxyResponse: unknown; status: QaPanelStatus }> {
    const form = new FormData();
    form.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });
    form.append('qa_panel_id', qaPanelId);

    const bearerToken = this.generateProxyBearerToken();

    try {
      const response = await firstValueFrom(
        this.httpService.post(proxyUrl, form, {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${bearerToken}`,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }),
      );

      const isSuccess = response.status >= 200 && response.status < 300;

      return {
        proxyResponse: response.data,
        status: isSuccess ? QaPanelStatus.success : QaPanelStatus.failed,
      };
    } catch (error: any) {
      this.logger.error(
        `QA panel proxy API request failed: ${error.message}`,
        error.stack,
      );

      return {
        proxyResponse: error.response?.data ?? {
          message: error.message ?? 'Proxy API request failed',
        },
        status: QaPanelStatus.failed,
      };
    }
  }
}
