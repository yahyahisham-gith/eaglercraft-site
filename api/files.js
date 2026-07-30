const fs = require('fs');
const path = require('path');

// Helper to calculate accurate file sizes dynamically
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'kB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Helper to format the date exactly like the browser index
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
    // Process.cwd() points to the root of your Vercel deployment. Fallback to 'unknown'.
    const directoryPath = process.cwd() || 'unknown';
    
    // We still need a valid path to read the files, so we fall back to the root if unknown
    const pathToRead = directoryPath !== 'unknown' ? directoryPath : '/var/task';
    
    try {
        const files = fs.readdirSync(pathToRead);
        
        // Filter out hidden Vercel system files and the api folder itself
        const filteredFiles = files.filter(file => {
            return !file.startsWith('.') && file !== 'node_modules' && file !== 'api';
        });

        let tableRows = '';

        // Loop through everything in the root and generate the row data
        filteredFiles.forEach(file => {
            const filePath = path.join(pathToRead, file);
            const stats = fs.statSync(filePath);
            
            const isDirectory = stats.isDirectory();
            const size = isDirectory ? '-' : formatBytes(stats.size);
            const dateModified = formatDate(stats.mtime);
            
            const icon = isDirectory ? '📁' : '📄';
            const href = isDirectory ? `/${file}/` : `/${file}`;

            tableRows += `
            <tr>
                <td><span class="icon">${icon}</span><a href="${href}">${file}</a></td>
                <td class="col-size">${size}</td>
                <td class="col-date">${dateModified}</td>
            </tr>`;
        });

        // The HTML structure that perfectly mimics the native browser index
        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Index of ${directoryPath}</title>
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
                .parent-dir {
                    margin-bottom: 20px;
                    font-family: 'Times New Roman', Times, serif;
                    font-size: 1.1rem;
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
            <h1>Index of ${directoryPath}</h1>
            
            <div class="parent-dir">
                <a href="/"><span class="icon">📁</span>[parent directory]</a>
            </div>

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

        // Send back the dynamically constructed HTML
        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(html);
        
    } catch (err) {
        console.error("Error reading directory:", err);
        res.status(500).send('Error generating directory index');
    }
};