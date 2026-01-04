import React from 'react';
import { PumpingSession } from '@/services/storage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, MoreVertical } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SessionListItemProps {
    session: PumpingSession;
    onEdit: (session: PumpingSession) => void;
    onDelete: (session: PumpingSession) => void;
    targetVolume?: number;
}

const SessionListItem: React.FC<SessionListItemProps> = ({ session, onEdit, onDelete, targetVolume }) => {
    const startDate = new Date(session.startedAt as string);
    const endDate = new Date(startDate.getTime() + session.duration * 60000);

    const timeFormat: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
    const startTime = startDate.toLocaleTimeString([], timeFormat);
    const endTime = endDate.toLocaleTimeString([], timeFormat);

    return (
        <div
            className="flex w-full items-center justify-between px-6 py-2 bg-transparent"
        >
            {/* Left Side: Icon & Volume */}
            <div className="flex items-center gap-2">
                <div className="relative w-fit h-fit flex items-center justify-center">
                    {/* Dynamic Bottle Image */}
                    <img
                        src={(() => {
                            const target = targetVolume || 150;
                            const percentage = (session.volume / target) * 100;

                            if (percentage <= 25) return "/milk-25.webp";
                            if (percentage <= 50) return "/milk-50.webp";
                            if (percentage <= 75) return "/milk-75.webp";
                            return "/milk-100.webp";
                        })()}
                        alt={`${session.volume}ml bottle`}
                        className="w-8 h-11 object-contain shrink-0"
                    />
                </div>

                <Badge className="w-18 bg-[#cd4cea] hover:bg-[#cd4cea]/90 text-white rounded-full px-4 py-1 text-sm font-normal">
                    {session.volume} ml
                </Badge>
            </div>

            {/* Right Side: Time & Menu */}
            <div className="flex flex-1 items-center gap-2 ml-8">
                <span className="text-sm font-medium text-purple-700 flex-1 text-center">
                    {startTime} - {endTime}
                </span>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-5 text-purple-700 hover:text-purple-900">
                            <MoreVertical className="size-5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32">
                        <DropdownMenuItem onClick={() => onEdit(session)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDelete(session)} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                            <Trash2 className="mr-2 h-4 w-4 text-red-600" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
};

export default SessionListItem;
