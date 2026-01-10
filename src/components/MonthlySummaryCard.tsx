import React, { useEffect, useState, useMemo } from 'react';
import { Card } from './ui/card';
import { PumpingSession, subscribeToMonthlySessions } from '@/services/storage';
import { auth } from '@/firebase';
import { getDaysInMonth } from 'date-fns';
import { Droplets, Clock, Hash } from 'lucide-react';
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
      <div className="flex items-center justify-center px-8">
        <h3 className="text-lg text-center font-medium mb-2 text-purple-900 flex items-center gap-2">
          Monthly Summary
        </h3>
      </div>

      {/* Chart */}
      <div className="w-full h-40 px-2 py-0 bg-purple-50/50 rounded-lg overflow-hidden outline-none border-none focus:outline-none **:outline-none **:border-none">
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
              tick={{ fontSize: 10, fill: 'var(--color-purple-600)' }}
              interval="preserveStartEnd"
              tickFormatter={(value) => (value === 1 || value === 15 || value === dailyData.length) ? value : ''}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e9d5ff',
                borderRadius: '12px',
                fontSize: '12px',
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

      <div className="grid grid-cols-3 gap-2">
        {/* Total Volume */}
        <div className="flex flex-col items-center p-2 bg-purple-100/50 rounded-2xl border border-purple-100">
          <div className="p-2 bg-white rounded-full mb-2 shadow-sm">
            <Droplets className="w-4 h-4 text-purple-600" />
          </div>
          <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider text-center">Total</span>
          <div className="flex items-baseline gap-0.5 mt-1">
            <span className="text-xl font-bold text-purple-900">
              {(totalVolume / 1000).toFixed(1)}
            </span>
            <span className="text-[10px] font-medium text-purple-600">L</span>
          </div>
        </div>

        {/* Daily Average */}
        <div className="flex flex-col items-center p-2 bg-purple-100/50 rounded-2xl border border-purple-100">
          <div className="p-2 bg-white rounded-full mb-2 shadow-sm">
            <Clock className="w-4 h-4 text-purple-600" />
          </div>
          <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider text-center">Daily Avg</span>
          <div className="flex items-baseline gap-0.5 mt-1">
            <span className="text-xl font-bold text-purple-900">{dailyAverage}</span>
            <span className="text-[10px] font-medium text-purple-600">ml</span>
          </div>
        </div>

        {/* Session Count */}
        <div className="flex flex-col items-center p-2 bg-purple-100/50 rounded-2xl border border-purple-100">
          <div className="p-2 bg-white rounded-full mb-2 shadow-sm">
            <Hash className="w-4 h-4 text-purple-600" />
          </div>
          <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider text-center">Sessions</span>
          <span className="text-xl font-bold text-purple-900 mt-1">{totalSessions}</span>
        </div>
      </div>
    </Card>
  );
};

export default React.memo(MonthlySummaryCard);
