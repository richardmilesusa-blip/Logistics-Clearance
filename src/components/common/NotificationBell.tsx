import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Clock, Check } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../../lib/apiClient';

interface NotificationItem {
  id: string;
  job_id: string | null;
  recipient_id: string;
  channel: string;
  type: string;
  message: string;
  is_read: boolean;
  sent_at: string | null;
  created_at: string;
}

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Fetch unread notifications every 60 seconds
  const { data: notifications = [] } = useQuery<NotificationItem[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await apiClient.get('/api/notifications');
      return res.data?.data || [];
    },
    refetchInterval: 60000,
  });

  // Mutate to mark all as read
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiClient.put('/api/notifications/read-all');
    },
    onSuccess: () => {
      queryClient.setQueryData(['notifications'], []);
    },
  });

  // Mutate to mark single notification as read
  const markSingleReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.put(`/api/notifications/${id}/read`);
    },
    onSuccess: (_, id) => {
      queryClient.setQueryData<NotificationItem[]>(['notifications'], (prev) =>
        prev ? prev.filter((n) => n.id !== id) : []
      );
    },
  });

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllAsRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAllReadMutation.mutate();
  };

  const handleNotificationClick = (note: NotificationItem) => {
    markSingleReadMutation.mutate(note.id);
    setIsOpen(false);
    if (note.job_id) {
      navigate(`/jobs/${note.job_id}`);
    }
  };

  const truncateMessage = (msg: string, limit = 60) => {
    if (msg.length <= limit) return msg;
    return msg.substring(0, limit) + '...';
  };

  const getRelativeTime = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="relative" ref={dropdownRef} id="notification-bell-container">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-full text-slate-500 hover:text-primary-700 hover:bg-slate-100 transition-colors relative cursor-pointer focus:outline-none"
        title="Check compliance updates"
        id="notification-bell-btn"
      >
        <Bell size={20} />
        {notifications.length > 0 && (
          <span className="absolute top-0 right-0 w-4 h-4 bg-danger-500 text-[9px] font-bold text-white rounded-full flex items-center justify-center animate-pulse border border-white">
            {notifications.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-3 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-fade-in"
          id="notification-bell-dropdown"
        >
          <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold text-primary-900">
              Clearance Compliance Notifications ({notifications.length})
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-1.5">
                <Clock size={16} className="text-slate-300 animate-pulse" />
                <span>All cleared. No compliance alerts.</span>
              </div>
            ) : (
              // Display upper limit of 8 entries
              notifications.slice(0, 8).map((note) => (
                <div
                  key={note.id}
                  onClick={() => handleNotificationClick(note)}
                  className="p-3 hover:bg-slate-50 transition-colors cursor-pointer flex justify-between items-start gap-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-slate-600 leading-normal font-medium">
                      {truncateMessage(note.message)}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] font-bold text-accent-500 uppercase tracking-wide">
                        {note.type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[9px] text-slate-400 font-medium">
                        {getRelativeTime(note.created_at)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      markSingleReadMutation.mutate(note.id);
                    }}
                    className="p-1 text-slate-300 hover:text-success-500 rounded transition-colors"
                    title="Mark single note as read"
                  >
                    <Check size={12} />
                  </button>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-2 bg-slate-50 border-t border-slate-100 text-center">
              <button
                onClick={handleMarkAllAsRead}
                className="text-xs font-bold text-primary-600 hover:text-primary-800 focus:outline-none cursor-pointer w-full text-center"
                id="notification-mark-all-btn"
              >
                Mark all read
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
