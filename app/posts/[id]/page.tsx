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

  // Получаем текущий счетчик просмотров (без увеличения - просмотры считаются через Intersection Observer в ленте)
  let currentViewCount = 0;
  try {
    const viewCount = (post as any).viewCount;
    if (viewCount !== null && viewCount !== undefined) {
      currentViewCount = Number(viewCount) || 0;
    }
  } catch (error: any) {
    console.error("[posts/[id]] Error getting viewCount:", error);
  }

  const postData = {
    ...post,
    coverImage: (post as any).coverImage || null,
    videoMetadata: post.videoMetadata || null,
    isLiked: post.likes && Array.isArray(post.likes) && post.likes.length > 0,
    likesCount: post._count.likes,
    commentsCount: post._count.comments,
    viewCount: currentViewCount,
  };

  // Debug log
  console.log("[posts/[id]] Post data:", {
    id: post.id,
    postType: post.postType,
    coverImage: (post as any).coverImage,
    videoMetadata: post.videoMetadata,
  });

  return <PostDetailClient post={postData} session={session} />;
}

