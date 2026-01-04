import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import TrackerList from '@/components/TrackerList';

const HistoryPage: React.FC = () => {
    const navigate = useNavigate();
    const [date, setDate] = useState<Date | undefined>(new Date());

    return (
        <div className="min-h-screen bg-background flex flex-col items-center p-6 relative overflow-hidden">
            {/* Header */}
            <header className="w-full max-w-md flex justify-between items-center mb-4 z-10">
                <div className="flex items-center space-x-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/tracker')}>
                        <ArrowLeft className="w-6 h-6" />
                    </Button>
                    <div className="flex flex-col">
                        <h1 className="text-2xl font-bold bg-clip-text text-purple-900">
                            History
                        </h1>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="w-full max-w-md z-10 flex-1 pb-8">
                <TrackerList date={date} showViewMore={false} onDateChange={setDate} />
            </main>
        </div>
    );
};

export default HistoryPage;
