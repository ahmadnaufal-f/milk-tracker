import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import BasePage from '@/components/BasePage';
import { ShieldCheck } from 'lucide-react';

const PrivacyNoticePage: React.FC = () => {
  return (
    <BasePage showBackButton pageTitle="Privacy Notice">
      <div className="w-full max-w-lg space-y-5 pb-8">
        {/* ── Intro banner ────────────────────────────────────────────────── */}
        <div
          className="rounded-2xl p-4 flex items-start gap-3"
          style={{
            background: 'linear-gradient(135deg, var(--color-purple-100), var(--color-tertiary-200))',
            border: '1px solid var(--color-purple-200)',
          }}
        >
          <ShieldCheck className="w-6 h-6 mt-0.5 shrink-0" style={{ color: 'var(--color-purple-500)' }} />
          <div>
            <p className="font-semibold text-md" style={{ color: 'var(--color-heading)' }}>
              Your privacy matters
            </p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-body)', opacity: 0.75 }}>
              How we handle and protect the data you track in Milk Tracker.
            </p>
          </div>
        </div>

        {/* ── Notice content ──────────────────────────────────────────────── */}
        <Card className="bg-card/50 backdrop-blur-sm border-white/10">
          <CardContent className="py-6">
            {/*
              TODO: Replace the placeholder below with the finalised privacy
              notice content. Keep the `.privacy-content` prose styles so the
              copy stays readable and on-brand.
            */}
            <div className="privacy-content space-y-4 text-sm leading-relaxed" style={{ color: 'var(--color-body)' }}>
              <p className="italic" style={{ opacity: 0.7 }}>
                Our privacy notice is being finalised and will appear here soon.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </BasePage>
  );
};

export default PrivacyNoticePage;
