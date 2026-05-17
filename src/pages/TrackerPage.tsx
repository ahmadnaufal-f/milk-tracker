import React from 'react';
import PumpingInformation from '@/components/PumpingInformation';
import TrackerListCard from '@/components/TrackerListCard';
import BasePage from '@/components/BasePage';

const TrackerPage: React.FC = () => {
  return (
    <BasePage showAvatar={true}>
      <main className="flex flex-col items-center w-full max-w-md space-y-8">
        <PumpingInformation />

        <div className="w-full">
          <TrackerListCard date={new Date()} showViewMore={true} />
        </div>
      </main>
    </BasePage>
  );
};

export default TrackerPage;
