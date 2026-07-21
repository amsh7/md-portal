import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/50 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg mt-10 mb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none" aria-label="Close">
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1">
        {label}
        {required && <span className="text-brand-red"> *</span>}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red disabled:bg-gray-100';

export function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`bg-brand-red text-white font-semibold rounded px-4 py-2 text-sm hover:bg-red-700 disabled:opacity-50 ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function EmptyState({ hint, action }: { hint: string; action?: ReactNode }) {
  return (
    <div className="text-center py-10">
      <p className="text-sm text-gray-500 mb-3">{hint}</p>
      {action}
    </div>
  );
}

export function Loading() {
  const { t } = useTranslation();
  return <p className="text-sm text-gray-500 py-6 text-center">{t('common.loading')}</p>;
}

export function ErrorNote({ message }: { message: string }) {
  return <p className="text-sm text-brand-red py-2">{message}</p>;
}
