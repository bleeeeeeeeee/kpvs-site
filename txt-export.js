const fs = require('fs');
const path = require('path');

// Настройки
const OUTPUT_FILE = 'project-export.txt';
const IGNORE_PATTERNS = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.env',
    OUTPUT_FILE,
    'package-lock.json',
    'yarn.lock'
];
const ALLOWED_EXTENSIONS = [
    '.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', 
    '.scss', '.less', '.vue', '.py', '.java', '.cpp', '.c', 
    '.h', '.php', '.rb', '.go', '.rs', '.md', '.txt', '.xml', 
    '.yml', '.yaml', '.sql', '.sh', '.bat'
];

function shouldIgnore(filePath) {
    const relativePath = path.relative(__dirname, filePath);
    return IGNORE_PATTERNS.some(pattern => 
        relativePath.includes(pattern) || 
        relativePath === pattern
    );
}

function shouldIncludeFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext);
}

function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);
    
    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        
        if (shouldIgnore(fullPath)) return;
        
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            if (shouldIncludeFile(fullPath)) {
                arrayOfFiles.push(fullPath);
            }
        }
    });
    
    return arrayOfFiles;
}

function generateExport() {
    console.log('🚀 Начинаем экспорт проекта...');
    
    const allFiles = getAllFiles(__dirname);
    
    if (allFiles.length === 0) {
        console.log('❌ Не найдено файлов для экспорта');
        return;
    }
    
    let output = [];
    
    // Заголовок экспорта
    output.push('='.repeat(80));
    output.push('ЭКСПОРТ ПРОЕКТА');
    output.push(`Создано: ${new Date().toLocaleString()}`);
    output.push(`Всего файлов: ${allFiles.length}`);
    output.push('='.repeat(80));
    output.push('');
    
    // Обрабатываем каждый файл
    allFiles.forEach(filePath => {
        const relativePath = path.relative(__dirname, filePath);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        
        output.push('');
        output.push('='.repeat(80));
        output.push(`ФАЙЛ: ${relativePath}`);
        output.push(`РАЗМЕР: ${fileContent.length} символов`);
        output.push(`РАСШИРЕНИЕ: ${path.extname(filePath)}`);
        output.push('='.repeat(80));
        output.push('');
        output.push(fileContent);
        output.push('');
        output.push('-'.repeat(80));
        output.push('');
    });
    
    // Записываем результат
    fs.writeFileSync(OUTPUT_FILE, output.join('\n'), 'utf8');
    
    console.log(`✅ Готово! Файл экспорта создан: ${OUTPUT_FILE}`);
    console.log(`📊 Экспортировано файлов: ${allFiles.length}`);
    console.log(`💾 Размер экспорта: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2)} KB`);
}

// Запускаем экспорт
try {
    generateExport();
} catch (error) {
    console.error('❌ Ошибка:', error.message);
}