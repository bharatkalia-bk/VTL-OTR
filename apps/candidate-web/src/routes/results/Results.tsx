import { useQuery } from '@tanstack/react-query';
import { Badge, Card, CardBody, EmptyState, Skeleton, buttonVariants } from '@vtl/ui';
import { Award } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Page, PageHeader } from '../../components/Layout';
import { api } from '../../lib/api';
import { pick } from '../../lib/format';

interface AppRow { id: string; applicationNo: string; status: string; exam: { titleEn: string; titleHi: string }; admitCard: { rollNo: string } | null; result: { status: string } | null }
interface Card_ { applicationId: string; stage: string; normalised: number | null; raw: number; qualified: boolean; withheld: boolean; rank: number | null }

export default function Results() {
  const { t, i18n } = useTranslation();
  const apps = useQuery({ queryKey: ['applications'], queryFn: () => api.get<AppRow[]>('/applications') });
  const cards = useQuery({ queryKey: ['my-results'], queryFn: () => api.get<Card_[]>('/me/results') });
  const withExam = apps.data?.filter((a) => a.admitCard) ?? [];
  return (
    <>
      <PageHeader title={t('results.title')} description={t('results.subtitle')} />
      <Page>
        {apps.isLoading ? <Skeleton className="h-40" /> : withExam.length === 0 ? <EmptyState icon={<Award />} title={t('results.none')} /> : (
          <div className="grid gap-4 md:grid-cols-2">
            {withExam.map((a) => {
              const mine = cards.data?.filter((c) => c.applicationId === a.id) ?? [];
              const latest = mine.at(-1);
              return (
                <Card key={a.id} className="overflow-hidden">
                  <div className="bg-gradient-to-r from-navy to-navy-600 px-5 py-4 text-white">
                    <p className="font-heading font-bold">{pick(a.exam, i18n.language)}</p>
                    <p className="text-sm text-white/80 tabular-nums">{a.admitCard?.rollNo}</p>
                  </div>
                  <CardBody className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      {latest ? <Badge tone={latest.withheld ? 'warning' : latest.qualified ? 'success' : 'neutral'}>{t(`results.STAGE_${latest.stage}`)}: {latest.withheld ? t('results.withheld') : latest.qualified ? t('results.qualified') : t('results.notQualified')}</Badge> : <Badge>{t('results.keyProvisional')}</Badge>}
                    </div>
                    <Link to={`/results/${a.id}`} className={buttonVariants({ variant: 'primary', size: 'sm' })}>{t('results.open')}</Link>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </Page>
    </>
  );
}
