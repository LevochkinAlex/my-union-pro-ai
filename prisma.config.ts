// Автоматическая загрузка переменных окружения из .env.local
import { config } from 'dotenv';
import { resolve } from 'path';

// Загружаем .env.local если он существует
config({ path: resolve(process.cwd(), '.env.local') });
// Также пробуем загрузить .env на случай если .env.local отсутствует
config({ path: resolve(process.cwd(), '.env') });

const prismaConfig = {};

export default prismaConfig;
