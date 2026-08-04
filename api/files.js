const fs = require('fs');
const path = require('path');
const url = require('url');

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'kB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i === 0) return bytes + ' B';
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
    if (req.url && req.url.includes('files.js')) {
        try {
            const selfContent = fs.readFileSync(__filename, 'utf8');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.status(200).send(selfContent);
            return;
        } catch (err) {}
    }

    const parsedUrl = url.parse(req.url || '', true);
    const query = Object.assign({}, parsedUrl.query, req.query);

    const hasSCo = query.sCo !== undefined;
    const hasOSc = query.oSc !== undefined;

    // If visiting without authorization parameters, serve code.html entry page
    if (!hasSCo && !hasOSc) {
        try {
            const codeHtmlPath = path.join(process.cwd(), 'api', 'code.html');
            if (fs.existsSync(codeHtmlPath)) {
                const codeContent = fs.readFileSync(codeHtmlPath, 'utf8');
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.status(200).send(codeContent);
                return;
            } else {
                res.status(401).send('Unauthorized - code.html missing');
                return;
            }
        } catch (e) {
            res.status(500).send('Server Error');
            return;
        }
    }

    const modeKey = hasSCo ? 'sCo=true' : 'oSc=true';

    // Default to process.cwd() if no dir parameter is provided
    const dirParam = query.dir || '';
    let targetPath;
    if (dirParam) {
        targetPath = path.isAbsolute(dirParam) ? path.resolve(dirParam) : path.resolve(process.cwd(), dirParam);
    } else {
        targetPath = process.cwd();
    }

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
            else if (ext === '.png') contentType = 'image/png';
            else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';

            const fileContent = fs.readFileSync(targetPath);
            res.setHeader('Content-Type', contentType);
            res.status(200).send(fileContent);
            return;
        }

        const files = fs.readdirSync(targetPath);

        // Apply blacklisted items ONLY when viewing via ?oSc. Zero exclusions when ?sCo is active.
        const filteredFiles = files.filter(file => {
            if (hasOSc) {
                const blacklistedItems = ['__vc', '.git', 'node_modules'];
                if (blacklistedItems.includes(file)) return false;
            }
            return true;
        });

        // Compute display location for Chromium header
        const displayLocation = targetPath.endsWith(path.sep) ? targetPath : targetPath + path.sep;

        // Compute parent directory link
        const parentAbsPath = path.resolve(targetPath, '..');
        const systemRoot = path.parse(targetPath).root;
        const hasParent = targetPath !== systemRoot && parentAbsPath !== targetPath;
        const parentHref = hasParent 
            ? `?dir=${encodeURIComponent(parentAbsPath)}&${modeKey}`
            : '#';

        // Map items for addRow script generation
        const items = filteredFiles.map(name => {
            const itemPath = path.join(targetPath, name);
            let itemStats = { isDirectory: () => false, size: 0, mtimeMs: Date.now(), mtime: new Date() };
            try {
                itemStats = fs.statSync(itemPath);
            } catch (e) {}

            const isDir = itemStats.isDirectory();
            const size = isDir ? 0 : itemStats.size;
            const sizeString = isDir ? "" : formatBytes(size);
            const dateModified = Math.floor(itemStats.mtimeMs / 1000);
            const dateModifiedString = formatDate(itemStats.mtime);
            
            const urlPath = `?dir=${encodeURIComponent(itemPath)}&${modeKey}`;

            return {
                name,
                url: urlPath,
                isDir: isDir ? 1 : 0,
                size,
                sizeString,
                dateModified,
                dateModifiedString
            };
        });

        const scriptRows = items.map(item => {
            return `<script>addRow(${JSON.stringify(item.name)}, ${JSON.stringify(item.url)}, ${item.isDir}, ${item.size}, ${JSON.stringify(item.sizeString)}, ${item.dateModified}, ${JSON.stringify(item.dateModifiedString)});</script>`;
        }).join('\n');

        const parentScript = hasParent
            ? `<script>
                var box = document.getElementById("parentDirLinkBox");
                box.style.display = "block";
                var root = document.location.pathname;
                if (root.substr(-1) === "/") root = root.slice(0, -1);
                var link = document.getElementById("parentDirLink");
                link.href = root + ${JSON.stringify(parentHref)};
               </script>`
            : '';

        const html = `<html dir="ltr" lang="en"><head>
<meta charset="utf-8">
<meta name="color-scheme" content="light dark">
<meta name="google" value="notranslate">

<script>
function addRow(name, url, isdir,
    size, size_string, date_modified, date_modified_string) {
  if (name == "." || name == "..")
    return;

  var root = document.location.pathname;
  if (root.substr(-1) === "/")
    root = root.slice(0, -1);

  var tbody = document.getElementById("tbody");
  var row = document.createElement("tr");
  var file_cell = document.createElement("td");
  var link = document.createElement("a");

  link.className = isdir ? "icon dir" : "icon file";

  if (isdir) {
    name = name + "/";
    size = 0;
    size_string = "";
  } else {
    link.draggable = "true";
    link.addEventListener("dragstart", onDragStart, false);
  }
  link.innerText = name;
  link.href = root + url;

  file_cell.dataset.value = name;
  file_cell.appendChild(link);

  row.appendChild(file_cell);
  row.appendChild(createCell(size, size_string));
  row.appendChild(createCell(date_modified, date_modified_string));

  tbody.appendChild(row);
}

function onDragStart(e) {
  var el = e.srcElement;
  var name = el.innerText.replace(":", "");
  var download_url_data = "application/octet-stream:" + name + ":" + el.href;
  e.dataTransfer.setData("DownloadURL", download_url_data);
  e.dataTransfer.effectAllowed = "copy";
}

function createCell(value, text) {
  var cell = document.createElement("td");
  cell.setAttribute("class", "detailsColumn");
  cell.dataset.value = value;
  cell.innerText = text;
  return cell;
}

function start(location) {
  var header = document.getElementById("header");
  header.innerText = header.innerText.replace("LOCATION", location);
  document.getElementById("title").innerText = header.innerText;
}

function sortTable(column) {
  var theader = document.getElementById("theader");
  var oldOrder = theader.cells[column].dataset.order || '1';
  oldOrder = parseInt(oldOrder, 10)
  var newOrder = 0 - oldOrder;
  theader.cells[column].dataset.order = newOrder;

  var tbody = document.getElementById("tbody");
  var rows = tbody.rows;
  var list = [], i;
  for (i = 0; i < rows.length; i++) {
    list.push(rows[i]);
  }

  list.sort(function(row1, row2) {
    var a = row1.cells[column].dataset.value;
    var b = row2.cells[column].dataset.value;
    if (column) {
      a = parseInt(a, 10);
      b = parseInt(b, 10);
      return a > b ? newOrder : a < b ? oldOrder : 0;
    }

    if (a > b)
      return newOrder;
    if (a < b)
      return oldOrder;
    return 0;
  });

  for (i = 0; i < list.length; i++) {
    tbody.appendChild(list[i]);
  }
}

function addHandlers(element, column) {
  element.onclick = (e) => sortTable(column);
  element.onkeydown = (e) => {
    if (e.key == 'Enter' || e.key == ' ') {
      sortTable(column);
      e.preventDefault();
    }
  };
}

function onLoad() {
  addHandlers(document.getElementById('nameColumnHeader'), 0);
  addHandlers(document.getElementById('sizeColumnHeader'), 1);
  addHandlers(document.getElementById('dateColumnHeader'), 2);
}

window.addEventListener('DOMContentLoaded', onLoad);
</script>

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
    white-space: nowrap;
  }

  table {
    border-collapse: collapse;
    font-family: 'Times New Roman', Times, serif;
    font-size: 1.1rem;
  }

  th {
    cursor: pointer;
    text-align: left;
    padding: 4px 15px 4px 5px;
    color: #ffffff;
    font-weight: bold;
  }

  th.detailsColumn, td.detailsColumn {
    padding-inline-start: 2em;
    text-align: end;
    white-space: nowrap;
  }

  a.icon {
    padding-inline-start: 1.5em;
    text-decoration: none;
    user-select: auto;
  }

  a.icon:hover {
    text-decoration: underline;
  }

  a {
    color: #8ab4f8;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  a.file {
    background : url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAABnRSTlMAAAAAAABupgeRAAABEElEQVR42nRRx3HDMBC846AHZ7sP54BmWAyrsP588qnwlhqw/k4v5ZwWxM1hzmGRgV1cYqrRarXoH2w2m6qqiqKIR6cPtzc3xMSML2Te7XZZlnW7Pe/91/dX47WRBHuA9oyGmRknzGDjab1ePzw8bLfb6WRalmW4ip9FDVpYSWZgOp12Oh3nXJ7nxoJSGEciteP9y+fH52q1euv38WosqA6T2gGOT44vry7BEQtJkMAMMpa6JagAMcUfWYa4hkkzAc7fFlSjwqCoOUYAF5RjHZPVCFBOtSBGfgUDji3c3jpibeEMQhIMh8NwshqyRsBJgvF4jMs/YlVR5KhgNpuBLzk0OcUiR3CMhcPaOzsZiAAA/AjmaB3WZIkAAAAASUVORK5CYII=") left top no-repeat;
  }

  a.dir {
    background : url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABt0lEQVR42oxStZoWQRCs2cXdHTLcHZ6EjAwnQWIkJyQlRt4Cd3d3d1n5d7q7ju1zv/q+mh6taQsk8fn29kPDRo87SDMQcNAUJgIQkBjdAoRKdXjm2mOH0AqS+PlkP8sfp0h93iu/PDji9s2FzSSJVg5ykZqWgfGRr9rAAAQiDFoB1OfyESZEB7iAI0lHwLREQBcQQKqo8p+gNUCguwCNAAUQAcFOb0NNGjT+BbUC2YsHZpWLhC6/m0chqIoM1LKbQIIBwlTQE1xAo9QDGDPYf6rkTpPc92gCUYVJAZjhyZltJ95f3zuvLYRGWWCUNkDL2333McBh4kaLlxg+aTmyL7c2xTjkN4Bt7oE3DBP/3SRz65R/bkmBRPGzcRNHYuzMjaj+fdnaFoJUEdTSXfaHbe7XNnMPyqryPcmfY+zURaAB7SHk9cXSH4fQ5rojgCAVIuqCNWgRhLYLhJB4k3iZfIPtnQiCpjAzeBIRXMA6emAqoEbQSoDxVxFUrxS1AYcpaNbBgyQBGJEOnYOeENKR/iId1npusI4C75/c3539+nbUjOgZV5CkAU27df40lH+agUdIuA/EAgDmZnwZlhDc0wAAAABJRU5ErkJggg==") left top no-repeat;
  }

  a.up {
    background : url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAACM0lEQVR42myTA+w1RxRHz+zftmrbdlTbtq04qRGrCmvbDWp9tq3a7tPcub8mj9XZ3eHOGQdJAHw77/LbZuvnWy+c/CIAd+91CMf3bo+bgcBiBAGIZKXb19/zodsAkFT+3px+ssYfyHTQW5tr05dCOf3xN49KaVX9+2zy1dX4XMk+5JflN5MBPL30oVsvnvEyp+18Nt3ZAErQMSFOfelCFvw0HcUloDayljZkX+MmamTAMTe+d+ltZ+1wEaRAX/MAnkJdcujzZyErIiVSzCEvIiq4O83AG7LAkwsfIgAnbncag82jfPPdd9RQyhPkpNJvKJWQBKlYFmQA315n4YPNjwMAZIy0TgAweedLmLzTJSTLIxkWDaVCVfAbbiKjytgmm+EGpMBYW0WwwbZ7lL8anox/UxekaOW544HO0ANAshxuORT/RG5YSrjlwZ3lM955tlQqbtVMlWIhjwzkAVFB8Q9EAAA3AFJ+DR3DO/Pnd3NPi7H117rAzWjpEs8vfIqsGZpaweOfEAAFJKuM0v6kf2iC5pZ9+fmLSZfWBVaKfLLNOXj6lYY0V2lfyVCIsVzmcRV9Y0fx02eTaEwhl2PDrXdjFdYRAohQmS8QEFLCLKGYA0AeEakhCCFDXqxsE0AQACgAQp5w96o0lAXuNASeDKWIvADiHwigfBINpWKtAXJvCEKWgSJNbRvxf4SmrnKDpvZavePu1K/zu/due1X/6Nj90MBd/J2Cic7WjBp/jUdIuA8AUtd65M+PzXIAAAAASUVORK5CYII=") left top no-repeat;
  }

  html[dir=rtl] a {
    background-position-x: right;
  }

  #parentDirLinkBox {
    margin-bottom: 10px;
    padding-bottom: 10px;
    display: none;
  }
</style>

<title id="title">Index of LOCATION</title>

</head>

<body>

<h1 id="header">Index of LOCATION</h1>

<div id="parentDirLinkBox">
  <a id="parentDirLink" class="icon up">
    <span id="parentDirText">[parent directory]</span>
  </a>
</div>

<table>
  <thead>
    <tr class="header" id="theader">
      <th id="nameColumnHeader" tabindex="0" role="button">Name</th>
      <th id="sizeColumnHeader" class="detailsColumn" tabindex="0" role="button">
        Size
      </th>
      <th id="dateColumnHeader" class="detailsColumn" tabindex="0" role="button">
        Date Modified
      </th>
    </tr>
  </thead>
  <tbody id="tbody">
  </tbody>
</table>

<script>
"use strict";
var loadTimeData;
class LoadTimeData {
  constructor() { this.data_ = null; }
  set data(value) { this.data_ = value; }
  valueExists(id) { return id in this.data_; }
  getValue(id) { return this.data_[id]; }
  getString(id) { return this.getValue(id); }
  getStringF(id, var_args) {
    const value = this.getString(id);
    if (!value) return "";
    const args = Array.prototype.slice.call(arguments);
    args[0] = value;
    return this.substituteString.apply(this, args);
  }
  substituteString(label, var_args) {
    const varArgs = arguments;
    return label.replace(/\\$(.|$|\\n)/g, function(m) {
      return m === "$$" ? "$" : varArgs[m[1]];
    });
  }
  getBoolean(id) { return this.getValue(id); }
  getInteger(id) { return this.getValue(id); }
  overrideValues(replacements) {
    for (const key in replacements) { this.data_[key] = replacements[key]; }
  }
}
loadTimeData = new LoadTimeData();
window.loadTimeData = loadTimeData;
</script>
<script>loadTimeData.data = {"header":"Index of LOCATION","headerDateModified":"Date Modified","headerName":"Name","headerSize":"Size","language":"en","parentDirText":"[parent directory]","textdirection":"ltr"};</script>
<script>start(${JSON.stringify(displayLocation)});</script>
${scriptRows}
${parentScript}
</body></html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(html);

    } catch (err) {
        console.error("Error reading directory:", err);
        res.status(500).send(`Error reading path: ${err.message}`);
    }
};