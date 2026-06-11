import http from "http";
import fs from "fs";
import path from "path";

const port = 4555;

const server = http.createServer((req, res) => {
  const filePath = path.join(process.cwd(), "index.html");
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(content);
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});