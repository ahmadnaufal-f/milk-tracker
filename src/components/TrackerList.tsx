import React, { useEffect, useState } from 'react';
import { subscribeToSessions, updateSession, deleteSession, PumpingSession, subscribeToSettings } from '@/services/storage';
import { Button } from '@/components/ui/button';
import { Save, ChevronLeft, ChevronRight } from 'lucide-react';
import SessionListItem from '@/components/SessionListItem';
import { useNavigate } from 'react-router-dom';
import { auth } from '@/firebase';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { format, addDays, subDays } from 'date-fns';
import { Card } from './ui/card';
import { Spinner } from './ui/spinner';

interface TrackerListProps {
    date?: Date | null;
    showViewMore?: boolean;
    onDateChange?: (date: Date) => void;
}

const TrackerList: React.FC<TrackerListProps> = ({ date, showViewMore = false, onDateChange }) => {
    const [sessions, setSessions] = useState<PumpingSession[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [targetVolume, setTargetVolume] = useState<number>(150);
    const displayDate = date || new Date();

    // Edit State
    const [editingSession, setEditingSession] = useState<PumpingSession | null>(null);
    const [editVolume, setEditVolume] = useState('');
    const [editDuration, setEditDuration] = useState('');
    const [editStartTime, setEditStartTime] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) {
            setLoading(false);
            return;
        }

        // If date is provided, use it. Otherwise query for today.
        // This ensures we always query for a single day.
        const filterDate = date || new Date();

        const unsubscribeSessions = subscribeToSessions(user.uid, (data) => {
            setSessions(data);
            setLoading(false);
        }, filterDate);

        const unsubscribeSettings = subscribeToSettings(user.uid, (settings) => {
            if (settings.targetVolume) {
                setTargetVolume(Number(settings.targetVolume));
            }
        });

        return () => {
            unsubscribeSessions();
            unsubscribeSettings();
        };
    }, [date]);

    const handleEditClick = (session: PumpingSession) => {
        setEditingSession(session);
        setEditVolume(session.volume.toString());
        setEditDuration(session.duration.toString());

        // Format date for datetime-local input (YYYY-MM-DDThh:mm)
        const dateObj = new Date(session.startedAt as string | Date);
        // Adjust to local ISO string for input
        const localIso = new Date(dateObj.getTime() - (dateObj.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        setEditStartTime(localIso);
    };

    const handleSaveEdit = async () => {
        if (!editingSession || !auth.currentUser) return;

        setIsSaving(true);
        try {
            await updateSession(auth.currentUser.uid, editingSession.id!, {
                volume: Number(editVolume),
                duration: Number(editDuration),
                startedAt: new Date(editStartTime).toISOString()
            });
            setEditingSession(null);
        } catch (error) {
            console.error("Failed to update session", error);
            alert("Failed to update session");
        } finally {
            setIsSaving(false);
        }
    };

    const [deletingSession, setDeletingSession] = useState<PumpingSession | null>(null);

    // ... inside component

    const handleDeleteClick = (session: PumpingSession) => {
        setDeletingSession(session);
    };

    const confirmDelete = async () => {
        if (!deletingSession || !auth.currentUser) return;

        setIsDeleting(true);
        try {
            await deleteSession(auth.currentUser.uid, deletingSession.id!);
            if (editingSession?.id === deletingSession.id) {
                setEditingSession(null);
            }
            setDeletingSession(null);
        } catch (error) {
            console.error("Failed to delete session", error);
            alert("Failed to delete session");
        } finally {
            setIsDeleting(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-white dark:bg-card rounded-3xl shadow-sm border p-6 min-h-[200px] flex items-center justify-center">
                <div className="text-center text-muted-foreground animate-pulse">
                    Loading history...
                </div>
            </div>
        );
    }

    return (
        <Card className="w-full gap-4 mb-8 shadow-xl overflow-hidden border-solid border-purple-300 bg-purple-50  rounded-3xl">
            {onDateChange ? (
                <div className="flex items-center justify-between px-8">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDateChange(subDays(displayDate, 1))}
                        className="h-8 w-8 text-slate-400 hover:text-purple-600"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <h3 className="text-lg font-medium text-purple-900">
                        {format(displayDate, 'MMMM d, yyyy')}
                    </h3>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDateChange(addDays(displayDate, 1))}
                        disabled={displayDate >= new Date(new Date().setHours(0, 0, 0, 0))}
                        className="h-8 w-8 text-slate-400 hover:text-purple-600 disabled:opacity-30"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </Button>
                </div>
            ) : (
                <h3 className="text-lg font-medium text-center text-purple-900 flex items-center justify-center gap-2">
                    <span className="text-yellow-400">✨</span> Today's Pumping <span className="text-yellow-400">✨</span>
                </h3>
            )}

            {sessions.length === 0 ? (
                <div className="text-center text-muted-foreground">
                    <img src="/empty-bottle.webp" alt="Empty Bottle" className="w-24 h-24 mb-4 mx-auto" />
                    <p>{onDateChange ? "No sessions for this date." : "You haven't started pumped yet. Start now!"}</p>
                    {onDateChange && <p className="text-sm mt-1">Select another date or start tracking!</p>}
                </div>
            ) : (
                <div>
                    {sessions.map((session, index) => (
                        <React.Fragment key={session.id}>
                            <SessionListItem
                                session={session}
                                onEdit={handleEditClick}
                                onDelete={handleDeleteClick}
                                targetVolume={targetVolume}
                            />
                            {index < sessions.length - 1 && <Separator className="bg-purple-100 dark:bg-purple-900/20" />}
                        </React.Fragment>
                    ))}
                </div>
            )}

            {/* Daily Summary */}
            {onDateChange && sessions.length > 0 && (
                <div className="mt-2 mx-4 p-4 bg-purple-100/50 rounded-2xl grid grid-cols-2 gap-4 border border-purple-100">
                    <div className="flex flex-col items-center">
                        <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Daily Total</span>
                        <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-2xl font-medium text-purple-800">
                                {sessions.reduce((sum, s) => sum + s.volume, 0)}
                            </span>
                            <span className="text-xs font-medium text-purple-600">ml</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-center border-l border-purple-200">
                        <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Session Avg</span>
                        <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-2xl font-medium text-purple-800">
                                {Math.round(sessions.reduce((sum, s) => sum + s.volume, 0) / sessions.length)}
                            </span>
                            <span className="text-xs font-medium text-purple-600">ml</span>
                        </div>
                    </div>
                </div>
            )}

            {showViewMore && <ViewMoreButton />}

            <Dialog open={!!editingSession} onOpenChange={(open) => !open && setEditingSession(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit Session</DialogTitle>
                        <DialogDescription>
                            Update the details for this pumping session.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="edit-start" className="text-right">
                                Started
                            </Label>
                            <Input
                                id="edit-start"
                                type="datetime-local"
                                value={editStartTime}
                                onChange={(e) => setEditStartTime(e.target.value)}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="edit-duration" className="text-right">
                                Mins
                            </Label>
                            <Input
                                id="edit-duration"
                                type="number"
                                value={editDuration}
                                onChange={(e) => setEditDuration(e.target.value)}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="edit-volume" className="text-right">
                                Volume
                            </Label>
                            <Input
                                id="edit-volume"
                                type="number"
                                value={editVolume}
                                onChange={(e) => setEditVolume(e.target.value)}
                                className="col-span-3"
                            />
                        </div>
                    </div>
                    <DialogFooter className="flex justify-between sm:justify-between items-center w-full">
                        <div className="flex flex-col-reverse gap-2">
                            <Button variant="ghost" onClick={() => setEditingSession(null)}>Cancel</Button>
                            <Button onClick={handleSaveEdit} disabled={isSaving || isDeleting}>
                                {isSaving ? <Spinner /> : <Save className="mr-1 size-4" />}
                                Save Changes
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deletingSession} onOpenChange={(open) => !open && setDeletingSession(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete Session</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this session? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex gap-2 sm:justify-end">
                        <Button variant="outline" onClick={() => setDeletingSession(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
                            {isDeleting ? <Spinner /> : "Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
};

const ViewMoreButton: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="text-center">
            <button
                className="text-purple-400 hover:text-purple-600 text-sm font-medium hover:underline inline-flex items-center transition-colors"
                onClick={() => navigate('/history')}
            >
                View all history <span className="ml-1">&gt;</span>
            </button>
        </div>
    );
};

export default TrackerList;
