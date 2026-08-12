---
title: "Building REST APIs with Node.js"
date: "2023-09-20"
author: "Jane Smith"
category: "Web Development"
tags: ["nodejs", "api", "rest", "backend"]
series: "Backend Development"
layout: "post"
---

# Building REST APIs with Node.js

In this tutorial, we'll explore how to build a RESTful API using Node.js and Express.

## Setting Up the Project

First, let's set up a new Node.js project:

```bash
mkdir my-api
cd my-api
pnpm init
pnpm add express
```

## Creating the Server

Create an `index.js` file with the following content:

```javascript
const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/api/users', (req, res) => {
    res.json({ users: [] });
});

app.post('/api/users', (req, res) => {
    const user = req.body;
    res.status(201).json(user);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
```

## RESTful Principles

When building REST APIs, follow these principles:

- Use proper HTTP methods (GET, POST, PUT, DELETE)
- Use meaningful resource URLs
- Return appropriate status codes
- Handle errors gracefully

## Conclusion

Building REST APIs with Node.js is straightforward with Express. Follow RESTful principles to create clean, maintainable APIs.
