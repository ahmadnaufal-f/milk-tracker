import { PumpingSession } from "../services/storage";

export const MOCK_SESSIONS: PumpingSession[] = [
    {
        id: "mock-1",
        volume: 5.5,
        duration: 20,
        startedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    },
    {
        id: "mock-2",
        volume: 3.0,
        duration: 15,
        startedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    },
    {
        id: "mock-3",
        volume: 4.2,
        duration: 18,
        startedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
    },
    {
        id: "mock-4",
        volume: 6.0,
        duration: 25,
        startedAt: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
    },
    {
        id: "mock-5",
        volume: 2.5,
        duration: 10,
        startedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(), // 1 week ago
    }
];
