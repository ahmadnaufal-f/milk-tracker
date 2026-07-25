import React, { useState } from 'react';
import Markdown from 'react-markdown';
import { Card, CardContent } from '@/components/ui/card';
import BasePage from '@/components/BasePage';
import { ShieldCheck } from 'lucide-react';
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
    <BasePage showBackButton pageTitle="Privacy Notice">
      <div className="w-full max-w-lg space-y-5 pb-8">
        {/* ── Intro banner + language selector ─────────────────────────────── */}
        <div
          className="rounded-2xl p-4 flex items-start gap-3"
          style={{
            background: 'var(--color-purple-100)',
            border: '1px solid var(--color-purple-200)',
          }}
        >
          <ShieldCheck className="w-6 h-6 mt-0.5 shrink-0" style={{ color: 'var(--color-purple-500)' }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-md" style={{ color: 'var(--color-heading)' }}>
                  Your privacy matters
                </p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--color-body)', opacity: 0.75 }}>
                  How we handle and protect the data you track in Milk Tracker.
                </p>
              </div>

              {/* ── Language selector (EN / ID) ─────────────────────────────── */}
              <div
                role="group"
                aria-label="Select language"
                className="flex shrink-0 rounded-lg overflow-hidden"
                style={{ border: '1px solid var(--color-purple-300)', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.15)' }}
              >
                {LANGUAGES.map(({ code, label }) => {
                  const active = locale === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setLocale(code)}
                      className="px-3 py-1 text-xs font-semibold transition-colors duration-150"
                      style={{
                        background: active ? 'var(--color-purple-500)' : 'transparent',
                        color: active ? 'white' : 'var(--color-purple-700)',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Notice content ──────────────────────────────────────────────── */}
        <Card className="bg-card/50 backdrop-blur-sm border-white/10">
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
