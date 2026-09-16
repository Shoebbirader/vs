import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { offlineMutationQueueSize, subscribeOfflineMutationQueue } from "@/lib/offline-mutations";

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const [pending, setPending] = useState(() => offlineMutationQueueSize());

  useEffect(() => subscribeOfflineMutationQueue(() => setPending(offlineMutationQueueSize())), []);

  if (isOnline && pending === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 left-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 shadow-md">
      {isOnline ? <Wifi size={18} className="flex-shrink-0" /> : <WifiOff size={18} className="flex-shrink-0" />}
      <div className="flex-1">
        <p className="font-semibold">{isOnline ? "Syncing saved changes" : "You're offline"}</p>
        <p className="text-xs">{pending ? `${pending} driver change${pending === 1 ? "" : "s"} waiting to sync.` : "Some features may be limited until connectivity returns."}</p>
      </div>
    </div>
  );
}
