import React, { useEffect, useState } from 'react';
import TrackerListCard from '@/components/TrackerListCard';
import MonthlySummaryCard from '@/components/MonthlySummaryCard';
import DateSelectorCard from '@/components/DateSelectorCard';
import BasePage from '@/components/BasePage';

const HistoryPage: React.FC = () => {
  const [date, setDate] = useState<Date>(new Date());
  const [month, setMonth] = useState<Date>(new Date());

  useEffect(() => {
    const currMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    if (currMonth.getTime() !== month.getTime()) {
      setMonth(currMonth);
    }
  }, [date, month]);

  return (
    <BasePage showBackButton={true} pageTitle="History">
      <main className="w-full max-w-md z-10 flex-1 flex flex-col gap-4">
        <DateSelectorCard date={date} onDateChange={setDate} />
        <TrackerListCard date={date} showViewMore={false} onDateChange={setDate} title="Daily Log" />
        <MonthlySummaryCard date={month} />
      </main>
    </BasePage>
  );
};

export default HistoryPage;
