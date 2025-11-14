import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractProfileDataFromMessages, isProfileComplete } from "@/lib/profile-extraction";

function resolveDocumentPath(filePath: string) {
  const normalized = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  return path.join(process.cwd(), "public", normalized);
}

async function loadDocumentBuffer(filePath: string) {
  const absolutePath = resolveDocumentPath(filePath);
  const buffer = await fs.readFile(absolutePath);
  return {
    buffer,
    base64: buffer.toString("base64"),
    size: buffer.length,
    fileName: filePath.split("/").pop() || "document.pdf",
  };
}

// API для извлечения и сохранения данных профиля из чата
export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    // Получаем все сообщения пользователя
    const messages = await prisma.chatMessage.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { organization: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Извлекаем данные из чата
    const rawProfileData = await extractProfileDataFromMessages(
      messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }))
    );

    console.log("[extract-profile] Извлеченные данные:", rawProfileData);
    console.log("[extract-profile] Всего сообщений:", messages.length);

    // Убираем пустые значения, чтобы не перезаписывать существующие поля
    const profileData = Object.fromEntries(
      Object.entries(rawProfileData).filter(
        ([, value]) =>
          value !== undefined &&
          value !== null &&
          value !== "" &&
          !(typeof value === "number" && Number.isNaN(value))
      )
    );

    const mergedUser = { ...user, ...profileData };
    const requiredFields: Record<string, string> = {
      firstName: "Имя",
      lastName: "Фамилия",
      dateOfBirth: "Дата рождения",
      phone: "Телефон",
      address: "Адрес",
      jobTitle: "Должность",
      profession: "Профессия",
      education: "Образование",
    };
    const missingFields = Object.entries(requiredFields)
      .filter(([key]) => {
        const value = (mergedUser as any)[key];
        return value === null || value === undefined || value === "";
      })
      .map(([, label]) => label);

    if (!isProfileComplete(mergedUser)) {
      console.log("[extract-profile] Профиль все еще не полон", {
        firstName: !!mergedUser.firstName,
        lastName: !!mergedUser.lastName,
        dateOfBirth: !!mergedUser.dateOfBirth,
        phone: !!mergedUser.phone,
        address: !!mergedUser.address,
        jobTitle: !!mergedUser.jobTitle,
        profession: !!mergedUser.profession,
        education: !!mergedUser.education,
      });

      return NextResponse.json(
        {
          error: "Профиль еще не заполнен полностью",
          missingFields,
        },
        { status: 400 }
      );
    }

    // Обновляем профиль пользователя
    const updatedUser = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        ...profileData,
        membershipStatus: "DOCUMENTS_PENDING", // После заполнения профиля переходим к документам
      },
      include: {
        organization: true,
      },
    });

    // Автоматически генерируем заявления после заполнения профиля
    try {
      const { generateMembershipApplication, generateContributionsApplication } = await import("@/lib/documents");
      
      const ppoChairman = updatedUser.organization?.chairmanName || "Председатель ППО";
      
      console.log("[extract-profile] Начинаем генерацию заявлений для пользователя:", updatedUser.id);
      
      // Генерируем оба заявления
      const [membershipPath, contributionsPath] = await Promise.all([
        generateMembershipApplication(updatedUser, ppoChairman),
        generateContributionsApplication(updatedUser, ppoChairman),
      ]);

      console.log("[extract-profile] Заявления сгенерированы:", { membershipPath, contributionsPath });

      const existingDocs = await prisma.document.findMany({
        where: {
          userId: updatedUser.id,
          type: {
            in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
          },
        },
      });

      const [membershipFile, contributionsFile] = await Promise.all([
        loadDocumentBuffer(membershipPath),
        loadDocumentBuffer(contributionsPath),
      ]);

      const upsertDocument = async (
        type: "MEMBERSHIP_APPLICATION" | "CONTRIBUTION_APPLICATION",
        payload: {
          title: string;
          filePath: string;
          buffer: { base64: string; size: number; fileName: string };
        }
      ) => {
        const existing = existingDocs.find((doc) => doc.type === type);
        const data = {
          type,
          status: "GENERATED" as const,
          title: payload.title,
          content: payload.buffer.base64,
          filePath: payload.filePath,
          fileName: payload.buffer.fileName,
          fileSize: payload.buffer.size,
          mimeType: "application/pdf",
          userId: updatedUser.id,
          organizationId: updatedUser.organizationId || null,
        };

        if (existing) {
          await prisma.document.update({
            where: { id: existing.id },
            data,
          });
        } else {
          await prisma.document.create({ data });
        }
      };

      await Promise.all([
        upsertDocument("MEMBERSHIP_APPLICATION", {
          title: "Заявление о вступлении в профсоюз",
          filePath: membershipPath,
          buffer: membershipFile,
        }),
        upsertDocument("CONTRIBUTION_APPLICATION", {
          title: "Заявление о взносах",
          filePath: contributionsPath,
          buffer: contributionsFile,
        }),
      ]);

      console.log("[extract-profile] Документы сохранены/обновлены в базе данных");
    } catch (error) {
      console.error("[extract-profile] Ошибка генерации заявлений:", error);
      // Не прерываем процесс, если генерация заявлений не удалась
    }

    // Добавляем маркер завершения профиля, если его еще нет
    const markerExists = await prisma.chatMessage.findFirst({
      where: {
        userId: session.user.id,
        content: {
          contains: "[PROFILE_COMPLETE]",
        },
      },
    });

    if (!markerExists) {
      await prisma.chatMessage.create({
        data: {
          userId: session.user.id,
          role: "assistant",
          content:
            "Профиль подтвержден и документы готовы к скачиванию. [PROFILE_COMPLETE]",
        },
      });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        membershipStatus: updatedUser.membershipStatus,
      },
      missingFields: [],
    });
  } catch (error) {
    console.error("Extract profile error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

