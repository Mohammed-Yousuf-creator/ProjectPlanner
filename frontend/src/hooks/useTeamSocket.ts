import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TeamSocket, type TeamSocketEvent, type TeamSocketStatus } from '@/lib/ws';
import { useAuthStore } from '@/stores/authStore';

export type TeamSocketState = {
  status: TeamSocketStatus;
  accessRevoked: boolean;
  retryExhausted: boolean;
  reconnect: () => void;
};

/**
 * Bridges the team WebSocket into react-query. Broadcast payloads are treated as
 * opaque notifications: we invalidate the affected query keys and let REST
 * refetch, which keeps the client honest about the (undocumented) payload shape.
 */
export function useTeamSocket(
  teamId: string | undefined,
  handlers: { onAccessRevoked?: () => void } = {},
): TeamSocketState {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const [status, setStatus] = useState<TeamSocketStatus>('idle');
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [retryExhausted, setRetryExhausted] = useState(false);
  const socketRef = useRef<TeamSocket | null>(null);
  const onAccessRevokedRef = useRef(handlers.onAccessRevoked);
  onAccessRevokedRef.current = handlers.onAccessRevoked;

  const handleEvent = useCallback(
    (event: TeamSocketEvent) => {
      if (!teamId) return;
      if (event.startsWith('message.')) {
        void queryClient.invalidateQueries({ queryKey: ['team', teamId, 'messages'] });
      } else if (event.startsWith('task.')) {
        void queryClient.invalidateQueries({ queryKey: ['team', teamId, 'tasks'] });
      }
    },
    [queryClient, teamId],
  );

  useEffect(() => {
    if (!teamId || !accessToken) return;

    setAccessRevoked(false);
    setRetryExhausted(false);

    const socket = new TeamSocket(teamId, {
      getToken: () => useAuthStore.getState().accessToken,
      onStatus: (next) => {
        setStatus(next);
        if (next === 'closed') {
          setRetryExhausted(socketRef.current?.hasExhaustedRetries ?? false);
        }
      },
      onEvent: handleEvent,
      onAccessRevoked: () => {
        setAccessRevoked(true);
        onAccessRevokedRef.current?.();
      },
    });

    socketRef.current = socket;
    socket.connect();

    return () => {
      socket.dispose();
      socketRef.current = null;
      setStatus('idle');
    };
  }, [teamId, accessToken, handleEvent]);

  const reconnect = useCallback(() => {
    setRetryExhausted(false);
    if (socketRef.current) socketRef.current.reconnectNow();
    else if (teamId) {
      setStatus('connecting');
      const socket = new TeamSocket(teamId, {
        getToken: () => useAuthStore.getState().accessToken,
        onStatus: setStatus,
        onEvent: handleEvent,
        onAccessRevoked: () => {
          setAccessRevoked(true);
          onAccessRevokedRef.current?.();
        },
      });
      socketRef.current = socket;
      socket.connect();
    }
  }, [teamId, handleEvent]);

  return { status, accessRevoked, retryExhausted, reconnect };
}
