/**
 * Аналитика по обращениям для отчетов
 */

import { prisma } from "@/lib/prisma";

export interface TicketAnalytics {
  total: number;
  pending: number;
  inProgress: number;
  resolved: number;
  closed: number;
  overdue: number; // Просроченные обращения
  overdueCount: number; // Количество просроченных обращений
  averageResponseTime: number | null; // Среднее время ответа председателя (в часах)
  averageResolutionTime: number | null; // Среднее время решения обращения (в часах)
}

/**
 * Получить аналитику по обращениям организации
 */
export async function getTicketAnalytics(
  organizationId: string,
  startDate?: Date,
  endDate?: Date
): Promise<TicketAnalytics> {
  const where: any = {
    organizationId,
  };

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = startDate;
    }
    if (endDate) {
      where.createdAt.lte = endDate;
    }
  }

  const tickets = await prisma.ticket.findMany({
    where,
    select: {
      id: true,
      status: true,
      isOverdue: true,
      createdAt: true,
      lastResponseAt: true,
      resolvedAt: true,
      responseDeadline: true,
    },
  });

  const total = tickets.length;
  const pending = tickets.filter((t) => t.status === "PENDING").length;
  const inProgress = tickets.filter((t) => t.status === "IN_PROGRESS").length;
  const resolved = tickets.filter((t) => t.status === "RESOLVED").length;
  const closed = tickets.filter((t) => t.status === "CLOSED").length;
  const overdue = tickets.filter((t) => t.isOverdue).length;

  // Вычисляем среднее время ответа председателя
  const ticketsWithResponse = tickets.filter(
    (t) => t.lastResponseAt && t.createdAt
  );
  let averageResponseTime: number | null = null;
  if (ticketsWithResponse.length > 0) {
    const totalResponseTime = ticketsWithResponse.reduce((sum, t) => {
      const responseTime =
        (new Date(t.lastResponseAt!).getTime() -
          new Date(t.createdAt).getTime()) /
        (1000 * 60 * 60); // В часах
      return sum + responseTime;
    }, 0);
    averageResponseTime = totalResponseTime / ticketsWithResponse.length;
  }

  // Вычисляем среднее время решения обращения
  const resolvedTickets = tickets.filter(
    (t) => t.resolvedAt && t.createdAt
  );
  let averageResolutionTime: number | null = null;
  if (resolvedTickets.length > 0) {
    const totalResolutionTime = resolvedTickets.reduce((sum, t) => {
      const resolutionTime =
        (new Date(t.resolvedAt!).getTime() -
          new Date(t.createdAt).getTime()) /
        (1000 * 60 * 60); // В часах
      return sum + resolutionTime;
    }, 0);
    averageResolutionTime = totalResolutionTime / resolvedTickets.length;
  }

  return {
    total,
    pending,
    inProgress,
    resolved,
    closed,
    overdue,
    overdueCount: overdue,
    averageResponseTime,
    averageResolutionTime,
  };
}

/**
 * Получить список просроченных обращений организации
 */
export async function getOverdueTickets(
  organizationId: string
): Promise<
  Array<{
    id: string;
    publicId: string;
    title: string;
    status: string;
    createdAt: Date;
    responseDeadline: Date | null;
    isOverdue: boolean;
    overdueDays: number; // Количество дней просрочки
  }>
> {
  const tickets = await prisma.ticket.findMany({
    where: {
      organizationId,
      isOverdue: true,
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    select: {
      id: true,
      publicId: true,
      title: true,
      status: true,
      createdAt: true,
      responseDeadline: true,
      isOverdue: true,
    },
    orderBy: {
      responseDeadline: "asc", // Сначала самые просроченные
    },
  });

  const now = new Date();

  return tickets.map((ticket) => {
    const overdueDays = ticket.responseDeadline
      ? Math.ceil(
          (now.getTime() - new Date(ticket.responseDeadline).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

    return {
      id: ticket.id,
      publicId: ticket.publicId,
      title: ticket.title,
      status: ticket.status,
      createdAt: ticket.createdAt,
      responseDeadline: ticket.responseDeadline,
      isOverdue: ticket.isOverdue,
      overdueDays,
    };
  });
}
