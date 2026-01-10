import React from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';

interface DateSelectorCardProps {
  date: Date;
  onDateChange: (date: Date) => void;
}

const DateSelectorCard: React.FC<DateSelectorCardProps> = ({ date, onDateChange }) => {
  return (
    <Card className="w-full shadow-md overflow-hidden border-solid border-purple-300 bg-purple-50 rounded-3xl p-4">
      <div className="flex items-center justify-between px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDateChange(subDays(date, 1))}
          className="h-8 w-8 text-slate-400 hover:text-purple-600"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h3 className="text-lg font-medium text-purple-900">
          {format(date, 'MMMM d, yyyy')}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDateChange(addDays(date, 1))}
          disabled={date >= new Date(new Date().setHours(0, 0, 0, 0))}
          className="h-8 w-8 text-slate-400 hover:text-purple-600 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </Card>
  );
};

export default DateSelectorCard;
