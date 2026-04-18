const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const routingTargetRegex = /#page-landing\s*{\s+display:\s*block;\s*}\s*#page-dashboard\s*{\s+display:\s*none;\s*}\s*body\.dashboard-view\s+#page-landing\s*{\s+display:\s*none;\s*}\s*body\.dashboard-view\s+#page-dashboard\s*{\s+display:\s*flex;\s*}/;

console.log('Regex matched?', routingTargetRegex.test(html));
console.log('Style matched?', html.includes('</style>'));
console.log('Comment matched?', html.includes('<!-- ══════════════════════════════════════════════════════'));
console.log('Comment with another length?', html.includes('<!-- ══════════════════════════════════'));
console.log('JS matched?', html.includes('// ─── PAGE ROUTING ────────────────────────────────────────────'));

