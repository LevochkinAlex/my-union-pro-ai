import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import PostDetailClient from "@/components/posts/PostDetailClient";

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const { id } = await params;

  const post = await prisma.userPost.findUnique({
    where: { id },
    include: {
      author: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          avatarUrl: true,
          jobTitle: true,
          profession: true,
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      attachments: {
        orderBy: {
          createdAt: "asc",
        },
      },
      likes: session?.user?.id
        ? {
            where: {
              userId: session.user.id,
            },
            select: {
              id: true,
            },
          }
        : false,
      _count: {
        select: {
          likes: true,
          comments: true,
        },
      },
    },
  });

  if (!post) {
    notFound();
  }

  // Увеличиваем счетчик просмотров (безопасно, даже если поле не существует)
  let currentViewCount = 0;
  try {
    const viewCount = (post as any).viewCount;
    if (viewCount !== null && viewCount !== undefined) {
      currentViewCount = Number(viewCount) || 0;
    }
    // Пытаемся обновить через raw SQL, который безопасно обработает отсутствие поля
    await prisma.$executeRawUnsafe(`
      UPDATE "UserPost" 
      SET "viewCount" = COALESCE("viewCount", 0) + 1 
      WHERE id = $1
    `, id);
    currentViewCount += 1;
  } catch (error: any) {
    // Если поле не существует, просто игнорируем ошибку
    if (!error.message?.includes('column "viewCount" does not exist')) {
      console.error("[posts/[id]] Error updating viewCount:", error);
    }
  }

  const postData = {
    ...post,
    isLiked: post.likes && Array.isArray(post.likes) && post.likes.length > 0,
    likesCount: post._count.likes,
    commentsCount: post._count.comments,
    viewCount: currentViewCount,
  };

  return <PostDetailClient post={postData} session={session} />;
}

