import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";

function canAccessChannel(
  ctx: { isRPOHead: boolean; organizationId: string | null },
  channel: { organizationId: string | null; name: string } | null
): boolean {
  if (!channel) return false;
  const isRegional = channel.organizationId === null && channel.name === "Региональные новости";
  if (isRegional && ctx.isRPOHead) return true;
  return channel.organizationId === ctx.organizationId;
}

/**
 * PUT /api/ppo-head/news/[id]
 * Обновление новости Председателем (ППО/МПО/РПО)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userFlags = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isRPOHead: true, rpoHeadOrganizationId: true },
    });
    const isRPOHead = !!userFlags?.isRPOHead;

    let organizationId: string | null = null;
    if (isRPOHead) {
      organizationId = userFlags?.rpoHeadOrganizationId || null;
    } else {
      const perm = await checkUserPermissions(session.user.id, "news_create");
      if (!perm.hasAccess || !perm.organizationId) {
        return NextResponse.json(
          { error: "Доступ запрещен или организация не назначена" },
          { status: 403 }
        );
      }
      organizationId = perm.organizationId;
    }

    const ctx = { isRPOHead, organizationId };
    const { id } = await params;
    const body = await request.json();
    const { title, content, coverImage, channelId, isPublished } = body;

    const existingNews = await prisma.newsPost.findUnique({
      where: { id },
      include: { channel: true },
    });

    if (!existingNews) {
      return NextResponse.json({ error: "Новость не найдена" }, { status: 404 });
    }

    if (!canAccessChannel(ctx, existingNews.channel)) {
      return NextResponse.json(
        { error: "Нет прав на редактирование этой новости" },
        { status: 403 }
      );
    }

    if (channelId && channelId !== existingNews.channelId) {
      const newChannel = await prisma.newsChannel.findUnique({
        where: { id: channelId },
        select: { organizationId: true, name: true },
      });
      if (!newChannel || !canAccessChannel(ctx, newChannel)) {
        return NextResponse.json(
          { error: "Указанный канал не найден или недоступен" },
          { status: 400 }
        );
      }
    }

    // Обновляем новость
    const updatedNews = await prisma.newsPost.update({
      where: { id },
      data: {
        title: title?.trim() || existingNews.title,
        content: content?.trim() || existingNews.content,
        coverImage: coverImage !== undefined ? coverImage : existingNews.coverImage,
        channelId: channelId || existingNews.channelId,
        publishedAt: isPublished ? (existingNews.publishedAt || new Date()) : null,
        updatedAt: new Date(),
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
        channel: {
          select: {
            id: true,
            name: true,
            iconUrl: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      news: updatedNews,
    });
  } catch (error: any) {
    console.error("[ppo-head/news/[id]] PUT error:", error);
    return NextResponse.json(
      { error: "Ошибка при обновлении новости" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ppo-head/news/[id]
 * Удаление новости Председателем (ППО/МПО/РПО)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const delUserFlags = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isRPOHead: true, rpoHeadOrganizationId: true },
    });
    const delIsRPOHead = !!delUserFlags?.isRPOHead;

    let delOrganizationId: string | null = null;
    if (delIsRPOHead) {
      delOrganizationId = delUserFlags?.rpoHeadOrganizationId || null;
    } else {
      const perm = await checkUserPermissions(session.user.id, "news_manage");
      if (!perm.hasAccess || !perm.organizationId) {
        return NextResponse.json(
          { error: "Доступ запрещен или организация не назначена" },
          { status: 403 }
        );
      }
      delOrganizationId = perm.organizationId;
    }

    const delCtx = { isRPOHead: delIsRPOHead, organizationId: delOrganizationId };
    const { id } = await params;

    const existingNews = await prisma.newsPost.findUnique({
      where: { id },
      include: { channel: true },
    });

    if (!existingNews) {
      return NextResponse.json({ error: "Новость не найдена" }, { status: 404 });
    }

    if (!canAccessChannel(delCtx, existingNews.channel)) {
      return NextResponse.json(
        { error: "Нет прав на удаление этой новости" },
        { status: 403 }
      );
    }

    // Удаляем связанные данные
    await prisma.$transaction([
      // Удаляем голоса в опросах
      prisma.newsPollVote.deleteMany({
        where: {
          poll: {
            newsPostId: id,
          },
        },
      }),
      // Удаляем опросы (варианты хранятся в JSON)
      prisma.newsPoll.deleteMany({
        where: { newsPostId: id },
      }),
      // Удаляем лайки
      prisma.newsLike.deleteMany({
        where: { newsPostId: id },
      }),
      // Удаляем комментарии
      prisma.newsComment.deleteMany({
        where: { newsPostId: id },
      }),
      // Удаляем саму новость
      prisma.newsPost.delete({
        where: { id },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Новость успешно удалена",
    });
  } catch (error: any) {
    console.error("[ppo-head/news/[id]] DELETE error:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении новости" },
      { status: 500 }
    );
  }
}

