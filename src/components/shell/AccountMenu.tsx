import * as React from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, User as UserIcon, Activity } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Account access, built only from fields the database actually has —
 * profiles.name / .email — no avatar_url, no invented status text. The
 * previous menu's "Settings" item had no handler and went nowhere; it's
 * gone, not carried forward silently broken.
 */
export function AccountMenu() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const name = user?.profile?.name || "Your account";
  const email = user?.profile?.email || user?.user.email || "";
  const initial = (user?.profile?.name?.charAt(0) || user?.user.email?.charAt(0) || "U").toUpperCase();

  const handleLogout = async () => {
    try {
      await signOut();
      navigate("/login");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "relative flex size-10 items-center justify-center rounded-full",
          "transition-shadow duration-fast ease-out",
          "hover:shadow-subtle",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
        aria-label={`Account menu for ${name}`}
      >
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary font-display text-sm font-semibold text-primary-foreground">
            {initial}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-body-sm font-semibold text-foreground">{name}</span>
            <span className="truncate text-caption text-muted-foreground">{email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/profile")} className="gap-2">
          <UserIcon className="size-4" aria-hidden="true" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/my-orders")} className="gap-2">
          <Activity className="size-4" aria-hidden="true" />
          Activity
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="gap-2 text-destructive focus:text-destructive">
          <LogOut className="size-4" aria-hidden="true" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
