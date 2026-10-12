import React, { useEffect, useState, useMemo } from 'react';
import { Card } from './ui/card';
import { PumpingSession, subscribeToMonthlySessions } from '@/services/storage';
import { auth } from '@/firebase';
import { getDaysInMonth } from 'date-fns';
import { Clock, Hash } from 'lucide-react';
import { Spinner } from './ui/spinner';
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';

interface MonthlySummaryCardProps {
  date: Date;
}

const MonthlySummaryCard: React.FC<MonthlySummaryCardProps> = ({ date }) => {
  const [sessions, setSessions] = useState<PumpingSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    setLoading(true);
    const unsubscribe = subscribeToMonthlySessions(user.uid, date, (data) => {
      setSessions(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [date]);

  // Process sessions into daily volumes for chart
  const dailyData = useMemo(() => {
    const daysInMonth = getDaysInMonth(date);
    const volumeByDay: Record<number, number> = {};

    // Initialize all days with 0
    for (let i = 1; i <= daysInMonth; i++) {
      volumeByDay[i] = 0;
    }

    // Sum up volumes per day
    sessions.forEach(session => {
      const sessionDate = new Date(session.startedAt);
      const day = sessionDate.getDate();
      volumeByDay[day] = (volumeByDay[day] || 0) + session.volume;
    });

    // Convert to array for chart
    return Object.entries(volumeByDay).map(([day, volume]) => ({
      day: Number(day),
      volume,
    }));
  }, [sessions, date]);

  if (loading) {
    return (
      <Card className="w-full mb-4 shadow-md overflow-hidden border-solid border-purple-300 bg-purple-50 rounded-3xl p-6 flex justify-center">
        <Spinner className="text-purple-600" />
      </Card>
    );
  }

  const totalVolume = sessions.reduce((sum, s) => sum + s.volume, 0);
  const totalSessions = sessions.length;

  const uniqueDays = new Set(sessions.map(s => new Date(s.startedAt).toDateString())).size;
  const dailyAverage = uniqueDays > 0 ? Math.round(totalVolume / uniqueDays) : 0;

  return (
    <Card className="w-full shadow-md overflow-hidden border-solid border-purple-300 bg-purple-50 rounded-3xl p-6">
      <div className="text-center">
        <h3 className="text-sm font-semibold text-purple-800">Monthly total</h3>
        <p className="mt-1 flex items-baseline justify-center gap-1.5 text-purple-950">
          <span className="text-4xl font-bold leading-none tabular-nums tracking-tight">
            {(totalVolume / 1000).toFixed(1)}
          </span>
          <span className="text-base font-semibold text-purple-800">L</span>
        </p>
      </div>

      {/* Chart */}
      <div className="h-48 w-full overflow-hidden rounded-lg border-none bg-purple-50/50 px-2 py-0 outline-none focus:outline-none **:outline-none **:border-none">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dailyData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid
              horizontal={true}
              vertical={false}
              strokeDasharray="3 3"
              stroke="var(--color-purple-200)"
            />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'var(--color-purple-700)' }}
              interval="preserveStartEnd"
              tickFormatter={(value) => (value === 1 || value === 15 || value === dailyData.length) ? value : ''}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e9d5ff',
                borderRadius: '12px',
                fontSize: '14px',
              }}
              formatter={(value: number | undefined) => [`${value ?? 0} ml`, 'Volume']}
              labelFormatter={(label) => `Day ${label}`}
            />
            <Bar
              dataKey="volume"
              fill="var(--color-purple-500)"
              radius={[2, 2, 0, 0]}
              maxBarSize={12}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-purple-200 pt-4">
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-1.5 text-purple-800">
            <Clock aria-hidden="true" className="size-4" />
            <span className="text-[13px] font-semibold sm:text-sm">Daily average</span>
          </div>
          <p className="flex items-baseline gap-1 text-purple-950">
            <span className="text-xl font-bold tabular-nums sm:text-2xl">{dailyAverage}</span>
            <span className="text-xs font-semibold text-purple-800">ml</span>
          </p>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-1.5 text-purple-800">
            <Hash aria-hidden="true" className="size-4" />
            <span className="text-[13px] font-semibold sm:text-sm">Sessions</span>
          </div>
          <span className="text-xl font-bold tabular-nums text-purple-950 sm:text-2xl">{totalSessions}</span>
        </div>
      </div>
    </Card>
  );
};

export default React.memo(MonthlySummaryCard);
