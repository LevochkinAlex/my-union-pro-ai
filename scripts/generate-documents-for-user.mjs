import { PrismaClient } from '@prisma/client';
import { generateMembershipApplication, generateContributionsApplication } from '../lib/documents.js';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

async function generateDocuments() {
  const email = process.argv[2] || 'ceo@yappix.ru';
  
  try {
    console.log(`📄 Generating documents for: ${email}`);
    
    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true }
    });
    
    if (!user) {
      console.error('❌ User not found:', email);
      process.exit(1);
    }
    
    // Проверяем что профиль заполнен
    if (!user.firstName || !user.lastName || !user.dateOfBirth) {
      console.error('❌ Profile incomplete. Missing:', {
        firstName: !user.firstName,
        lastName: !user.lastName,
        dateOfBirth: !user.dateOfBirth
      });
      process.exit(1);
    }
    
    console.log('\n✅ Profile is complete:');
    console.log(`  Name: ${user.firstName} ${user.lastName} ${user.middleName || ''}`);
    console.log(`  DOB: ${user.dateOfBirth}`);
    console.log(`  Address: ${user.address || 'N/A'}`);
    console.log(`  Organization: ${user.organization?.name || 'N/A'}`);
    
    // Проверяем существующие документы
    const existingDocs = await prisma.document.findMany({
      where: {
        userId: user.id,
        type: {
          in: ['MEMBERSHIP_APPLICATION', 'CONTRIBUTION_APPLICATION']
        }
      }
    });
    
    if (existingDocs.length > 0) {
      console.log('\n⚠️  Found existing documents:');
      existingDocs.forEach(d => {
        console.log(`  - ${d.type}: ${d.title} (${d.status})`);
      });
      console.log('\n🗑️  Deleting old documents...');
      await prisma.document.deleteMany({
        where: {
          userId: user.id,
          type: {
            in: ['MEMBERSHIP_APPLICATION', 'CONTRIBUTION_APPLICATION']
          }
        }
      });
    }
    
    console.log('\n📝 Generating documents...');
    
    // Генерируем заявление о вступлении
    const membershipPath = await generateMembershipApplication(user);
    console.log('✅ Membership application:', membershipPath);
    
    // Генерируем заявление о взносах
    const contributionsPath = await generateContributionsApplication(
      user,
      user.organization?.name,
      undefined
    );
    console.log('✅ Contributions application:', contributionsPath);
    
    // Получаем размеры файлов
    const membershipFullPath = path.join(process.cwd(), 'public', membershipPath);
    const contributionsFullPath = path.join(process.cwd(), 'public', contributionsPath);
    
    const membershipStats = await fs.stat(membershipFullPath);
    const contributionsStats = await fs.stat(contributionsFullPath);
    
    // Сохраняем в базу
    await prisma.document.create({
      data: {
        userId: user.id,
        type: 'MEMBERSHIP_APPLICATION',
        status: 'GENERATED',
        title: 'Заявление о вступлении в профсоюз',
        filePath: membershipPath,
        fileName: path.basename(membershipPath),
        fileSize: membershipStats.size,
        mimeType: 'application/pdf',
        organizationId: user.organizationId || null,
      }
    });
    
    await prisma.document.create({
      data: {
        userId: user.id,
        type: 'CONTRIBUTION_APPLICATION',
        status: 'GENERATED',
        title: 'Заявление о взносах',
        filePath: contributionsPath,
        fileName: path.basename(contributionsPath),
        fileSize: contributionsStats.size,
        mimeType: 'application/pdf',
        organizationId: user.organizationId || null,
      }
    });
    
    console.log('\n✅ Documents saved to database!');
    console.log(`\n📋 Summary:`);
    console.log(`  - Membership application: ${membershipPath}`);
    console.log(`  - Contributions application: ${contributionsPath}`);
    console.log(`  - Total size: ${((membershipStats.size + contributionsStats.size) / 1024).toFixed(2)} KB`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

generateDocuments();

