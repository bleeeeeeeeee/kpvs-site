const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUTPUT_FILE = path.join(ROOT, "project-export.txt");
const IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".env",
  "project-export.txt",
  "package-lock.json",
  "yarn.lock"
];
const ALLOWED_EXTENSIONS = [
  ".js", ".jsx", ".ts", ".tsx", ".json", ".html", ".css",
  ".scss", ".less", ".vue", ".py", ".java", ".cpp", ".c",
  ".h", ".php", ".rb", ".go", ".rs", ".md", ".txt", ".xml",
  ".yml", ".yaml", ".sql", ".sh", ".bat"
];

function shouldIgnore(filePath) {
  const relativePath = path.relative(ROOT, filePath);
  return IGNORE_PATTERNS.some(function(pattern) {
    return relativePath.includes(pattern) || relativePath === pattern;
  });
}

function shouldIncludeFile(filePath) {
  return ALLOWED_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  fs.readdirSync(dirPath).forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    if (shouldIgnore(fullPath)) return;
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else if (shouldIncludeFile(fullPath)) {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

function generateExport() {
  console.log("Exporting project sources...");
  const allFiles = getAllFiles(ROOT);
  if (!allFiles.length) {
    console.log("No files matched export filters.");
    return;
  }
  const output = [
    "=".repeat(80),
    "PROJECT EXPORT",
    "Created: " + new Date().toISOString(),
    "Files: " + allFiles.length,
    "=".repeat(80),
    ""
  ];
  allFiles.forEach(function(filePath) {
    const relativePath = path.relative(ROOT, filePath);
    const fileContent = fs.readFileSync(filePath, "utf8");
    output.push(
      "",
      "=".repeat(80),
      "FILE: " + relativePath,
      "SIZE: " + fileContent.length,
      "=".repeat(80),
      "",
      fileContent,
      "",
      "-".repeat(80),
      ""
    );
  });
  fs.writeFileSync(OUTPUT_FILE, output.join("\n"), "utf8");
  const kb = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2);
  console.log("Written: " + path.relative(ROOT, OUTPUT_FILE) + " (" + allFiles.length + " files, " + kb + " KB)");
}

try {
  generateExport();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
