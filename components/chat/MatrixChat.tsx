'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import GroupIconUpload from './GroupIconUpload';

// Simple Avatar component
function Avatar({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-full overflow-hidden flex items-center justify-center ${className || ''}`}>{children}</div>;
}

function AvatarFallback({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`w-full h-full flex items-center justify-center ${className || ''}`}>{children}</div>;
}

// Компонент для отображения сообщений с поддержкой Markdown
function MessageContent({ content }: { content: string }) {
  // Проверяем, содержит ли сообщение markdown разметку
  const hasMarkdown = /(\*\*|__|\*|_|`|\[|\]|#|\n\n)/.test(content);
  
  if (!hasMarkdown) {
    // Простой текст - без markdown
    return <p className="whitespace-pre-wrap break-words">{content}</p>;
  }
  
  // Markdown контент
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none 
      prose-headings:text-gray-900 dark:prose-headings:text-white
      prose-p:text-gray-900 dark:prose-p:text-white prose-p:my-1
      prose-strong:text-gray-900 dark:prose-strong:text-white
      prose-code:text-blue-600 dark:prose-code:text-blue-400 prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
      prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800 prose-pre:text-gray-900 dark:prose-pre:text-white
      prose-a:text-blue-600 dark:prose-a:text-blue-400
      prose-ul:my-1 prose-ol:my-1 prose-li:my-0
      prose-blockquote:border-l-4 prose-blockquote:border-gray-300 dark:prose-blockquote:border-gray-600
      break-words">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{
          // Стилизуем параграфы
          p: ({ children }) => <p className="my-1">{children}</p>,
          // Стилизуем списки
          ul: ({ children }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
          ol: ({ children }) => <ol className="my-1 ml-4 list-decimal">{children}</ol>,
          // Стилизуем код
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-400 px-1 py-0.5 rounded text-sm" {...props}>
                  {children}
                </code>
              );
            }
            return <code className={className} {...props}>{children}</code>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

interface MatrixCredentials {
  userId: string;
  accessToken: string;
  serverUrl: string;
}

interface MatrixRoom {
  roomId: string;
  name: string;
  avatarUrl?: string;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount: number;
  isDirect: boolean;
  isTicket?: boolean; // Обращения - всегда в рабочих чатах
  ticketId?: string; // Public ID обращения
  ticketResolved?: boolean; // Обращение закрыто
  ticketStatus?: string; // Статус обращения
  isTicketCreator?: boolean; // Текущий пользователь - создатель обращения
}

interface DbRoomInfo {
  matrixRoomId: string;
  displayName: string;
  avatarUrl?: string;
  isDirect: boolean;
  isTicket?: boolean;
  ticketId?: string;
  ticketResolved?: boolean;
  ticketStatus?: string;
  isTicketCreator?: boolean;
  participantCount: number;
  participants: Array<{
    id: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
    matrixUserId?: string;
  }>;
}

interface MessageReaction {
  key: string;
  users: string[];
  count: number;
  eventIds?: Map<string, string>; // userId -> reactionEventId for redaction
}

interface MessageAttachment {
  type: 'image' | 'file' | 'video' | 'audio';
  url: string;
  name: string;
  size?: number;
  mimeType?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
}

interface ReplyInfo {
  eventId: string;
  sender: string;
  senderName: string;
  content: string;
}

interface MatrixMessage {
  eventId: string;
  sender: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  timestamp: number;
  isOwn: boolean;
  msgtype: 'm.text' | 'm.image' | 'm.file' | 'm.video' | 'm.audio';
  reactions?: MessageReaction[];
  replyTo?: ReplyInfo;
  attachment?: MessageAttachment;
  isEdited?: boolean; // Пометка о редактировании
  editTimestamp?: number; // Время последнего редактирования
}

interface TypingUser {
  userId: string;
  name: string;
}

export default function MatrixChat() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const urlChatId = searchParams.get('chatId');
  // credentials удален - Matrix больше не используется
  const [rooms, setRooms] = useState<MatrixRoom[]>([]);
  const [dbRoomInfo, setDbRoomInfo] = useState<Map<string, DbRoomInfo>>(new Map());
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [urlChatHandled, setUrlChatHandled] = useState(false);
  const [messages, setMessages] = useState<MatrixMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{userId: string; displayName: string; avatarUrl?: string; position?: string; organization?: string}>>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [dbRoomInfoLoaded, setDbRoomInfoLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<string>('MEMBER');
  // New chat menu dropdown
  const [showNewChatMenu, setShowNewChatMenu] = useState(false);
  // Group creation state (for PPO Head)
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [orgMembers, setOrgMembers] = useState<Array<{id: string; firstName: string; lastName: string; avatarUrl?: string; matrixUserId?: string}>>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(true); // Default open on mobile
  const [connected, setConnected] = useState(false);
  const [replyTo, setReplyTo] = useState<MatrixMessage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [forwardMessage, setForwardMessage] = useState<MatrixMessage | null>(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null); // For mobile tap actions
  const [messageMenu, setMessageMenu] = useState<string | null>(null); // eventId of message with open menu
  const [contextMenu, setContextMenu] = useState<{ eventId: string; x: number; y: number } | null>(null); // Context menu position
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null); // eventId of message being edited
  const [editingText, setEditingText] = useState<string>(''); // Text being edited
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  
  // Group editing state
  const [showEditGroup, setShowEditGroup] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDescription, setEditGroupDescription] = useState('');
  const [editGroupIcon, setEditGroupIcon] = useState<string | null>(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteResults, setInviteResults] = useState<Array<{id: string; firstName: string; lastName: string; avatarUrl?: string; matrixUserId?: string}>>([]);
  const [selectedInvites, setSelectedInvites] = useState<string[]>([]);
  const [groupParticipants, setGroupParticipants] = useState<Array<{id: string; firstName: string; lastName: string; avatarUrl?: string; role: string}>>([]);
  
  // Chat tabs state (for PPO Head)
  const [chatTab, setChatTab] = useState<'work' | 'personal'>('work');
  
  // Ticket close state
  const [showCloseTicket, setShowCloseTicket] = useState(false);
  const [ticketRating, setTicketRating] = useState(5);
  const [ticketComment, setTicketComment] = useState('');
  const [closingTicket, setClosingTicket] = useState(false);
  
  // Clear chat modal state
  const [showClearChatModal, setShowClearChatModal] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  
  // Image preview modal state
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // Computed isPPOHead based on viewMode
  const isPPOHead = viewMode === 'PPO_HEAD' || viewMode === 'EMPLOYEE';

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const syncTokenRef = useRef<string | null>(null);
  const syncAbortRef = useRef<AbortController | null>(null);

  // Close context menu on outside click or escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-message-bubble]')) {
          setContextMenu(null);
        }
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      // Use setTimeout to avoid immediate closure
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
      }, 0);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [contextMenu]);

  // Auth with Matrix and load viewMode
  useEffect(() => {
    async function authenticate() {
      if (!session?.user) return;

      try {
        // Load user viewMode
        const userResp = await fetch('/api/profile');
        if (userResp.ok) {
          const userData = await userResp.json();
          setViewMode(userData.viewMode || 'MEMBER');
          // If in MEMBER mode, default to personal tab
          if (userData.viewMode === 'MEMBER' || !userData.viewMode) {
            setChatTab('personal');
          }
        }

        // Matrix auth удален - загружаем только комнаты из БД
        // Load room info from our DB
        await loadDbRoomInfo();
        
        // Устанавливаем фиктивные credentials для совместимости (будут удалены позже)
        setCredentials({
          userId: session.user.id,
          accessToken: '',
          serverUrl: ''
        });
      } catch {
        setError('Ошибка подключения');
      } finally {
        setLoading(false);
      }
    }
    authenticate();
  }, [session]);

  // Load room info from our database (proper names, avatars)
  const loadDbRoomInfo = useCallback(async () => {
    try {
      const resp = await fetch('/api/chat/rooms');
      if (resp.ok) {
        const data = await resp.json();
        const infoMap = new Map<string, DbRoomInfo>();
        for (const room of data.rooms || []) {
          if (room.matrixRoomId) {
            infoMap.set(room.matrixRoomId, room);
          }
        }
        setDbRoomInfo(infoMap);
      }
    } catch (err) {
      console.error('Failed to load room info from DB:', err);
    } finally {
      setDbRoomInfoLoaded(true);
    }
  }, []);

  // Load organization members for group creation (PPO Head/Employee only)
  const loadOrgMembers = useCallback(async () => {
    // Check viewMode directly since isPPOHead may not be updated yet
    if (viewMode !== 'PPO_HEAD' && viewMode !== 'EMPLOYEE') return;
    try {
      const resp = await fetch('/api/ppo-head/members?status=approved');
      if (resp.ok) {
        const data = await resp.json();
        setOrgMembers(data.members || []);
      }
    } catch (err) {
      console.error('Failed to load org members:', err);
    }
  }, [viewMode]);

  // Create group chat (PPO Head only)
  const handleCreateGroup = useCallback(async () => {
    if (!credentials || !groupName.trim() || selectedMembers.length === 0) return;
    
    setCreatingGroup(true);
    try {
      // Create group via our API (which creates in DB and Matrix)
      const resp = await fetch('/api/ppo-head/chats/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName.trim(),
          description: groupDescription.trim() || null,
          participantIds: selectedMembers
        })
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Ошибка создания группы');
      }

      const data = await resp.json();
      
      // Refresh rooms
      await loadDbRoomInfo();
      
      // Reset form
      setShowCreateGroup(false);
      setGroupName('');
      setGroupDescription('');
      setSelectedMembers([]);
      
      // Select new room if it has matrixRoomId
      if (data.chat?.matrixRoomId) {
        setSelectedRoomId(data.chat.matrixRoomId);
      }
    } catch (err) {
      console.error('Failed to create group:', err);
      setError(err instanceof Error ? err.message : 'Ошибка создания группы');
    } finally {
      setCreatingGroup(false);
    }
  }, [credentials, groupName, groupDescription, selectedMembers, loadDbRoomInfo]);

  // Load org members when showing create group modal
  useEffect(() => {
    if (showCreateGroup && (viewMode === 'PPO_HEAD' || viewMode === 'EMPLOYEE')) {
      loadOrgMembers();
    }
  }, [showCreateGroup, viewMode, loadOrgMembers]);

  // Ensure user has a DM chat with AI bot
  const ensureBotChat = useCallback(async (creds: MatrixCredentials) => {
    const BOT_USER_ID = '@myunion_bot:matrix.myunion.pro';
    
    try {
      // Check if DM with bot exists by looking at account data
      const accountDataResp = await fetch(
        `${creds.serverUrl}/_matrix/client/v3/user/${encodeURIComponent(creds.userId)}/account_data/m.direct`,
        { headers: { 'Authorization': `Bearer ${creds.accessToken}` } }
      );
      
      let hasBotRoom = false;
      if (accountDataResp.ok) {
        const directRooms = await accountDataResp.json();
        hasBotRoom = directRooms[BOT_USER_ID]?.length > 0;
      }
      
      if (!hasBotRoom) {
        // Create DM room with bot
        const createResp = await fetch(
          `${creds.serverUrl}/_matrix/client/v3/createRoom`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${creds.accessToken}`
            },
            body: JSON.stringify({
              preset: 'trusted_private_chat',
              is_direct: true,
              invite: [BOT_USER_ID],
              initial_state: [{
                type: 'm.room.name',
                content: { name: 'МойСоюз Помощник' }
              }]
            })
          }
        );
        
        if (createResp.ok) {
          const room = await createResp.json();
          
          // Update m.direct account data
          const newDirectRooms = { [BOT_USER_ID]: [room.room_id] };
          await fetch(
            `${creds.serverUrl}/_matrix/client/v3/user/${encodeURIComponent(creds.userId)}/account_data/m.direct`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${creds.accessToken}`
              },
              body: JSON.stringify(newDirectRooms)
            }
          );
          
          console.log('Created bot chat room:', room.room_id);
        }
      }
    } catch (err) {
      console.error('Failed to ensure bot chat:', err);
    }
  }, []);

  // Matrix API helpers
  const matrixFetch = useCallback(async (
    endpoint: string, 
    options: RequestInit = {}
  ) => {
    if (!credentials) return null;
    
    const url = `${credentials.serverUrl}/_matrix/client/v3${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credentials.accessToken}`,
        ...options.headers,
      },
    });
    
    if (!response.ok) return null;
    return response.json();
  }, [credentials]);

  // Matrix sync УДАЛЕН - используем только API /api/chat/rooms
  const sync = useCallback(async (initialSync = false) => {
    // Matrix больше не используется - загружаем комнаты через API
    try {
      const response = await fetch('/api/chat/rooms');
      if (!response.ok) return;
      const data = await response.json();
      if (!data.rooms) return;
      
      setConnected(true);

      // Process rooms
      const joinedRooms = data.rooms?.join || {};
      const roomList: MatrixRoom[] = [];

      for (const [roomId, roomData] of Object.entries(joinedRooms)) {
        interface MemberContent { 
          displayname?: string; 
          avatar_url?: string; 
          is_direct?: boolean;
          membership?: string;
        }
        interface StateEvent { 
          type: string; 
          state_key?: string;
          sender?: string;
          content: { name?: string } & MemberContent;
        }
        
        const rd = roomData as {
          state?: { events?: StateEvent[] };
          timeline?: { events?: Array<{ type: string; content: { body?: string }; origin_server_ts?: number }> };
          unread_notifications?: { notification_count?: number };
          ephemeral?: { events?: Array<{ type: string; content: { user_ids?: string[] } }> };
        };
        
        const stateEvents = rd.state?.events || [];
        const nameEvent = stateEvents.find(e => e.type === 'm.room.name');
        
        // Get all member events
        const allMemberEvents = stateEvents.filter(e => e.type === 'm.room.member');
        
        // Count joined/invited members
        const activeMembers = allMemberEvents.filter(e => 
          e.content?.membership === 'join' || e.content?.membership === 'invite'
        );
        
        // Check if this is a bot room
        const isBotRoom = allMemberEvents.some(
          e => e.state_key?.includes('myunion_bot')
        );
        
        // Find other members (not the current user)
        const otherMembers = allMemberEvents.filter(
          e => e.state_key !== credentials.userId && 
               (e.content?.membership === 'join' || e.content?.membership === 'invite')
        );
        
        // Check if we have DB info for this room (preferred source)
        const dbInfo = dbRoomInfo.get(roomId);
        
        // Determine if this is a direct chat
        const isDirect = dbInfo?.isDirect ?? (activeMembers.length <= 2 && !nameEvent?.content?.name);
        
        // Get room name - priority: DB info > explicit name > member name > fallback
        let roomName = dbInfo?.displayName || nameEvent?.content?.name;
        let roomAvatar: string | undefined = dbInfo?.avatarUrl;
        
        // For rooms without name from DB, try to determine from Matrix data
        if (!roomName && otherMembers.length > 0) {
          const otherMember = otherMembers[0];
          
          // Check if it's the bot
          if (otherMember.state_key?.includes('myunion_bot') || otherMember.state_key?.includes('ai_assistant')) {
            roomName = 'МойСоюз Помощник';
          } else {
            // Get display name from member event
            roomName = otherMember.content?.displayname;
            if (!roomAvatar) roomAvatar = otherMember.content?.avatar_url;
            
            // If no display name, try to create readable name from Matrix ID
            if (!roomName && otherMember.state_key) {
              const username = otherMember.state_key.split(':')[0].replace('@', '');
              if (username.startsWith('myunion_')) {
                roomName = 'Пользователь';
              } else {
                roomName = username.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              }
            }
          }
        }
        
        // Fallback names based on room type
        if (!roomName) {
          if (isBotRoom) {
            roomName = 'МойСоюз Помощник';
            roomAvatar = '/icon.png';
          } else if (activeMembers.length === 1) {
            roomName = 'Новый чат';
          } else if (isDirect) {
            roomName = 'Личный чат';
          } else {
            roomName = 'Групповой чат';
          }
        }
        
        // Always set bot avatar if it's a bot room
        if (isBotRoom && !roomAvatar) {
          roomAvatar = '/icon.png';
        }
        
        const timelineEvents = rd.timeline?.events || [];
        const lastMsg = [...timelineEvents].reverse().find(e => e.type === 'm.room.message');

        // ONLY add rooms that exist in our database
        if (dbInfo) {
          const displayName = dbInfo.displayName || roomName || 'Чат';
          // Use isTicket from API, fallback to name check for backwards compatibility
          const isTicketChat = dbInfo.isTicket || displayName.startsWith('Обращение #');
          
          roomList.push({
            roomId,
            name: displayName,
            avatarUrl: dbInfo.avatarUrl || roomAvatar,
            lastMessage: lastMsg?.content?.body,
            lastMessageTime: lastMsg?.origin_server_ts,
            unreadCount: rd.unread_notifications?.notification_count || 0,
            isDirect: dbInfo.isDirect,
            isTicket: isTicketChat, // Обращения всегда в Рабочих
            ticketId: dbInfo.ticketId,
            ticketResolved: dbInfo.ticketResolved,
            ticketStatus: dbInfo.ticketStatus,
            isTicketCreator: dbInfo.isTicketCreator,
          });
        }

        // Handle typing indicators
        const typingEvent = rd.ephemeral?.events?.find(e => e.type === 'm.typing');
        if (typingEvent && roomId === selectedRoomId) {
          const typingUserIds = typingEvent.content?.user_ids || [];
          setTypingUsers(
            typingUserIds
              .filter(id => id !== credentials.userId)
              .map(id => ({ userId: id, name: id.split(':')[0].replace('@', '') }))
          );
        }

        // Update messages for selected room
        if (roomId === selectedRoomId && !initialSync) {
          type TimelineEvent = { type: string; event_id: string; sender: string; content: { body?: string; msgtype?: string; url?: string; info?: any; 'm.relates_to'?: any; 'm.new_content'?: any }; origin_server_ts: number };
          
          // First, handle edit events - update existing messages
          const editEvents = (timelineEvents as TimelineEvent[])
            .filter(e => e.type === 'm.room.message' && e.content?.['m.relates_to']?.rel_type === 'm.replace');
          
          if (editEvents.length > 0) {
            setMessages(prev => {
              const updated = [...prev];
              editEvents.forEach(editEvent => {
                const originalEventId = editEvent.content?.['m.relates_to']?.event_id;
                const newContent = editEvent.content?.['m.new_content']?.body || editEvent.content?.body?.replace(/^\* /, '') || '';
                const index = updated.findIndex(m => m.eventId === originalEventId);
                if (index !== -1) {
                  updated[index] = {
                    ...updated[index],
                    content: newContent,
                    isEdited: true,
                    editTimestamp: editEvent.origin_server_ts
                  };
                }
              });
              return updated;
            });
          }
          
          // Then, handle regular messages (excluding edit events)
          const newMsgs: MatrixMessage[] = (timelineEvents as TimelineEvent[])
            .filter(e => e.type === 'm.room.message' && e.content?.['m.relates_to']?.rel_type !== 'm.replace')
            .map(e => {
              const msgtype = (e.content?.msgtype || 'm.text') as MatrixMessage['msgtype'];
              let attachment: MessageAttachment | undefined;
              
              // Helper to convert mxc:// to https:// using our proxy for auth
              const mxcToHttp = (mxcUrl: string, thumbnail = false) => {
                if (!mxcUrl?.startsWith('mxc://')) return mxcUrl;
                const parts = mxcUrl.replace('mxc://', '').split('/');
                const server = parts[0];
                const mediaId = parts.slice(1).join('/');
                // Use our proxy to add auth header
                if (thumbnail) {
                  return `/api/matrix-media/${server}/${mediaId}?width=400&height=400&method=scale`;
                }
                return `/api/matrix-media/${server}/${mediaId}`;
              };
              
              // Handle attachments
              if (msgtype === 'm.image' && e.content?.url) {
                attachment = {
                  type: 'image',
                  url: mxcToHttp(e.content.url),
                  thumbnailUrl: e.content.info?.thumbnail_url ? mxcToHttp(e.content.info.thumbnail_url, true) : mxcToHttp(e.content.url, true),
                  name: e.content.body || 'image',
                  mimeType: e.content.info?.mimetype,
                  width: e.content.info?.w,
                  height: e.content.info?.h,
                  size: e.content.info?.size
                };
              } else if (msgtype === 'm.file' && e.content?.url) {
                attachment = {
                  type: 'file',
                  url: mxcToHttp(e.content.url),
                  name: e.content.body || 'file',
                  mimeType: e.content.info?.mimetype,
                  size: e.content.info?.size
                };
              } else if (msgtype === 'm.video' && e.content?.url) {
                attachment = {
                  type: 'video',
                  url: mxcToHttp(e.content.url),
                  thumbnailUrl: e.content.info?.thumbnail_url ? mxcToHttp(e.content.info.thumbnail_url, true) : undefined,
                  name: e.content.body || 'video',
                  mimeType: e.content.info?.mimetype,
                  size: e.content.info?.size
                };
              } else if (msgtype === 'm.audio' && e.content?.url) {
                attachment = {
                  type: 'audio',
                  url: mxcToHttp(e.content.url),
                  name: e.content.body || 'audio',
                  mimeType: e.content.info?.mimetype,
                  size: e.content.info?.size
                };
              }
              
              // Get sender name from our DB data
              let senderName = 'Пользователь';
              let senderAvatar: string | undefined;
              
              if (e.sender.includes('myunion_bot') || e.sender.includes('ai_assistant')) {
                senderName = 'МойСоюз Помощник';
              } else if (dbInfo?.participants) {
                // Find sender in our DB participants
                const participant = dbInfo.participants.find(p => p.matrixUserId === e.sender);
                if (participant) {
                  senderName = [participant.firstName, participant.lastName].filter(Boolean).join(' ') || 'Пользователь';
                  senderAvatar = participant.avatarUrl || undefined;
                }
              }
              
              // Fallback to Matrix display name
              if (senderName === 'Пользователь') {
                const memberEvent = allMemberEvents.find(m => m.state_key === e.sender);
                if (memberEvent?.content?.displayname) {
                  senderName = memberEvent.content.displayname;
                }
              }
              
      // Check if this is an edited message
      const isEdited = e.content?.['m.relates_to']?.rel_type === 'm.replace';
      const actualContent = isEdited 
        ? (e.content?.['m.new_content']?.body || e.content?.body?.replace(/^\* /, '') || '')
        : (e.content?.body || '');
      
      return {
        eventId: isEdited ? e.content?.['m.relates_to']?.event_id || e.event_id : e.event_id,
        sender: e.sender,
        senderName,
        senderAvatar,
        content: actualContent,
        timestamp: e.origin_server_ts,
        isOwn: e.sender === credentials.userId,
        msgtype,
        attachment,
        isEdited: isEdited || undefined,
        editTimestamp: isEdited ? e.origin_server_ts : undefined
      };
            });

          if (newMsgs.length > 0) {
            setMessages(prev => {
              const existing = new Set(prev.map(m => m.eventId));
              const unique = newMsgs.filter(m => !existing.has(m.eventId));
              return [...prev, ...unique].sort((a, b) => a.timestamp - b.timestamp);
            });
            scrollToBottom();
          }
        }
      }

      if (initialSync || roomList.length > 0) {
        const filteredRoomList = roomList.filter(r => dbRoomInfo.has(r.roomId));
        if (filteredRoomList.length !== roomList.length) {
          console.log('[MatrixChat] Filtered rooms not in DB:', roomList.length - filteredRoomList.length);
        }
        setRooms(prev => {
          const updated = new Map(prev.map(r => [r.roomId, r]));
          filteredRoomList.forEach(r => updated.set(r.roomId, r));
          
          // Добавляем чат с ИИ из dbRoomInfo если его нет в Matrix rooms
          dbRoomInfo.forEach((info, matrixRoomId) => {
            const isBotChat = info.displayName?.includes('Помощник') || 
                             info.displayName?.includes('AI') || 
                             info.displayName?.includes('Бот') ||
                             info.participants?.some(p => p.matrixUserId?.includes('myunion_bot') || p.matrixUserId?.includes('ai_assistant'));
            
            if (isBotChat && !updated.has(matrixRoomId)) {
              // Создаем чат с ИИ если его нет в Matrix rooms
              updated.set(matrixRoomId, {
                roomId: matrixRoomId,
                name: info.displayName || 'МойСоюз Помощник',
                avatarUrl: info.avatarUrl || '/icon.png',
                lastMessage: undefined,
                lastMessageTime: 0,
                unreadCount: 0,
                isDirect: true,
              });
            }
          });
          
          const allRooms = Array.from(updated.values());
          
          // Сортируем: чат с ИИ первый, затем по времени последнего сообщения
          const sorted = allRooms.sort((a, b) => {
            const aIsBot = a.name?.includes('Помощник') || a.name?.includes('AI') || a.name?.includes('Бот');
            const bIsBot = b.name?.includes('Помощник') || b.name?.includes('AI') || b.name?.includes('Бот');
            
            if (aIsBot && !bIsBot) return -1;
            if (!aIsBot && bIsBot) return 1;
            
            return (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
          });
          
          // Calculate total unread count and notify sidebar
          const totalUnread = sorted.reduce((sum, r) => sum + r.unreadCount, 0);
          console.log('[MatrixChat] Total unread count after sync:', totalUnread, 'from', sorted.length, 'rooms');
          setTimeout(() => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('chat-unread-updated', { 
                detail: { count: totalUnread } 
              }));
            }
          }, 0);
          
          return sorted;
        });
        
        // For rooms with generic names, fetch member info asynchronously
        if (initialSync) {
          filteredRoomList.forEach(async (room) => {
            if (room.name === 'Чат' || room.name === 'Групповой чат' || room.name === 'Личный чат' || !room.avatarUrl) {
              try {
                const membersData = await matrixFetch(`/rooms/${encodeURIComponent(room.roomId)}/members`);
                if (!membersData?.chunk) return;
                
                const members = membersData.chunk.filter((m: any) => 
                  m.content?.membership === 'join' || m.content?.membership === 'invite'
                );
                
                const otherMember = members.find((m: any) => m.state_key !== credentials.userId);
                const isBotRoom = members.some((m: any) => m.state_key?.includes('myunion_bot'));
                
                let name = room.name;
                let avatar = room.avatarUrl;
                
                if (isBotRoom) {
                  name = 'МойСоюз Помощник';
                  avatar = '/icon.png';
                } else if (otherMember) {
                  name = otherMember.content?.displayname || '';
                  avatar = otherMember.content?.avatar_url || '';
                  
                  if (!name && otherMember.state_key) {
                    const username = otherMember.state_key.split(':')[0].replace('@', '');
                    if (username.startsWith('myunion_')) {
                      name = 'Пользователь';
                    } else {
                      name = username.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    }
                  }
                }
                
                if (name && name !== room.name) {
                  setRooms(prev => prev.map(r => 
                    r.roomId === room.roomId 
                      ? { ...r, name: name || r.name, avatarUrl: avatar || r.avatarUrl, isDirect: members.length <= 2 }
                      : r
                  ));
                }
              } catch (err) {
                console.error('Failed to fetch room members for', room.roomId, err);
              }
            }
          });
        }
      }

    } catch (err: unknown) {
      console.error('Error loading rooms:', err);
      setConnected(false);
    }
  }, [dbRoomInfo]);

  // Matrix sync удален - используем WebSocket и API
  // Сообщения загружаются через loadRoomMessages при выборе комнаты
  // Новые сообщения приходят через WebSocket (если подключен)

  // Load room messages from our API (NOT Matrix)
  const loadRoomMessages = useCallback(async (roomIdOrChatId: string) => {
    // Получаем chatId из matrixRoomId или используем напрямую
    const dbInfo = Array.from(dbRoomInfo.values()).find(info => 
      info.matrixRoomId === roomIdOrChatId || 
      info.chatId === roomIdOrChatId ||
      info.chatId === roomIdOrChatId
    );
    const actualChatId = dbInfo?.chatId || roomIdOrChatId;
    
    try {
      const response = await fetch(`/api/chat/${actualChatId}/messages?limit=50`);
      if (!response.ok) {
        console.error('[Chat] Failed to load messages:', response.status);
        return [];
      }
      const data = await response.json();
      if (!data.messages || !Array.isArray(data.messages)) return [];
      
      // Преобразуем сообщения из API в формат MatrixMessage для совместимости
      const msgs: MatrixMessage[] = data.messages.map((msg: any) => {
        const senderName = msg.sender 
          ? [msg.sender.firstName, msg.sender.lastName].filter(Boolean).join(' ') || 'Пользователь'
          : 'Пользователь';
        
        const isBot = msg.sender?.firstName === 'AI' || msg.sender?.lastName === 'Помощник';
        
        return {
          eventId: msg.id,
          sender: msg.senderId,
          senderName: isBot ? 'МойСоюз Помощник' : senderName,
          senderAvatar: msg.sender?.avatarUrl,
          content: msg.content,
          timestamp: new Date(msg.createdAt).getTime(),
          isOwn: msg.senderId === session?.user?.id,
          msgtype: msg.messageType === 'image' ? 'm.image' : msg.messageType === 'file' ? 'm.file' : 'm.text',
          reactions: msg.reactions ? Object.entries(msg.reactions).map(([emoji, data]: [string, any]) => ({
            key: emoji,
            count: data.count || 0,
            users: data.userIds || [],
            eventIds: new Map()
          })) : undefined,
          replyTo: msg.replyTo ? {
            eventId: msg.replyTo.id,
            sender: msg.replyTo.senderId,
            senderName: [msg.replyTo.sender?.firstName, msg.replyTo.sender?.lastName].filter(Boolean).join(' ') || 'Пользователь',
            content: msg.replyTo.content
          } : undefined,
          attachment: msg.attachments && msg.attachments.length > 0 ? {
            type: msg.attachments[0].type,
            url: msg.attachments[0].url,
            thumbnailUrl: msg.attachments[0].thumbnailUrl,
            name: msg.attachments[0].name,
            mimeType: msg.attachments[0].mimeType,
            size: msg.attachments[0].size,
            width: msg.attachments[0].width,
            height: msg.attachments[0].height
          } : undefined,
          isEdited: !!msg.editedAt,
          editTimestamp: msg.editedAt ? new Date(msg.editedAt).getTime() : undefined
        };
      });
      
      setMessages(msgs);
      scrollToBottom();
      return msgs;
    } catch (error) {
      console.error('[Chat] Error loading messages:', error);
      return [];
    }
  }, [dbRoomInfo, session?.user?.id]);

    // First pass: collect all messages
    const messageEvents = (data.chunk || []).filter((e: { type: string }) => e.type === 'm.room.message');
    
    // Second pass: collect reactions
    const reactionEvents = (data.chunk || []).filter((e: { type: string }) => e.type === 'm.reaction');
    const reactionsMap = new Map<string, MessageReaction[]>();
    
    for (const event of reactionEvents) {
      const relatesTo = event.content?.['m.relates_to'];
      if (relatesTo?.rel_type === 'm.annotation') {
        const targetId = relatesTo.event_id;
        const key = relatesTo.key;
        
        if (!reactionsMap.has(targetId)) {
          reactionsMap.set(targetId, []);
        }
        
        const reactions = reactionsMap.get(targetId)!;
        const existing = reactions.find(r => r.key === key);
        if (existing) {
          if (!existing.users.includes(event.sender)) {
            existing.count++;
            existing.users.push(event.sender);
            if (!existing.eventIds) existing.eventIds = new Map();
            existing.eventIds.set(event.sender, event.event_id);
          }
        } else {
          const eventIds = new Map<string, string>();
          eventIds.set(event.sender, event.event_id);
          reactions.push({ key, count: 1, users: [event.sender], eventIds });
        }
      }
    }

    // Build messages map for replies
    const messagesById = new Map<string, { sender: string; content: string }>();
    for (const e of messageEvents) {
      messagesById.set(e.event_id, {
        sender: e.sender,
        content: e.content?.body || ''
      });
    }

    // First, collect all edit events and create a map of original event_id -> new content
    const editMap = new Map<string, { content: string; timestamp: number }>();
    messageEvents.forEach((e: any) => {
      if (e.content?.['m.relates_to']?.rel_type === 'm.replace') {
        const originalEventId = e.content['m.relates_to'].event_id;
        const newContent = e.content?.['m.new_content']?.body || e.content?.body?.replace(/^\* /, '') || '';
        editMap.set(originalEventId, {
          content: newContent,
          timestamp: e.origin_server_ts
        });
      }
    });
    
    const msgs: MatrixMessage[] = messageEvents
      .filter((e: any) => e.content?.['m.relates_to']?.rel_type !== 'm.replace') // Exclude edit events themselves
      .map((e: any) => {
      const msgtype = e.content?.msgtype || 'm.text';
      let attachment: MessageAttachment | undefined;
      
      // Check if this message was edited
      const editInfo = editMap.get(e.event_id);
      const isEdited = !!editInfo;
      
      // Helper to convert mxc:// to https:// using our proxy for auth
      const mxcToHttp = (mxcUrl: string, thumbnail = false) => {
        if (!mxcUrl?.startsWith('mxc://')) return mxcUrl;
        const parts = mxcUrl.replace('mxc://', '').split('/');
        const server = parts[0];
        const mediaId = parts.slice(1).join('/');
        // Use our proxy to add auth header
        if (thumbnail) {
          return `/api/matrix-media/${server}/${mediaId}?width=400&height=400&method=scale`;
        }
        return `/api/matrix-media/${server}/${mediaId}`;
      };
      
      // Handle attachments
      if (msgtype === 'm.image' && e.content?.url) {
        attachment = {
          type: 'image',
          url: mxcToHttp(e.content.url),
          thumbnailUrl: e.content.info?.thumbnail_url ? mxcToHttp(e.content.info.thumbnail_url, true) : mxcToHttp(e.content.url, true),
          name: e.content.body || 'image',
          mimeType: e.content.info?.mimetype,
          width: e.content.info?.w,
          height: e.content.info?.h,
          size: e.content.info?.size
        };
      } else if (msgtype === 'm.file' && e.content?.url) {
        attachment = {
          type: 'file',
          url: mxcToHttp(e.content.url),
          name: e.content.body || 'file',
          mimeType: e.content.info?.mimetype,
          size: e.content.info?.size
        };
      } else if (msgtype === 'm.video' && e.content?.url) {
        attachment = {
          type: 'video',
          url: mxcToHttp(e.content.url),
          thumbnailUrl: e.content.info?.thumbnail_url ? mxcToHttp(e.content.info.thumbnail_url, true) : undefined,
          name: e.content.body || 'video',
          mimeType: e.content.info?.mimetype,
          width: e.content.info?.w,
          height: e.content.info?.h,
          size: e.content.info?.size
        };
      } else if (msgtype === 'm.audio' && e.content?.url) {
        attachment = {
          type: 'audio',
          url: mxcToHttp(e.content.url),
          name: e.content.body || 'audio',
          mimeType: e.content.info?.mimetype,
          size: e.content.info?.size
        };
      }
      
      // Extract content, removing reply fallback format if present
      let content = editInfo?.content || e.content?.body || '';
      // Remove Matrix reply fallback format: "> <@user:server> text...\n\nactual message"
      if (content.includes('\n\n') && content.startsWith('> ')) {
        const parts = content.split('\n\n');
        if (parts.length > 1) {
          // The actual message is after the double newline
          content = parts.slice(1).join('\n\n');
        }
      }
      
      // Handle reply
      let replyTo: ReplyInfo | undefined;
      const relatesTo = e.content?.['m.relates_to'];
      if (relatesTo?.['m.in_reply_to']?.event_id) {
        const replyEventId = relatesTo['m.in_reply_to'].event_id;
        const replyMsg = messagesById.get(replyEventId);
        if (replyMsg) {
          // Get proper sender name for reply
          let replySenderName = replyMsg.sender.split(':')[0].replace('@', '').replace(/_/g, ' ');
          const roomDbInfo = dbRoomInfo.get(roomId);
          if (roomDbInfo?.participants) {
            const replyParticipant = roomDbInfo.participants.find(p => p.matrixUserId === replyMsg.sender);
            if (replyParticipant) {
              replySenderName = [replyParticipant.firstName, replyParticipant.lastName].filter(Boolean).join(' ') || replySenderName;
            }
          }
          
          replyTo = {
            eventId: replyEventId,
            sender: replyMsg.sender,
            senderName: replySenderName,
            content: replyMsg.content.slice(0, 100)
          };
        }
      }
      
      // Get sender name from our DB data
      let senderName = 'Пользователь';
      let senderAvatar: string | undefined;
      
      const roomDbInfo = dbRoomInfo.get(roomId);
      
      if (e.sender.includes('myunion_bot') || e.sender.includes('ai_assistant')) {
        senderName = 'МойСоюз Помощник';
      } else if (roomDbInfo?.participants) {
        const participant = roomDbInfo.participants.find(p => p.matrixUserId === e.sender);
        if (participant) {
          senderName = [participant.firstName, participant.lastName].filter(Boolean).join(' ') || 'Пользователь';
          senderAvatar = participant.avatarUrl || undefined;
        }
      }
      
      return {
        eventId: e.event_id,
        sender: e.sender,
        senderName,
        senderAvatar,
        content,
        timestamp: e.origin_server_ts,
        isOwn: e.sender === credentials?.userId,
        msgtype: msgtype as MatrixMessage['msgtype'],
        reactions: reactionsMap.get(e.event_id),
        replyTo,
        attachment,
        isEdited: isEdited || undefined,
        editTimestamp: editInfo?.timestamp
      };
    }).reverse();

    setMessages(msgs);
    scrollToBottom();
    return msgs;
  }, [credentials, matrixFetch, dbRoomInfo]);

  // Select room
  // Fetch room members to get proper names
  const fetchRoomMembers = useCallback(async (roomId: string) => {
    if (!credentials) return null;
    
    try {
      const data = await matrixFetch(`/rooms/${encodeURIComponent(roomId)}/members`);
      if (!data?.chunk) return null;
      
      const members = data.chunk.filter((m: any) => 
        m.content?.membership === 'join' || m.content?.membership === 'invite'
      );
      
      // Find other member (not current user)
      const otherMember = members.find((m: any) => m.state_key !== credentials.userId);
      const isBotRoom = members.some((m: any) => m.state_key?.includes('myunion_bot'));
      
      let name = '';
      let avatar = '';
      
      if (isBotRoom) {
        name = 'МойСоюз Помощник';
        avatar = '/icon.png';
      } else if (otherMember) {
        name = otherMember.content?.displayname || '';
        avatar = otherMember.content?.avatar_url || '';
        
        if (!name && otherMember.state_key) {
          const username = otherMember.state_key.split(':')[0].replace('@', '');
          if (username.startsWith('myunion_')) {
            name = 'Пользователь';
          } else {
            name = username.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          }
        }
      }
      
      return {
        name: name || 'Личный чат',
        avatarUrl: avatar,
        isDirect: members.length <= 2,
        memberCount: members.length
      };
    } catch (err) {
      console.error('Failed to fetch room members:', err);
      return null;
    }
  }, [credentials, matrixFetch]);

  // markRoomAsRead удален - отметка прочитано делается через API в handleSelectRoom

  // Select room - must be declared before useEffect that uses it
  const handleSelectRoom = useCallback(async (roomId: string) => {
    setSelectedRoomId(roomId);
    setMessages([]);
    setTypingUsers([]);
    
    // Clear unread count immediately for better UX
    setRooms(prev => {
      const updated = prev.map(r => 
        r.roomId === roomId ? { ...r, unreadCount: 0 } : r
      );
      
      // Calculate new total and notify sidebar (use setTimeout to avoid setState during render)
      const totalUnread = updated.reduce((sum, r) => sum + r.unreadCount, 0);
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('chat-messages-read', { 
            detail: { count: totalUnread } 
          }));
        }
      }, 0);
      
      return updated;
    });
    
    // Load messages
    const msgs = await loadRoomMessages(roomId);
    
    // Mark the last message as read
    if (msgs && msgs.length > 0) {
      const lastEventId = msgs[msgs.length - 1].eventId;
      markRoomAsRead(roomId, lastEventId);
    }
    
    // Fetch room members to update room info
    const memberInfo = await fetchRoomMembers(roomId);
    if (memberInfo) {
      setRooms(prev => prev.map(r => {
        if (r.roomId === roomId && (!r.name || r.name === 'Чат' || r.name === 'Групповой чат' || r.name === 'Личный чат')) {
          return {
            ...r,
            name: memberInfo.name,
            avatarUrl: memberInfo.avatarUrl || r.avatarUrl,
            isDirect: memberInfo.isDirect
          };
        }
        return r;
      }));
    }
  }, [loadRoomMessages, markRoomAsRead, fetchRoomMembers]);

  // Handle chatId from URL (e.g., from appeals page or notifications)
  // Note: This useEffect is placed after handleSelectRoom declaration to avoid hoisting issues
  useEffect(() => {
    if (!urlChatId || urlChatHandled) return;
    
    // Wait for rooms and dbRoomInfo to be loaded, with retry logic
    if (rooms.length === 0 || !dbRoomInfoLoaded) {
      // Retry after a short delay if rooms are not loaded yet
      const retryTimer = setTimeout(() => {
        if (rooms.length === 0 || !dbRoomInfoLoaded) {
          console.log('[MatrixChat] Waiting for rooms/dbRoomInfo to load before opening chat from URL...');
        }
      }, 1000);
      return () => clearTimeout(retryTimer);
    }
    
    async function openChatFromUrl() {
      try {
        console.log('[MatrixChat] Opening chat from URL, chatId:', urlChatId);
        // Find chat by ID and get its matrixRoomId
        const response = await fetch(`/api/chat/${urlChatId}`);
        if (response.ok) {
          const data = await response.json();
          console.log('[MatrixChat] Chat data from API:', { 
            chatId: data.chat?.id, 
            matrixRoomId: data.chat?.matrixRoomId,
            hasMessages: data.messages?.length > 0 
          });
          
          if (data.chat?.matrixRoomId) {
            // Find the room in our loaded rooms
            const room = rooms.find(r => r.roomId === data.chat.matrixRoomId);
            if (room) {
              console.log('[MatrixChat] Found room, opening chat:', data.chat.matrixRoomId);
              // If this is a ticket chat, switch to work tab
              const roomInfo = dbRoomInfo.get(data.chat.matrixRoomId);
              if (roomInfo?.isTicket || room.isTicket) {
                setChatTab('work');
              }
              // Close mobile menu to show chat
              setIsMobileMenuOpen(false);
              // Use handleSelectRoom to properly load messages and update UI
              await handleSelectRoom(data.chat.matrixRoomId);
              setUrlChatHandled(true);
            } else {
              console.log('[MatrixChat] Room not found in loaded rooms, matrixRoomId:', data.chat.matrixRoomId);
              console.log('[MatrixChat] Available rooms:', rooms.map(r => r.roomId).slice(0, 5));
              // Try to wait a bit more and retry
              setTimeout(async () => {
                const retryRoom = rooms.find(r => r.roomId === data.chat.matrixRoomId);
                if (retryRoom) {
                  console.log('[MatrixChat] Found room on retry, opening chat');
                  setIsMobileMenuOpen(false);
                  // Use handleSelectRoom to properly load messages and update UI
                  await handleSelectRoom(data.chat.matrixRoomId);
                  setUrlChatHandled(true);
                } else {
                  console.error('[MatrixChat] Room still not found after retry');
                  setUrlChatHandled(true); // Mark as handled to prevent infinite retries
                }
              }, 2000);
            }
          } else {
            console.error('[MatrixChat] Chat has no matrixRoomId:', data.chat);
            setUrlChatHandled(true);
          }
        } else {
          const errorText = await response.text();
          console.error('[MatrixChat] Failed to fetch chat:', response.status, errorText);
          setUrlChatHandled(true);
        }
      } catch (err) {
        console.error('[MatrixChat] Failed to open chat from URL:', err);
        setUrlChatHandled(true);
      }
    }
    
    openChatFromUrl();
  }, [urlChatId, urlChatHandled, rooms, dbRoomInfo, dbRoomInfoLoaded, handleSelectRoom]);

  // Send message (with reply support)
  const handleSend = async () => {
    if (!selectedRoomId || !newMessage.trim() || sending || !credentials) return;

    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');
    const currentReplyTo = replyTo;
    setReplyTo(null);
    
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = '48px';
    }

    try {
      const txnId = `m${Date.now()}`;
      
      // Build message content
      const messageContent: Record<string, unknown> = {
        msgtype: 'm.text',
        body: content
      };
      
      // Add reply reference if replying
      if (currentReplyTo) {
        messageContent['m.relates_to'] = {
          'm.in_reply_to': {
            event_id: currentReplyTo.eventId
          }
        };
        // Include fallback for clients that don't support rich replies
        messageContent.body = `> <${currentReplyTo.sender}> ${currentReplyTo.content.slice(0, 50)}...\n\n${content}`;
        messageContent['format'] = 'org.matrix.custom.html';
        messageContent['formatted_body'] = `<mx-reply><blockquote><a href="#">In reply to</a> <a href="#">${currentReplyTo.senderName}</a><br>${currentReplyTo.content.slice(0, 100)}</blockquote></mx-reply>${content}`;
      }
      
      const data = await matrixFetch(
        `/rooms/${encodeURIComponent(selectedRoomId)}/send/m.room.message/${txnId}`,
        {
          method: 'PUT',
          body: JSON.stringify(messageContent),
        }
      );

      if (data?.event_id) {
        setMessages(prev => [...prev, {
          eventId: data.event_id,
          sender: credentials.userId,
          senderName: session?.user?.name || 'Вы',
          content, // Already cleaned, no fallback format
          timestamp: Date.now(),
          isOwn: true,
          msgtype: 'm.text',
          replyTo: currentReplyTo ? {
            eventId: currentReplyTo.eventId,
            sender: currentReplyTo.sender,
            senderName: currentReplyTo.senderName,
            content: currentReplyTo.content
          } : undefined
        }]);
        scrollToBottom();
        
        // Send push notification to other participants
        // This will create UserNotification records for recipients
        console.log('[MatrixChat] 📤 Sending notification for message in room:', selectedRoomId);
        fetch('/api/chat/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: selectedRoomId, message: content }),
        })
        .then(res => {
          if (!res.ok) {
            console.error('[MatrixChat] ❌ Notification API error:', res.status, res.statusText);
            return res.json().catch(() => ({ error: 'Failed to parse response' }));
          }
          return res.json();
        })
        .then(data => {
          if (data.error) {
            console.error('[MatrixChat] ⚠️ Notification error:', data.error);
          } else {
            console.log('[MatrixChat] ✅ Notification sent successfully:', data);
          }
        })
        .catch((err) => {
          console.error('[MatrixChat] ❌ Error sending notification:', err);
        });
      }
    } catch (err) {
      console.error('Send error:', err);
      setNewMessage(content);
      setReplyTo(currentReplyTo);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // Send reaction
  const handleReaction = async (eventId: string, emoji: string) => {
    if (!selectedRoomId || !credentials) return;
    setShowReactions(null);
    
    // Check if user already reacted with this emoji
    const msg = messages.find(m => m.eventId === eventId);
    const existingReaction = msg?.reactions?.find(r => r.key === emoji);
    const userAlreadyReacted = existingReaction?.users.includes(credentials.userId);
    
    try {
      if (userAlreadyReacted && existingReaction?.eventIds?.get(credentials.userId)) {
        // Remove existing reaction via redaction
        const reactionEventId = existingReaction.eventIds.get(credentials.userId);
        await matrixFetch(
          `/rooms/${encodeURIComponent(selectedRoomId)}/redact/${encodeURIComponent(reactionEventId!)}/${Date.now()}`,
          { method: 'PUT', body: JSON.stringify({ reason: 'User toggled reaction' }) }
        );
        
        // Update UI - remove reaction
        setMessages(prev => prev.map(m => {
          if (m.eventId === eventId) {
            const reactions = (m.reactions || []).map(r => {
              if (r.key === emoji) {
                const newUsers = r.users.filter(u => u !== credentials.userId);
                const newEventIds = new Map(r.eventIds);
                newEventIds.delete(credentials.userId);
                return { ...r, users: newUsers, count: Math.max(0, r.count - 1), eventIds: newEventIds };
              }
              return r;
            }).filter(r => r.count > 0);
            return { ...m, reactions };
          }
          return m;
        }));
      } else {
        // Add new reaction
        const txnId = `r${Date.now()}`;
        const result = await matrixFetch(
          `/rooms/${encodeURIComponent(selectedRoomId)}/send/m.reaction/${txnId}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              'm.relates_to': {
                rel_type: 'm.annotation',
                event_id: eventId,
                key: emoji
              }
            }),
          }
        );
        
        // Optimistically update UI
        setMessages(prev => prev.map(m => {
          if (m.eventId === eventId) {
            const reactions = [...(m.reactions || [])];
            const existing = reactions.find(r => r.key === emoji);
            if (existing) {
              if (!existing.users.includes(credentials.userId)) {
                existing.count++;
                existing.users.push(credentials.userId);
                if (!existing.eventIds) existing.eventIds = new Map();
                existing.eventIds.set(credentials.userId, result?.event_id);
              }
            } else {
              const eventIds = new Map<string, string>();
              eventIds.set(credentials.userId, result?.event_id);
              reactions.push({ key: emoji, count: 1, users: [credentials.userId], eventIds });
            }
            return { ...m, reactions };
          }
          return m;
        }));
      }
    } catch (err) {
      console.error('Reaction error:', err);
    }
  };

  // Delete message (redact in Matrix)
  const handleDeleteMessage = async (eventId: string) => {
    if (!selectedRoomId || !credentials) return;
    setMessageMenu(null);
    
    if (!confirm('Удалить сообщение?')) return;
    
    try {
      const txnId = `redact_${Date.now()}`;
      await matrixFetch(
        `/rooms/${encodeURIComponent(selectedRoomId)}/redact/${encodeURIComponent(eventId)}/${txnId}`,
        { method: 'PUT', body: JSON.stringify({ reason: 'Deleted by sender' }) }
      );
      
      // Remove from UI
      setMessages(prev => prev.filter(m => m.eventId !== eventId));
    } catch (err) {
      console.error('Delete message error:', err);
      alert('Не удалось удалить сообщение');
    }
  };

  // Edit message
  const handleEditMessage = async (eventId: string, newContent: string) => {
    if (!selectedRoomId || !credentials || !newContent.trim()) return;
    
    try {
      const txnId = `edit_${Date.now()}`;
      
      // Matrix edit format: send new message with m.relates_to pointing to original
      const messageContent: Record<string, unknown> = {
        msgtype: 'm.text',
        body: `* ${newContent.trim()}`,
        'm.new_content': {
          msgtype: 'm.text',
          body: newContent.trim()
        },
        'm.relates_to': {
          rel_type: 'm.replace',
          event_id: eventId
        }
      };
      
      const data = await matrixFetch(
        `/rooms/${encodeURIComponent(selectedRoomId)}/send/m.room.message/${txnId}`,
        {
          method: 'PUT',
          body: JSON.stringify(messageContent),
        }
      );

      if (data?.event_id) {
        // Update message in UI
        setMessages(prev => prev.map(m => {
          if (m.eventId === eventId) {
            return {
              ...m,
              content: newContent.trim(),
              isEdited: true,
              editTimestamp: Date.now()
            };
          }
          return m;
        }));
        
        setEditingMessageId(null);
        setEditingText('');
      }
    } catch (err) {
      console.error('Edit message error:', err);
      alert('Не удалось отредактировать сообщение');
    }
  };

  // Upload and send file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedRoomId || !credentials) return;
    
    setUploading(true);
    
    try {
      // Upload file to Matrix media repo
      const uploadUrl = `${credentials.serverUrl}/_matrix/media/v3/upload?filename=${encodeURIComponent(file.name)}`;
      const uploadResp = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': file.type
        },
        body: file
      });
      
      if (!uploadResp.ok) throw new Error('Upload failed');
      
      const { content_uri } = await uploadResp.json();
      
      // Determine message type (support iPhone formats)
      let msgtype = 'm.file';
      const fileName = file.name.toLowerCase();
      const isHeic = fileName.endsWith('.heic') || fileName.endsWith('.heif');
      const isImage = file.type.startsWith('image/') || isHeic;
      const isVideo = file.type.startsWith('video/') || fileName.endsWith('.mov');
      
      if (isImage) msgtype = 'm.image';
      else if (isVideo) msgtype = 'm.video';
      else if (file.type.startsWith('audio/')) msgtype = 'm.audio';
      
      // Send message with attachment
      const txnId = `f${Date.now()}`;
      const messageContent: Record<string, unknown> = {
        msgtype,
        body: file.name,
        url: content_uri,
        info: {
          mimetype: file.type,
          size: file.size
        }
      };
      
      // For images, try to get dimensions
      if (msgtype === 'm.image') {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise(resolve => img.onload = resolve);
        (messageContent.info as Record<string, unknown>).w = img.width;
        (messageContent.info as Record<string, unknown>).h = img.height;
        URL.revokeObjectURL(img.src);
      }
      
      const data = await matrixFetch(
        `/rooms/${encodeURIComponent(selectedRoomId)}/send/m.room.message/${txnId}`,
        {
          method: 'PUT',
          body: JSON.stringify(messageContent),
        }
      );
      
      if (data?.event_id) {
        setMessages(prev => [...prev, {
          eventId: data.event_id,
          sender: credentials.userId,
          senderName: session?.user?.name || 'Вы',
          content: file.name,
          timestamp: Date.now(),
          isOwn: true,
          msgtype: msgtype as MatrixMessage['msgtype'],
          attachment: {
            type: msgtype.replace('m.', '') as MessageAttachment['type'],
            url: content_uri.replace('mxc://', `${credentials.serverUrl}/_matrix/media/v3/download/`),
            name: file.name,
            mimeType: file.type,
            size: file.size
          }
        }]);
        scrollToBottom();
      }
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Forward message to another room
  const handleForward = async (targetRoomId: string) => {
    if (!forwardMessage || !credentials) return;
    
    try {
      const txnId = `fw${Date.now()}`;
      const messageContent: Record<string, unknown> = {
        msgtype: forwardMessage.msgtype || 'm.text',
        body: forwardMessage.content
      };
      
      // If forwarding an attachment, include it
      if (forwardMessage.attachment) {
        messageContent.url = forwardMessage.attachment.url.replace(
          `${credentials.serverUrl}/_matrix/media/v3/download/`,
          'mxc://'
        );
        messageContent.info = {
          mimetype: forwardMessage.attachment.mimeType,
          size: forwardMessage.attachment.size
        };
      }
      
      await matrixFetch(
        `/rooms/${encodeURIComponent(targetRoomId)}/send/m.room.message/${txnId}`,
        {
          method: 'PUT',
          body: JSON.stringify(messageContent),
        }
      );
      
      setForwardMessage(null);
      setShowForwardModal(false);
    } catch (err) {
      console.error('Forward error:', err);
    }
  };

  // Send typing indicator
  const handleTyping = async () => {
    if (!selectedRoomId || !credentials) return;
    await matrixFetch(`/rooms/${encodeURIComponent(selectedRoomId)}/typing/${encodeURIComponent(credentials.userId)}`, {
      method: 'PUT',
      body: JSON.stringify({ typing: true, timeout: 10000 }),
    });
  };

  // Search users from our DB
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/chat/users/search?q=${encodeURIComponent(searchTerm)}`);
        const data = await response.json();
        
        if (data?.users) {
          setSearchResults(
            data.users.map((u: { id: string; matrixUserId: string; displayName: string; avatarUrl?: string; position?: string; organization?: string }) => ({
              userId: u.id, // Use our user ID, not matrixUserId
              matrixUserId: u.matrixUserId, // Keep for reference
              displayName: u.displayName,
              avatarUrl: u.avatarUrl,
              position: u.position,
              organization: u.organization,
            }))
          );
        }
      } catch (err) {
        console.error('User search error:', err);
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Get current chat DB ID (for API calls)
  const getCurrentChatDbId = useCallback(() => {
    if (!selectedRoomId) return null;
    const dbInfo = dbRoomInfo.get(selectedRoomId);
    // dbInfo may contain chatId from our DB
    // For now, we need to look it up from rooms endpoint
    return null; // Will fetch from API when needed
  }, [selectedRoomId, dbRoomInfo]);

  // Load group participants
  const loadGroupParticipants = useCallback(async (chatId: string) => {
    try {
      const response = await fetch(`/api/ppo-head/chats/${chatId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.chat?.participants) {
          setGroupParticipants(data.chat.participants.map((p: any) => ({
            id: p.user?.id,
            odId: p.user?.odId,
            firstName: p.user?.firstName || '',
            lastName: p.user?.lastName || '',
            avatarUrl: p.user?.avatarUrl,
            role: p.role || 'member'
          })));
        }
      }
    } catch (err) {
      console.error('Failed to load group participants:', err);
    }
  }, []);

  // Clear chat history with mode selection
  const handleClearChat = useCallback(async (mode: 'all' | 'me') => {
    if (!selectedRoomId) return;
    
    setClearingChat(true);
    try {
      // Get chatId from our DB
      const dbChatResponse = await fetch(`/api/chat/rooms/by-matrix-id?roomId=${encodeURIComponent(selectedRoomId)}`);
      const dbChatData = await dbChatResponse.json();
      const chatId = dbChatData.chatId;
      
      if (!chatId) {
        alert('Чат не найден в базе данных');
        return;
      }
      
      const response = await fetch(`/api/chat/${chatId}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      
      if (response.ok) {
        setMessages([]);
        setShowClearChatModal(false);
        alert(mode === 'all' ? 'История удалена у всех участников' : 'История удалена только у вас');
      } else {
        const data = await response.json();
        alert(data.error || 'Ошибка очистки чата');
      }
    } catch (err) {
      console.error('Failed to clear chat:', err);
      alert('Ошибка очистки чата');
    } finally {
      setClearingChat(false);
    }
  }, [selectedRoomId]);

  // Edit group
  const handleEditGroup = useCallback(async (chatId: string) => {
    if (!editGroupName.trim()) return;
    
    try {
      const response = await fetch(`/api/ppo-head/chats/${chatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editGroupName.trim(),
          description: editGroupDescription.trim() || null,
          iconUrl: editGroupIcon,
        }),
      });
      
      if (response.ok) {
        // Update local room name and avatar
        setRooms(prev => prev.map(r => 
          r.roomId === selectedRoomId ? { ...r, name: editGroupName.trim(), avatarUrl: editGroupIcon || r.avatarUrl } : r
        ));
        setShowEditGroup(false);
        setShowGroupSettings(false);
        setEditGroupIcon(null);
      } else {
        const data = await response.json();
        alert(data.error || 'Ошибка редактирования');
      }
    } catch (err) {
      console.error('Failed to edit group:', err);
    }
  }, [editGroupName, editGroupDescription, editGroupIcon, selectedRoomId]);

  // Delete group
  const handleDeleteGroup = useCallback(async (chatId: string) => {
    if (!confirm('Удалить групповой чат? Это действие нельзя отменить.')) return;
    
    try {
      const response = await fetch(`/api/ppo-head/chats/${chatId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setRooms(prev => prev.filter(r => r.roomId !== selectedRoomId));
        setSelectedRoomId(null);
        setShowGroupSettings(false);
      } else {
        const data = await response.json();
        alert(data.error || 'Ошибка удаления');
      }
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  }, [selectedRoomId]);

  // Close ticket with rating
  const handleCloseTicket = useCallback(async () => {
    if (!selectedRoomId) return;
    
    // Get ticket ID from selectedRoom
    const room = rooms.find(r => r.roomId === selectedRoomId);
    const ticketId = room?.ticketId;
    
    if (!ticketId) {
      // Fallback to parsing from displayName
      const roomInfo = dbRoomInfo.get(selectedRoomId);
      const ticketNumber = roomInfo?.displayName?.match(/#(\d+)/)?.[1];
      if (!ticketNumber) {
        alert('Не удалось определить номер обращения');
        return;
      }
    }
    
    setClosingTicket(true);
    
    try {
      const response = await fetch(`/api/tickets/${ticketId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: ticketRating,
          comment: ticketComment.trim() || null,
        }),
      });
      
      if (response.ok) {
        // Update local room state to reflect closed ticket
        setRooms(prev => prev.map(r => 
          r.roomId === selectedRoomId 
            ? { ...r, ticketResolved: true, ticketStatus: 'RESOLVED' } 
            : r
        ));
        
        // Reload dbRoomInfo to get updated ticket status from database
        try {
          const resp = await fetch('/api/chat/rooms');
          if (resp.ok) {
            const data = await resp.json();
            const infoMap = new Map<string, DbRoomInfo>();
            for (const room of data.rooms || []) {
              if (room.matrixRoomId) {
                infoMap.set(room.matrixRoomId, room);
              }
            }
            setDbRoomInfo(infoMap);
            console.log('[MatrixChat] Updated dbRoomInfo after closing ticket');
            
            // Force sync to update rooms with new ticket status from dbInfo
            setTimeout(async () => {
              await sync(true);
            }, 100);
          }
        } catch (err) {
          console.error('[MatrixChat] Failed to reload dbRoomInfo after closing ticket:', err);
        }
        
        setShowCloseTicket(false);
        setTicketRating(5);
        setTicketComment('');
        alert('Обращение успешно закрыто! Всем участникам отправлены уведомления.');
      } else {
        const data = await response.json();
        alert(data.error || 'Ошибка закрытия обращения');
      }
    } catch (err) {
      console.error('Failed to close ticket:', err);
      alert('Ошибка закрытия обращения');
    } finally {
      setClosingTicket(false);
    }
  }, [selectedRoomId, ticketRating, ticketComment, rooms, dbRoomInfo]);

  // Invite to group
  const handleInviteToGroup = useCallback(async (chatId: string) => {
    if (selectedInvites.length === 0) return;
    
    try {
      const response = await fetch(`/api/ppo-head/chats/${chatId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantIds: selectedInvites }),
      });
      
      if (response.ok) {
        setShowInviteModal(false);
        setSelectedInvites([]);
        setInviteSearch('');
        // Reload participants
        loadGroupParticipants(chatId);
      } else {
        const data = await response.json();
        alert(data.error || 'Ошибка приглашения');
      }
    } catch (err) {
      console.error('Failed to invite:', err);
    }
  }, [selectedInvites, loadGroupParticipants]);

  // Remove participant from group
  const handleRemoveParticipant = useCallback(async (chatId: string, participantUserId: string) => {
    if (!confirm('Удалить участника из группы?')) return;
    
    try {
      const response = await fetch(`/api/ppo-head/chats/${chatId}/participants/${participantUserId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setGroupParticipants(prev => prev.filter(p => p.id !== participantUserId));
      } else {
        const data = await response.json();
        alert(data.error || 'Ошибка удаления');
      }
    } catch (err) {
      console.error('Failed to remove participant:', err);
    }
  }, []);

  // Search for users to invite
  useEffect(() => {
    if (!inviteSearch.trim() || !showInviteModal) {
      setInviteResults([]);
      return;
    }
    
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/chat/users/search?q=${encodeURIComponent(inviteSearch)}`);
        const data = await response.json();
        if (data?.users) {
          // Filter out already participating users
          const participantIds = groupParticipants.map(p => p.id);
          setInviteResults(data.users.filter((u: any) => !participantIds.includes(u.id)));
        }
      } catch (err) {
        console.error('Invite search error:', err);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [inviteSearch, showInviteModal, groupParticipants]);

  // Start chat with user
  const handleStartChat = async (userId: string) => {
    try {
      console.log('[MatrixChat] Creating chat with user ID:', userId);
      
      // Create chat using our API (this will create both Matrix room and DB record)
      const chatResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId }),
      });
      
      if (!chatResponse.ok) {
        const errorText = await chatResponse.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `HTTP ${chatResponse.status}` };
        }
        console.error('[MatrixChat] ❌ Failed to create chat:', {
          status: chatResponse.status,
          statusText: chatResponse.statusText,
          error: errorData
        });
        alert(errorData.error || `Ошибка при создании чата (${chatResponse.status})`);
        return;
      }
      
      let chatData;
      try {
        chatData = await chatResponse.json();
        console.log('[MatrixChat] ✅ Chat created:', chatData);
      } catch (err) {
        console.error('[MatrixChat] ❌ Failed to parse chat response:', err);
        alert('Ошибка при обработке ответа сервера');
        return;
      }
      
      if (!chatData?.chat) {
        console.error('[MatrixChat] ❌ Invalid chat response:', chatData);
        alert('Неверный формат ответа от сервера');
        return;
      }
      
      // Use matrixRoomId from response or fetch it
      let matrixRoomId = chatData.chat?.matrixRoomId;
      console.log('[MatrixChat] Initial matrixRoomId from response:', matrixRoomId);
      
      if (!matrixRoomId) {
        console.log('[MatrixChat] ⚠️ No matrixRoomId in response, trying to fetch from chat rooms API...');
        // Try to get it from chat rooms API which includes matrixRoomId
        try {
          const roomsResponse = await fetch('/api/chat/rooms');
          if (roomsResponse.ok) {
            const roomsData = await roomsResponse.json();
            const foundChat = roomsData.rooms?.find((r: any) => r.id === chatData.chat.id);
            if (foundChat?.matrixRoomId) {
              matrixRoomId = foundChat.matrixRoomId;
              console.log('[MatrixChat] ✅ Found matrixRoomId from rooms API:', matrixRoomId);
            } else {
              console.log('[MatrixChat] ⚠️ Chat not found in rooms API, waiting 1 second and retrying...');
              // Wait a bit for Matrix room creation to complete
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              const retryRoomsResponse = await fetch('/api/chat/rooms');
              if (retryRoomsResponse.ok) {
                const retryRoomsData = await retryRoomsResponse.json();
                const retryFoundChat = retryRoomsData.rooms?.find((r: any) => r.id === chatData.chat.id);
                if (retryFoundChat?.matrixRoomId) {
                  matrixRoomId = retryFoundChat.matrixRoomId;
                  console.log('[MatrixChat] ✅ Found matrixRoomId after retry:', matrixRoomId);
                }
              }
            }
          }
        } catch (err) {
          console.error('[MatrixChat] Error fetching rooms:', err);
        }
      }
      
      if (matrixRoomId) {
        // Close modal first
        setShowNewChat(false);
        setSearchTerm('');
        
        // Get other user info from response
        const otherUser = chatData.chat?.otherUser;
        const otherUserName = otherUser 
          ? [otherUser.firstName, otherUser.lastName].filter(Boolean).join(' ') || 'Пользователь'
          : 'Пользователь';
        const otherUserAvatar = otherUser?.avatarUrl;
        
        // Immediately add room to list with basic info (before Matrix sync)
        const newRoom: MatrixRoom = {
          roomId: matrixRoomId,
          name: otherUserName,
          avatarUrl: otherUserAvatar,
          lastMessage: undefined,
          lastMessageTime: Date.now(),
          unreadCount: 0,
          isDirect: true,
        };
        
        setRooms(prev => {
          // Check if room already exists
          if (prev.some(r => r.roomId === matrixRoomId)) {
            return prev;
          }
          // Add new room at the beginning (most recent)
          return [newRoom, ...prev].sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
        });
        
        // Reload dbRoomInfo to include the new chat
        try {
          const resp = await fetch('/api/chat/rooms');
          if (resp.ok) {
            const data = await resp.json();
            const infoMap = new Map<string, DbRoomInfo>();
            for (const room of data.rooms || []) {
              if (room.matrixRoomId) {
                infoMap.set(room.matrixRoomId, room);
              }
            }
            setDbRoomInfo(infoMap);
            console.log('[MatrixChat] Updated dbRoomInfo with new chat');
          }
        } catch (err) {
          console.error('[MatrixChat] Failed to reload dbRoomInfo:', err);
        }
        
        // Set selected room and load messages
        // Use handleSelectRoom to properly load messages and update UI
        await handleSelectRoom(matrixRoomId);
        
        // Wait a bit for Matrix to process the room creation, then sync to update room list
        setTimeout(async () => {
          await sync(true);
        }, 500);
      } else {
        console.error('[MatrixChat] ⚠️ No matrixRoomId in chat response after all retries');
        console.log('[MatrixChat] Chat data:', chatData);
        
        // Close modal
        setShowNewChat(false);
        setSearchTerm('');
        
        // Even without matrixRoomId, we can still show the chat in the list
        // The chat exists in DB, it just needs Matrix room to be created
        if (chatData.chat?.id) {
          // Try to sync and wait for Matrix room to appear
          await sync(true);
          
          // Wait a bit more and check again
          setTimeout(async () => {
            const finalCheck = await fetch('/api/chat/rooms');
            if (finalCheck.ok) {
              const finalData = await finalCheck.json();
              const finalChat = finalData.rooms?.find((r: any) => r.id === chatData.chat.id);
              if (finalChat?.matrixRoomId) {
                console.log('[MatrixChat] ✅ Found matrixRoomId after sync:', finalChat.matrixRoomId);
                await handleSelectRoom(finalChat.matrixRoomId);
              } else {
                console.warn('[MatrixChat] ⚠️ Matrix room still not created for chat', chatData.chat.id);
                alert('Чат создан, но комната Matrix еще не готова. Попробуйте обновить страницу через несколько секунд.');
              }
            }
          }, 2000);
        } else {
          alert('Ошибка: чат не был создан. Попробуйте еще раз.');
        }
      }
    } catch (err) {
      console.error('[MatrixChat] Error creating chat:', err);
      alert('Ошибка при создании чата. Попробуйте еще раз.');
    }
  };

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  const selectedRoom = rooms.find(r => r.roomId === selectedRoomId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-blue-200 dark:border-blue-800"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-blue-600 animate-spin"></div>
          </div>
          <p className="text-gray-600 dark:text-gray-400">Подключение к чату...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-red-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Ошибка подключения</h3>
          <p className="text-gray-600 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gray-50 dark:bg-gray-900">
      {/* Chat List - full width on mobile, sidebar on desktop */}
      <div className={`
        ${selectedRoomId ? 'hidden md:flex' : 'flex'}
        w-full md:w-80 h-full flex-col
        border-r border-gray-200 dark:border-gray-700 
        bg-white dark:bg-gray-800
      `}>
        {/* Header with logo and + button */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Чаты</h2>
          </div>
          {/* + Button with dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowNewChatMenu(!showNewChatMenu)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            {showNewChatMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                <button
                  onClick={() => { setShowNewChat(true); setShowNewChatMenu(false); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Написать
                </button>
                  {isPPOHead && (
                    <button
                      onClick={() => { setShowCreateGroup(true); setShowNewChatMenu(false); }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Создать группу
                    </button>
                  )}
              </div>
            )}
          </div>
        </div>

        {/* Chat Tabs - only show for staff/head modes, not for regular members */}
        {viewMode !== 'MEMBER' && (
          <div className="flex bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setChatTab('work')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors relative ${
                chatTab === 'work'
                  ? 'text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                Рабочие
                {rooms.filter(r => !r.isDirect || r.isTicket).reduce((sum, r) => sum + r.unreadCount, 0) > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 text-[11px] bg-blue-600 text-white rounded-full flex items-center justify-center">
                    {rooms.filter(r => !r.isDirect || r.isTicket).reduce((sum, r) => sum + r.unreadCount, 0)}
                  </span>
                )}
              </span>
              {chatTab === 'work' && (
                <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-blue-600 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setChatTab('personal')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors relative ${
                chatTab === 'personal'
                  ? 'text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                Личные
                {rooms.filter(r => r.isDirect && !r.isTicket).reduce((sum, r) => sum + r.unreadCount, 0) > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 text-[11px] bg-blue-600 text-white rounded-full flex items-center justify-center">
                    {rooms.filter(r => r.isDirect && !r.isTicket).reduce((sum, r) => sum + r.unreadCount, 0)}
                  </span>
                )}
              </span>
              {chatTab === 'personal' && (
                <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-blue-600 rounded-full" />
              )}
            </button>
          </div>
        )}

        {/* Room List */}
        <div className="flex-1 overflow-y-auto">
          {rooms.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-gray-500 dark:text-gray-400">Нет активных чатов</p>
              <button
                onClick={() => setShowNewChat(true)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Начать чат
              </button>
            </div>
          ) : (
            rooms
              .filter(room => {
                // For regular members (MEMBER mode) - show personal chats AND their own tickets
                if (viewMode === 'MEMBER') {
                  // Показываем личные чаты (не обращения) ИЛИ свои обращения
                  return (room.isDirect && !room.isTicket) || (room.isTicket && room.isTicketCreator);
                }
                // Filter by tab - Telegram style (for staff/head modes)
                // Рабочие = групповые ИЛИ обращения
                if (chatTab === 'work') return !room.isDirect || room.isTicket;
                // Личные = личные И НЕ обращения
                return room.isDirect && !room.isTicket;
              })
              .map(room => {
              // Generate gradient color based on room name
              const colors = [
                'from-blue-500 to-blue-600',
                'from-purple-500 to-purple-600', 
                'from-green-500 to-green-600',
                'from-orange-500 to-orange-600',
                'from-pink-500 to-pink-600',
                'from-cyan-500 to-cyan-600',
                'from-indigo-500 to-indigo-600',
                'from-teal-500 to-teal-600',
              ];
              const colorIndex = room.name.charCodeAt(0) % colors.length;
              const gradientColor = colors[colorIndex];
              
              // Get initials
              const initials = room.name
                .split(' ')
                .map(w => w.charAt(0))
                .slice(0, 2)
                .join('')
                .toUpperCase() || '?';
              
              return (
                <button
                  key={room.roomId}
                  onClick={() => handleSelectRoom(room.roomId)}
                  className={`w-full p-4 text-left transition-all hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    selectedRoomId === room.roomId 
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-600' 
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 ring-2 ring-gray-100 dark:ring-gray-700 flex-shrink-0">
                      {room.avatarUrl ? (
                        <img 
                          src={room.avatarUrl.startsWith('mxc://') 
                            ? room.avatarUrl.replace('mxc://', `${credentials?.serverUrl}/_matrix/media/v3/thumbnail/`) 
                            : room.avatarUrl}
                          alt={room.name}
                          className="w-full h-full object-cover rounded-full"
                        />
                      ) : (
                        <AvatarFallback className={`bg-gradient-to-br ${gradientColor} text-white font-semibold text-lg`}>
                          {initials}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900 dark:text-white truncate">
                          {room.name}
                        </span>
                        {room.unreadCount > 0 && (
                          <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                            {room.unreadCount > 99 ? '99+' : room.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {room.lastMessage || (room.isDirect ? 'Начните диалог' : 'Нет сообщений')}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main Chat Area - hidden on mobile when no chat selected */}
      <div className={`${selectedRoomId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
        {selectedRoom ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
              <div className="flex items-center gap-3">
                {/* Back button on mobile */}
                <button
                  className="md:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  onClick={() => setSelectedRoomId(null)}
                >
                  <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                
                <Avatar className="h-10 w-10 ring-2 ring-gray-100 dark:ring-gray-700">
                  {selectedRoom.avatarUrl ? (
                    <img 
                      src={selectedRoom.avatarUrl.replace('mxc://', `${credentials?.serverUrl}/_matrix/media/v3/thumbnail/`)}
                      alt={selectedRoom.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <AvatarFallback className={`bg-gradient-to-br ${
                      ['from-blue-500 to-blue-600', 'from-purple-500 to-purple-600', 
                       'from-green-500 to-green-600', 'from-orange-500 to-orange-600',
                       'from-pink-500 to-pink-600', 'from-cyan-500 to-cyan-600'][
                        selectedRoom.name.charCodeAt(0) % 6
                      ]
                    } text-white font-semibold`}>
                      {selectedRoom.name.split(' ').map(w => w.charAt(0)).slice(0, 2).join('').toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                    {selectedRoom.name}
                  </h3>
                  {typingUsers.length > 0 ? (
                    <p className="text-sm text-blue-600 dark:text-blue-400 animate-pulse">
                      {typingUsers.map(u => u.name).join(', ')} печатает...
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {selectedRoom.isDirect ? 'Личный чат' : 'Групповой чат'}
                    </p>
                  )}
                </div>
                
                {/* Close ticket button (only for ticket creator, not resolved) */}
                {selectedRoom.isTicket && selectedRoom.isTicketCreator && !selectedRoom.ticketResolved && (
                  <button
                    onClick={() => setShowCloseTicket(true)}
                    className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Закрыть
                  </button>
                )}
                
                {/* Clear chat button (for all personal chats) */}
                {selectedRoom.isDirect && !selectedRoom.isTicket && (
                  <button
                    onClick={() => setShowClearChatModal(true)}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Очистить чат"
                  >
                    <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
                
                {/* Group settings button (for PPO Head and group chats or tickets) */}
                {isPPOHead && (!selectedRoom.isDirect || selectedRoom.isTicket) && (
                  <button
                    onClick={() => {
                      setShowGroupSettings(true);
                      setEditGroupName(selectedRoom.name);
                      setEditGroupDescription('');
                      // Load participants - need to get chatId from dbRoomInfo
                      const dbInfo = dbRoomInfo.get(selectedRoom.roomId);
                      if (dbInfo) {
                        // Fetch chat details by matrix room ID
                        fetch(`/api/chat/rooms/by-matrix-id?roomId=${encodeURIComponent(selectedRoom.roomId)}`)
                          .then(r => r.json())
                          .then(data => {
                            if (data.chatId) {
                              loadGroupParticipants(data.chatId);
                            }
                          })
                          .catch(() => {});
                      }
                    }}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Настройки группы"
                  >
                    <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div 
              className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800"
              onClick={(e) => {
                // Close menus when clicking outside
                if ((e.target as HTMLElement).closest('[data-message-bubble]') === null && 
                    (e.target as HTMLElement).closest('[data-context-menu]') === null) {
                  setActiveMessageId(null);
                  setShowReactions(null);
                  setContextMenu(null);
                }
              }}
              onContextMenu={(e) => {
                // Close context menu on right click outside
                if ((e.target as HTMLElement).closest('[data-message-bubble]') === null) {
                  setContextMenu(null);
                }
              }}
            >
              {/* Quick questions for AI chat - показываем приветствие если нет сообщений и это чат с ИИ */}
              {messages.length === 0 && (
                selectedRoom.name?.includes('Помощник') || 
                selectedRoom.name?.includes('AI') || 
                selectedRoom.name?.includes('Бот') ||
                selectedRoom.name?.includes('ai-assistant') ||
                // Проверяем участников чата на наличие ИИ бота
                dbRoomInfo[selectedRoomId]?.participants?.some(p => 
                  p.matrixUserId?.includes('ai_assistant') ||
                  p.matrixUserId?.includes('myunion_bot') ||
                  p.matrixUserId?.includes('assistant') ||
                  p.firstName === 'AI' ||
                  p.lastName === 'Помощник'
                )
              ) && (
                <div className="flex flex-col items-center justify-center h-full py-8">
                  <div className="w-20 h-20 mb-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Привет! Я AI-помощник 👋
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 text-center mb-6 max-w-sm">
                    Я помогу вам с вопросами о профсоюзе, скидках, документах и членстве.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
                    {[
                      { icon: '📝', text: 'Как вступить в профсоюз?' },
                      { icon: '💳', text: 'Какие есть скидки?' },
                      { icon: '📋', text: 'Где найти мои документы?' },
                      { icon: '✉️', text: 'Как создать обращение?' },
                      { icon: '👤', text: 'Как заполнить профиль?' },
                      { icon: '❓', text: 'Кто наш председатель?' },
                    ].map((q, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setNewMessage(q.text);
                          inputRef.current?.focus();
                        }}
                        className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-blue-50 dark:hover:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-all text-left group"
                      >
                        <span className="text-xl">{q.icon}</span>
                        <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {q.text}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => {
                const showAvatar = idx === 0 || messages[idx - 1].sender !== msg.sender;
                const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🙏', '👎'];
                
                return (
                  <div
                    key={msg.eventId}
                    className={`flex items-end gap-2 group ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    {!msg.isOwn && showAvatar && (
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        {msg.senderAvatar ? (
                          <img src={msg.senderAvatar} alt="" className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs">
                            {msg.senderName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                    )}
                    {!msg.isOwn && !showAvatar && <div className="w-8" />}
                    
                    <div className="relative">
                      {/* Reaction picker */}
                      {showReactions === msg.eventId && (
                        <div className={`absolute ${msg.isOwn ? 'right-0' : 'left-0'} bottom-full mb-2 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-100 dark:border-gray-700 px-2 py-1 flex gap-1 z-20`}>
                          {REACTION_EMOJIS.map(emoji => (
                            <button
                              key={emoji}
                              onClick={(e) => { e.stopPropagation(); handleReaction(msg.eventId, emoji); setActiveMessageId(null); }}
                              className="text-xl hover:scale-125 transition-transform p-1"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                      
                      {/* Message bubble - context menu on right click (desktop) or long press (mobile) */}
                      <div
                        data-message-bubble
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          // Calculate position, ensuring menu stays within viewport
                          const x = Math.min(e.clientX, window.innerWidth - 200);
                          const y = Math.min(e.clientY, window.innerHeight - 300);
                          setContextMenu({ eventId: msg.eventId, x, y });
                          setShowReactions(null);
                        }}
                        onTouchStart={(e) => {
                          const touch = e.touches[0];
                          const timer = setTimeout(() => {
                            // Long press detected
                            e.preventDefault();
                            const x = Math.min(touch.clientX, window.innerWidth - 200);
                            const y = Math.min(touch.clientY, window.innerHeight - 300);
                            setContextMenu({ eventId: msg.eventId, x, y });
                            setShowReactions(null);
                          }, 500); // 500ms for long press
                          setLongPressTimer(timer);
                        }}
                        onTouchEnd={() => {
                          if (longPressTimer) {
                            clearTimeout(longPressTimer);
                            setLongPressTimer(null);
                          }
                        }}
                        onTouchMove={() => {
                          if (longPressTimer) {
                            clearTimeout(longPressTimer);
                            setLongPressTimer(null);
                          }
                        }}
                        className={`max-w-[280px] sm:max-w-[380px] rounded-2xl px-4 py-2 shadow-sm cursor-pointer select-none ${
                          msg.isOwn
                            ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-br-sm'
                            : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-sm border border-gray-100 dark:border-gray-600'
                        }`}
                      >
                        {!msg.isOwn && showAvatar && (
                          <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
                            {msg.senderName}
                          </div>
                        )}
                        
                        {/* Reply preview */}
                        {msg.replyTo && (
                          <div className={`mb-2 border-l-2 ${
                            msg.isOwn ? 'border-blue-300 pl-2' : 'border-gray-400 dark:border-gray-500 pl-2'
                          }`}>
                            <div className={`text-xs font-medium ${
                              msg.isOwn ? 'text-blue-200' : 'text-gray-500 dark:text-gray-400'
                            }`}>
                              {msg.replyTo.senderName}
                            </div>
                            <div className={`text-xs truncate ${
                              msg.isOwn ? 'text-blue-100' : 'text-gray-600 dark:text-gray-300'
                            }`}>
                              {msg.replyTo.content}
                            </div>
                          </div>
                        )}
                        
                        {/* Attachment */}
                        {msg.attachment && (
                          <div className="mb-2">
                            {msg.attachment.type === 'image' && (
                              <div className="relative">
                                <img
                                  src={msg.attachment.thumbnailUrl || msg.attachment.url}
                                  alt={msg.attachment.name}
                                  className="rounded-lg max-w-full max-h-80 cursor-pointer object-cover"
                                  onClick={(e) => { e.stopPropagation(); setPreviewImage(msg.attachment?.url || null); }}
                                  onError={(e) => {
                                    // Try original URL if thumbnail fails
                                    const target = e.target as HTMLImageElement;
                                    if (target.src !== msg.attachment?.url) {
                                      target.src = msg.attachment?.url || '';
                                    } else {
                                      // Show fallback
                                      target.style.display = 'none';
                                      target.nextElementSibling?.classList.remove('hidden');
                                    }
                                  }}
                                />
                                {/* Fallback for unsupported formats (HEIC, etc) */}
                                <a
                                  href={msg.attachment.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hidden flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 max-w-[280px]"
                                >
                                  <svg className="w-8 h-8 flex-shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-gray-900 dark:text-white truncate">{msg.attachment.name}</div>
                                    <div className="text-sm text-gray-500">Нажмите для просмотра</div>
                                  </div>
                                </a>
                              </div>
                            )}
                            {msg.attachment.type === 'video' && (
                              <video
                                src={msg.attachment.url}
                                controls
                                className="rounded-lg max-w-full"
                                poster={msg.attachment.thumbnailUrl}
                              />
                            )}
                            {msg.attachment.type === 'audio' && (
                              <audio src={msg.attachment.url} controls className="w-full" />
                            )}
                            {msg.attachment.type === 'file' && (
                              <a
                                href={msg.attachment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 p-2 rounded-lg ${
                                  msg.isOwn ? 'bg-blue-700/50 hover:bg-blue-700/70' : 'bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500'
                                }`}
                              >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <div className="flex-1 min-w-0">
                                  <div className="truncate text-sm font-medium">{msg.attachment.name}</div>
                                  {msg.attachment.size && (
                                    <div className="text-xs opacity-75">
                                      {(msg.attachment.size / 1024 / 1024).toFixed(2)} МБ
                                    </div>
                                  )}
                                </div>
                              </a>
                            )}
                          </div>
                        )}
                        
                        {/* Text content (hide if only attachment without text) */}
                        {editingMessageId === msg.eventId ? (
                          <div className="space-y-2">
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              className="w-full p-2 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 resize-none"
                              rows={3}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                  e.preventDefault();
                                  handleEditMessage(msg.eventId, editingText);
                                }
                                if (e.key === 'Escape') {
                                  setEditingMessageId(null);
                                  setEditingText('');
                                }
                              }}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditMessage(msg.eventId, editingText)}
                                className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                              >
                                Сохранить
                              </button>
                              <button
                                onClick={() => {
                                  setEditingMessageId(null);
                                  setEditingText('');
                                }}
                                className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
                              >
                                Отмена
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {(!msg.attachment || msg.content !== msg.attachment.name) && (
                              <MessageContent content={msg.content} />
                            )}
                            <div className={`flex items-center gap-1 text-xs mt-1 ${msg.isOwn ? 'text-blue-100' : 'text-gray-400'}`}>
                              <span>{new Date(msg.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                              {msg.isEdited && (
                                <span className="italic opacity-75">(отредактировано)</span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      
                      {/* Reactions display */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className={`flex flex-wrap gap-1 mt-1 ${msg.isOwn ? 'justify-end' : 'justify-start'}`}>
                          {msg.reactions.map(reaction => (
                            <button
                              key={reaction.key}
                              onClick={() => handleReaction(msg.eventId, reaction.key)}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm ${
                                reaction.users.includes(credentials?.userId || '')
                                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              <span>{reaction.key}</span>
                              <span className="text-xs">{reaction.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Context Menu */}
            {contextMenu && (
              <div
                ref={contextMenuRef}
                data-context-menu
                className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[180px]"
                style={{
                  left: `${contextMenu.x}px`,
                  top: `${contextMenu.y}px`,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {messages.find(m => m.eventId === contextMenu.eventId) && (() => {
                  const msg = messages.find(m => m.eventId === contextMenu.eventId)!;
                  return (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setReplyTo(msg);
                          setContextMenu(null);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        Ответить
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowReactions(showReactions === msg.eventId ? null : msg.eventId);
                          setContextMenu(null);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Реакция
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setForwardMessage(msg);
                          setShowForwardModal(true);
                          setContextMenu(null);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                        </svg>
                        Переслать
                      </button>
                      {msg.isOwn && (
                        <>
                          {msg.msgtype === 'm.text' && !msg.attachment && (
                            <>
                              <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingMessageId(msg.eventId);
                                  setEditingText(msg.content);
                                  setContextMenu(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Редактировать
                              </button>
                            </>
                          )}
                          <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMessage(msg.eventId);
                              setContextMenu(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-3"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Удалить
                          </button>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
              {/* Ticket closed notice */}
              {selectedRoom?.isTicket && selectedRoom?.ticketResolved && (
                <div className="flex items-center justify-center gap-2 py-4 px-6 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border border-green-200 dark:border-green-800">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-green-700 dark:text-green-300 font-medium">
                    Обращение закрыто. Написать сообщение невозможно.
                  </span>
                </div>
              )}
              
              {/* Show input only if ticket is not resolved */}
              {(!selectedRoom?.isTicket || !selectedRoom?.ticketResolved) && (
                <>
              {/* Reply preview */}
              {replyTo && (
                <div className="mb-2 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold">
                      Ответ для {replyTo.senderName}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300 truncate">
                      {replyTo.content}
                    </div>
                  </div>
                  <button
                    onClick={() => setReplyTo(null)}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              
              <div className="flex items-end gap-2">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
                />
                
                {/* Attach button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex-shrink-0 h-12 w-12 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 
                    hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                  title="Прикрепить файл"
                >
                  {uploading ? (
                    <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  )}
                </button>
                
                <div className="flex-1 min-w-0 flex items-end">
                  <textarea
                    ref={inputRef}
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      handleTyping();
                      // Auto-resize textarea
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={replyTo ? "Написать ответ..." : "Введите сообщение..."}
                    rows={1}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 
                      bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white 
                      resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                      placeholder:text-gray-400 overflow-y-auto leading-relaxed"
                    style={{ minHeight: '48px', maxHeight: '150px' }}
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={!newMessage.trim() || sending}
                  className="flex-shrink-0 h-12 w-12 flex items-center justify-center bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full 
                    hover:from-blue-700 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed 
                    transition-all shadow-lg hover:shadow-xl active:scale-95"
                >
                  {sending ? (
                    <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </div>
              </>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 hidden md:flex items-center justify-center bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
            <div className="text-center p-8">
              <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-xl">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                MyUnion Чат
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                Выберите чат или начните новый разговор
              </p>
              <button
                onClick={() => setShowNewChat(true)}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl 
                  hover:from-blue-700 hover:to-blue-600 transition-all shadow-lg hover:shadow-xl font-semibold"
              >
                Начать чат
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Новый чат</h3>
                <button 
                  onClick={() => {
                    setShowNewChat(false);
                    setSearchTerm('');
                  }}
                  className="p-1 hover:bg-white/20 rounded-full"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-4">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Поиск пользователей..."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 
                  bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="max-h-80 overflow-y-auto">
              {searchResults.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  {searchTerm ? 'Пользователи не найдены' : 'Введите имя для поиска'}
                </div>
              ) : (
                searchResults.map(user => (
                  <button
                    key={user.userId}
                    onClick={() => handleStartChat(user.userId)}
                    className="w-full p-4 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Avatar className="h-12 w-12">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover rounded-full" />
                      ) : (
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                          {user.displayName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="text-left flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-white truncate">
                        {user.displayName}
                      </div>
                      {(user.position || user.organization) && (
                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {[user.position, user.organization].filter(Boolean).join(' • ')}
                        </div>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Forward Message Modal */}
      {showForwardModal && forwardMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Переслать сообщение</h3>
                <button 
                  onClick={() => {
                    setShowForwardModal(false);
                    setForwardMessage(null);
                  }}
                  className="p-1 hover:bg-white/20 rounded-full"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Message preview */}
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Сообщение от {forwardMessage.senderName}:</div>
              <div className="text-sm text-gray-700 dark:text-gray-200 truncate">
                {forwardMessage.attachment ? (
                  <span className="flex items-center gap-1">
                    {forwardMessage.attachment.type === 'image' && '🖼️ Изображение'}
                    {forwardMessage.attachment.type === 'video' && '🎬 Видео'}
                    {forwardMessage.attachment.type === 'audio' && '🎵 Аудио'}
                    {forwardMessage.attachment.type === 'file' && `📎 ${forwardMessage.attachment.name}`}
                  </span>
                ) : (
                  forwardMessage.content
                )}
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto">
              <div className="p-2 text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">
                Выберите чат
              </div>
              {rooms.filter(r => r.roomId !== selectedRoomId).length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  Нет доступных чатов для пересылки
                </div>
              ) : (
                rooms.filter(r => r.roomId !== selectedRoomId).map(room => (
                  <button
                    key={room.roomId}
                    onClick={() => handleForward(room.roomId)}
                    className="w-full p-4 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      {room.avatarUrl ? (
                        <img 
                          src={room.avatarUrl.replace('mxc://', `${credentials?.serverUrl}/_matrix/media/v3/thumbnail/`)}
                          alt={room.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <AvatarFallback className={`bg-gradient-to-br ${
                          ['from-blue-500 to-blue-600', 'from-purple-500 to-purple-600', 
                           'from-green-500 to-green-600', 'from-orange-500 to-orange-600'][
                            room.name.charCodeAt(0) % 4
                          ]
                        } text-white`}>
                          {room.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="text-left flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-white truncate">
                        {room.name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {room.isDirect ? 'Личный чат' : 'Групповой чат'}
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Group Modal (PPO Head only) */}
      {showCreateGroup && isPPOHead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-green-600 to-teal-600 text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Создать группу</h3>
                <button 
                  onClick={() => {
                    setShowCreateGroup(false);
                    setGroupName('');
                    setGroupDescription('');
                    setSelectedMembers([]);
                    setMemberSearchTerm('');
                  }}
                  className="p-1 hover:bg-white/20 rounded-full"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Название группы *
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Например: Профком 2025"
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 
                    bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white
                    focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Описание
                </label>
                <textarea
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  placeholder="Краткое описание группы..."
                  rows={2}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 
                    bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white
                    focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Участники * ({selectedMembers.length} выбрано)
                </label>
                {/* Поиск участников */}
                <div className="mb-2">
                  <input
                    type="text"
                    value={memberSearchTerm}
                    onChange={(e) => setMemberSearchTerm(e.target.value)}
                    placeholder="Поиск участников..."
                    className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 
                      bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white
                      focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600">
                  {orgMembers.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                      Загрузка участников...
                    </div>
                  ) : (() => {
                    // Фильтруем участников по поисковому запросу
                    const filteredMembers = orgMembers.filter(member => {
                      if (!memberSearchTerm.trim()) return true;
                      const fullName = [member.lastName, member.firstName].filter(Boolean).join(' ').toLowerCase();
                      const searchLower = memberSearchTerm.toLowerCase();
                      return fullName.includes(searchLower);
                    });

                    if (filteredMembers.length === 0) {
                      return (
                        <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                          Участники не найдены
                        </div>
                      );
                    }

                    return filteredMembers.map(member => {
                      const fullName = [member.lastName, member.firstName].filter(Boolean).join(' ') || 'Пользователь';
                      const isSelected = selectedMembers.includes(member.id);
                      return (
                        <label 
                          key={member.id} 
                          className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                            isSelected ? 'bg-green-50 dark:bg-green-900/20' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedMembers(prev => 
                                isSelected 
                                  ? prev.filter(id => id !== member.id)
                                  : [...prev, member.id]
                              );
                            }}
                            className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                          />
                          <Avatar className="h-10 w-10 flex-shrink-0">
                            {member.avatarUrl ? (
                              <img 
                                src={member.avatarUrl} 
                                alt={fullName}
                                className="w-full h-full object-cover rounded-full"
                                onError={(e) => {
                                  // Fallback на инициалы если изображение не загрузилось
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const fallback = target.nextElementSibling as HTMLElement;
                                  if (fallback) fallback.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <AvatarFallback className={`bg-gradient-to-br ${
                              ['from-blue-500 to-blue-600', 'from-purple-500 to-purple-600', 
                               'from-green-500 to-green-600', 'from-orange-500 to-orange-600',
                               'from-pink-500 to-pink-600', 'from-cyan-500 to-cyan-600'][
                                (member.lastName?.charCodeAt(0) || member.firstName?.charCodeAt(0) || 0) % 6
                              ]
                            } text-white text-sm font-semibold ${member.avatarUrl ? 'hidden' : ''}`}>
                              {fullName.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm text-gray-900 dark:text-white flex-1">{fullName}</span>
                        </label>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={() => {
                  setShowCreateGroup(false);
                  setGroupName('');
                  setGroupDescription('');
                  setSelectedMembers([]);
                }}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 
                  text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={creatingGroup || !groupName.trim() || selectedMembers.length === 0}
                className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-green-600 to-teal-600 
                  text-white font-semibold hover:from-green-700 hover:to-teal-700 
                  disabled:opacity-50 disabled:cursor-not-allowed transition-all
                  disabled:hover:from-green-600 disabled:hover:to-teal-600"
                style={{
                  color: (creatingGroup || !groupName.trim() || selectedMembers.length === 0) 
                    ? 'rgba(255, 255, 255, 0.7)' 
                    : 'white'
                }}
              >
                {creatingGroup ? 'Создание...' : 'Создать группу'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Settings Modal */}
      {showGroupSettings && selectedRoom && (!selectedRoom.isDirect || selectedRoom.isTicket) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-purple-600 to-purple-500 text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Настройки группы</h3>
                <button 
                  onClick={() => setShowGroupSettings(false)}
                  className="p-1 hover:bg-white/20 rounded-full"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Avatar with Crop */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Аватар группы
                </label>
                <GroupIconUpload
                  value={editGroupIcon || selectedRoom?.avatarUrl || null}
                  onChange={(url) => setEditGroupIcon(url)}
                />
              </div>

              {/* Edit Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Название группы
                </label>
                <input
                  type="text"
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 
                    bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Описание (опционально)
                </label>
                <textarea
                  value={editGroupDescription}
                  onChange={(e) => setEditGroupDescription(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 
                    bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                />
              </div>

              {/* Participants */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Участники ({groupParticipants.length})
                  </label>
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    + Добавить
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {groupParticipants.map(p => (
                    <div key={p.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <Avatar className="h-8 w-8">
                        {p.avatarUrl ? (
                          <img src={p.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <AvatarFallback className="bg-blue-500 text-white text-xs">
                            {(p.firstName?.[0] || '').toUpperCase()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <span className="flex-1 text-sm text-gray-900 dark:text-white">
                        {p.firstName} {p.lastName}
                      </span>
                      {p.role === 'admin' && (
                        <span className="text-xs text-purple-600 dark:text-purple-400">Админ</span>
                      )}
                      {p.role !== 'admin' && (
                        <button
                          onClick={() => {
                            const dbInfo = dbRoomInfo.get(selectedRoom.roomId);
                            fetch(`/api/chat/rooms/by-matrix-id?roomId=${encodeURIComponent(selectedRoom.roomId)}`)
                              .then(r => r.json())
                              .then(data => {
                                if (data.chatId) handleRemoveParticipant(data.chatId, p.id);
                              });
                          }}
                          className="text-xs text-red-500 hover:text-red-600"
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  fetch(`/api/chat/rooms/by-matrix-id?roomId=${encodeURIComponent(selectedRoom.roomId)}`)
                    .then(r => r.json())
                    .then(data => {
                      if (data.chatId) handleDeleteGroup(data.chatId);
                    });
                }}
                className="px-3 py-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 text-sm"
              >
                Удалить
              </button>
              <button
                onClick={() => setShowClearChatModal(true)}
                className="px-3 py-2 rounded-lg bg-orange-100 text-orange-600 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 text-sm"
              >
                Очистить
              </button>
              <div className="flex-1" />
              <button
                onClick={() => {
                  setShowGroupSettings(false);
                  setEditGroupIcon(null);
                }}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  fetch(`/api/chat/rooms/by-matrix-id?roomId=${encodeURIComponent(selectedRoom.roomId)}`)
                    .then(r => r.json())
                    .then(data => {
                      if (data.chatId) handleEditGroup(data.chatId);
                    });
                }}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-500 text-white hover:from-purple-700 hover:to-purple-600"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite to Group Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Добавить участников</h3>
                <button 
                  onClick={() => {
                    setShowInviteModal(false);
                    setInviteSearch('');
                    setSelectedInvites([]);
                  }}
                  className="p-1 hover:bg-white/20 rounded-full"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-4">
              <input
                type="text"
                value={inviteSearch}
                onChange={(e) => setInviteSearch(e.target.value)}
                placeholder="Поиск участников..."
                className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div className="max-h-60 overflow-y-auto px-4">
              {inviteResults.length === 0 ? (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                  {inviteSearch ? 'Не найдено' : 'Введите имя для поиска'}
                </div>
              ) : (
                inviteResults.map(user => (
                  <label
                    key={user.id}
                    className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedInvites.includes(user.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedInvites(prev => [...prev, user.id]);
                        } else {
                          setSelectedInvites(prev => prev.filter(id => id !== user.id));
                        }
                      }}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <Avatar className="h-8 w-8">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                      ) : (
                        <AvatarFallback className="bg-blue-500 text-white text-xs">
                          {(user.firstName?.[0] || '').toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <span className="text-sm text-gray-900 dark:text-white">
                      {user.firstName} {user.lastName}
                    </span>
                  </label>
                ))
              )}
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteSearch('');
                  setSelectedInvites([]);
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  if (selectedRoom) {
                    fetch(`/api/chat/rooms/by-matrix-id?roomId=${encodeURIComponent(selectedRoom.roomId)}`)
                      .then(r => r.json())
                      .then(data => {
                        if (data.chatId) handleInviteToGroup(data.chatId);
                      });
                  }
                }}
                disabled={selectedInvites.length === 0}
                className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 
                  text-white hover:from-blue-700 hover:to-blue-600 disabled:opacity-50"
              >
                Добавить ({selectedInvites.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Ticket Modal */}
      {showCloseTicket && selectedRoom?.isTicket && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-green-600 to-green-500 text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Закрыть обращение</h3>
                <button 
                  onClick={() => setShowCloseTicket(false)}
                  className="p-1 hover:bg-white/20 rounded-full"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Rating */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Оцените качество обслуживания
                </label>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setTicketRating(star)}
                      className={`transition-transform hover:scale-110 ${
                        star <= ticketRating ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'
                      }`}
                    >
                      <svg
                        className="h-10 w-10"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </button>
                  ))}
                </div>
                <p className="text-center mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {ticketRating === 1 && 'Очень плохо'}
                  {ticketRating === 2 && 'Плохо'}
                  {ticketRating === 3 && 'Удовлетворительно'}
                  {ticketRating === 4 && 'Хорошо'}
                  {ticketRating === 5 && 'Отлично!'}
                </p>
              </div>
              
              {/* Comment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Комментарий (необязательно)
                </label>
                <textarea
                  value={ticketComment}
                  onChange={(e) => setTicketComment(e.target.value)}
                  rows={3}
                  placeholder="Напишите, что понравилось или что можно улучшить..."
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 
                    bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none
                    focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={() => setShowCloseTicket(false)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 
                  dark:bg-gray-700 dark:text-gray-300 font-medium"
              >
                Отмена
              </button>
              <button
                onClick={handleCloseTicket}
                disabled={closingTicket}
                className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-green-600 to-green-500 
                  text-white hover:from-green-700 hover:to-green-600 disabled:opacity-50 font-medium
                  flex items-center justify-center gap-2"
              >
                {closingTicket ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Закрытие...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Закрыть обращение
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Chat Modal */}
      {showClearChatModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-orange-500 to-orange-400 text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Очистить чат</h3>
                <button 
                  onClick={() => setShowClearChatModal(false)}
                  className="p-1 hover:bg-white/20 rounded-full"
                  disabled={clearingChat}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Выберите как удалить историю сообщений:
              </p>
              
              <button
                onClick={() => handleClearChat('me')}
                disabled={clearingChat}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 
                  bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600
                  text-left transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">Только у меня</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">История останется у собеседника</div>
                  </div>
                </div>
              </button>
              
              <button
                onClick={() => handleClearChat('all')}
                disabled={clearingChat}
                className="w-full px-4 py-3 rounded-xl border border-red-200 dark:border-red-900/50 
                  bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30
                  text-left transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-red-600 dark:text-red-400">У всех участников</div>
                    <div className="text-xs text-red-500 dark:text-red-400/70">Сообщения будут удалены навсегда</div>
                  </div>
                </div>
              </button>
              
              {clearingChat && (
                <div className="flex items-center justify-center py-2">
                  <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  <span className="ml-2 text-sm text-gray-500">Удаление...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
          onClick={() => setPreviewImage(null)}
        >
          {/* Close button */}
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          {/* Download button */}
          <a
            href={previewImage}
            download
            onClick={(e) => e.stopPropagation()}
            className="absolute top-4 left-4 p-2 text-white/70 hover:text-white transition-colors"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </a>
          
          {/* Image */}
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
