import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { User } from 'firebase/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import BasePage from '@/components/BasePage';
import { saveUserSettings, subscribeToSettings, AISummarizationContext } from '@/services/storage';
import { Baby, Milk, Target, CheckCircle2, Circle } from 'lucide-react';
import ToggleSwitch from '@/components/ui/toggle-switch';

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
      <div className="w-full max-w-lg space-y-5 pb-8">

        {/* ── Enable / Disable toggle ──────────────────────────────────── */}
        <Card className="bg-card/50 backdrop-blur-sm border-white/10">
          <CardContent>
            <div className="flex flex-row items-center gap-3">
              <div className="grow">
                <p className="font-semibold text-md" style={{ color: 'var(--color-heading)' }}>Enable AI Summarization</p>
              </div>
              <ToggleSwitch
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Intro banner ────────────────────────────────────────────────── */}
        <div
          className="rounded-2xl p-4 flex items-start gap-3"
          style={{
            background: 'linear-gradient(135deg, var(--color-purple-100), var(--color-tertiary-200))',
            border: '1px solid var(--color-purple-200)',
          }}
        >
          <span className="text-2xl mt-0.5">✨</span>
          <div>
            <p className="font-semibold text-md" style={{ color: 'var(--color-heading)' }}>
              Personalise your AI summaries
            </p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-body)', opacity: 0.75 }}>
              The more context you share, the more tailored and useful your weekly summaries will be.
              All fields are optional.
            </p>
          </div>
        </div>

        {/* ── Settings cards (disabled when master switch is off) ──────────── */}
        <div
          className="space-y-5 transition-all duration-300"
          style={{
            opacity: enabled ? 1 : 0.45,
            pointerEvents: enabled ? 'auto' : 'none',
          }}
        >

          {/* ── Baby birthdate ────────────────────────────────────────────── */}
          <Card className="bg-card/50 backdrop-blur-sm border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Baby className="w-4 h-4" style={{ color: 'var(--color-purple-500)' }} />
                Baby's Birthdate
              </CardTitle>
              <CardDescription>
                Helps the AI contextualise your pumping journey by age.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                id="babyBirthdate"
                type="date"
                value={babyBirthdate}
                onChange={(e) => setBabyBirthdate(e.target.value)}
                className="bg-background/50"
                max={new Date().toISOString().split('T')[0]}
              />
            </CardContent>
          </Card>

          {/* ── Feeding method ────────────────────────────────────────────── */}
          <Card className="bg-card/50 backdrop-blur-sm border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Milk className="w-4 h-4" style={{ color: 'var(--color-purple-500)' }} />
                Feeding Method
              </CardTitle>
              <CardDescription>
                How are you currently feeding your baby?
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {(
                [
                  { value: 'exclusive', label: 'Exclusive Pumping', emoji: '🍼' },
                  { value: 'supplemental', label: 'Supplemental', emoji: '🤱' },
                ] as { value: NonNullable<FeedingMethod>; label: string; emoji: string }[]
              ).map(({ value, label, emoji }) => {
                const selected = feedingMethod === value;
                return (
                  <button
                    key={value}
                    id={`feedingMethod-${value}`}
                    onClick={() => setFeedingMethod(selected ? undefined : value)}
                    className="rounded-xl p-4 text-left transition-all duration-200"
                    style={{
                      border: selected
                        ? '2px solid var(--color-purple-500)'
                        : '2px solid var(--color-purple-200)',
                      background: selected
                        ? 'linear-gradient(135deg, var(--color-purple-100), var(--color-tertiary-100))'
                        : 'transparent',
                      transform: selected ? 'scale(1.02)' : 'scale(1)',
                      boxShadow: selected ? '0 4px 12px color-mix(in oklch, var(--color-purple-400) 20%, transparent)' : 'none',
                    }}
                  >
                    <span className="text-xl">{emoji}</span>
                    <p
                      className="text-sm font-medium mt-1"
                      style={{ color: selected ? 'var(--color-purple-700)' : 'var(--color-body)' }}
                    >
                      {label}
                    </p>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* ── Pumping goals ─────────────────────────────────────────────── */}
          <Card className="bg-card/50 backdrop-blur-sm border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="w-4 h-4" style={{ color: 'var(--color-purple-500)' }} />
                Pumping Goals
              </CardTitle>
              <CardDescription>
                Select all that apply — you can have multiple goals.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {PUMPING_GOALS.map(({ key, label, description }) => {
                const checked = pumpingGoals[key];
                return (
                  <button
                    key={key}
                    id={`goal-${key}`}
                    onClick={() => toggleGoal(key)}
                    className="w-full flex items-center gap-3 rounded-xl p-3 text-left transition-all duration-200"
                    style={{
                      border: checked
                        ? '1.5px solid var(--color-purple-400)'
                        : '1.5px solid var(--color-purple-100)',
                      background: checked
                        ? 'color-mix(in oklch, var(--color-purple-100) 60%, transparent)'
                        : 'transparent',
                    }}
                  >
                    {checked
                      ? <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: 'var(--color-purple-600)' }} />
                      : <Circle className="w-5 h-5 shrink-0" style={{ color: 'var(--color-grey-400)' }} />
                    }
                    <div className="min-w-0">
                      <p
                        className="text-sm font-medium"
                        style={{ color: checked ? 'var(--color-purple-800)' : 'var(--color-body)' }}
                      >
                        {label}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-body)', opacity: 0.6 }}>
                        {description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

        </div>


      </div>
    </BasePage>
  );
};

export default AISummarizationContextPage;
