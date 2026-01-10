import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings, LogOut, User as UserIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { auth } from '@/firebase';
import { signOut, User } from 'firebase/auth';

interface BasePageProps {
  children: React.ReactNode;
  className?: string;
  showBackButton?: boolean;
  pageTitle?: string;
  showAvatar?: boolean;
}

const BasePage: React.FC<BasePageProps> = ({
  children,
  className = '',
  showBackButton = false,
  pageTitle,
  showAvatar = false,
}) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(auth.currentUser);

  useEffect(() => {
    if (showAvatar) {
      const unsubscribe = auth.onAuthStateChanged((u) => {
        setUser(u);
      });
      return () => unsubscribe();
    }
  }, [showAvatar]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  const showHeader = showBackButton || pageTitle || showAvatar;

  return (
    <div className={`min-h-screen flex flex-col items-center p-4 relative overflow-hidden ${className}`}>
      {showHeader && (
        <header className="w-full max-w-md flex justify-between items-center mb-4 z-10">
          <div className="flex items-center space-x-3">
            {showBackButton && (
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            {pageTitle && (
              <h1 className="text-2xl font-semibold">{pageTitle}</h1>
            )}
          </div>

          {showAvatar && (
            <DropdownMenu>
              <DropdownMenuTrigger className="rounded-full">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user?.photoURL || undefined} alt={user?.displayName || "User"} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {user?.displayName ? user.displayName.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
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
          )}
        </header>
      )}
      {children}
    </div>
  );
};

export default BasePage;
