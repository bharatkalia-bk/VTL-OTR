import { EmptyState, buttonVariants } from '@vtl/ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Page } from '../components/Layout';

export default function NotFound() {
  const { t } = useTranslation();
  return <Page><EmptyState title={t('notFound.title')} description={t('notFound.body')} action={<Link to="/" className={buttonVariants({ variant: 'primary' })}>{t('nav.home')}</Link>} /></Page>;
}
