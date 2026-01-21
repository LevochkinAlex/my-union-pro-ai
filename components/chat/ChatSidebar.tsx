'use client';

interface ChatRoom {
  id: string;
  name: string;
  avatarUrl?: string;
  type: 'PRIVATE' | 'GROUP' | 'TICKET';
  lastMessage?: {
    content: string;
    createdAt: Date;
  };
  unreadCount: number;
  isDirect: boolean;
  isTicket?: boolean;
}

interface ChatSidebarProps {
  rooms: ChatRoom[];
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
}

export default function ChatSidebar({ rooms, selectedChatId, onSelectChat }: ChatSidebarProps) {
  return (
    <div className="w-64 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
      {/* Header */}
      <div className="h-16 border-b border-gray-200 dark:border-gray-700 flex items-center px-4">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Чаты</h1>
      </div>

      {/* Rooms list */}
      <div className="flex-1 overflow-y-auto">
        {rooms.map(room => (
          <button
            key={room.id}
            onClick={() => onSelectChat(room.id)}
            className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
              selectedChatId === room.id
                ? 'bg-blue-50 dark:bg-blue-900/20 border-r-2 border-blue-500'
                : ''
            }`}
          >
            {room.avatarUrl ? (
              <img
                src={room.avatarUrl}
                alt={room.name}
                className="w-10 h-10 rounded-full"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                <span className="text-gray-600 dark:text-gray-300 text-sm font-medium">
                  {room.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {room.name}
                </p>
                {room.unreadCount > 0 && (
                  <span className="ml-2 bg-blue-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                    {room.unreadCount}
                  </span>
                )}
              </div>
              {room.lastMessage && (
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">
                  {room.lastMessage.content}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
