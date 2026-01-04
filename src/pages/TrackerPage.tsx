import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PumpingTimer from '@/components/PumpingTimer';
import TrackerList from '@/components/TrackerList';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Settings, LogOut, User as UserIcon } from 'lucide-react';
import { auth } from '@/firebase';
import { signOut, User } from 'firebase/auth';

const TrackerPage: React.FC = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState<User | null>(auth.currentUser);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((u) => {
            setUser(u);
        });
        return () => unsubscribe();
    }, []);

    const handleSignOut = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error signing out", error);
        }
    };

    return (
        <>
            <main className="flex flex-col items-center w-full max-w-md space-y-8 p-4">
                <DropdownMenu>
                    <DropdownMenuTrigger className="self-end rounded-full">
                        <Avatar className="h-10 w-10">
                            <AvatarImage src={user?.photoURL || undefined} alt={user?.displayName || "User"} />
                            <AvatarFallback className="bg-primary/10 text-primary">
                                {user?.displayName ? user.displayName.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
                            </AvatarFallback>
                        </Avatar>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 bg-card/95 backdrop-blur-md border-white/10">
                        <DropdownMenuLabel className="font-normal">
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none">{user?.displayName}</p>
                                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => navigate('/settings')} className="cursor-pointer">
                            <Settings className="mr-2 h-4 w-4" />
                            <span>Settings</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-red-500 focus:text-red-500 focus:bg-red-100/10">
                            <LogOut className="mr-2 h-4 w-4 text-red-500" />
                            <span>Sign out</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <PumpingTimer />

                <div className="w-full">
                    <TrackerList date={new Date()} showViewMore={true} />
                </div>
            </main>
        </>
    );
};

export default TrackerPage;
