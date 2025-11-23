#!/bin/bash

# Clean debug logs from best-benefits.ts
# Keep only critical errors

echo "🧹 Cleaning debug logs..."

# Backup
cp lib/best-benefits.ts lib/best-benefits.ts.backup

# Comment out console.log lines (keep console.error and console.warn for critical issues)
sed -i.tmp 's/^  console\.log(\[best-benefits\]/  \/\/ console.log([best-benefits]/g' lib/best-benefits.ts
sed -i.tmp 's/^    console\.log(\[best-benefits\]/    \/\/ console.log([best-benefits]/g' lib/best-benefits.ts
sed -i.tmp 's/^      console\.log(\[best-benefits\]/      \/\/ console.log([best-benefits]/g' lib/best-benefits.ts
sed -i.tmp 's/^        console\.log(\[best-benefits\]/        \/\/ console.log([best-benefits]/g' lib/best-benefits.ts

# Remove temp files
rm -f lib/best-benefits.ts.tmp

echo "✅ Done! Backup saved to lib/best-benefits.ts.backup"
echo "Review changes and commit if good."

