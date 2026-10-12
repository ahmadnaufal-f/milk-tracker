import React, { useState } from 'react';
import Markdown from 'react-markdown';
import { Card, CardContent } from '@/components/ui/card';
import BasePage from '@/components/BasePage';
// @ts-ignore
import privacyEn from '@/data/privacy-en.md?raw';
// @ts-ignore
import privacyId from '@/data/privacy-id.md?raw';

type Locale = 'en' | 'id';

const LANGUAGES: { code: Locale; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'id', label: 'ID' },
];

const CONTENT: Record<Locale, string> = {
  en: privacyEn,
  id: privacyId,
};

const PrivacyNoticePage: React.FC = () => {
  const [locale, setLocale] = useState<Locale>(() =>
    navigator.language === 'id-ID' ? 'id' : 'en'
  );

  return (
    <BasePage showBackButton>
      <div className="w-full max-w-lg space-y-4 pb-8">
        <div className="flex justify-end">
          <div
            role="group"
            aria-label="Select language"
            className="flex overflow-hidden rounded-lg border border-purple-300 bg-white/70"
          >
            {LANGUAGES.map(({ code, label }) => {
              const active = locale === code;
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setLocale(code)}
                  className={`min-h-11 px-3 text-sm font-semibold transition-colors ${active
                    ? 'bg-purple-700 text-white'
                    : 'text-purple-900 hover:bg-purple-50'}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Notice content ──────────────────────────────────────────────── */}
        <Card className="border-purple-100 bg-card/70 shadow-sm">
          <CardContent className="py-6">
            <div className="prose dark:prose-invert prose-sm max-w-none">
              <Markdown
                components={{
                  h1: ({ node, ...props }) => (
                    <h1 {...props} className="mb-2 text-2xl font-bold" />
                  ),
                  h2: ({ node, ...props }) => (
                    <h2 {...props} className="mt-6 mb-2 text-lg font-semibold" />
                  ),
                  h3: ({ node, ...props }) => (
                    <h3 {...props} className="mt-4 mb-2 text-base font-semibold" />
                  ),
                  ul: ({ node, ...props }) => (
                    <ul {...props} className="list-disc pl-5 space-y-1 my-2" />
                  ),
                  p: ({ node, ...props }) => (
                    <p {...props} className="my-2 leading-relaxed" />
                  ),
                  a: ({ node, ...props }) => (
                    <a {...props} className="underline underline-offset-2" style={{ color: 'var(--color-purple-600)' }} />
                  ),
                }}
              >
                {CONTENT[locale]}
              </Markdown>
            </div>
          </CardContent>
        </Card>
      </div>
    </BasePage>
  );
};

export default PrivacyNoticePage;
