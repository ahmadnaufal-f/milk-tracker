import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { User } from 'firebase/auth';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ToggleSwitch from '@/components/ui/toggle-switch';
import BasePage from '@/components/BasePage';
import { saveUserSettings, subscribeToSettings, AISummarizationContext } from '@/services/storage';
import { Baby, Milk, Target, CheckCircle2, Circle, Sparkles } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type FeedingMethod = AISummarizationContext['feedingMethod'];
type PumpingGoalKey = keyof NonNullable<AISummarizationContext['pumpingGoal']>;

const PUMPING_GOALS: { key: PumpingGoalKey; label: string; description: string }[] = [
  { key: 'freezerStash', label: 'Build a Freezer Stash', description: 'Pumping extra to store for later use' },
  { key: 'returningToWork', label: 'Returning to Work', description: 'Prepare for work schedule pumping' },
  { key: 'maintainingSupply', label: 'Maintain My Supply', description: 'Keep current production levels steady' },
  { key: 'increasingSupply', label: 'Increase My Supply', description: 'Boost overall milk production' },
  { key: 'weaning', label: 'Weaning', description: 'Gradually reducing milk production' },
];

const DEFAULT_GOALS: NonNullable<AISummarizationContext['pumpingGoal']> = {
  freezerStash: false,
  maintainingSupply: false,
  increasingSupply: false,
  returningToWork: false,
  weaning: false,
};

// ── Component ─────────────────────────────────────────────────────────────────

const AISummarizationContextPage: React.FC = () => {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [babyBirthdate, setBabyBirthdate] = useState('');
  const [feedingMethod, setFeedingMethod] = useState<FeedingMethod>(undefined);
  const [pumpingGoals, setPumpingGoals] = useState({ ...DEFAULT_GOALS });

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(setUser);
    return unsub;
  }, []);

  // ── Load from Firestore ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToSettings(user.uid, (settings) => {
      const ctx = settings.aiContext;
      if (!ctx) return;
      if (ctx.enabled !== undefined) setEnabled(ctx.enabled);
      if (ctx.babyBirthdate) setBabyBirthdate(ctx.babyBirthdate);
      if (ctx.feedingMethod) setFeedingMethod(ctx.feedingMethod);
      if (ctx.pumpingGoal) setPumpingGoals({ ...DEFAULT_GOALS, ...ctx.pumpingGoal });
    });
    return unsub;
  }, [user]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  // maintainingSupply / increasingSupply / weaning are mutually exclusive
  const EXCLUSIVE_GOALS: PumpingGoalKey[] = ['maintainingSupply', 'increasingSupply', 'weaning'];

  const toggleGoal = (key: PumpingGoalKey) => {
    if (EXCLUSIVE_GOALS.includes(key)) {
      // Radio behaviour: selecting one clears the other two
      setPumpingGoals((prev) => ({
        ...prev,
        maintainingSupply: false,
        increasingSupply: false,
        weaning: false,
        [key]: !prev[key], // toggle off if already selected
      }));
    } else {
      // Free checkbox for freezerStash / returningToWork
      setPumpingGoals((prev) => ({ ...prev, [key]: !prev[key] }));
    }
  };

  // ── Save & go back ──────────────────────────────────────────────────────────
  const handleBack = async () => {
    if (!user) { navigate(-1); return; }
    setSaving(true);
    try {
      await saveUserSettings(user.uid, {
        aiContext: {
          enabled,
          babyBirthdate: babyBirthdate || undefined,
          feedingMethod: feedingMethod || undefined,
          pumpingGoal: pumpingGoals,
        },
      });
    } catch (err) {
      console.error('Failed to save AI context', err);
    } finally {
      setSaving(false);
      navigate(-1);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <BasePage showBackButton onBack={handleBack} pageTitle={saving ? 'Saving…' : 'AI Context'}>
      <div className="w-full max-w-lg space-y-6 pb-8">
        <section aria-labelledby="context-intro-heading" className="space-y-4">
          <div className="flex items-start gap-3">
            <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--color-purple-600)]" />
            <div className="space-y-1">
              <h2 id="context-intro-heading" className="font-semibold text-[var(--color-heading)]">Personalise your AI summaries</h2>
              <p className="text-sm leading-relaxed text-purple-700">
                The more context you share, the more tailored and useful your weekly summaries will be. All fields are optional.
              </p>
            </div>
          </div>

          <div className="flex min-h-16 items-center justify-between gap-4 border-b border-border pb-4">
            <p className="font-semibold text-foreground">Enable AI Summarization</p>
            <ToggleSwitch id="context-ai-enabled" label="Enable AI Summarization" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          </div>
        </section>

        <fieldset disabled={!enabled} className="space-y-6">
          <legend className="sr-only">AI summary context fields</legend>
          <section aria-labelledby="birthdate-heading" className="space-y-2 border-b border-border pb-6">
            <div className="space-y-1">
              <h2 id="birthdate-heading" className="flex items-center gap-2 text-base font-semibold text-[var(--color-heading)]">
                <Baby aria-hidden="true" className="size-4 shrink-0 text-[var(--color-purple-600)]" />
                Baby's Birthdate
              </h2>
              <p id="babyBirthdate-help" className="text-sm text-purple-700">
                Helps the AI contextualise your pumping journey by age.
              </p>
            </div>
            <Label htmlFor="babyBirthdate" className="sr-only">Baby's Birthdate</Label>
            <Input
              id="babyBirthdate"
              type="date"
              value={babyBirthdate}
              onChange={(e) => setBabyBirthdate(e.target.value)}
              aria-describedby="babyBirthdate-help"
              className="min-h-11 max-w-sm bg-background/70 disabled:cursor-not-allowed disabled:opacity-60"
              max={new Date().toISOString().split('T')[0]}
            />
          </section>

          <section aria-labelledby="feeding-heading" aria-describedby="feeding-help" className="space-y-3 border-b border-border pb-6">
            <div className="space-y-1">
              <h2 id="feeding-heading" className="flex items-center gap-2 text-base font-semibold text-[var(--color-heading)]">
                <Milk aria-hidden="true" className="size-4 shrink-0 text-[var(--color-purple-600)]" />
                Feeding Method
              </h2>
              <p id="feeding-help" className="text-sm text-purple-700">How are you currently feeding your baby?</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-labelledby="feeding-heading">
              {(
                [
                  { value: 'exclusive', label: 'Exclusive Pumping', Icon: Milk },
                  { value: 'supplemental', label: 'Supplemental', Icon: Baby },
                ] as { value: NonNullable<FeedingMethod>; label: string; Icon: typeof Milk }[]
              ).map(({ value, label, Icon }) => {
                const selected = feedingMethod === value;
                return (
                  <button
                    key={value}
                    id={`feedingMethod-${value}`}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setFeedingMethod(selected ? undefined : value)}
                    className={`flex min-h-14 items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm transition-colors duration-150 hover:bg-purple-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-purple-500)] focus-visible:ring-offset-2 motion-reduce:transition-none disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:opacity-60 ${selected ? 'border-purple-400 bg-purple-50 text-purple-900' : 'border-border bg-transparent text-foreground'}`}
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0 text-[var(--color-purple-700)]" />
                    <span className="font-medium">{label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="goals-heading" className="space-y-3">
            <div className="space-y-1">
              <h2 id="goals-heading" className="flex items-center gap-2 text-base font-semibold text-[var(--color-heading)]">
                <Target aria-hidden="true" className="size-4 shrink-0 text-[var(--color-purple-600)]" />
                Pumping Goals
              </h2>
              <p id="goals-help" className="text-sm text-purple-700">Select all that apply — you can have multiple goals.</p>
            </div>
            <div className="space-y-1" role="group" aria-labelledby="goals-heading" aria-describedby="goals-help">
              {PUMPING_GOALS.map(({ key, label, description }) => {
                const checked = pumpingGoals[key];
                return (
                  <button
                    key={key}
                    id={`goal-${key}`}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => toggleGoal(key)}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-purple-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-purple-500)] focus-visible:ring-offset-2 motion-reduce:transition-none disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:opacity-60 ${checked ? 'bg-purple-50/80' : 'bg-transparent'}`}
                  >
                    {checked
                      ? <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-[var(--color-purple-700)]" />
                      : <Circle aria-hidden="true" className="size-5 shrink-0 text-purple-700" />
                    }
                    <span className="min-w-0">
                      <span className={`block text-sm font-medium ${checked ? 'text-purple-900' : 'text-foreground'}`}>
                        {label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-purple-700">
                        {description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </fieldset>
      </div>
    </BasePage>
  );
};

export default AISummarizationContextPage;
