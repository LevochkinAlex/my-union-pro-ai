'use client';

import { useState } from 'react';
import {
  Card,
  CardBody,
  Avatar,
  Chip,
  Input,
  ScrollShadow,
} from '@heroui/react';
import { Search, MessageCircle } from 'lucide-react';

interface ChatSidebarProps {
  rooms: any[];
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
}

export default function ChatSidebar({ rooms, selectedChatId, onSelectChat }: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRooms = (rooms || []).filter(room => {
    const roomName = room?.name || room?.displayName || '';
    return roomName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="w-80 border-r border-divider bg-content1 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-divider">
        <h1 className="text-2xl font-bold text-foreground mb-4">Чаты</h1>
        <Input
          placeholder="Поиск чатов..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          startContent={<Search className="w-4 h-4 text-default-400" />}
          size="sm"
          variant="bordered"
          classNames={{
            input: "text-sm",
            inputWrapper: "border-default-200",
          }}
        />
      </div>

      {/* Rooms list */}
      <ScrollShadow className="flex-1">
        <div className="p-2">
          {filteredRooms.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle className="w-12 h-12 mx-auto mb-2 text-default-400" />
              <p className="text-sm text-foreground-500">
                {searchQuery ? 'Чаты не найдены' : 'Нет чатов'}
              </p>
            </div>
          ) : (
            filteredRooms.map(room => {
              const roomName = room?.name || room?.displayName || 'Без названия';
              const roomAvatar = room?.avatarUrl || null;
              const unreadCount = room?.unreadCount || 0;
              const lastMessage = room?.lastMessage;
              
              return (
                <Card
                  key={room.id}
                  isPressable
                  onPress={() => onSelectChat(room.id)}
                  className={`mb-2 transition-all ${
                    selectedChatId === room.id
                      ? 'bg-primary-50 dark:bg-primary-900/20 border-l-4 border-l-primary'
                      : 'hover:bg-default-100 dark:hover:bg-default-50'
                  }`}
                  shadow="none"
                >
                  <CardBody className="p-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={roomAvatar}
                        name={roomName}
                        size="md"
                        className="flex-shrink-0"
                      />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className={`font-medium text-sm truncate ${
                            selectedChatId === room.id
                              ? 'text-primary'
                              : 'text-foreground'
                          }`}>
                            {roomName}
                          </p>
                          {unreadCount > 0 && (
                            <Chip
                              size="sm"
                              color="primary"
                              variant="flat"
                              className="ml-2"
                            >
                              {unreadCount}
                            </Chip>
                          )}
                        </div>
                        {lastMessage && (
                          <p className="text-xs text-foreground-500 truncate">
                            {lastMessage.content}
                          </p>
                        )}
                        {lastMessage?.createdAt && (
                          <p className="text-xs text-foreground-400 mt-0.5">
                            {new Date(lastMessage.createdAt).toLocaleTimeString('ru-RU', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            })
          )}
        </div>
      </ScrollShadow>
    </div>
  );
}
