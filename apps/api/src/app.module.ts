import { Module } from '@nestjs/common';
import { CoreModule } from './infra/core.module';
import { AdminAuthService } from './modules/admin/admin-auth.service';
import { AdminCandidatesService } from './modules/admin/admin-candidates.service';
import { AdminExamsService } from './modules/admin/admin-exams.service';
import * as AdminControllers from './modules/admin/admin.controllers';
import { AdmitCardsService } from './modules/admin/admit-cards.service';
import { CampaignsService } from './modules/admin/campaigns.service';
import { DashboardService } from './modules/admin/dashboard.service';
import { ReportsService } from './modules/admin/reports.service';
import { ApplicationsController } from './modules/applications/applications.controller';
import { ApplicationsService } from './modules/applications/applications.service';
import { CandidateAuthController } from './modules/auth/candidate-auth.controller';
import { CandidateAuthService } from './modules/auth/candidate-auth.service';
import { CandidateDataService } from './modules/candidates/candidate-data.service';
import { ExamsService } from './modules/exams/exams.service';
import { HelpdeskController } from './modules/helpdesk/helpdesk.controller';
import { HelpdeskService } from './modules/helpdesk/helpdesk.service';
import { MaintenanceService } from './modules/maintenance/maintenance.service';
import { MediaService } from './modules/media/media.service';
import { PaymentsController } from './modules/payments/payments.controller';
import { PaymentsService } from './modules/payments/payments.service';
import { PdfDocsService } from './modules/pdf/pdf-docs.service';
import { PdfService } from './modules/pdf/pdf.service';
import { QrSignerService } from './modules/pdf/qr-signer.service';
import { CorrectionsService } from './modules/profile/corrections.service';
import { DocumentsService } from './modules/profile/documents.service';
import { IdentityService } from './modules/profile/identity.service';
import { MeController } from './modules/profile/me.controller';
import { ProfileService } from './modules/profile/profile.service';
import { DevController } from './modules/public/dev.controller';
import { HealthController } from './modules/public/health.controller';
import { PublicController } from './modules/public/public.controller';
import { DigiLockerMockController } from './modules/profile/digilocker-mock.controller';
import { AgencyService } from './modules/lifecycle/agency.service';
import { AiService } from './modules/lifecycle/ai.service';
import { AssessmentService } from './modules/lifecycle/assessment.service';
import { CandidateLifecycleController } from './modules/lifecycle/candidate-lifecycle.controller';
import { ChannelsService } from './modules/lifecycle/channels.service';
import { DebarmentService } from './modules/lifecycle/debarment.service';
import { ExamDayService } from './modules/lifecycle/examday.service';
import { JourneyService } from './modules/lifecycle/journey.service';
import * as LifecycleControllers from './modules/lifecycle/lifecycle.controllers';
import { ObserverService } from './modules/lifecycle/observer.service';
import { ResultsService } from './modules/lifecycle/results.service';
import { SelectionService } from './modules/lifecycle/selection.service';

@Module({
  imports: [CoreModule],
  controllers: [
    HealthController, PublicController, DevController, CandidateAuthController, MeController, DigiLockerMockController,
    ApplicationsController, PaymentsController, HelpdeskController,
    ...Object.values(AdminControllers), ...Object.values(LifecycleControllers), CandidateLifecycleController,
  ],
  providers: [
    CandidateDataService, CandidateAuthService, ProfileService, DocumentsService, MediaService, IdentityService, CorrectionsService,
    PdfService, PdfDocsService, QrSignerService, ExamsService, ApplicationsService, PaymentsService, HelpdeskService, MaintenanceService,
    AdminAuthService, AdminCandidatesService, AdminExamsService, AdmitCardsService, CampaignsService, DashboardService, ReportsService,
    AiService, DebarmentService, ExamDayService, ObserverService, AgencyService, AssessmentService, ResultsService, SelectionService, ChannelsService, JourneyService,
  ],
})
export class AppModule {}
