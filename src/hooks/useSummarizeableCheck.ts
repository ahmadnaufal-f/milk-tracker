import { useEffect, useState } from "react";
import { PumpingSession } from "@/services/storage";

export default function useSummarizeableCheck(sessions: PumpingSession[]) {
  const [isSummarizeable, setIsSummarizeable] = useState(false);

  // check if the session data exists in each day for the last 7 days
  useEffect(() => {
    const today = new Date();
    const last7Days = [];
    for (let i = 1; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      last7Days.push(date);
    }

    const isSummarizeable = last7Days.every((day) => {
      return sessions.some((session) => {
        const sessionDate = new Date(session.startedAt);
        return sessionDate.toDateString() === day.toDateString();
      });
    });

    setIsSummarizeable(isSummarizeable);
  }, [sessions]);

  return { isSummarizeable };
}
