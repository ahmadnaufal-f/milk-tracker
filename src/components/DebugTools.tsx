import React, { useState } from 'react';
import { addSession } from '@/services/storage';
import { MOCK_SESSIONS } from '@/data/mockSessions';
import { Button } from '@/components/ui/button';

import { auth } from '@/firebase';

const DebugTools: React.FC = () => {
    const [seeding, setSeeding] = useState(false);

    const handleSeed = async () => {
        const user = auth.currentUser;
        if (!user) {
            alert("Please log in to seed data.");
            return;
        }

        if (!confirm('This will add 5 dummy records to your Firestore database. Continue?')) return;

        setSeeding(true);
        try {
            for (const session of MOCK_SESSIONS) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { id, ...data } = session;
                await addSession(user.uid, data);
            }
            alert('Seeding complete! The list should update automatically.');
        } catch (error) {
            console.error(error);
            alert('Failed to seed data. Check console.');
        } finally {
            setSeeding(false);
        }
    };

    return (
        <div className="fixed bottom-4 right-4 opacity-50 hover:opacity-100 transition-opacity">
            <Button
                onClick={handleSeed}
                disabled={seeding}
                variant="outline"
                size="sm"
                className="text-xs"
            >
                {seeding ? 'Seeding...' : 'Seed Dummy Data'}
            </Button>
        </div>
    );
};

export default DebugTools;
