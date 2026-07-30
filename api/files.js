const fs = require('fs');
const path = require('path');

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'kB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(date) {
    return date.toLocaleString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

module.exports = (req, res) => {
    // Serve its own source code when requested directly
    if (req.url && req.url.includes('api/files.js')) {
        try {
            const selfContent = fs.readFileSync(__filename, 'utf8');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.status(200).send(selfContent);
            return;
        } catch (err) {}
    }

    const hasSCo = req.query.sCo !== undefined;
    const hasOSc = req.query.oSc !== undefined;

    // If visiting /files without authorization parameters, serve code.html
    if (!hasSCo && !hasOSc) {
        try {
            const codeHtmlPath = path.join(process.cwd(), 'api', 'code.html');
            if (fs.existsSync(codeHtmlPath)) {
                const codeContent = fs.readFileSync(codeHtmlPath, 'utf8');
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.status(200).send(codeContent);
                return;
            }
        } catch (e) {}
    }

    const rootDir = process.cwd();
    
    // Read the target directory dynamically from the ?dir= query parameter
    const dirParam = req.query.dir || '';
    const targetPath = path.resolve(rootDir, dirParam);

    try {
        if (!fs.existsSync(targetPath)) {
            res.status(404).send('Not Found');
            return;
        }

        const stats = fs.statSync(targetPath);

        // If it's a file, serve its contents directly
        if (stats.isFile()) {
            const ext = path.extname(targetPath).toLowerCase();
            let contentType = 'text/plain; charset=utf-8';
            if (ext === '.html') contentType = 'text/html; charset=utf-8';
            else if (ext === '.js') contentType = 'application/javascript; charset=utf-8';
            else if (ext === '.json') contentType = 'application/json; charset=utf-8';

            const fileContent = fs.readFileSync(targetPath);
            res.setHeader('Content-Type', contentType);
            res.status(200).send(fileContent);
            return;
        }

        const files = fs.readdirSync(targetPath);
        const modeKey = hasSCo ? 'sCo=true' : 'oSc=true';

        // Apply blacklisted items ONLY when viewing via ?oSc
        const filteredFiles = files.filter(file => {
            if (hasOSc) {
                const blacklistedItems = ['__vc', '.git', 'node_modules'];
                if (blacklistedItems.includes(file)) return false;
            }
            return true;
        });

        let tableRows = '';

        // Dynamically compute the parent directory relative to rootDir
        const parentAbsPath = path.resolve(targetPath, '..');
        const parentRelDir = path.relative(rootDir, parentAbsPath);
        const parentHref = parentRelDir ? `/files?dir=${encodeURIComponent(parentRelDir)}&${modeKey}` : `/files?${modeKey}`;

        tableRows += `
        <tr>
            <td><span class="icon">📁</span><a href="${parentHref}">[parent directory]</a></td>
            <td class="col-size">-</td>
            <td class="col-date">-</td>
        </tr>`;

        filteredFiles.forEach(file => {
            const filePath = path.join(targetPath, file);
            let fileStats;
            try {
                fileStats = fs.statSync(filePath);
            } catch (e) {
                return;
            }
            
            const isDirectory = fileStats.isDirectory();
            const size = isDirectory ? '-' : formatBytes(fileStats.size);
            const dateModified = formatDate(fileStats.mtime);
            
            const icon = isDirectory ? '📁' : '📄';
            const childRelPath = path.relative(rootDir, filePath);
            const href = `/files?dir=${encodeURIComponent(childRelPath)}&${modeKey}`;

            tableRows += `
            <tr>
                <td><span class="icon">${icon}</span><a href="${href}">${file}</a></td>
                <td class="col-size">${size}</td>
                <td class="col-date">${dateModified}</td>
            </tr>`;
        });

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Index of ${targetPath}</title>
            <style>
                body {
                    background-color: #111111;
                    color: #ffffff;
                    font-family: 'Times New Roman', Times, serif;
                    margin: 0;
                    padding: 10px 15px;
                }
                h1 {
                    font-size: 2rem;
                    font-weight: bold;
                    margin: 0 0 15px 0;
                    border-bottom: 1px solid #555555;
                    padding-bottom: 10px;
                }
                a {
                    color: #8ab4f8;
                    text-decoration: none;
                }
                a:hover {
                    text-decoration: underline;
                }
                table {
                    border-collapse: collapse;
                    font-family: 'Times New Roman', Times, serif;
                    font-size: 1.1rem;
                }
                th {
                    text-align: left;
                    padding: 4px 15px 4px 5px;
                    color: #ffffff;
                    font-weight: bold;
                }
                td {
                    padding: 2px 15px 2px 5px;
                    white-space: nowrap;
                }
                .col-size {
                    text-align: right;
                    padding-right: 25px;
                }
                .col-date {
                    padding-left: 10px;
                }
                .icon {
                    text-decoration: none;
                    margin-right: 5px;
                    display: inline-block;
                    vertical-align: middle;
                    font-size: 1.1rem;
                }
            </style>
        </head>
        <body>
            <h1>Index of ${targetPath}</h1>

            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th class="col-size">Size</th>
                        <th class="col-date">Date Modified</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </body>
        </html>`;

        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(html);
        
    } catch (err) {
        console.error("Error reading directory:", err);
        res.status(500).send(`Error reading path: ${err.message}`);
    }
};