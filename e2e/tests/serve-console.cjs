const http = require("http")
const fs = require("fs")
const path = require("path")

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

const dist = path.resolve(__dirname, "../../packages/console/dist")
const port = parseInt(process.argv[2] || "7071", 10)

http.createServer((req, res) => {
  let filePath = path.join(dist, req.url === "/" ? "index.html" : req.url)
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    filePath = path.join(dist, "index.html")
  }
  const ext = path.extname(filePath)
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream")
  fs.createReadStream(filePath).pipe(res)
}).listen(port, () => {
  console.log(`Console serving ${dist} on port ${port}`)
})
