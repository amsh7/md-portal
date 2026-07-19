import { useTranslation } from 'react-i18next';

export default function Placeholder({ moduleKey }: { moduleKey: string }) {
  const { t } = useTranslation();
  return (
    <div className="bg-white rounded-lg border p-8 text-center max-w-xl mx-auto mt-10">
      <h1 className="text-lg font-bold mb-2">{t(`nav.${moduleKey}`)}</h1>
      <p className="text-sm text-gray-500">{t('placeholder.body')}</p>
    </div>
  );
}
