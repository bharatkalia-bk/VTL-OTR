import { Card, CardBody } from '@vtl/ui';
import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router-dom';
import { Page, PageHeader } from '../components/Layout';

const PAGES = ['privacy', 'terms', 'accessibility', 'hyperlink', 'copyright'] as const;

export default function Legal() {
  const { page } = useParams();
  const { t } = useTranslation();
  if (!PAGES.includes(page as (typeof PAGES)[number])) return <Navigate to="/" replace />;
  const paras = t(`legal.${page}.body`, { returnObjects: true }) as string[];
  return (
    <>
      <PageHeader title={t(`legal.${page}.title`)} />
      <Page><Card><CardBody className="prose max-w-none space-y-3 text-sm leading-relaxed">{Array.isArray(paras) && paras.map((p, i) => <p key={i}>{p}</p>)}</CardBody></Card></Page>
    </>
  );
}
