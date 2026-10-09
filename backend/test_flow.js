const http = require('http');

const request = (path, method, data, token = null) => {
  return new Promise((resolve, reject) => {
    const dataStr = JSON.stringify(data);
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr)
      }
    };
    if (token) options.headers['Authorization'] = 'Bearer ' + token;

    const req = http.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.write(dataStr);
    req.end();
  });
};

(async () => {
  try {
    let res;
    // 1. Register
    res = await request('/auth/register', 'POST', { full_name: "John Doe", username: "johndoe2", email: "john2@example.com", password: "password123", confirm_password: "password123" });
    console.log("Register:", res.data);

    // 2. Login
    res = await request('/auth/login', 'POST', { identifier: "johndoe2", password: "password123" });
    console.log("Login:", res.data);
    const token = res.data.data.token;

    // 3. Create project
    res = await request('/projects', 'POST', { name: "My First Project", description: "Hello" }, token);
    console.log("Create Project:", res.data);
    const projectId = res.data.data.id;

    // 4. Create file
    res = await request('/files/project/' + projectId, 'POST', { name: "index.js", content: "console.log('test')" }, token);
    console.log("Create File:", res.data);
    const fileId = res.data.data.id;

    // 5. Create version
    res = await request('/files/' + fileId + '/versions', 'POST', { content: "console.log('test2')", message: "v1" }, token);
    console.log("Create Version:", res.data);
    
    // 6. Create Review
    res = await request('/files/' + fileId + '/reviews', 'POST', { file_id: fileId, version_id: res.data.data.id, line_number: 1, content: "Looks good" }, token);
    console.log("Create Review:", res.data);
    const reviewId = res.data.data.id;

    // 7. Convert review to task
    res = await request('/tasks', 'POST', { title: "Fix index", project_id: projectId, file_id: fileId, status: "todo", priority: "medium" }, token);
    console.log("Create Task:", res.data);

    // 8. Invite user 'himesh' (need his user ID, maybe we can list users first)
    res = await request('/users', 'GET', {}, token);
    const himesh = res.data.data.find(u => u.username === 'himesh');
    
    if (himesh) {
      res = await request('/projects/' + projectId + '/members/invitations', 'POST', { userId: himesh.id }, token);
      console.log("Invite Himesh:", res.data);
    }
    
    console.log("DONE");
  } catch(e) {
    console.error(e);
  }
})();
